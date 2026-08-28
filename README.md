# UNiAGENT

An AI-assisted platform for university students: academic/GPA tracking, a project log, a career and internship tracker, real open job search with AI-drafted cover letters and CV-vs-job-description match analysis, AI-generated topic quizzes for test prep, document search, an AI chat assistant, and a report generator. Each registered account gets its own private, isolated set of data.

Job listings come from [Adzuna](https://developer.adzuna.com), scoped to their South Africa endpoint - real, currently-open postings, not a general/global feed. Unlike some of the other integrations in this app, Adzuna requires a free developer account: sign up at developer.adzuna.com and set `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` in `.env`. Without both set, job search honestly reports itself as not configured instead of silently returning nothing. "Apply" always happens on the real employer's site; this app helps draft a cover letter and track the application, it does not auto-submit applications anywhere.

## Current architecture

Everything runs as a single Node/Express server (`server.ts`), which also serves the Vite/React frontend. Data is written to a local JSON file (`data/uniagent-data.json`) after every change and reloaded on startup, so it survives a restart - but it's a single file on one machine, not a real database: no protection against concurrent writes and no way to run more than one server instance against the same data. Moving to a real database (SQLite or Postgres) is the top item on the roadmap.

Security basics are in place: passwords are hashed with scrypt, session tokens are opaque random strings (not derived from the user id), login/register are rate-limited, and standard HTTP security headers are set via `helmet`. What's still missing: self-service password reset (no email provider is configured, so an admin resets passwords manually from the Admin panel instead) and single sign-on.

A separate, more complete backend (FastAPI + PostgreSQL + pgvector + LangGraph) exists under `backend/` but is **not connected** to the app - it's a planned future direction, not something currently running.

## Run locally

**Prerequisites:** Node.js 22+ (the `openai` package requires it - Node 20 will install with a warning but isn't supported)

1. Install dependencies:
   ```
   npm install
   ```
2. Create a `.env` file in the project root with an AI provider key. OpenAI is preferred when both are set:
   ```
   OPENAI_API_KEY=your-key-here
   ```
   or
   ```
   GEMINI_API_KEY=your-key-here
   ```
   Without either, the AI chat and every other AI-dependent feature (quizzes, cover letters, CV matching, project reviews) fall back to deterministic (non-AI) responses, or plainly say "AI not configured", instead of failing or making something up.
3. Run the app:
   ```
   npm run dev
   ```
   This starts the server at `http://localhost:3000` (or the port set by the `PORT` environment variable).

The first account you register on a fresh server automatically becomes an administrator - every account after that registers as a regular student, and can be promoted from the Admin panel.

## Testing

```
npm test
```

Runs a real integration suite (`tests/api.test.mjs`) that spawns the actual server against a throwaway data directory and exercises it over HTTP - registration/login, the project scanner's honesty (it must only report what was actually submitted), document search, quiz generation, job search, cover-letter drafting, CV-vs-job matching, report generation, admin user management, rate limiting, and a real restart-survives-persistence check.

## Production build

```
npm run build
npm start
```

## Docker

```
docker compose up --build
```

Requires a `.env` file in the project root with `OPENAI_API_KEY` and/or `GEMINI_API_KEY` set - `docker-compose.yml` reads them from there rather than any value being committed to the repo.

### Keeping your data across updates

All accounts, workspaces, and chat history live in one JSON file, mounted from your host machine into the container at `/app/data` (see `volumes:` in `docker-compose.yml`). By default that maps to a `data` folder next to `docker-compose.yml`, which is fine for a single install you never move.

If you expect to extract future updates into a new folder (a new zip each time), set `UNIAGENT_HOST_DATA_DIR` in your `.env` to a stable folder *outside* any versioned project folder instead, e.g. on Windows:

```
UNIAGENT_HOST_DATA_DIR=C:/UniAgentData
```

Create that folder once, point every future version's `.env` at it, and your real data survives every update instead of starting empty in each new folder.

## Deploying live, via Firebase

For a real, publicly reachable deployment (as opposed to running on one person's own computer), this app can run on **Cloud Run** (Google Cloud's container hosting, which Firebase's own App Hosting is built on top of) with **Firestore** as the database, fronted by **Firebase Hosting** for the URL. Data storage automatically switches from the local JSON file to Firestore the moment `FIREBASE_PROJECT_ID` is set - no other configuration changes.

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com), and enable **Firestore** (Native mode) from the Build menu.
2. Install the [gcloud CLI](https://cloud.google.com/sdk/docs/install) and run `gcloud auth login`, then `gcloud config set project YOUR_PROJECT_ID`.
3. Deploy the existing `Dockerfile.frontend` straight to Cloud Run:
   ```
   gcloud run deploy uniagent \
     --source . \
     --region us-central1 \
     --allow-unauthenticated \
     --max-instances 1 \
     --set-env-vars FIREBASE_PROJECT_ID=YOUR_PROJECT_ID,NODE_ENV=production \
     --set-env-vars OPENAI_API_KEY=YOUR_KEY,ADZUNA_APP_ID=YOUR_ID,ADZUNA_APP_KEY=YOUR_KEY
   ```
   No `GOOGLE_APPLICATION_CREDENTIALS` is needed here - Cloud Run supplies Firestore credentials automatically. `--max-instances 1` matters: this app keeps its working copy of the data in memory and periodically saves it, rather than reading/writing Firestore fresh on every single line of code - correct with exactly one running instance, but two instances running at once could each hold a different in-memory copy and overwrite each other's saves. Capping at 1 instance is the simple fix; splitting the data model so it's safe at higher scale is future work, not something needed for a pilot.
   - **Requires billing enabled** on the Google Cloud project - Cloud Run, Cloud Build, and Artifact Registry all require a billing account attached (a card on file) even though actual usage for a small pilot will likely stay within the free tier and cost $0. See the Vercel option below if that's a blocker right now.
4. (Optional, for a nicer/custom URL) Connect Firebase Hosting to that Cloud Run service: `firebase init hosting`, choose "Configure as a single-page app? No", and when asked to set up rewrites, point `/**` at the `uniagent` Cloud Run service. Then `firebase deploy --only hosting`.

The single-Firestore-document design (see the comment above `loadState`/`saveState` in `server.ts`) is sized for a pilot - a handful to a few dozen accounts - not a full university-wide rollout. Splitting into one Firestore document per student is the natural next step if this needs to scale past that, and doesn't require redesigning anything else.

### Deploying without a billing account: Vercel + Firestore

Cloud Run (above) requires a Google Cloud billing account attached, even for free-tier usage. If that's not available right now, this app can instead run on **Vercel's free Hobby plan** (no card required) while still using Firestore for real data storage - the same `FIREBASE_PROJECT_ID` switch applies.

Two real differences from Cloud Run to know about:

- **Not for real multi-student use.** Vercel runs this app as serverless functions rather than one continuous process, so - unlike Cloud Run pinned to one instance - concurrent requests can land on different, independent instances at the same moment. `server.ts` reloads its working copy from Firestore at the start of every request specifically to keep each instance's view fresh (see the middleware comment in `buildApp`), which closes the worst case (a long-lived stale copy), but two requests landing at almost the exact same instant can still race and the later save can overwrite the earlier one. Fine for solo testing and demos; not something to point a whole class of students at.
- **Non-commercial use only.** Vercel's Hobby plan terms restrict it to personal, non-commercial use - appropriate for testing and demoing this to yourself or your team, not for actually running it as a paid product for the university. That would need Vercel's paid Pro plan (which does require a card) or the Cloud Run path above.

Deploy steps:

1. Create a free account at [vercel.com](https://vercel.com) - no card needed for the Hobby plan.
2. Install the CLI: `npm install -g vercel`, then run `vercel login`.
3. From the project folder, run `vercel` and follow the prompts (accept the defaults it detects).
4. In the Vercel dashboard for the new project, go to **Settings → Environment Variables** and add `FIREBASE_PROJECT_ID`, `OPENAI_API_KEY`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` (same values as everywhere else) - `GOOGLE_APPLICATION_CREDENTIALS` is not needed or supported here.
5. Run `vercel --prod` to deploy live. Vercel prints the live URL when it finishes.

This path was built and locally verified (including a simulated request against the exact code Vercel runs - static assets, the SPA fallback, and a path-traversal check) but could not be deployed and checked against Vercel's real infrastructure directly from this environment, so treat the first real deploy as something to verify carefully - register a test account and confirm login, page loads, and a few core features all work before trusting it further.

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import crypto from 'crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

dotenv.config();

// NOTE: this file used to compute __filename/__dirname here via
// fileURLToPath(import.meta.url), left over from an early draft. Nothing in
// the app actually used them (static files are served from
// path.join(process.cwd(), 'dist') below instead) - and worse, they were
// actively broken in production: esbuild's CJS bundle output has no
// equivalent for import.meta.url and silently turns it into `undefined`,
// which made fileURLToPath() throw and crash the server on every single
// startup of the built app (`npm start`, and every Docker image) - a bug
// that a plain `npm run build` type-check never caught, because it only
// showed up when the bundled output was actually executed. Removed rather
// than patched, since there was no real use for them.

// --- Password hashing (scrypt, Node's built-in crypto - no extra deps) ---
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, derivedHex] = stored.split(':');
  if (!salt || !derivedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(derivedHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

// --- Session store: opaque random token -> user id (never derived from
// --- the user id itself, so a token can't be forged/guessed). Lives on
// --- dbState (not a standalone module-level Map) so it round-trips through
// --- the same persistence as everything else - see the comment above
// --- dbState below for why that matters more than it might seem.
function issueToken(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  dbState.sessions.set(token, userId);
  return token;
}

// Used after a password reset or account deactivation so an already-issued
// token can't keep working after the admin action - without this, resetting
// a password wouldn't actually log the old session out.
function revokeSessionsForUser(userId: string) {
  for (const [token, uid] of dbState.sessions.entries()) {
    if (uid === userId) dbState.sessions.delete(token);
  }
}

// A short, readable temporary password (avoids ambiguous characters like
// 0/O/1/l) - shown to the admin exactly once in the API response. It is
// never logged and never stored anywhere except as its scrypt hash.
function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += alphabet[crypto.randomInt(alphabet.length)];
  }
  return out;
}

// --- Per-account workspace: every registered account gets its own separate
// --- student profile, modules, projects, career data, documents, chat
// --- sessions, and agent runs. Previously all of this lived directly on
// --- dbState as a single shared object, so every account - the demo
// --- student, the demo admin, and anyone who registered - saw and edited
// --- the exact same "Alex Chen" data. Now each user id maps to its own
// --- workspace, keyed in `workspaces` below. ---
function createBlankWorkspace(details?: {
  student_number?: string;
  university?: string;
  degree?: string;
  major?: string;
  year_of_study?: number;
  target_gpa?: number;
}) {
  return {
    student: {
      id: `s-${crypto.randomBytes(6).toString('hex')}`,
      student_number: details?.student_number || '',
      university: details?.university || '',
      degree: details?.degree || '',
      major: details?.major || '',
      year_of_study: details?.year_of_study || 1,
      gpa: 0,
      target_gpa: details?.target_gpa || 4.0,
      credits_earned: 0,
      credits_required: 360,
      status: 'active'
    },
    modules: [] as any[],
    projects: [] as any[],
    skills: [] as any[],
    career_profile: {
      target_roles: [] as string[],
      desired_industries: [] as string[],
      preferred_locations: [] as string[],
      target_salary_range: '',
      bio: '',
      linkedin_url: '',
      github_url: '',
      career_readiness_score: 0
    },
    internships: [] as any[],
    documents: [] as any[],
    chat_sessions: [] as any[],
    agent_runs: [] as any[],
    quizzes: [] as any[],
    quiz_attempts: [] as any[]
  };
}

type Workspace = ReturnType<typeof createBlankWorkspace>;

// In-memory persistent state store for container environment. There is no
// seeded demo data anymore - the platform starts with zero accounts, and
// every account (including the very first one - see the bootstrap comment
// in POST /auth/register below) is created through real registration.
type UserRecord = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  password_hash: string;
};

const dbState = {
  users: [] as UserRecord[],
  workspaces: new Map<string, Workspace>(),
  // Login sessions live here too, not in their own standalone Map, so a
  // deployment that reloads state on every request (see the Firestore
  // "reload per request" middleware in startServer) sees a consistent,
  // just-refreshed view of who's logged in - not a stale local copy of
  // sessions sitting alongside freshly-reloaded accounts.
  sessions: new Map<string, string>(),
};

// --- Persistence: everything above used to live only in this process's
// --- memory, so a restart (a deploy, a crash, a host recycling the
// --- container) silently erased every account. This writes the full state
// --- somewhere durable after every change, and reloads it on startup.
//
// Two backends, chosen automatically - never both, and nothing about a
// route handler changes based on which one is active:
//
//  1. Firestore (Firebase's real cloud database), used automatically
//     whenever FIREBASE_PROJECT_ID is set - the right choice for a real
//     deployment (Cloud Run, Firebase App Hosting, or anywhere else),
//     since it survives the container itself being destroyed and rebuilt,
//     not just restarted.
//  2. A single local JSON file, used automatically otherwise - unchanged
//     from before, and still what local Docker development and the
//     automated test suite run against.
//
// Honest limitation of the Firestore path: everything is stored as one
// document (all accounts, all workspaces) rather than one document per
// student. That keeps every existing route handler working unmodified -
// none of them had to become "aware" of Firestore - but it means (a) a
// single Firestore document has a 1MiB size ceiling, which a handful to a
// few dozen pilot accounts won't come close to but a real university-wide
// rollout eventually would, and (b) two requests finishing at almost
// exactly the same moment both trigger a save, and the code below chains
// those writes so they always land in the order they were queued (a
// slower network round-trip for an earlier change can never overwrite a
// newer one) - but a single user firing off several rapid actions in a
// row could still, in a rare worst case, have an in-between save overwritten
// by the very next one. Fine for a pilot; the real fix if this ever needs
// to scale past that is splitting this into one Firestore document per
// student, which is a natural next step for this same design, not a
// rewrite from scratch.
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || '';
function isFirestoreConfigured(): boolean {
  return !!FIREBASE_PROJECT_ID;
}

let firestoreDb: Firestore | null = null;
function getFirestoreDb(): Firestore | null {
  if (!isFirestoreConfigured()) return null;
  if (!firestoreDb) {
    // Three ways credentials can reach this, tried in order:
    //  1. FIREBASE_SERVICE_ACCOUNT_KEY - the *contents* of a service-account
    //     JSON key, pasted whole into an environment variable. Needed on
    //     platforms like Vercel that have no writable persistent filesystem
    //     to point a file path at and no Google Cloud metadata server to
    //     supply credentials automatically.
    //  2. GOOGLE_APPLICATION_CREDENTIALS (a path to a service-account JSON
    //     key file on disk) - read automatically by applicationDefault(),
    //     used for local Docker development.
    //  3. Nothing set at all - applicationDefault() falls back to asking the
    //     surrounding infrastructure for credentials, which works
    //     automatically on Google Cloud infrastructure (Cloud Run, Firebase
    //     App Hosting) and nowhere else.
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '';
    if (serviceAccountJson) {
      let serviceAccount: Record<string, unknown>;
      try {
        serviceAccount = JSON.parse(serviceAccountJson);
      } catch (e) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is set but is not valid JSON - paste the full contents of the service-account key file, unedited.');
      }
      initializeApp({ credential: cert(serviceAccount as any), projectId: FIREBASE_PROJECT_ID });
    } else {
      initializeApp({ credential: applicationDefault(), projectId: FIREBASE_PROJECT_ID });
    }
    firestoreDb = getFirestore();
  }
  return firestoreDb;
}

const FIRESTORE_COLLECTION = 'uniagent_state';
const FIRESTORE_DOC_ID = 'main';

// Overridable so the integration test suite (tests/api.test.mjs) can point
// this at a throwaway directory instead of the real dev data file.
const DATA_DIR = process.env.UNIAGENT_DATA_DIR || path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'uniagent-data.json');

async function loadState() {
  const fdb = getFirestoreDb();
  if (fdb) {
    try {
      const snap = await fdb.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC_ID).get();
      if (snap.exists) {
        const data = snap.data() as { users?: string; workspaces?: string; sessions?: string } | undefined;
        const users = data?.users ? JSON.parse(data.users) : [];
        const workspaces = data?.workspaces ? JSON.parse(data.workspaces) : {};
        const sessionEntries = data?.sessions ? JSON.parse(data.sessions) : [];
        if (Array.isArray(users)) dbState.users = users;
        dbState.workspaces = new Map(Object.entries(workspaces));
        dbState.sessions = new Map(Array.isArray(sessionEntries) ? sessionEntries : []);
        console.log(`Loaded ${dbState.users.length} account(s) from Firestore (project ${FIREBASE_PROJECT_ID})`);
      } else {
        console.log(`No existing Firestore document yet (project ${FIREBASE_PROJECT_ID}) - starting with an empty database.`);
      }
    } catch (e) {
      console.error('Could not read state from Firestore - starting with an empty database. Check FIREBASE_PROJECT_ID and your credentials.', e);
    }
    return;
  }

  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.users)) dbState.users = parsed.users;
    if (parsed.workspaces && typeof parsed.workspaces === 'object') {
      dbState.workspaces = new Map(Object.entries(parsed.workspaces));
    }
    if (Array.isArray(parsed.sessions)) {
      dbState.sessions = new Map(parsed.sessions);
    }
    console.log(`Loaded ${dbState.users.length} account(s) from ${DATA_FILE}`);
  } catch (e) {
    console.warn(`Could not read ${DATA_FILE} - starting with an empty database.`, e);
  }
}

// Chains Firestore writes one after another instead of firing them off in
// parallel. Without this, two saves queued close together could have their
// network round-trips complete out of order, and a slow-to-arrive earlier
// snapshot could land AFTER (and silently overwrite) a newer one.
let firestoreSaveChain: Promise<void> = Promise.resolve();

// Returns a promise so callers that need the write to have actually landed
// (see the res.json() interception in buildApp below) can await it, instead
// of it being fire-and-forget. That distinction matters a lot more than it
// sounds: on Vercel, every request reloads dbState fresh from Firestore
// (see the "reload per request" middleware), so if a client receives a
// success response and immediately fires its next request - which the
// frontend does, e.g. loading the dashboard right after login - before this
// save has actually reached Firestore, that next request's own reload can
// read the old snapshot and silently wipe out the very session/data change
// that was just supposedly saved. Awaiting this before the response goes
// out closes that race for the overwhelmingly common case (sequential
// requests); only truly simultaneous requests from two different clients
// remain the known, already-documented edge case.
function saveState(): Promise<void> {
  const fdb = getFirestoreDb();
  if (fdb) {
    // Snapshot the in-memory state synchronously, right now, before any
    // awaiting - so this save reflects everything mutated up to this exact
    // instant, even while an earlier-queued save is still in flight.
    const payload = {
      users: JSON.stringify(dbState.users),
      workspaces: JSON.stringify(Object.fromEntries(dbState.workspaces)),
      sessions: JSON.stringify(Array.from(dbState.sessions.entries())),
      saved_at: new Date().toISOString(),
    };
    firestoreSaveChain = firestoreSaveChain
      .then(() => fdb.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC_ID).set(payload))
      .then(() => undefined)
      .catch((e) => console.error('Failed to save data to Firestore:', e));
    return firestoreSaveChain;
  }

  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const payload = JSON.stringify({
      users: dbState.users,
      workspaces: Object.fromEntries(dbState.workspaces),
      sessions: Array.from(dbState.sessions.entries()),
    });
    // Write to a temp file and rename over the real one, so a crash
    // mid-write can never leave a half-written, corrupted data file.
    const tmpFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmpFile, payload);
    fs.renameSync(tmpFile, DATA_FILE);
  } catch (e) {
    console.error('Failed to save data to disk:', e);
  }
  return Promise.resolve();
}

// Returns the calling user's own workspace, creating a fresh blank one the
// first time it's needed (covers the admin account, and is a safety net
// for any account that somehow doesn't have one yet).
function getWorkspace(userId: string): Workspace {
  let ws = dbState.workspaces.get(userId);
  if (!ws) {
    ws = createBlankWorkspace();
    dbState.workspaces.set(userId, ws);
  }
  return ws;
}

function allWorkspaces(): Workspace[] {
  return Array.from(dbState.workspaces.values());
}

// AI helper supporting OpenAI and Gemini, with an honest empty-string
// fallback when neither is configured (every caller already treats "" as
// "no AI available" and falls back to real, non-fabricated deterministic
// content - see analyzeProjectWithAI, generateQuizWithAI, etc.).
//
// OpenAI is preferred when both keys happen to be set, since it's the
// provider actually funded for this deployment; Gemini stays supported so
// nothing breaks for anyone who configured that instead.
type AIProvider = 'openai' | 'gemini';

function currentAIProvider(): AIProvider | null {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return null;
}

let aiClient: OpenAI | GoogleGenAI | null = null;
let aiClientProvider: AIProvider | null = null;
function getAI(): { client: OpenAI | GoogleGenAI; provider: AIProvider } | null {
  const provider = currentAIProvider();
  if (!provider) return null;
  if (!aiClient || aiClientProvider !== provider) {
    aiClient = provider === 'openai'
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    aiClientProvider = provider;
  }
  return { client: aiClient, provider };
}

async function queryAI(systemPrompt: string, userPrompt: string, opts: { expectJson?: boolean } = {}): Promise<string> {
  const ai = getAI();
  if (!ai) return "";
  try {
    if (ai.provider === 'openai') {
      const response = await (ai.client as OpenAI).chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        ...(opts.expectJson ? { response_format: { type: 'json_object' as const } } : {}),
      });
      return response.choices[0]?.message?.content || "";
    } else {
      const response = await (ai.client as GoogleGenAI).models.generateContent({
        model: 'gemini-3.6-flash',
        contents: `${systemPrompt}\n\nUser Question:\n${userPrompt}`,
      });
      return response.text || "";
    }
  } catch (e) {
    console.warn(`${ai.provider} API call failed, using deterministic response`, e);
    return "";
  }
}

// --- Project code scan: real, file-derived signal detection, no invented ---
// --- technologies. This replaces an earlier version that returned the ---
// --- exact same hardcoded "FastAPI / React / PostgreSQL" analysis for ---
// --- every project regardless of what was actually submitted. ---
const LANGUAGE_BY_EXT: Record<string, string> = {
  py: 'Python', ts: 'TypeScript', tsx: 'TypeScript (React)', js: 'JavaScript', jsx: 'JavaScript (React)',
  java: 'Java', go: 'Go', rb: 'Ruby', php: 'PHP', cs: 'C#', cpp: 'C++', cc: 'C++', c: 'C', sql: 'SQL',
  html: 'HTML', css: 'CSS', scss: 'SCSS', swift: 'Swift', kt: 'Kotlin', rs: 'Rust', json: 'JSON',
  yml: 'YAML', yaml: 'YAML', md: 'Markdown', sh: 'Shell', dart: 'Dart', vue: 'Vue',
};

const FRAMEWORK_SIGNATURES: [RegExp, string][] = [
  [/from\s+fastapi|import\s+fastapi/i, 'FastAPI'],
  [/from\s+flask|import\s+flask/i, 'Flask'],
  [/from\s+django|import\s+django/i, 'Django'],
  [/require\(['"]express['"]\)|from\s+['"]express['"]/i, 'Express'],
  [/from\s+['"]react['"]|import\s+react/i, 'React'],
  [/from\s+['"]vue['"]/i, 'Vue'],
  [/@angular\/core/i, 'Angular'],
  [/org\.springframework/i, 'Spring'],
  [/psycopg2|from\s+sqlalchemy|require\(['"]pg['"]\)|postgres/i, 'PostgreSQL'],
  [/mongoose|mongodb/i, 'MongoDB'],
  [/mysql/i, 'MySQL'],
  [/redis/i, 'Redis'],
  [/tensorflow|torch\b|pytorch/i, 'ML framework (TensorFlow/PyTorch)'],
  [/pandas/i, 'Pandas'],
  [/numpy/i, 'NumPy'],
  [/@google\/genai|openai|anthropic/i, 'LLM API client'],
];

function analyzeProjectFiles(files: { name: string; content: string }[]) {
  const languages = new Set<string>();
  const frameworks = new Set<string>();
  let totalLines = 0;
  for (const f of files || []) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (LANGUAGE_BY_EXT[ext]) languages.add(LANGUAGE_BY_EXT[ext]);
    const content = f.content || '';
    totalLines += content ? content.split('\n').length : 0;
    for (const [pattern, name] of FRAMEWORK_SIGNATURES) {
      if (pattern.test(content) || pattern.test(f.name)) frameworks.add(name);
    }
  }
  const hasDocker = (files || []).some(f => /dockerfile/i.test(f.name) || /docker-compose/i.test(f.name));
  const hasTests = (files || []).some(f =>
    /(^|\/)(tests?|specs?|__tests__)(\/|$)/i.test(f.name) ||
    /\.(test|spec)\.[jt]sx?$/i.test(f.name) ||
    /^test_.*\.py$/i.test(f.name.split('/').pop() || '')
  );
  const hasDatabase = frameworks.has('PostgreSQL') || frameworks.has('MongoDB') || frameworks.has('MySQL') || frameworks.has('Redis');
  return {
    detected_languages: Array.from(languages),
    detected_frameworks: Array.from(frameworks),
    file_count: (files || []).length,
    total_lines_of_code: totalLines,
    has_docker: hasDocker,
    has_tests: hasTests,
    has_database: hasDatabase,
  };
}

// If an AI provider (OpenAI or Gemini) is configured, ask it to review the actual submitted code
// and return strict JSON. Returns null (never invented content) if no key is
// set, the call fails, or the response isn't valid JSON - callers fall back
// to a heuristic, signal-only summary in that case.
async function analyzeProjectWithAI(title: string, description: string, files: { name: string; content: string }[]): Promise<any | null> {
  const ai = getAI();
  if (!ai || !files?.length) return null;
  const excerpt = files
    .map(f => `--- ${f.name} ---\n${(f.content || '').slice(0, 3000)}`)
    .join('\n\n')
    .slice(0, 12000);
  const system = 'You are a precise, honest code reviewer for a student project portfolio tool. Base every statement strictly on what is actually visible in the submitted files. Never invent a technology, framework, or architectural claim that the code does not show evidence of. If the submitted code is minimal, say so plainly instead of padding the review.';
  const prompt = `Project title: "${title}"\nProject description: "${description || 'none provided'}"\n\nSubmitted files:\n${excerpt}\n\nRespond with ONLY valid JSON, no markdown code fences, matching exactly this shape:\n{"analysis_summary": string, "architecture": string, "strengths": string[], "improvements": string[], "professional_summary": string, "career_value": string}\nKeep each string concise (1-2 sentences). "strengths" and "improvements" should each have 2-4 short items.`;
  const raw = await queryAI(system, prompt, { expectJson: true });
  if (!raw) return null;
  try {
    const cleaned = raw.trim().replace(/^```(json)?\s*/i, '').replace(/```\s*$/i, '');
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === 'object' && parsed) return parsed;
    return null;
  } catch (e) {
    console.warn('Could not parse AI project-analysis response as JSON, using heuristic fallback', e);
    return null;
  }
}

// --- Quiz generation: real questions written by the configured AI provider
// --- for the module and topic the student picks, grounded in that
// --- student's own uploaded course documents when a keyword match is found
// --- for the topic, otherwise written from general subject knowledge.
// --- Unlike the project review above there is no honest heuristic fallback
// --- for "write a correct multiple-choice question" without a real
// --- knowledge source, so when no AI key is configured this returns null
// --- and the calling route says so plainly instead of presenting
// --- fabricated questions.
async function generateQuizWithAI(
  moduleCode: string,
  moduleName: string,
  topic: string,
  questionCount: number,
  groundingChunks: string[]
): Promise<{ questions: any[]; source: 'documents' | 'topic_only' } | null> {
  const ai = getAI();
  if (!ai) return null;
  const hasGrounding = groundingChunks.length > 0;
  const groundingText = hasGrounding ? groundingChunks.join('\n---\n').slice(0, 10000) : '';
  const system = 'You are an exam-preparation quiz writer for a university student. Write clear, accurate multiple-choice questions strictly about the requested topic, at a level appropriate for the named module. Every question must have exactly 4 options with exactly one unambiguously correct answer, plus a short explanation of why that answer is correct. Never invent facts that contradict any provided source material. If no source material is provided, rely on well-established, mainstream knowledge of the topic rather than obscure or disputed claims.';
  const prompt = hasGrounding
    ? `Module: ${moduleCode} ${moduleName}\nTopic: "${topic}"\n\nBase the questions on this material from the student's own uploaded course documents:\n${groundingText}\n\nWrite ${questionCount} multiple-choice questions on this topic. Respond with ONLY valid JSON, no markdown code fences, matching exactly this shape:\n{"questions": [{"question": string, "options": [string, string, string, string], "correct_index": number, "explanation": string}]}`
    : `Module: ${moduleCode} ${moduleName}\nTopic: "${topic}"\n\nNo matching course documents were found for this topic, so write ${questionCount} multiple-choice questions a strong undergraduate student would be expected to answer correctly on this topic, based on standard curriculum knowledge. Respond with ONLY valid JSON, no markdown code fences, matching exactly this shape:\n{"questions": [{"question": string, "options": [string, string, string, string], "correct_index": number, "explanation": string}]}`;
  const raw = await queryAI(system, prompt, { expectJson: true });
  if (!raw) return null;
  try {
    const cleaned = raw.trim().replace(/^```(json)?\s*/i, '').replace(/```\s*$/i, '');
    const parsed = JSON.parse(cleaned);
    const rawQuestions = Array.isArray(parsed?.questions) ? parsed.questions : [];
    const valid = rawQuestions.filter((q: any) =>
      q && typeof q.question === 'string' && q.question.trim() &&
      Array.isArray(q.options) && q.options.length === 4 &&
      q.options.every((o: any) => typeof o === 'string' && o.trim()) &&
      Number.isInteger(q.correct_index) && q.correct_index >= 0 && q.correct_index <= 3
    );
    if (!valid.length) return null;
    return { questions: valid, source: hasGrounding ? 'documents' : 'topic_only' };
  } catch (e) {
    console.warn('Could not parse AI quiz-generation response as JSON', e);
    return null;
  }
}

// --- Live job listings: real open postings from Adzuna's job search API
// --- (https://developer.adzuna.com), scoped to South Africa specifically
// --- (Adzuna's "za" country endpoint) - the earlier source used here
// --- (Arbeitnow) turned out to have zero South African coverage at all, it
// --- only aggregates European/remote-tech listings, so it was replaced
// --- outright rather than kept alongside this one. Unlike Arbeitnow,
// --- Adzuna requires a free developer account (app_id + app_key from
// --- developer.adzuna.com) - if neither is configured, the route says so
// --- plainly (see isJobsConfigured below) instead of silently returning
// --- nothing or, worse, inventing listings. If the upstream API can't be
// --- reached, the route also reports that plainly rather than fabricating
// --- postings, which would be a much worse failure mode than an honest
// --- error for something students might actually act on.
const JOBS_SOURCE_LABEL = 'Adzuna South Africa (adzuna.co.za) - a real job listings aggregator, scoped to South African postings';
const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID;
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY;

function isJobsConfigured(): boolean {
  return !!(ADZUNA_APP_ID && ADZUNA_APP_KEY);
}

function stripHtml(html: string): string {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

// Cached per exact (query, remoteOnly) combination, not as one shared batch -
// unlike the old Arbeitnow integration, Adzuna does real server-side keyword
// filtering per request via `what`, so there's no single "all jobs" batch to
// fetch once and filter locally anymore. Adzuna's free tier is a limited
// number of calls a month (not unlimited like Arbeitnow was), so caching
// repeat searches matters more here.
const jobsCache = new Map<string, { fetchedAt: number; jobs: any[] }>();
const JOBS_CACHE_TTL_MS = 15 * 60 * 1000;

async function fetchRawJobs(query: string): Promise<any[]> {
  const cacheKey = query.toLowerCase();
  const cached = jobsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < JOBS_CACHE_TTL_MS) {
    return cached.jobs;
  }
  const params = new URLSearchParams({
    app_id: ADZUNA_APP_ID!,
    app_key: ADZUNA_APP_KEY!,
    results_per_page: '30',
    'content-type': 'application/json',
  });
  if (query) params.set('what', query);
  const res = await fetch(`https://api.adzuna.com/v1/api/jobs/za/search/1?${params.toString()}`);
  if (!res.ok) throw new Error(`Adzuna API returned HTTP ${res.status}`);
  const body: any = await res.json();
  const jobs = Array.isArray(body?.results) ? body.results : [];
  jobsCache.set(cacheKey, { fetchedAt: Date.now(), jobs });
  return jobs;
}

const REMOTE_HINT_RE = /\bremote\b|work[\s-]?from[\s-]?home|\btelecommute\b|\bwfh\b/i;

function mapJob(raw: any) {
  const title = raw.title || '';
  const description = stripHtml(raw.description || '');
  const jobTypes: string[] = [];
  if (raw.contract_time === 'full_time') jobTypes.push('Full-time');
  if (raw.contract_time === 'part_time') jobTypes.push('Part-time');
  if (raw.contract_type === 'permanent') jobTypes.push('Permanent');
  if (raw.contract_type === 'contract') jobTypes.push('Contract');
  return {
    id: String(raw.id ?? raw.redirect_url ?? title),
    title,
    company: raw.company?.display_name || 'Unspecified company',
    location: raw.location?.display_name || 'South Africa',
    // Adzuna has no real "is this remote" field - this is a best-effort
    // signal derived from the actual title/description text, same honest-
    // keyword-match philosophy used everywhere else in this app, never
    // presented as a confirmed fact the listing doesn't actually state.
    remote: REMOTE_HINT_RE.test(`${title} ${description}`),
    tags: raw.category?.label ? [raw.category.label] : [],
    job_types: jobTypes,
    description: description.slice(0, 1500),
    url: raw.redirect_url || '',
    posted_at: raw.created || null,
    source: 'Adzuna'
  };
}

const JOB_QUERY_STOPWORDS = new Set(['a', 'an', 'the', 'and', 'or', 'for', 'in', 'at', 'of', 'to', 'with', 'jobs', 'job', 'position', 'role', 'work']);

// Adzuna already does real server-side relevance filtering via `what`, so
// unlike the old local-only Arbeitnow filtering this doesn't drop results -
// it only applies the remote-only toggle (using the heuristic above, since
// Adzuna has no real remote field) and computes a transparent match_score
// for display, the same honest-keyword-match philosophy as
// searchWorkspaceDocuments below - real matching against real listing text,
// never an invented "AI job match score".
function scoreAndFilterJobs(rawJobs: any[], query: string, remoteOnly: boolean) {
  const qWords = (query || '').toLowerCase().split(/\s+/).filter((w) => w.length > 1 && !JOB_QUERY_STOPWORDS.has(w));
  const mapped = rawJobs.map(mapJob);
  const pool = mapped.filter((j) => !remoteOnly || j.remote === true);
  const scored = pool.map((j) => {
    const haystack = `${j.title} ${j.company} ${j.location} ${j.tags.join(' ')} ${j.description}`.toLowerCase();
    const matchedCount = qWords.filter((w) => haystack.includes(w)).length;
    const match_score = qWords.length ? Number((matchedCount / qWords.length).toFixed(2)) : 1;
    return { ...j, match_score };
  });
  scored.sort((a, b) => b.match_score - a.match_score);
  return scored;
}

// --- Cover letter drafting: grounded strictly in the student's own real
// --- profile (modules, skills, projects) - the same "never invent facts"
// --- rule used for project reviews and quizzes above. No AI key means
// --- no draft, not a templated fake letter claiming experience the
// --- student doesn't have.
async function draftCoverLetterWithAI(
  student: any,
  modules: any[],
  skills: any[],
  projects: any[],
  job: { title: string; company: string; location?: string; description?: string }
): Promise<string | null> {
  const ai = getAI();
  if (!ai) return null;
  const completedModules = (modules || [])
    .filter((m: any) => m.status === 'completed')
    .map((m: any) => `${m.code} ${m.name}${m.final_mark != null ? ` (${m.final_mark}%)` : ''}`)
    .slice(0, 8);
  const skillList = (skills || []).map((s: any) => s.name).slice(0, 15);
  const projectList = (projects || [])
    .map((p: any) => `${p.title}${p.technologies?.length ? ` (${p.technologies.slice(0, 4).join(', ')})` : ''}`)
    .slice(0, 5);

  const system = 'You are a career-writing assistant helping a university student draft a short, honest cover letter. Use ONLY the facts given below about the student - their real modules, skills, and projects. Never invent work experience, achievements, employers, or qualifications the student was not given credit for. If little is listed, write a shorter, more general letter rather than padding it with invented specifics.';
  const prompt = `Student: ${student?.degree || 'undergraduate'} student${student?.major ? `, majoring in ${student.major}` : ''}${student?.university ? ` at ${student.university}` : ''}, year ${student?.year_of_study || 'unspecified'}.\nCompleted modules: ${completedModules.join('; ') || 'none listed yet'}.\nSkills: ${skillList.join(', ') || 'none listed yet'}.\nProjects: ${projectList.join('; ') || 'none listed yet'}.\n\nJob: "${job.title}" at ${job.company}, location: ${job.location || 'not specified'}.\nJob description excerpt: ${(job.description || '').slice(0, 1500)}\n\nWrite a concise, professional cover letter (roughly 200-300 words) for this student applying to this role. Address it generically ("Dear Hiring Manager") since there is no named contact. Do not invent a return address, phone number, or date.`;

  const raw = await queryAI(system, prompt);
  return raw && raw.trim() ? raw.trim() : null;
}

// --- CV-vs-job matching: compares the actual extracted text of a student's
// --- uploaded CV against the actual text of a specific job description.
// --- Same "never invent" rule as the cover letter drafter above - gaps and
// --- strengths must come from what's really on the page, not from what a
// --- generic candidate for this role would plausibly have.
async function matchCvToJobWithAI(
  cvText: string,
  job: { title: string; company: string; description?: string }
): Promise<any | null> {
  const ai = getAI();
  if (!ai) return null;
  const system = 'You are a careful, honest CV/resume reviewer helping a student tailor their real CV to a specific job description. Base every observation STRICTLY on the actual text of the CV and the job description given below. Never invent experience, skills, qualifications, or achievements that are not actually present in the CV text. If the CV is a weak match for this job, say so plainly rather than padding the analysis with generic encouragement.';
  const prompt = `CV / resume text (as extracted from the student's uploaded file):\n${cvText.slice(0, 8000)}\n\nJob: "${job.title}" at ${job.company}.\nJob description:\n${(job.description || '').slice(0, 4000)}\n\nRespond with ONLY valid JSON, no markdown code fences, matching exactly this shape:\n{"match_summary": string, "strengths": string[], "gaps": string[], "missing_keywords": string[], "suggested_edits": string[]}\n"match_summary" is 2-3 sentences on overall fit, stated plainly even if the fit is weak. "strengths" are genuine overlaps between the CV and the job (2-5 short items). "gaps" are genuine mismatches or requirements the CV doesn't address (2-5 short items). "missing_keywords" are specific terms or skills from the job description that don't appear in the CV (up to 8). "suggested_edits" are concrete, specific rewording or addition suggestions for the student's CV, each grounded in something already true about them from the CV text - never a suggestion to claim something not already there (3-6 items).`;

  const raw = await queryAI(system, prompt, { expectJson: true });
  if (!raw) return null;
  try {
    const cleaned = raw.trim().replace(/^```(json)?\s*/i, '').replace(/```\s*$/i, '');
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed.match_summary === 'string') return parsed;
    return null;
  } catch (e) {
    console.warn('Could not parse AI CV-match response as JSON', e);
    return null;
  }
}

// Builds and returns the Express app, but does not start listening - that
// split exists because Vercel's Node runtime imports this app directly and
// calls it as a request handler itself (see the bottom of this file); it
// must never also start its own separate app.listen(), or the two would
// fight over the same responsibilities.
async function buildApp() {
  // Must finish before anything else - every route handler below assumes
  // dbState is already populated.
  await loadState();

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // On a host that can run more than one instance of this app at once
  // (Vercel's serverless functions, or Cloud Run if it ever scales past a
  // single instance), the in-memory dbState this process started with can
  // silently drift from what other instances have since saved - one
  // instance's copy stays stale while another's moves on. Firestore is the
  // one thing every instance shares, so when it's configured, reload from
  // it at the start of every request rather than trusting whatever this
  // particular instance loaded at its own startup. This does NOT fully
  // eliminate the risk (two requests landing at almost the same instant on
  // two different instances can still race and the second save can
  // overwrite the first), but it closes the far more common and far worse
  // case of a long-lived stale copy. Skipped entirely on the local-file
  // backend, where there's always exactly one process and this would just
  // be unnecessary work.
  if (isFirestoreConfigured()) {
    app.use((req, res, next) => {
      loadState().then(() => next()).catch(next);
    });
  }

  // Standard HTTP security headers (X-Content-Type-Options, X-Frame-Options,
  // HSTS, etc). Content-Security-Policy is left off deliberately - this
  // process serves its own bundled frontend (Vite dev middleware / built
  // assets) from the same origin, and helmet's default CSP would need to be
  // hand-tuned for that bundle's inline styles/scripts or it silently breaks
  // the UI. Turning off just the CSP directive keeps the rest of the
  // hardening without that risk.
  app.use(helmet({ contentSecurityPolicy: false }));

  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // Rate limit login/register specifically - these are the endpoints an
  // attacker would actually hammer (password guessing, account enumeration).
  // Everything else stays unlimited so normal use of the app isn't affected.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { detail: 'Too many attempts. Please wait a few minutes and try again.' },
  });

  // Persist after every successful request that changes state, rather than
  // hunting down and instrumenting every individual mutating route by hand.
  // GET requests and failed requests (nothing actually changed) don't
  // trigger a write.
  //
  // This intercepts res.json() itself - the save happens and is awaited
  // BEFORE the response body is actually sent to the client - rather than
  // listening for the 'finish' event, which only fires after the response
  // has already gone out. That distinction was a real bug: with 'finish',
  // a client that received e.g. a login token would immediately fire its
  // next request (the frontend does exactly this, loading the dashboard
  // right after login) before the save had actually reached Firestore, and
  // that next request's own per-request Firestore reload would then read
  // the old snapshot - silently discarding the very session that was just
  // "saved", and making every request right after login/register fail with
  // 401 "Not authenticated". Awaiting the save before responding closes
  // that race for normal sequential use.
  app.use((req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (req.method !== 'GET' && res.statusCode < 400) {
        saveState()
          .catch((e) => console.error('Failed to persist state before responding:', e))
          .then(() => originalJson(body));
        return res;
      }
      return originalJson(body);
    }) as typeof res.json;
    next();
  });

  // Auth middleware - every protected route below requires a valid bearer
  // token that maps to a real, active session. Unlike before, tokens are
  // opaque random strings looked up in `sessions`, not derived from (and
  // therefore never forgeable from) the user id.
  const requireAuth: express.RequestHandler = (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const userId = token ? dbState.sessions.get(token) : undefined;
    const user = userId ? dbState.users.find(u => u.id === userId) : undefined;
    if (!user || !user.is_active) {
      return res.status(401).json({ detail: 'Not authenticated' });
    }
    (req as any).user = user;
    next();
  };

  const requireAdmin: express.RequestHandler = (req, res, next) => {
    requireAuth(req, res, () => {
      if ((req as any).user.role !== 'admin') {
        return res.status(403).json({ detail: 'Administrator privileges required' });
      }
      next();
    });
  };

  // 1. Mandatory instant Health Check
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'UniAgent',
      version: '0.1.0'
    });
  });

  // 2. Auth Endpoints
  app.post('/api/v1/auth/login', authLimiter, (req, res) => {
    const { email, password } = req.body;
    const user = dbState.users.find(u => u.email.toLowerCase() === (email || '').toLowerCase());
    if (!user || !password || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ detail: 'Invalid email or password' });
    }
    if (!user.is_active) {
      return res.status(400).json({ detail: 'Account is disabled' });
    }
    const token = issueToken(user.id);
    res.json({
      access_token: token,
      refresh_token: token,
      token_type: 'bearer',
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role
      }
    });
  });

  app.post('/api/v1/auth/register', authLimiter, (req, res) => {
    const {
      email, password, full_name, student_number,
      university, degree, major, year_of_study, target_gpa
    } = req.body;
    if (!email || !password) {
      return res.status(400).json({ detail: 'Email and password are required' });
    }
    if (dbState.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      return res.status(400).json({ detail: 'An account with this email address already exists' });
    }
    // Public self-registration always creates a "student" account - role is
    // intentionally never taken from client input here - EXCEPT for the
    // very first account ever created on a fresh server. There's no seeded
    // demo admin anymore, so without this bootstrap there would be no way
    // for anyone to reach an admin account at all. Every account after the
    // first is promoted the normal way, via an existing admin using
    // PUT /admin/users/:id/role.
    const role = dbState.users.length === 0 ? "admin" : "student";
    const newUser = {
      id: `u-${Date.now()}`,
      email,
      full_name: full_name || "New Student",
      role,
      is_active: true,
      password_hash: hashPassword(password)
    };
    dbState.users.push(newUser);
    // Every new account gets its own blank workspace, populated only with
    // whatever academic details were supplied at signup - nothing is shared
    // or inherited from any other account.
    dbState.workspaces.set(newUser.id, createBlankWorkspace({
      student_number,
      university,
      degree,
      major,
      year_of_study: year_of_study ? Number(year_of_study) : undefined,
      target_gpa: target_gpa ? Number(target_gpa) : undefined,
    }));
    const token = issueToken(newUser.id);
    res.json({
      access_token: token,
      refresh_token: token,
      token_type: 'bearer',
      user: {
        id: newUser.id,
        email: newUser.email,
        full_name: newUser.full_name,
        role: newUser.role
      }
    });
  });

  // Self-service password change for whoever is currently signed in. Until
  // this existed, the ONLY way to change a password was an admin resetting
  // someone else's from the Admin panel - which left the admin account
  // itself with no path back in if that password was ever forgotten, and
  // left every other account unable to simply pick their own password
  // instead of living with whatever they registered with. Requires the
  // current password (not just a valid session) so a signed-in-but-
  // unattended browser tab can't be used to lock the real owner out.
  app.post('/api/v1/auth/change-password', requireAuth, (req, res) => {
    const user = (req as any).user;
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ detail: 'Current and new password are required' });
    }
    if (!verifyPassword(current_password, user.password_hash)) {
      return res.status(401).json({ detail: 'Current password is incorrect' });
    }
    if (String(new_password).length < 8) {
      return res.status(400).json({ detail: 'New password must be at least 8 characters' });
    }
    user.password_hash = hashPassword(new_password);
    // Same as an admin-initiated reset: every existing session for this
    // account is invalidated, including the one that just made this
    // request. The response below still reaches the caller fine (auth was
    // already checked before this point) - the frontend treats a 200 here
    // as "log in again with the new password."
    revokeSessionsForUser(user.id);
    res.json({ message: 'Password changed successfully. Please log in again with your new password.' });
  });

  app.get('/api/v1/auth/me', requireAuth, (req, res) => {
    const user = (req as any).user;
    const ws = getWorkspace(user.id);
    res.json({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      student: ws.student
    });
  });

  // Matches the FastAPI backend's PUT /users/profile contract: updates the
  // logged-in user's display name plus their student academic profile in
  // one call (the frontend previously called a /users/me/student path that
  // neither backend actually exposed, so profile edits silently no-op'd).
  app.put('/api/v1/users/profile', requireAuth, (req, res) => {
    const { full_name, ...studentFields } = req.body;
    const currentUser = (req as any).user;
    if (full_name) {
      currentUser.full_name = full_name;
    }
    const ws = getWorkspace(currentUser.id);
    ws.student = { ...ws.student, ...studentFields };
    res.json({ message: 'Profile updated successfully' });
  });

  // 3. Academic Endpoints
  app.get('/api/v1/academic/modules', requireAuth, (req, res) => {
    res.json(getWorkspace((req as any).user.id).modules);
  });

  app.post('/api/v1/academic/modules', requireAuth, (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    const newMod = {
      id: `m-${Date.now()}`,
      ...req.body,
      is_distinction: req.body.is_distinction || (req.body.final_mark >= 75)
    };
    ws.modules.unshift(newMod);
    res.json(newMod);
  });

  app.put('/api/v1/academic/modules/:id', requireAuth, (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    const idx = ws.modules.findIndex((m: any) => m.id === req.params.id);
    if (idx !== -1) {
      const updated = { ...ws.modules[idx], ...req.body };
      // Recompute is_distinction from the (possibly just-updated) final_mark,
      // unless the caller explicitly set is_distinction in this same request
      // - otherwise a module edited down after once scoring >=75 stays
      // flagged as a distinction forever.
      if (!('is_distinction' in req.body)) {
        updated.is_distinction = typeof updated.final_mark === 'number' && updated.final_mark >= 75;
      }
      ws.modules[idx] = updated;
      return res.json(ws.modules[idx]);
    }
    res.status(404).json({ detail: "Module not found" });
  });

  app.delete('/api/v1/academic/modules/:id', requireAuth, (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    ws.modules = ws.modules.filter((m: any) => m.id !== req.params.id);
    res.json({ message: "Module deleted" });
  });

  app.get('/api/v1/academic/stats', requireAuth, (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    const completed = ws.modules.filter((m: any) => m.status === 'completed' && m.final_mark);
    const distinctions = completed.filter((m: any) => m.is_distinction || m.final_mark >= 75).length;
    const avg = completed.reduce((acc: number, m: any) => acc + (m.final_mark || 0), 0) / (completed.length || 1);
    const totalCredits = completed.reduce((acc: number, m: any) => acc + (m.credits || 0), 0);

    // Real per-semester trend, computed from this account's actual modules -
    // not a fixed sample history shown to every account regardless of what
    // they've actually entered.
    const bySemester = new Map<string, { year: number; totalMark: number; totalCredits: number; count: number }>();
    completed.forEach((m: any) => {
      const key = `${m.semester || 'Unspecified'} ${m.year || ''}`.trim();
      const entry = bySemester.get(key) || { year: m.year || 0, totalMark: 0, totalCredits: 0, count: 0 };
      entry.totalMark += (m.final_mark || 0) * (m.credits || 1);
      entry.totalCredits += (m.credits || 1);
      entry.count += 1;
      bySemester.set(key, entry);
    });
    const trends = Array.from(bySemester.entries())
      .map(([semester, v]) => ({
        semester,
        average: Number((v.totalMark / v.totalCredits).toFixed(1)),
        credits: v.totalCredits,
        year: v.year,
      }))
      .sort((a, b) => a.year - b.year || a.semester.localeCompare(b.semester))
      .map(({ year, ...rest }) => rest);

    res.json({
      gpa: ws.student.gpa,
      target_gpa: ws.student.target_gpa,
      credits_earned: totalCredits || ws.student.credits_earned,
      credits_required: ws.student.credits_required,
      average_mark: completed.length ? Number(avg.toFixed(2)) : null,
      total_modules: ws.modules.length,
      completed_modules: completed.length,
      in_progress_modules: ws.modules.filter((m: any) => m.status === 'in_progress').length,
      planned_modules: ws.modules.filter((m: any) => m.status === 'planned').length,
      distinctions: distinctions,
      distinction_rate_percent: completed.length ? Number(((distinctions / completed.length) * 100).toFixed(1)) : null,
      trends,
    });
  });

  // 4. Projects Endpoints & AST Scanner
  app.get('/api/v1/projects', requireAuth, (req, res) => {
    res.json(getWorkspace((req as any).user.id).projects);
  });

  app.get('/api/v1/projects/:id', requireAuth, (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    const proj = ws.projects.find((p: any) => p.id === req.params.id);
    if (proj) return res.json(proj);
    res.status(404).json({ detail: "Project not found" });
  });

  app.post('/api/v1/projects', requireAuth, async (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    const { title, description, repository_url, live_url, project_type, files } = req.body;

    const metrics = analyzeProjectFiles(files || []);
    const technologies = [...metrics.detected_languages, ...metrics.detected_frameworks];
    const aiReview = await analyzeProjectWithAI(title || 'Untitled project', description || '', files || []);

    // Every narrative field below is either the AI's actual review of the
    // submitted code (when an AI provider is configured and the file content
    // gave it something to work with) or an honest, signal-only fallback -
    // never a fixed description reused across every project.
    const noAiNote = metrics.file_count === 0
      ? 'No source files were submitted, so nothing could be analyzed.'
      : 'No AI-written review is available (no AI provider API key configured on this server). The fields below reflect only what could be detected from file names and content keywords.';

    const newProj = {
      id: `p-${Date.now()}`,
      title: title || "New Student Project",
      description: description || "",
      repository_url: repository_url || undefined,
      live_url: live_url || null,
      project_type: project_type || "Full-Stack Web App",
      status: "completed",
      analysis_summary: aiReview?.analysis_summary || noAiNote,
      technologies: technologies.length ? technologies : ['No recognizable languages or frameworks detected'],
      architecture: aiReview?.architecture || (metrics.file_count
        ? `Heuristic scan only: ${technologies.length ? technologies.join(', ') : 'no recognizable technologies'} detected across ${metrics.file_count} file(s).`
        : 'Not determined - no files were submitted for this project.'),
      main_features: [],
      functionality: aiReview?.analysis_summary || undefined,
      database_info: metrics.has_database ? `Detected: ${metrics.detected_frameworks.filter(f => ['PostgreSQL', 'MongoDB', 'MySQL', 'Redis'].includes(f)).join(', ')}` : 'No database usage detected in submitted files.',
      api_info: metrics.detected_frameworks.some(f => ['FastAPI', 'Express', 'Flask', 'Django', 'Spring'].includes(f))
        ? `Detected: ${metrics.detected_frameworks.filter(f => ['FastAPI', 'Express', 'Flask', 'Django', 'Spring'].includes(f)).join(', ')}`
        : 'No backend API framework detected in submitted files.',
      frontend_info: metrics.detected_frameworks.some(f => ['React', 'Vue', 'Angular'].includes(f))
        ? `Detected: ${metrics.detected_frameworks.filter(f => ['React', 'Vue', 'Angular'].includes(f)).join(', ')}`
        : 'No frontend framework detected in submitted files.',
      backend_info: metrics.detected_languages.join(', ') || 'Not determined.',
      ai_components: metrics.detected_frameworks.includes('LLM API client') ? 'Detected an LLM API client library in the submitted files.' : 'No AI/LLM library usage detected in submitted files.',
      security_info: 'Not assessed - this scan does not audit for security issues.',
      strengths: aiReview?.strengths || (metrics.has_tests ? ['Includes test files'] : []),
      weaknesses: [],
      improvements: aiReview?.improvements || (metrics.has_tests ? [] : ['Add automated tests - none were detected in the submitted files']),
      skills_demonstrated: technologies,
      career_value: aiReview?.career_value || undefined,
      professional_summary: aiReview?.professional_summary || (technologies.length
        ? `Built ${title || 'a project'} using ${technologies.slice(0, 3).join(', ')}.`
        : undefined),
      code_metrics: metrics,
      created_at: new Date().toISOString()
    };

    ws.projects.unshift(newProj);
    res.json(newProj);
  });

  app.delete('/api/v1/projects/:id', requireAuth, (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    ws.projects = ws.projects.filter((p: any) => p.id !== req.params.id);
    res.json({ message: "Project deleted" });
  });

  // 5. Document Ingestion & Search
  // Splits real text into readable, paragraph-aware chunks instead of the
  // old fixed two-chunk slice (which just cut every document at character
  // 300 and 600 regardless of content, and produced garbage for anything
  // longer than ~600 characters). Capped at 40 chunks so one huge file
  // can't blow up memory or the response payload.
  function chunkText(text: string, maxChunkChars = 800) {
    const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const chunks: string[] = [];
    let current = '';
    for (const p of paragraphs) {
      if (current && (current.length + p.length + 2) > maxChunkChars) {
        chunks.push(current.trim());
        current = p;
      } else {
        current = current ? `${current}\n\n${p}` : p;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    if (chunks.length === 0 && text.trim()) chunks.push(text.trim().slice(0, maxChunkChars));
    return chunks.slice(0, 40).map((content, idx) => ({
      chunk_index: idx,
      content,
      token_count: Math.max(1, Math.round(content.split(/\s+/).filter(Boolean).length * 1.3))
    }));
  }

  const fileUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  app.get('/api/v1/documents', requireAuth, (req, res) => {
    res.json(getWorkspace((req as any).user.id).documents);
  });

  // Paste-text ingestion - kept as a lightweight fallback alongside real
  // file upload below, for quickly dropping in a short note or rubric.
  app.post('/api/v1/documents/upload', requireAuth, (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    const { filename, content, document_type } = req.body;
    if (!filename || !content || !String(content).trim()) {
      return res.status(400).json({ detail: 'A filename and non-empty text content are required.' });
    }
    const chunks = chunkText(String(content));
    const newDoc = {
      id: `doc-${Date.now()}`,
      filename,
      original_name: filename,
      mime_type: 'text/plain',
      file_size: Buffer.byteLength(content, 'utf-8'),
      total_chunks: chunks.length,
      document_type: document_type || "general",
      status: "processed",
      created_at: new Date().toISOString(),
      chunks
    };
    ws.documents.unshift(newDoc);
    res.json(newDoc);
  });

  // Real file upload: extracts actual text from PDF and DOCX files instead
  // of requiring students to retype their syllabus into a text box.
  app.post('/api/v1/documents/upload-file', requireAuth, fileUpload.single('file'), async (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ detail: 'No file was uploaded.' });
    }
    const documentType = req.body?.document_type || 'general';
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();

    let textContent = '';
    try {
      if (ext === 'pdf') {
        const pdfParse = (await import('pdf-parse')).default;
        const parsed = await pdfParse(file.buffer);
        textContent = parsed.text;
      } else if (ext === 'docx') {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        textContent = result.value;
      } else if (ext === 'txt' || ext === 'md') {
        textContent = file.buffer.toString('utf-8');
      } else {
        return res.status(400).json({ detail: `Unsupported file type ".${ext}". Upload a PDF, DOCX, TXT, or MD file.` });
      }
    } catch (e) {
      console.warn(`Failed to parse uploaded ${ext} file:`, e);
      return res.status(400).json({ detail: `Couldn't read this ${ext.toUpperCase()} file - it may be corrupted, scanned/image-only, or password protected.` });
    }

    textContent = textContent.trim();
    if (!textContent) {
      return res.status(400).json({ detail: 'No readable text was found in this file.' });
    }

    const chunks = chunkText(textContent);
    const newDoc = {
      id: `doc-${Date.now()}`,
      filename: file.originalname,
      original_name: file.originalname,
      mime_type: file.mimetype || `application/${ext}`,
      file_size: file.size,
      total_chunks: chunks.length,
      document_type: documentType,
      status: "processed",
      created_at: new Date().toISOString(),
      chunks
    };
    ws.documents.unshift(newDoc);
    res.json(newDoc);
  });

  // Real keyword search: only chunks that actually contain a meaningful
  // query word are returned, scored by how much of the query matched (1.0
  // for an exact phrase match, otherwise the fraction of meaningful query
  // words found) - not a fabricated cosine-similarity number, since nothing
  // here computes embeddings. Common stopwords are excluded from matching so
  // an unrelated question ("what is...") doesn't score a false-positive hit
  // purely on words like "the" or "what". Shared by the /documents/search
  // route and the chat "document" agent's fallback so both cite the same
  // real matches.
  const SEARCH_STOPWORDS = new Set(['a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'am',
    'what', 'when', 'where', 'who', 'whom', 'which', 'why', 'how', 'do', 'does', 'did',
    'of', 'in', 'on', 'at', 'to', 'for', 'with', 'about', 'my', 'your', 'i', 'you', 'it',
    'this', 'that', 'and', 'or', 'but', 'according', 'document', 'according to']);
  function searchWorkspaceDocuments(ws: Workspace, query: string) {
    const qLower = (query || '').trim().toLowerCase();
    const queryWords = qLower.split(/\s+/).filter(w => w && !SEARCH_STOPWORDS.has(w));
    const matches: any[] = [];
    if (!queryWords.length) return matches;

    ws.documents.forEach((doc: any) => {
      // CVs are personal application material, not course content - keep
      // them out of course-document search and the chat assistant's
      // document citations so an unrelated academic query never surfaces a
      // snippet of the student's resume.
      if (doc.document_type === 'cv') return;
      doc.chunks?.forEach((c: any) => {
        const contentLower = c.content.toLowerCase();
        const matchedWords = queryWords.filter(w => contentLower.includes(w));
        if (matchedWords.length === 0) return;
        const exactPhrase = contentLower.includes(qLower);
        const match_score = exactPhrase ? 1 : Number((matchedWords.length / queryWords.length).toFixed(2));
        matches.push({
          chunk_id: `chk-${doc.id}-${c.chunk_index}`,
          document_id: doc.id,
          document_name: doc.original_name,
          document_type: doc.document_type,
          chunk_index: c.chunk_index,
          content: c.content,
          match_score,
          metadata: { filename: doc.original_name }
        });
      });
    });

    matches.sort((a, b) => b.match_score - a.match_score);
    return matches;
  }

  app.post('/api/v1/documents/search', requireAuth, (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    const { query } = req.body;
    const matches = searchWorkspaceDocuments(ws, query);
    res.json({
      query: query,
      total_matches: matches.length,
      results: matches.slice(0, 5)
    });
  });

  app.delete('/api/v1/documents/:id', requireAuth, (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    ws.documents = ws.documents.filter((d: any) => d.id !== req.params.id);
    res.json({ message: "Document removed" });
  });

  // 5b. Quiz Prep Endpoints - AI-generated multiple-choice quizzes for a
  // module/topic the student picks, grounded in their own uploaded course
  // documents when available. There is no meaningful non-AI fallback for
  // "write a correct question", so this is one of the few features that
  // plainly reports "AI not configured" rather than substituting templated
  // content when no AI provider key is set.
  app.get('/api/v1/quizzes', requireAuth, (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    res.json(ws.quizzes.map((q: any) => ({
      id: q.id,
      module_id: q.module_id,
      module_code: q.module_code,
      module_name: q.module_name,
      topic: q.topic,
      question_count: q.questions.length,
      source: q.source,
      created_at: q.created_at
    })));
  });

  app.get('/api/v1/quizzes/attempts', requireAuth, (req, res) => {
    res.json(getWorkspace((req as any).user.id).quiz_attempts);
  });

  app.get('/api/v1/quizzes/:id', requireAuth, (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    const quiz = ws.quizzes.find((q: any) => q.id === req.params.id);
    if (!quiz) return res.status(404).json({ detail: 'Quiz not found' });
    res.json({
      id: quiz.id,
      module_id: quiz.module_id,
      module_code: quiz.module_code,
      module_name: quiz.module_name,
      topic: quiz.topic,
      source: quiz.source,
      created_at: quiz.created_at,
      // Correct answers/explanations are withheld until submission so
      // taking the quiz twice from the same generated set isn't trivially
      // gameable from the network tab.
      questions: quiz.questions.map((q: any) => ({ id: q.id, question: q.question, options: q.options }))
    });
  });

  app.post('/api/v1/quizzes/generate', requireAuth, async (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    const { module_id, topic } = req.body;
    const questionCount = Math.min(10, Math.max(3, Number(req.body.question_count) || 5));

    if (!module_id || !topic || !String(topic).trim()) {
      return res.status(400).json({ detail: 'module_id and topic are required' });
    }
    const mod = ws.modules.find((m: any) => m.id === module_id);
    if (!mod) return res.status(404).json({ detail: 'Module not found' });

    if (!getAI()) {
      return res.json({
        ai_configured: false,
        quiz: null,
        message: 'Quiz generation needs an AI provider connection (OpenAI or Gemini), which is not currently configured on this server. Ask an admin to add an API key, then try again.'
      });
    }

    const trimmedTopic = String(topic).trim();
    const docMatches = searchWorkspaceDocuments(ws, trimmedTopic);
    const groundingChunks = docMatches.slice(0, 6).map((m: any) => m.content);

    const result = await generateQuizWithAI(mod.code, mod.name, trimmedTopic, questionCount, groundingChunks);
    if (!result) {
      return res.json({
        ai_configured: true,
        quiz: null,
        message: `Could not generate a quiz for "${trimmedTopic}" right now. Try again in a moment, or try a slightly different or more specific topic.`
      });
    }

    const quiz = {
      id: `quiz-${Date.now()}`,
      module_id: mod.id,
      module_code: mod.code,
      module_name: mod.name,
      topic: trimmedTopic,
      source: result.source,
      created_at: new Date().toISOString(),
      questions: result.questions.map((q: any, i: number) => ({
        id: `q-${Date.now()}-${i}`,
        question: q.question,
        options: q.options,
        correct_index: q.correct_index,
        explanation: q.explanation || ''
      }))
    };
    ws.quizzes.unshift(quiz);
    ws.quizzes = ws.quizzes.slice(0, 30); // bounded history, not a hard product limit

    res.json({
      ai_configured: true,
      quiz: {
        id: quiz.id,
        module_id: quiz.module_id,
        module_code: quiz.module_code,
        module_name: quiz.module_name,
        topic: quiz.topic,
        source: quiz.source,
        created_at: quiz.created_at,
        questions: quiz.questions.map((q: any) => ({ id: q.id, question: q.question, options: q.options }))
      },
      message: result.source === 'documents'
        ? `Generated from your uploaded course documents for ${mod.code}.`
        : `No matching course documents were found for "${trimmedTopic}", so this quiz was generated from general knowledge of the topic rather than your own materials.`
    });
  });

  app.post('/api/v1/quizzes/:id/submit', requireAuth, (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    const quiz = ws.quizzes.find((q: any) => q.id === req.params.id);
    if (!quiz) return res.status(404).json({ detail: 'Quiz not found' });
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];

    const results = quiz.questions.map((q: any) => {
      const given = answers.find((a: any) => a.question_id === q.id);
      const selected_index = typeof given?.selected_index === 'number' ? given.selected_index : null;
      const correct = selected_index === q.correct_index;
      return {
        question_id: q.id,
        question: q.question,
        options: q.options,
        selected_index,
        correct_index: q.correct_index,
        correct,
        explanation: q.explanation
      };
    });
    const score = results.filter((r: any) => r.correct).length;
    const total = results.length;

    const attempt = {
      id: `qa-${Date.now()}`,
      quiz_id: quiz.id,
      module_id: quiz.module_id,
      module_code: quiz.module_code,
      module_name: quiz.module_name,
      topic: quiz.topic,
      source: quiz.source,
      score,
      total,
      percentage: total ? Math.round((score / total) * 100) : 0,
      taken_at: new Date().toISOString(),
      results
    };
    ws.quiz_attempts.unshift(attempt);
    ws.quiz_attempts = ws.quiz_attempts.slice(0, 50);

    res.json(attempt);
  });

  // 6. Career & Internship Endpoints
  app.get('/api/v1/career/profile', requireAuth, (req, res) => {
    res.json(getWorkspace((req as any).user.id).career_profile);
  });

  app.put('/api/v1/career/profile', requireAuth, (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    ws.career_profile = { ...ws.career_profile, ...req.body };
    res.json(ws.career_profile);
  });

  app.get('/api/v1/career/skills', requireAuth, (req, res) => {
    res.json(getWorkspace((req as any).user.id).skills);
  });

  app.post('/api/v1/career/skills', requireAuth, (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    const newSkill = {
      id: `sk-${Date.now()}`,
      verified: true,
      source: "manual",
      ...req.body
    };
    ws.skills.push(newSkill);
    res.json(newSkill);
  });

  app.delete('/api/v1/career/skills/:id', requireAuth, (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    ws.skills = ws.skills.filter((s: any) => s.id !== req.params.id);
    res.json({ message: "Skill removed" });
  });

  app.get('/api/v1/career/internships', requireAuth, (req, res) => {
    res.json(getWorkspace((req as any).user.id).internships);
  });

  app.post('/api/v1/career/internships', requireAuth, (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    const newIntern = {
      id: `int-${Date.now()}`,
      created_at: new Date().toISOString(),
      ...req.body
    };
    ws.internships.unshift(newIntern);
    res.json(newIntern);
  });

  app.put('/api/v1/career/internships/:id', requireAuth, (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    const idx = ws.internships.findIndex((i: any) => i.id === req.params.id);
    if (idx !== -1) {
      ws.internships[idx] = { ...ws.internships[idx], ...req.body };
      return res.json(ws.internships[idx]);
    }
    res.status(404).json({ detail: "Internship not found" });
  });

  app.delete('/api/v1/career/internships/:id', requireAuth, (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    ws.internships = ws.internships.filter((i: any) => i.id !== req.params.id);
    res.json({ message: "Internship removed" });
  });

  // 6b. Job Search & Application Assistant - real, currently-open South
  // African postings (see fetchRawJobs above), plus an optional AI-drafted
  // cover letter grounded in the student's own profile. "Applying" here
  // means: view the real posting and apply on the real employer's site,
  // with this app helping draft materials and tracking the application -
  // not auto-submitting to external sites, which no small platform can
  // honestly promise (job boards and company career pages don't expose a
  // public "submit application" API).
  app.get('/api/v1/jobs/search', requireAuth, async (req, res) => {
    const query = String(req.query.query || '').trim();
    const remoteOnly = req.query.remote_only === 'true';
    if (!isJobsConfigured()) {
      return res.status(503).json({
        detail: 'Job search isn\'t configured on this server yet - an admin needs to add a free Adzuna API app_id and app_key (sign up at developer.adzuna.com) as ADZUNA_APP_ID / ADZUNA_APP_KEY.'
      });
    }
    try {
      const raw = await fetchRawJobs(query);
      const results = scoreAndFilterJobs(raw, query, remoteOnly).slice(0, 24);
      res.json({
        query,
        remote_only: remoteOnly,
        total_matches: results.length,
        results,
        source: JOBS_SOURCE_LABEL
      });
    } catch (e) {
      console.warn('Job search failed', e);
      res.status(502).json({ detail: 'Could not reach the live jobs listing service right now. Try again in a moment.' });
    }
  });

  app.post('/api/v1/jobs/draft-cover-letter', requireAuth, async (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    const job = req.body.job || {};
    if (!job.title || !job.company) {
      return res.status(400).json({ detail: 'job.title and job.company are required' });
    }
    if (!getAI()) {
      return res.json({
        ai_configured: false,
        cover_letter: null,
        message: 'Drafting a cover letter needs an AI provider connection (OpenAI or Gemini), which is not currently configured on this server. Ask an admin to add an API key, then try again.'
      });
    }
    const letter = await draftCoverLetterWithAI(ws.student, ws.modules, ws.skills, ws.projects, job);
    if (!letter) {
      return res.json({
        ai_configured: true,
        cover_letter: null,
        message: 'Could not draft a cover letter right now. Try again in a moment.'
      });
    }
    res.json({ ai_configured: true, cover_letter: letter, message: '' });
  });

  // 6c. CV Match Assistant - compares a student's uploaded CV (stored as a
  // regular document with document_type 'cv', via the existing
  // /documents/upload-file endpoint) against a specific job's real
  // description. Grounded strictly in the actual extracted CV text - see
  // matchCvToJobWithAI above.
  app.post('/api/v1/cv/match', requireAuth, async (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    const { document_id, job } = req.body;
    if (!document_id) {
      return res.status(400).json({ detail: 'document_id is required - upload a CV first.' });
    }
    if (!job?.title || !job?.company) {
      return res.status(400).json({ detail: 'job.title and job.company are required' });
    }
    const doc = ws.documents.find((d: any) => d.id === document_id);
    if (!doc) {
      return res.status(404).json({ detail: 'CV document not found. Upload it again.' });
    }
    const cvText = (doc.chunks || []).map((c: any) => c.content).join('\n').trim();
    if (!cvText) {
      return res.status(400).json({ detail: 'That document has no readable text.' });
    }
    if (!getAI()) {
      return res.json({
        ai_configured: false,
        result: null,
        message: 'Matching your CV against a job needs an AI provider connection (OpenAI or Gemini), which is not currently configured on this server. Ask an admin to add an API key, then try again.'
      });
    }
    const result = await matchCvToJobWithAI(cvText, job);
    if (!result) {
      return res.json({
        ai_configured: true,
        result: null,
        message: 'Could not analyze your CV against this job right now. Try again in a moment.'
      });
    }
    res.json({ ai_configured: true, result, message: '' });
  });

  // 7. Multi-Agent AI Chat & Orchestrator
  app.get('/api/v1/agents/list', requireAuth, (req, res) => {
    res.json([
      { id: "orchestrator", name: "Intelligent Orchestrator Agent", description: "Auto-routes queries to optimal domain agents.", capabilities: ["Intent classification", "Dynamic routing"] },
      { id: "academic", name: "Academic Progression Agent", description: "Calculates GPA goals, analyzes module marks, and optimizes study schedules.", capabilities: ["GPA projections", "Mark tracking"] },
      { id: "project", name: "Project Code Scan Agent", description: "Scans submitted project files for languages, frameworks, tests, and Docker config, with an optional AI-written review when an AI provider key is configured.", capabilities: ["Code signal detection", "CV bullet drafting"] },
      { id: "career", name: "Career & WIL Advisory Agent", description: "Matches skills with tech industry demands, tracks internships, and coaches for interviews.", capabilities: ["Skill gap analysis", "Resume bullet points"] },
      { id: "document", name: "Document Retrieval Agent", description: "Performs keyword search against your uploaded course documents and cites matching passages.", capabilities: ["Keyword search", "Document synthesis"] },
      { id: "support", name: "Student Support & Wellbeing Agent", description: "Advises on time management, campus procedures, and exam anxiety.", capabilities: ["Time management", "University guidelines"] },
      { id: "report", name: "Executive Report Generation Agent", description: "Synthesizes formal performance reviews and project evaluation dossiers.", capabilities: ["Formal transcripts", "PDF dossiers"] }
    ]);
  });

  app.get('/api/v1/agents/runs', requireAuth, (req, res) => {
    res.json(getWorkspace((req as any).user.id).agent_runs);
  });

  app.get('/api/v1/chat/sessions', requireAuth, (req, res) => {
    res.json(getWorkspace((req as any).user.id).chat_sessions);
  });

  app.post('/api/v1/chat/sessions', requireAuth, (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    const newSess = {
      id: `sess-${Date.now()}`,
      title: req.body.title || "New Academic Session",
      active_agent: req.body.active_agent || "orchestrator",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      messages: []
    };
    ws.chat_sessions.unshift(newSess);
    res.json(newSess);
  });

  app.delete('/api/v1/chat/sessions/:id', requireAuth, (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    ws.chat_sessions = ws.chat_sessions.filter((s: any) => s.id !== req.params.id);
    res.json({ message: "Session deleted" });
  });

  app.get('/api/v1/chat/sessions/:id/messages', requireAuth, (req, res) => {
    const ws = getWorkspace((req as any).user.id);
    const sess = ws.chat_sessions.find((s: any) => s.id === req.params.id);
    res.json(sess?.messages || []);
  });

  app.post('/api/v1/chat/sessions/:id/messages', requireAuth, async (req, res) => {
    const requestStartedAt = Date.now();
    const currentUser = (req as any).user;
    const ws = getWorkspace(currentUser.id);
    const { content, target_agent_override } = req.body;
    const sess = ws.chat_sessions.find((s: any) => s.id === req.params.id);
    if (!sess) return res.status(404).json({ detail: "Session not found" });

    // 1. Add user message
    const userMsg = {
      id: `msg-${Date.now()}`,
      role: "user",
      sender_agent: "user",
      content,
      created_at: new Date().toISOString()
    };
    sess.messages.push(userMsg);

    // 2. Classify / route agent
    let routedAgent = target_agent_override || "orchestrator";
    const qLower = content.toLowerCase();
    if (!target_agent_override || target_agent_override === 'orchestrator') {
      if (qLower.includes('report') || qLower.includes('dossier') || qLower.includes('export')) routedAgent = "report";
      else if (qLower.includes('note') || qLower.includes('syllabus') || qLower.includes('document') || qLower.includes('pdf')) routedAgent = "document";
      else if (qLower.includes('gpa') || qLower.includes('grade') || qLower.includes('mark') || qLower.includes('module') || qLower.includes('exam')) routedAgent = "academic";
      else if (qLower.includes('project') || qLower.includes('code') || qLower.includes('fastapi') || qLower.includes('react') || qLower.includes('bug')) routedAgent = "project";
      else if (qLower.includes('career') || qLower.includes('internship') || qLower.includes('interview') || qLower.includes('cv') || qLower.includes('job')) routedAgent = "career";
      else routedAgent = "academic";
    }

    // 3. Generate response
    let responseText = "";
    let sources: any[] = [];

    // The career agent gets a grounded system prompt instead of the generic
    // one below - real advice for THIS student's actual CV, modules,
    // skills, projects, and target roles, same "never invent facts" rule
    // used for cover letters and CV matching elsewhere in this file. Every
    // other agent still gets the generic prompt; this is scoped to career/
    // interview coaching specifically since that's the case where invented,
    // generic-sounding advice is most likely to be actively misleading (a
    // student walking into an interview claiming things their real CV
    // doesn't back up).
    let systemPrompt = `You are UNiAGENT, a premier AI University Student Platform. The request has been routed to the ${routedAgent.toUpperCase()} AGENT. Deliver a highly polished, actionable, Markdown-formatted answer with headings, metrics, and bullet points.`;
    if (routedAgent === 'career') {
      const cvDoc = ws.documents.find((d: any) => d.document_type === 'cv');
      const cvText = cvDoc ? (cvDoc.chunks || []).map((c: any) => c.content).join('\n').trim() : '';
      const completedModules = (ws.modules || [])
        .filter((m: any) => m.status === 'completed')
        .map((m: any) => `${m.code} ${m.name}${m.final_mark != null ? ` (${m.final_mark}%)` : ''}`)
        .slice(0, 8);
      const skillList = (ws.skills || []).map((s: any) => s.name).slice(0, 15);
      const projectList = (ws.projects || [])
        .map((p: any) => `${p.title}${p.technologies?.length ? ` (${p.technologies.slice(0, 4).join(', ')})` : ''}`)
        .slice(0, 5);
      systemPrompt = `You are UNiAGENT's AI Technical Interview & Career Coach for a real university student preparing for real interviews. Base every piece of advice STRICTLY on the real information about this specific student given below - their actual CV, modules, skills, and projects. Never invent work experience, achievements, employers, or skills the student wasn't given credit for, and never fabricate a "sample answer" that claims experience their CV doesn't show. If their CV or profile is thin on something they're asking about, say so plainly and suggest how to build that experience, rather than padding the answer with generic advice that could apply to anyone.

Student: ${ws.student?.degree || 'undergraduate'} student${ws.student?.major ? `, majoring in ${ws.student.major}` : ''}${ws.student?.university ? ` at ${ws.student.university}` : ''}, year ${ws.student?.year_of_study || 'unspecified'}.
Target roles: ${(ws.career_profile?.target_roles || []).join(', ') || 'none set yet - suggest the student add some in their Career profile'}.
Completed modules: ${completedModules.join('; ') || 'none listed yet'}.
Skills: ${skillList.join(', ') || 'none listed yet'}.
Projects: ${projectList.join('; ') || 'none listed yet'}.
${cvText ? `\nThe student's actual uploaded CV text:\n${cvText.slice(0, 6000)}` : '\nNo CV has been uploaded yet - mention early in your answer that uploading one (Career & Internships or Job Search & Apply tab) would let you give much more specific, CV-grounded interview prep, then answer as well as you can from the profile information above alone.'}

Deliver a highly polished, actionable, Markdown-formatted answer with headings and bullet points. Where relevant, reference specific real modules, projects, or CV lines by name rather than speaking generically.`;
    }

    // Check if live AI generation is possible
    const aiResp = await queryAI(systemPrompt, content);

    if (aiResp) {
      responseText = aiResp;
    } else {
      // Deterministic domain responses, personalized to the calling account
      const firstName = (currentUser.full_name || 'there').split(' ')[0];
      if (routedAgent === "academic") {
        responseText = `### Academic Guidance & Assessment\n\nHello **${firstName}**, here is your academic forecast:\n\n- **Current GPA**: \`${ws.student.gpa}\` (Target: \`${ws.student.target_gpa}\`)\n- **Completed Credits**: \`${ws.student.credits_earned} / ${ws.student.credits_required}\`\n\n#### Recommendation:\n1. Keep a close eye on your active modules' weighting so you know exactly what mark protects your target GPA.\n2. Dedicate focused weekly blocks to high-weight practical coursework.`;
        sources = [{ type: "academic_record", title: "Academic Transcript" }];
      } else if (routedAgent === "project") {
        const hasProjects = ws.projects.length > 0;
        if (hasProjects) {
          const proj = ws.projects[0];
          const techs: string[] = proj.technologies || [];
          responseText = `### Project Code Scan\n\nLooking at **${proj.title}**:\n- **Detected technologies**: ${techs.length ? techs.join(', ') : 'none detected'}\n- ${proj.code_metrics?.has_tests ? 'Test files were found in the submitted code.' : 'No test files were detected - consider adding some.'}\n- ${proj.code_metrics?.has_docker ? 'A Dockerfile or docker-compose config was found.' : 'No Docker configuration was detected.'}\n\nThis reflects a keyword/extension scan of the files you submitted, not a deep architectural review.`;
        } else {
          responseText = `### Project Code Scan\n\nYou haven't registered any projects yet - visit the Projects tab and submit some source files, and I can tell you what languages, frameworks, and testing/Docker setup were detected in them.`;
        }
        sources = hasProjects ? [{ type: "project_registry", title: "Student Code Portfolio" }] : [];
      } else if (routedAgent === "career") {
        const cvOnFile = ws.documents.some((d: any) => d.document_type === 'cv');
        const firstProject = ws.projects[0];
        responseText = `### Tech Career & Interview Strategy\n\n- **Target Roles**: ${ws.career_profile.target_roles.join(', ') || 'Add target roles in your Career profile to personalize this'}\n- **CV on file**: ${cvOnFile ? 'Yes - uploaded and available for CV-grounded prep once an AI connection is configured.' : 'No - upload one from the Career & Internships or Job Search & Apply tab so future advice can reference it directly.'}\n- **Interview Tip**: Prepare to walk through the real tradeoffs behind decisions in your own portfolio projects.${firstProject ? `\n- **From your own portfolio**: revisit **${firstProject.title}** and be ready to explain a specific decision you made and why.` : '\n- **Portfolio gap**: you have no registered projects yet - the Projects tab is worth filling in before interviews, since concrete project stories are what interviewers actually probe.'}`;
        sources = [{ type: "career_matrix", title: "Career Profile & Applications" }];
      } else if (routedAgent === "document") {
        const docMatches = searchWorkspaceDocuments(ws, content);
        if (docMatches.length > 0) {
          const top = docMatches[0];
          responseText = `### Knowledge Base Retrieval & Citations\n\nFound a matching passage in **${top.document_name}**:\n\n> ${top.content.slice(0, 500)}${top.content.length > 500 ? '...' : ''}`;
          sources = docMatches.slice(0, 3).map((m: any) => ({ type: "document_chunk", title: `${m.document_name} (chunk ${m.chunk_index})`, match_score: m.match_score, chunk_index: m.chunk_index }));
        } else if (ws.documents.length > 0) {
          responseText = `### Knowledge Base Retrieval\n\nI couldn't find any passages in your uploaded documents matching that question. Try rephrasing with different keywords, or check the Documents tab to confirm the right file was uploaded.`;
          sources = [];
        } else {
          responseText = `### Knowledge Base Retrieval\n\nYou haven't uploaded any documents yet - visit the Documents tab to add a syllabus or course notes, and I'll be able to cite matching passages when answering questions.`;
          sources = [];
        }
      } else if (routedAgent === "report") {
        responseText = `# EXECUTIVE STUDENT DOSSIER SUMMARY\n\n**Candidate**: ${currentUser.full_name} (${ws.student.student_number || 'N/A'})\n**Program**: ${ws.student.degree || 'Not set'}\n**Academic Standing**: GPA ${ws.student.gpa}\n\n### On File:\n- ${ws.modules.length} academic module(s)\n- ${ws.projects.length} registered project(s)\n- ${ws.documents.length} uploaded document(s)\n\nVisit the Reports tab to generate a full formatted report.`;
        sources = [{ type: "report_engine", title: "Report Generator" }];
      } else {
        responseText = `### Student Support & Productivity Strategy\n\n1. **Time Management**: Use the Pomodoro method for deep algorithmic problem solving.\n2. **Campus Resources**: Check in with your faculty's tutoring or advising office for structured support.`;
        sources = [{ type: "support_guide", title: "Student Wellbeing Handbook" }];
      }
    }

    const assistantMsg = {
      id: `msg-${Date.now() + 1}`,
      role: "assistant",
      sender_agent: routedAgent,
      content: responseText,
      sources_json: sources,
      latency_ms: Date.now() - requestStartedAt,
      tokens_used: responseText.split(' ').length,
      created_at: new Date().toISOString()
    };
    sess.messages.push(assistantMsg);
    sess.active_agent = routedAgent;
    sess.updated_at = new Date().toISOString();

    ws.agent_runs.unshift({
      id: `run-${Date.now()}`,
      agent_name: routedAgent,
      status: "success",
      input_prompt: content,
      output_result: responseText.slice(0, 300),
      duration_ms: 280,
      created_at: new Date().toISOString()
    });

    res.json({
      user_message: userMsg,
      assistant_message: assistantMsg,
      routed_agent: routedAgent,
      sources: sources
    });
  });

  // 8. Reports Generation
  // Previously this always required at least one project to exist (it built
  // the entire report around a single project, regardless of report_type or
  // which sections the user had checked) - so it 400'd for any account with
  // no projects, which is now every brand-new registration. It also silently
  // ignored `include_sections` and `report_type` entirely. Rewritten to
  // honor both, and to degrade gracefully (a friendly "not added yet" note)
  // instead of failing whenever a section has no data behind it yet.
  app.post('/api/v1/reports/generate', requireAuth, (req, res) => {
    const currentUser = (req as any).user;
    const ws = getWorkspace(currentUser.id);
    const { report_type, project_id, include_sections } = req.body;

    const sections = {
      gpa: include_sections?.gpa !== false,
      projects: include_sections?.projects !== false,
      skills: include_sections?.skills !== false,
      internships: include_sections?.internships !== false,
    };

    const reportTitles: Record<string, string> = {
      comprehensive: "Comprehensive Student Dossier",
      academic: "Academic Transcript & GPA Forecast",
      projects: "Technical Project & Architecture Portfolio",
      career: "Career Readiness & Skills Evaluation",
    };
    const title = reportTitles[report_type] || "Student Performance Report";

    const parts: string[] = [];
    parts.push(`# ${title.toUpperCase()}`);
    parts.push(`Student: ${currentUser.full_name} (${ws.student.student_number || 'No student ID on file'}) | Degree: ${ws.student.degree || 'Not set'}`);
    parts.push(`Date Generated: ${new Date().toLocaleDateString()}`);
    parts.push('');

    let sectionNum = 1;
    const addSection = (heading: string, body: string) => {
      parts.push('='.repeat(50));
      parts.push(`${sectionNum}. ${heading}`);
      parts.push('='.repeat(50));
      parts.push(body);
      parts.push('');
      sectionNum++;
    };

    const completed = ws.modules.filter((m: any) => m.status === 'completed' && typeof m.final_mark === 'number');
    const distinctions = completed.filter((m: any) => m.is_distinction).length;

    addSection('EXECUTIVE SUMMARY',
      ws.modules.length || ws.projects.length
        ? `${currentUser.full_name} is a Year ${ws.student.year_of_study} ${ws.student.degree || 'student'}${ws.student.university ? ` at ${ws.student.university}` : ''}, with a current GPA of ${ws.student.gpa} (target ${ws.student.target_gpa}) across ${completed.length} completed module(s) and ${distinctions} distinction(s), and ${ws.projects.length} registered project(s).`
        : `${currentUser.full_name} has just started building their UNiAGENT profile - no academic modules or projects have been added yet. Populate the Academic, Projects, and Career tabs to enrich future reports.`
    );

    if (sections.gpa) {
      addSection('ACADEMIC TRANSCRIPT & GPA FORECAST',
        ws.modules.length
          ? `Current GPA: ${ws.student.gpa} (Target: ${ws.student.target_gpa})\nCredits: ${ws.student.credits_earned} / ${ws.student.credits_required}\nCompleted Modules: ${completed.length} (${distinctions} distinction(s))\n\n` +
            ws.modules.map((m: any) => `- ${m.code || ''} ${m.name} - ${m.status}${m.final_mark ? `, ${m.final_mark}%` : ''}${m.is_distinction ? ' (Distinction)' : ''}`).join('\n')
          : 'No academic modules have been added yet. Add modules from the Academic tab to populate this section.'
      );
    }

    if (sections.projects) {
      if (ws.projects.length) {
        const proj = (project_id && ws.projects.find((p: any) => p.id === project_id)) || ws.projects[0];
        addSection('TECHNICAL PROJECTS & ARCHITECTURE',
          `Featured Project: ${proj.title}\n${proj.analysis_summary || proj.description || ''}\n\n` +
          `Architecture: ${proj.architecture || 'Not specified'}\n` +
          `Technologies: ${(proj.technologies || []).join(', ') || 'Not specified'}\n\n` +
          `Strengths:\n${(proj.strengths || []).map((s: string) => '- ' + s).join('\n') || '- None recorded'}\n\n` +
          `Recommended Improvements:\n${(proj.improvements || []).map((i: string) => '- ' + i).join('\n') || '- None recorded'}` +
          (ws.projects.length > 1 ? `\n\nAlso on file: ${ws.projects.slice(1).map((p: any) => p.title).join(', ')}` : '')
        );
      } else {
        addSection('TECHNICAL PROJECTS & ARCHITECTURE', 'No projects have been added yet. Add a project from the Projects tab to include a technical portfolio in this report.');
      }
    }

    if (sections.skills) {
      addSection('SKILLS & COMPETENCIES',
        ws.skills.length
          ? ws.skills.map((s: any) => `- ${s.name} (${s.proficiency_level}, ${s.category})`).join('\n')
          : 'No skills recorded yet. Add skills from the Career tab.'
      );
    }

    if (sections.internships) {
      const bioLines = (ws.career_profile.target_roles.length || ws.career_profile.bio)
        ? `\n\nCareer Bio: ${ws.career_profile.bio || 'Not set'}\nTarget Roles: ${ws.career_profile.target_roles.join(', ') || 'Not set'}`
        : '';
      addSection('CAREER & WORK-INTEGRATED LEARNING',
        (ws.internships.length
          ? ws.internships.map((i: any) => `- ${i.role_title} at ${i.company_name} (${i.status})`).join('\n')
          : 'No internships or WIL placements recorded yet. Add these from the Career tab.') + bioLines
      );
    }

    const reportContent = parts.join('\n');

    res.json({
      title: `${title} - ${currentUser.full_name}`,
      report_type: report_type || 'comprehensive',
      content: reportContent,
      markdown_content: reportContent,
      metadata: {
        student: ws.student.student_number,
        gpa: ws.student.gpa,
        project_title: ws.projects[0]?.title || null
      }
    });
  });

  // 9. Admin Endpoints
  app.get('/api/v1/admin/users', requireAdmin, (req, res) => {
    res.json(dbState.users.map(({ password_hash, ...safe }) => safe));
  });

  app.put('/api/v1/admin/users/:id/role', requireAdmin, (req, res) => {
    const ALLOWED_ROLES = new Set(['student', 'admin']);
    if (!ALLOWED_ROLES.has(req.body.role)) {
      return res.status(400).json({ detail: "role must be one of ['admin', 'student']" });
    }
    const u = dbState.users.find(user => user.id === req.params.id);
    if (u) {
      u.role = req.body.role;
      return res.json({ message: "Role updated" });
    }
    res.status(404).json({ detail: "User not found" });
  });

  // No email provider is configured on this server, so there's no
  // self-service "forgot password" flow yet - this is the honest
  // alternative: an admin generates a one-time temporary password and
  // relays it to the student out of band (in person, over a call, etc).
  // The plaintext value exists only in this one response, never logged or
  // stored - only its scrypt hash is kept. Every existing session for the
  // account is revoked so a reset actually takes effect immediately.
  app.post('/api/v1/admin/users/:id/reset-password', requireAdmin, (req, res) => {
    const u = dbState.users.find(user => user.id === req.params.id);
    if (!u) return res.status(404).json({ detail: "User not found" });
    const tempPassword = generateTempPassword();
    u.password_hash = hashPassword(tempPassword);
    revokeSessionsForUser(u.id);
    res.json({ message: "Password reset", temporary_password: tempPassword });
  });

  app.put('/api/v1/admin/users/:id/status', requireAdmin, (req, res) => {
    const { is_active } = req.body;
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ detail: "is_active must be a boolean" });
    }
    const u = dbState.users.find(user => user.id === req.params.id);
    if (!u) return res.status(404).json({ detail: "User not found" });
    if (u.id === (req as any).user.id && !is_active) {
      return res.status(400).json({ detail: "You can't deactivate your own account" });
    }
    u.is_active = is_active;
    if (!is_active) revokeSessionsForUser(u.id);
    res.json({ message: is_active ? "Account activated" : "Account deactivated" });
  });

  // Both endpoints below used to report a fictional stack - a hardcoded
  // "PostgreSQL 16 with pgvector" / "AsyncPostgresSaver" / "LangGraph
  // StateGraph" regardless of what's actually running, plus a fabricated,
  // never-changing api_requests_24h figure. What's actually running is this
  // single Express process with an in-memory store and an AI-backed chat via
  // whichever provider is configured (OpenAI preferred, Gemini supported,
  // deterministic fallback when neither key is set) - report that instead,
  // so this panel can be shown to someone technical without it reading as
  // deceptive the moment they check.
  const describeSystem = () => {
    const workspaces = allWorkspaces();
    const totalStudents = dbState.users.filter(u => u.role === 'student').length;
    const totalProjects = workspaces.reduce((s, w) => s + w.projects.length, 0);
    const totalDocuments = workspaces.reduce((s, w) => s + w.documents.length, 0);
    const totalAgentRuns = workspaces.reduce((s, w) => s + w.agent_runs.length, 0);
    const activeProvider = currentAIProvider();
    const providerLabel = activeProvider === 'openai' ? 'OpenAI' : activeProvider === 'gemini' ? 'Gemini' : null;
    const database = isFirestoreConfigured()
      ? `Firebase Firestore (project ${FIREBASE_PROJECT_ID}) - one shared document holding all accounts and workspaces; survives the server itself being rebuilt, but not yet split per-student, so it isn't sized for a full university-wide rollout as-is`
      : "Local JSON file (data/uniagent-data.json) - survives restarts on this machine, but isn't built for multiple server instances or concurrent writes at scale";
    return {
      status: "operational",
      database,
      checkpointer: "None - chat history is saved as part of the same data store, not a dedicated conversation store",
      multi_agent_system: `Rule-based keyword router with ${providerLabel ? `${providerLabel}-backed generation (live ${providerLabel} API key configured)` : 'no AI provider key set - using deterministic fallback responses'}`,
      total_users: dbState.users.length,
      total_students: totalStudents,
      total_projects: totalProjects,
      total_documents: totalDocuments,
      total_agent_runs: totalAgentRuns
    };
  };

  app.get('/api/v1/admin/telemetry', requireAdmin, (req, res) => {
    const workspaces = allWorkspaces();
    const totalStudents = dbState.users.filter(u => u.role === 'student').length;
    const totalProjects = workspaces.reduce((s, w) => s + w.projects.length, 0);
    const totalChunks = workspaces.reduce((s, w) => s + w.documents.reduce((ds, d: any) => ds + (d.total_chunks || 0), 0), 0);
    const totalChatSessions = workspaces.reduce((s, w) => s + w.chat_sessions.length, 0);
    const health = describeSystem();

    res.json({
      total_users: dbState.users.length,
      active_students: totalStudents,
      projects_scanned: totalProjects,
      vector_embeddings_stored: totalChunks,
      chat_sessions: totalChatSessions,
      agent_runs_logged: health.total_agent_runs,
      system_health: health
    });
  });

  app.get('/api/v1/admin/system-health', requireAdmin, (req, res) => {
    res.json(describeSystem());
  });

  app.get('/api/v1/admin/agent-telemetry', requireAdmin, (req, res) => {
    const combined = allWorkspaces()
      .flatMap(w => w.agent_runs)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 100);
    res.json(combined);
  });

  // Vite middleware mounting for SPA preview. Skipped entirely in NODE_ENV=test
  // (used by tests/api.test.mjs) - the integration suite only calls the
  // /api/v1/* routes, and booting the frontend dev server on every test run
  // just adds startup time and an unrelated failure surface.
  if (process.env.NODE_ENV === "test") {
    // API-only - no frontend middleware mounted.
  } else if (process.env.NODE_ENV !== "production") {
    // Imported dynamically (not at module top-level) so that vite - and its
    // build-time dependency rollup, which ships platform-specific native
    // binaries - is never pulled into the production bundle at all. This
    // branch only runs during local `npm run dev`; on Vercel and every other
    // production deployment NODE_ENV is "production", so this import
    // statement is never even reached, let alone executed.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, port: PORT, host: '0.0.0.0' },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (process.env.VERCEL) {
    // Vercel's Node runtime ignores express.static() entirely and won't
    // serve files added via res.sendFile() from outside its own build
    // output conventions either - both are Vercel-specific limitations,
    // not something wrong with this code on Cloud Run/Docker, where the
    // branch below (identical logic, just via express.static) works fine.
    // Reading the file and sending its bytes directly sidesteps both:
    // ordinary Node filesystem access, not a special-cased Express helper.
    const distPath = path.join(process.cwd(), 'dist');
    const MIME: Record<string, string> = {
      '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json',
      '.txt': 'text/plain; charset=utf-8',
    };
    app.get(/^(?!\/api\/).*/, (req, res) => {
      const requested = path.normalize(path.join(distPath, req.path));
      // req.path is always request-derived; normalize() before this check
      // so a path-traversal attempt (e.g. "/../../etc/passwd") can't
      // resolve to somewhere outside distPath and still pass the prefix
      // check below.
      const isInsideDist = requested === distPath || requested.startsWith(distPath + path.sep);
      const filePath = isInsideDist && fs.existsSync(requested) && fs.statSync(requested).isFile()
        ? requested
        : path.join(distPath, 'index.html'); // SPA fallback for any other real page/route
      const ext = path.extname(filePath);
      res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
      res.send(fs.readFileSync(filePath));
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}

// --- Entry point ---------------------------------------------------------
// Two ways this file runs:
//  1. Traditionally (Docker, Cloud Run, local `npm run dev`/`npm start`):
//     build the app once at process startup and have it listen on a real
//     port, same as any ordinary Node server.
//  2. On Vercel: Vercel imports this file directly and calls the default
//     export itself as a request handler, on whichever of its own
//     serverless instances happens to pick up a given request - there's no
//     port to listen on there, and calling app.listen() would be
//     meaningless. The app is still only built once per warm instance
//     (cached below), not rebuilt - re-registering every route - on every
//     single request.
let cachedApp: Promise<express.Express> | null = null;

async function handleOnVercel(req: express.Request, res: express.Response) {
  if (!cachedApp) cachedApp = buildApp();
  const app = await cachedApp;
  app(req, res);
}

if (!process.env.VERCEL) {
  buildApp().then((app) => {
    const PORT = Number(process.env.PORT) || 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`UniAgent Full-Stack Platform running on http://0.0.0.0:${PORT}`);
    });
  });
}

export default handleOnVercel;

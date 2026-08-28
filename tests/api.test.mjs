// Real integration tests against the actual server - no mocks. Each test
// block spawns `tsx server.ts` as a real child process against a throwaway
// data directory, talks to it over HTTP exactly like the frontend does, and
// tears it down afterward. This exists because there was previously no
// automated test coverage at all, which is a real gap for something meant
// to be sold rather than just run by one person.
//
// Run with: npm test

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const TSX_BIN = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

// Starts a real server child process on `port` using `dataDir` for
// persistence, and resolves once /health responds. Returns { proc, base,
// stop() }.
//
// Spawns `node <tsx-cli>` directly rather than `npx tsx` - npx is itself a
// wrapper process, and killing it doesn't reliably kill the real tsx/node
// process underneath, which left orphaned servers holding ports and pipe
// file descriptors open, hanging the whole test run. `detached: true` puts
// each server in its own process group so stop() can kill the entire group,
// not just the top process.
async function startServer(port, dataDir, extraEnv = {}) {
  const proc = spawn(process.execPath, [TSX_BIN, 'server.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      UNIAGENT_DATA_DIR: dataDir,
      GEMINI_API_KEY: '', // force the deterministic fallback path, not a live API call
      ADZUNA_APP_ID: '', // force the honest "not configured" path by default
      ADZUNA_APP_KEY: '',
      FIREBASE_PROJECT_ID: '', // force the local-JSON-file persistence path, not a real Firestore call
      GOOGLE_APPLICATION_CREDENTIALS: '',
      ...extraEnv,
    },
    stdio: 'ignore',
    detached: true,
  });
  proc.unref();

  const base = `http://localhost:${port}`;
  const deadline = Date.now() + 20000;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) {
        return {
          proc,
          base,
          stop: () => new Promise((resolve) => {
            let done = false;
            const finish = () => { if (!done) { done = true; resolve(); } };
            proc.once('exit', finish);
            try { process.kill(-proc.pid, 'SIGTERM'); } catch { finish(); }
            setTimeout(() => {
              try { process.kill(-proc.pid, 'SIGKILL'); } catch {}
              finish();
            }, 3000);
          }),
        };
      }
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server on port ${port} did not become healthy in time: ${lastErr}`);
}

function uniqueEmail(label) {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

// --- Main suite: one shared server for most tests ---------------------

let server;
let dataDir;

before(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'uniagent-test-'));
  server = await startServer(4501, dataDir);
});

after(async () => {
  await server.stop();
  rmSync(dataDir, { recursive: true, force: true });
});

test('health check responds', async () => {
  const res = await fetch(`${server.base}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'healthy');
});

test('first registered account becomes admin, second becomes student', async () => {
  const first = await fetch(`${server.base}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: uniqueEmail('admin'), password: 'pass1234', full_name: 'First User' }),
  }).then((r) => r.json());
  assert.equal(first.user.role, 'admin');

  const second = await fetch(`${server.base}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: uniqueEmail('student'), password: 'pass1234', full_name: 'Second User' }),
  }).then((r) => r.json());
  assert.equal(second.user.role, 'student');
});

test('wrong password is rejected, protected routes require auth', async () => {
  const email = uniqueEmail('login');
  await fetch(`${server.base}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct-horse', full_name: 'Login Test' }),
  });

  const badLogin = await fetch(`${server.base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'wrong-password' }),
  });
  assert.equal(badLogin.status, 401);

  const noAuth = await fetch(`${server.base}/api/v1/auth/me`);
  assert.equal(noAuth.status, 401);
});

test('project scan reports only what was actually submitted, never fixed defaults', async () => {
  const email = uniqueEmail('scan');
  const { access_token } = await fetch(`${server.base}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'pass1234', full_name: 'Scan Test' }),
  }).then((r) => r.json());
  const auth = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };

  // Real Flask code with no Docker file and no test file submitted.
  const flaskProject = await fetch(`${server.base}/api/v1/projects`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      title: 'Flask App',
      description: '',
      files: [{ name: 'app.py', content: 'from flask import Flask\napp = Flask(__name__)\n' }],
    }),
  }).then((r) => r.json());

  assert.deepEqual(flaskProject.code_metrics.detected_languages, ['Python']);
  assert.deepEqual(flaskProject.code_metrics.detected_frameworks, ['Flask']);
  assert.equal(flaskProject.code_metrics.has_docker, false);
  assert.equal(flaskProject.code_metrics.has_tests, false);
  assert.ok(!flaskProject.technologies.includes('FastAPI'), 'must not fabricate FastAPI when it was never submitted');
  assert.ok(!flaskProject.technologies.includes('PostgreSQL'), 'must not fabricate PostgreSQL when it was never submitted');

  // No files at all - metrics must be zero/empty, not a plausible-looking default.
  const emptyProject = await fetch(`${server.base}/api/v1/projects`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ title: 'Empty', description: '', files: [] }),
  }).then((r) => r.json());
  assert.equal(emptyProject.code_metrics.total_lines_of_code, 0);
  assert.equal(emptyProject.code_metrics.file_count, 0);
  assert.deepEqual(emptyProject.code_metrics.detected_languages, []);
});

test('document search only returns genuine keyword matches', async () => {
  const email = uniqueEmail('docsearch');
  const { access_token } = await fetch(`${server.base}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'pass1234', full_name: 'Doc Search Test' }),
  }).then((r) => r.json());
  const auth = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };

  await fetch(`${server.base}/api/v1/documents/upload`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      filename: 'syllabus.txt',
      content: 'The capstone project is worth 40 percent of the final grade.',
      document_type: 'syllabus',
    }),
  });

  const goodSearch = await fetch(`${server.base}/api/v1/documents/search`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ query: 'capstone project' }),
  }).then((r) => r.json());
  assert.equal(goodSearch.total_matches, 1);
  assert.equal(goodSearch.results[0].match_score, 1);

  const badSearch = await fetch(`${server.base}/api/v1/documents/search`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ query: 'xyzzy quantum unicorn' }),
  }).then((r) => r.json());
  assert.equal(badSearch.total_matches, 0);
});

test('report generation succeeds on a completely fresh account (regression test)', async () => {
  const email = uniqueEmail('report');
  const { access_token } = await fetch(`${server.base}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'pass1234', full_name: 'Report Test' }),
  }).then((r) => r.json());

  const res = await fetch(`${server.base}/api/v1/reports/generate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ report_type: 'full', format: 'text' }),
  });
  assert.equal(res.status, 200, 'a brand-new account with no project must not 400 when generating a report');
});

test('admin can reset a password and deactivate an account; a non-admin cannot', async () => {
  const adminDir = mkdtempSync(path.join(tmpdir(), 'uniagent-admin-'));
  const s = await startServer(4504, adminDir);
  try {
    // First account on this fresh server becomes admin via the bootstrap rule.
    const admin = await fetch(`${s.base}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: uniqueEmail('admin2'), password: 'admin-pass', full_name: 'Admin User' }),
    }).then((r) => r.json());
    assert.equal(admin.user.role, 'admin');
    const adminAuth = { Authorization: `Bearer ${admin.access_token}`, 'Content-Type': 'application/json' };

    const targetEmail = uniqueEmail('target');
    const target = await fetch(`${s.base}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail, password: 'original-pass', full_name: 'Target User' }),
    }).then((r) => r.json());
    assert.equal(target.user.role, 'student');
    const targetAuth = { Authorization: `Bearer ${target.access_token}`, 'Content-Type': 'application/json' };

    // A non-admin must not be able to list users or reset anyone's password.
    const forbiddenList = await fetch(`${s.base}/api/v1/admin/users`, { headers: targetAuth });
    assert.equal(forbiddenList.status, 403);
    const forbiddenReset = await fetch(`${s.base}/api/v1/admin/users/${target.user.id}/reset-password`, {
      method: 'POST',
      headers: targetAuth,
    });
    assert.equal(forbiddenReset.status, 403);

    // Admin resets the target's password - the old password must stop
    // working and the new temporary one must work.
    const resetRes = await fetch(`${s.base}/api/v1/admin/users/${target.user.id}/reset-password`, {
      method: 'POST',
      headers: adminAuth,
    }).then((r) => r.json());
    assert.ok(resetRes.temporary_password && resetRes.temporary_password.length >= 8);

    const oldPasswordLogin = await fetch(`${s.base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail, password: 'original-pass' }),
    });
    assert.equal(oldPasswordLogin.status, 401);

    const newPasswordLogin = await fetch(`${s.base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail, password: resetRes.temporary_password }),
    });
    assert.equal(newPasswordLogin.status, 200);

    // Admin deactivates the target - login must now fail even with the
    // correct (temporary) password.
    const deactivateRes = await fetch(`${s.base}/api/v1/admin/users/${target.user.id}/status`, {
      method: 'PUT',
      headers: adminAuth,
      body: JSON.stringify({ is_active: false }),
    });
    assert.equal(deactivateRes.status, 200);

    const loginAfterDeactivation = await fetch(`${s.base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail, password: resetRes.temporary_password }),
    });
    assert.equal(loginAfterDeactivation.status, 400);

    // An admin cannot deactivate their own account.
    const selfDeactivate = await fetch(`${s.base}/api/v1/admin/users/${admin.user.id}/status`, {
      method: 'PUT',
      headers: adminAuth,
      body: JSON.stringify({ is_active: false }),
    });
    assert.equal(selfDeactivate.status, 400);
  } finally {
    await s.stop();
    rmSync(adminDir, { recursive: true, force: true });
  }
});

// --- Isolated suite: real restart-survives-persistence test -----------

test('data survives a real server restart', async () => {
  const persistDir = mkdtempSync(path.join(tmpdir(), 'uniagent-persist-'));
  const first = await startServer(4502, persistDir);
  try {
    const email = uniqueEmail('persist');
    const reg = await fetch(`${first.base}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'pass1234', full_name: 'Persist Test' }),
    }).then((r) => r.json());

    await fetch(`${first.base}/api/v1/academic/modules`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${reg.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'CSC1015', name: 'Intro to Programming', credits: 18, semester: 'Sem 1', year: 2024, status: 'completed', final_mark: 88 }),
    });

    await first.stop();

    const second = await startServer(4502, persistDir);
    try {
      const login = await fetch(`${second.base}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'pass1234' }),
      }).then((r) => r.json());
      assert.ok(login.access_token, 'the account created before restart must still be able to log in after restart');

      const modules = await fetch(`${second.base}/api/v1/academic/modules`, {
        headers: { Authorization: `Bearer ${login.access_token}` },
      }).then((r) => r.json());
      assert.equal(modules.length, 1);
      assert.equal(modules[0].code, 'CSC1015');
    } finally {
      await second.stop();
    }
  } finally {
    rmSync(persistDir, { recursive: true, force: true });
  }
});

test('quiz generation is honest about needing AI, and validates its inputs', async () => {
  const email = uniqueEmail('quiz');
  const { access_token } = await fetch(`${server.base}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'pass1234', full_name: 'Quiz Test' }),
  }).then((r) => r.json());
  const auth = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };

  const mod = await fetch(`${server.base}/api/v1/academic/modules`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ code: 'CSC2001F', name: 'Data Structures', credits: 18, semester: 'Sem 1', year: 2024, status: 'in_progress' }),
  }).then((r) => r.json());

  // No Gemini key in the test environment - the endpoint must say so
  // plainly (ai_configured: false, quiz: null) rather than returning a
  // fabricated set of questions.
  const genRes = await fetch(`${server.base}/api/v1/quizzes/generate`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ module_id: mod.id, topic: 'Linked Lists' }),
  });
  assert.equal(genRes.status, 200);
  const genBody = await genRes.json();
  assert.equal(genBody.ai_configured, false);
  assert.equal(genBody.quiz, null);
  assert.ok(genBody.message && genBody.message.length > 0, 'must explain why no quiz was generated');

  // Missing topic / bad module_id must be rejected before ever reaching AI.
  const missingTopic = await fetch(`${server.base}/api/v1/quizzes/generate`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ module_id: mod.id, topic: '' }),
  });
  assert.equal(missingTopic.status, 400);

  const badModule = await fetch(`${server.base}/api/v1/quizzes/generate`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ module_id: 'does-not-exist', topic: 'Linked Lists' }),
  });
  assert.equal(badModule.status, 404);

  // No quiz was ever actually created, so history and submit must reflect that.
  const list = await fetch(`${server.base}/api/v1/quizzes`, { headers: auth }).then((r) => r.json());
  assert.deepEqual(list, []);
  const attempts = await fetch(`${server.base}/api/v1/quizzes/attempts`, { headers: auth }).then((r) => r.json());
  assert.deepEqual(attempts, []);
  const submitMissing = await fetch(`${server.base}/api/v1/quizzes/does-not-exist/submit`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ answers: [] }),
  });
  assert.equal(submitMissing.status, 404);
});

test('job search is honest about needing an Adzuna key when none is configured', async () => {
  const email = uniqueEmail('jobsearch');
  const { access_token } = await fetch(`${server.base}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'pass1234', full_name: 'Job Search Test' }),
  }).then((r) => r.json());
  const auth = { Authorization: `Bearer ${access_token}` };

  // The shared test server is started with no ADZUNA_APP_ID/APP_KEY (see
  // startServer above), same as it's started with no GEMINI_API_KEY for the
  // AI-dependent tests - this must fail honestly and explain why, not
  // silently return nothing or, worse, fabricate listings.
  const res = await fetch(`${server.base}/api/v1/jobs/search?query=engineer`, { headers: auth });
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.ok(body.detail && body.detail.length > 0, 'a not-configured job search must explain why, not silently return nothing');
});

test('job search returns real South African listings or an honest network error when Adzuna is configured, never fabricated ones', { skip: !process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY ? 'ADZUNA_APP_ID/ADZUNA_APP_KEY not set in this environment' : false }, async () => {
  const jobsDir = mkdtempSync(path.join(tmpdir(), 'uniagent-jobs-'));
  const s = await startServer(4504, jobsDir, { ADZUNA_APP_ID: process.env.ADZUNA_APP_ID, ADZUNA_APP_KEY: process.env.ADZUNA_APP_KEY });
  try {
    const email = uniqueEmail('jobsearch-live');
    const { access_token } = await fetch(`${s.base}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'pass1234', full_name: 'Job Search Live Test' }),
    }).then((r) => r.json());
    const auth = { Authorization: `Bearer ${access_token}` };

    const res = await fetch(`${s.base}/api/v1/jobs/search?query=engineer`, { headers: auth });
    if (res.status === 200) {
      const body = await res.json();
      assert.ok(Array.isArray(body.results));
      for (const job of body.results) {
        assert.ok(job.title && job.company, 'every listing must have a real title and company');
        assert.ok(job.url && job.url.startsWith('http'), 'every listing must link to a real posting');
      }
    } else {
      assert.equal(res.status, 502);
      const body = await res.json();
      assert.ok(body.detail && body.detail.length > 0, 'a failed job search must explain why, not silently return nothing');
    }
  } finally {
    await s.stop();
    rmSync(jobsDir, { recursive: true, force: true });
  }
});

test('cover letter drafting is honest about needing AI, and validates its inputs', async () => {
  const email = uniqueEmail('coverletter');
  const { access_token } = await fetch(`${server.base}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'pass1234', full_name: 'Cover Letter Test' }),
  }).then((r) => r.json());
  const auth = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };

  const missingFields = await fetch(`${server.base}/api/v1/jobs/draft-cover-letter`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ job: {} }),
  });
  assert.equal(missingFields.status, 400);

  // No Gemini key in the test environment - must say so plainly rather
  // than fabricating a cover letter claiming experience the student
  // doesn't have.
  const res = await fetch(`${server.base}/api/v1/jobs/draft-cover-letter`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ job: { title: 'Software Engineer Intern', company: 'Acme Corp', location: 'Remote', description: 'Build things.' } }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ai_configured, false);
  assert.equal(body.cover_letter, null);
  assert.ok(body.message && body.message.length > 0);
});

test('internship tracker persists job-search fields (application_url, cover_letter, source)', async () => {
  const email = uniqueEmail('jobtrack');
  const { access_token } = await fetch(`${server.base}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'pass1234', full_name: 'Job Track Test' }),
  }).then((r) => r.json());
  const auth = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };

  const created = await fetch(`${server.base}/api/v1/career/internships`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      company_name: 'Acme Corp',
      role_title: 'Software Engineer Intern',
      status: 'applied',
      location: 'Remote',
      application_url: 'https://example.com/jobs/123',
      cover_letter: 'Dear Hiring Manager, ...',
      source: 'job_search',
    }),
  }).then((r) => r.json());
  assert.equal(created.application_url, 'https://example.com/jobs/123');
  assert.equal(created.source, 'job_search');

  const list = await fetch(`${server.base}/api/v1/career/internships`, { headers: auth }).then((r) => r.json());
  const saved = list.find((i) => i.id === created.id);
  assert.ok(saved && saved.cover_letter, 'the cover letter must survive a round trip through the tracker');
});

test('CV upload is kept out of course-document search, and CV match is honest about needing AI', async () => {
  const email = uniqueEmail('cvmatch');
  const { access_token } = await fetch(`${server.base}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'pass1234', full_name: 'CV Match Test' }),
  }).then((r) => r.json());
  const auth = { Authorization: `Bearer ${access_token}` };
  const authJson = { ...auth, 'Content-Type': 'application/json' };

  // Upload a plain-text "CV" via the real multipart upload endpoint.
  const cvText = 'Jane Student. Skills: Python, SQL, unicorn-wrangling-9000. Completed a data pipelines project using PostgreSQL.';
  const form = new FormData();
  form.append('document_type', 'cv');
  form.append('file', new Blob([cvText], { type: 'text/plain' }), 'resume.txt');
  const uploaded = await fetch(`${server.base}/api/v1/documents/upload-file`, {
    method: 'POST',
    headers: auth,
    body: form,
  }).then((r) => r.json());
  assert.equal(uploaded.document_type, 'cv');

  // A course-document search for a term that ONLY appears in the CV must
  // not surface it - CVs are personal application material, not course
  // content the document agent should cite.
  const search = await fetch(`${server.base}/api/v1/documents/search`, {
    method: 'POST',
    headers: authJson,
    body: JSON.stringify({ query: 'unicorn-wrangling-9000' }),
  }).then((r) => r.json());
  assert.equal(search.total_matches, 0, 'CV content must not leak into course-document search results');

  // No Gemini key in the test environment - matching must say so plainly
  // rather than fabricating a gap analysis.
  const matchRes = await fetch(`${server.base}/api/v1/cv/match`, {
    method: 'POST',
    headers: authJson,
    body: JSON.stringify({ document_id: uploaded.id, job: { title: 'Backend Engineer', company: 'Acme Corp', description: 'Python and PostgreSQL experience required.' } }),
  });
  assert.equal(matchRes.status, 200);
  const matchBody = await matchRes.json();
  assert.equal(matchBody.ai_configured, false);
  assert.equal(matchBody.result, null);
  assert.ok(matchBody.message && matchBody.message.length > 0);

  // Validation: missing document_id, missing job fields, and an unknown
  // document_id must all be rejected before ever reaching AI.
  const missingDoc = await fetch(`${server.base}/api/v1/cv/match`, {
    method: 'POST',
    headers: authJson,
    body: JSON.stringify({ job: { title: 'Backend Engineer', company: 'Acme Corp' } }),
  });
  assert.equal(missingDoc.status, 400);

  const missingJob = await fetch(`${server.base}/api/v1/cv/match`, {
    method: 'POST',
    headers: authJson,
    body: JSON.stringify({ document_id: uploaded.id, job: {} }),
  });
  assert.equal(missingJob.status, 400);

  const unknownDoc = await fetch(`${server.base}/api/v1/cv/match`, {
    method: 'POST',
    headers: authJson,
    body: JSON.stringify({ document_id: 'does-not-exist', job: { title: 'Backend Engineer', company: 'Acme Corp' } }),
  });
  assert.equal(unknownDoc.status, 404);
});

test('career-agent chat is honest about CV status and reflects a real uploaded CV once one exists', async () => {
  const email = uniqueEmail('careercoach');
  const { access_token } = await fetch(`${server.base}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'pass1234', full_name: 'Career Coach Test' }),
  }).then((r) => r.json());
  const auth = { Authorization: `Bearer ${access_token}` };
  const authJson = { ...auth, 'Content-Type': 'application/json' };

  const session = await fetch(`${server.base}/api/v1/chat/sessions`, {
    method: 'POST',
    headers: authJson,
    body: JSON.stringify({ title: 'Interview prep' }),
  }).then((r) => r.json());

  // No CV uploaded yet, no live AI key in this test environment - the
  // deterministic career fallback must say plainly that no CV is on file
  // rather than pretending to have coached against one.
  const beforeCv = await fetch(`${server.base}/api/v1/chat/sessions/${session.id}/messages`, {
    method: 'POST',
    headers: authJson,
    body: JSON.stringify({ content: 'How should I prepare for a technical interview?', target_agent_override: 'career' }),
  }).then((r) => r.json());
  assert.equal(beforeCv.routed_agent, 'career');
  assert.match(beforeCv.assistant_message.content, /CV on file\*\*: No/);

  // Upload a real CV via the real multipart endpoint (same pattern as the
  // CV-match test above), then ask again - the fallback must now report a
  // CV is on file, since that's the observable, black-box-testable half of
  // "track the CV that is submitted"; the live-AI CV-grounded system prompt
  // itself needs a real API key to exercise and isn't reachable from here.
  const cvText = 'Jane Student. Skills: Python, SQL. Completed a data pipelines project using PostgreSQL.';
  const form = new FormData();
  form.append('document_type', 'cv');
  form.append('file', new Blob([cvText], { type: 'text/plain' }), 'resume.txt');
  await fetch(`${server.base}/api/v1/documents/upload-file`, {
    method: 'POST',
    headers: auth,
    body: form,
  }).then((r) => r.json());

  const afterCv = await fetch(`${server.base}/api/v1/chat/sessions/${session.id}/messages`, {
    method: 'POST',
    headers: authJson,
    body: JSON.stringify({ content: 'How should I prepare for a technical interview?', target_agent_override: 'career' }),
  }).then((r) => r.json());
  assert.equal(afterCv.routed_agent, 'career');
  assert.match(afterCv.assistant_message.content, /CV on file\*\*: Yes/);
});

test('self-service password change validates inputs, works, and invalidates the old session', async () => {
  const email = uniqueEmail('changepw');
  const { access_token } = await fetch(`${server.base}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'original-pass1', full_name: 'Change PW Test' }),
  }).then((r) => r.json());
  const authJson = { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` };

  // Wrong current password is rejected, and doesn't change anything.
  const wrongCurrent = await fetch(`${server.base}/api/v1/auth/change-password`, {
    method: 'POST',
    headers: authJson,
    body: JSON.stringify({ current_password: 'not-the-real-password', new_password: 'brand-new-pass1' }),
  });
  assert.equal(wrongCurrent.status, 401);

  // Too-short new password is rejected.
  const tooShort = await fetch(`${server.base}/api/v1/auth/change-password`, {
    method: 'POST',
    headers: authJson,
    body: JSON.stringify({ current_password: 'original-pass1', new_password: 'short' }),
  });
  assert.equal(tooShort.status, 400);

  // The old password still works, since neither bad attempt above changed anything.
  const stillOldPassword = await fetch(`${server.base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'original-pass1' }),
  });
  assert.equal(stillOldPassword.status, 200);

  // Correct current password + valid new password succeeds.
  const success = await fetch(`${server.base}/api/v1/auth/change-password`, {
    method: 'POST',
    headers: authJson,
    body: JSON.stringify({ current_password: 'original-pass1', new_password: 'brand-new-pass1' }),
  });
  assert.equal(success.status, 200);

  // The token used to make that change is now dead - changing a password
  // invalidates every existing session for the account, including the one
  // that just made the request.
  const oldTokenNowDead = await fetch(`${server.base}/api/v1/auth/me`, { headers: authJson });
  assert.equal(oldTokenNowDead.status, 401);

  // The old password no longer works...
  const oldPasswordRejected = await fetch(`${server.base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'original-pass1' }),
  });
  assert.equal(oldPasswordRejected.status, 401);

  // ...but the new one does.
  const newPasswordWorks = await fetch(`${server.base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'brand-new-pass1' }),
  });
  assert.equal(newPasswordWorks.status, 200);
});

test('login rate limiting kicks in after repeated attempts', async () => {
  const limitDir = mkdtempSync(path.join(tmpdir(), 'uniagent-ratelimit-'));
  const s = await startServer(4503, limitDir);
  try {
    const email = uniqueEmail('ratelimit');
    let sawRateLimited = false;
    for (let i = 0; i < 25; i++) {
      const res = await fetch(`${s.base}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'wrong' }),
      });
      if (res.status === 429) { sawRateLimited = true; break; }
    }
    assert.ok(sawRateLimited, 'expected the auth rate limiter to eventually return 429');
  } finally {
    await s.stop();
    rmSync(limitDir, { recursive: true, force: true });
  }
});

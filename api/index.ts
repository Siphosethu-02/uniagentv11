// Vercel's Node.js runtime only auto-detects serverless functions inside an
// `api/` directory at the project root - it will never pick up server.ts
// sitting at the root by itself, no matter what vercel.json's rewrites say.
// This file is the thin, real entry point Vercel actually builds; it just
// re-exports the request handler that already lives in server.ts (the same
// handler used by Docker/Cloud Run, just built once per warm instance there
// too - see the comment above `handleOnVercel` in server.ts).
export { default } from '../server.js';

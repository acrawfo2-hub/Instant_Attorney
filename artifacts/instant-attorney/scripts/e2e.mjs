#!/usr/bin/env node
// Instant-Attorney smoke / end-to-end checks.
//
// Cheap, deterministic, and AI-free — safe to run on a schedule or in CI without
// burning Anthropic API budget. It verifies the things that actually broke before:
//   1. the app is up and serving (GET /login — its production health path)
//   2. users can authenticate AND the DB is reachable (POST /api/auth/login
//      returns a session cookie; this call round-trips to Supabase)
//   3. the live DB schema has the columns document submission depends on
//      (migration-drift guard — their absence is the exact bug that broke submit)
//
// It does NOT run the ~165s document generation (that costs real money); test that
// manually in the UI before a publish.
//
// Usage:   node scripts/e2e.mjs
// Env:
//   BASE_URL                   target app origin (default http://localhost:80)
//   E2E_EMAIL / E2E_PASSWORD   a test login (auth check skipped if absent)
//   NEXT_PUBLIC_SUPABASE_URL   Supabase project URL (schema check skipped if absent)
//   SUPABASE_SERVICE_ROLE_KEY  Supabase service role key (schema check skipped if absent)
//
// Strict mode: when CI=true (GitHub Actions sets this automatically) or E2E_STRICT=1,
// every check is REQUIRED — a missing env var becomes a failure instead of a skip, so
// misconfigured secrets can never produce a false green.

const STRICT = process.env.CI === "true" || process.env.E2E_STRICT === "1";
const BASE = (process.env.BASE_URL || "http://localhost:80").replace(/\/$/, "");
const { E2E_EMAIL, E2E_PASSWORD } = process.env;
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let failures = 0;
const pass = (m) => console.log(`  \u2713 ${m}`);
const fail = (m) => { console.error(`  \u2717 ${m}`); failures++; };
const skip = (m) => {
  if (STRICT) { console.error(`  \u2717 required (strict mode): ${m}`); failures++; }
  else console.warn(`  \u26a0 skipped: ${m}`);
};

// fetch with an abort timeout and one short retry, so a transient network stall
// fails predictably instead of hanging the job.
async function http(url, opts = {}, { timeoutMs = 15000, retries = 1 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      return await fetch(url, { ...opts, signal: ac.signal });
    } catch (e) {
      if (attempt >= retries) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    } finally {
      clearTimeout(timer);
    }
  }
}

function readSetCookie(headers) {
  // getSetCookie() is the correct API, but fall back to get() for runtime safety.
  const arr = headers.getSetCookie?.();
  if (arr && arr.length) return arr;
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

async function checkLiveness() {
  console.log("Liveness");
  try {
    const r = await http(`${BASE}/login`, { method: "GET", redirect: "manual" });
    if (r.status >= 200 && r.status < 400) pass(`GET /login -> ${r.status} (app serving)`);
    else fail(`GET /login -> ${r.status}`);
  } catch (e) {
    fail(`GET /login threw: ${e.message}`);
  }
}

async function checkAuth() {
  console.log("Authentication");
  if (!E2E_EMAIL || !E2E_PASSWORD) return skip("E2E_EMAIL / E2E_PASSWORD not set");
  try {
    const r = await http(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
      redirect: "manual",
    });
    const cookies = readSetCookie(r.headers);
    if (r.status === 200 && cookies.length > 0) pass("login -> 200 with session cookie");
    else fail(`login -> ${r.status}, session cookies: ${cookies.length}`);
  } catch (e) {
    fail(`login threw: ${e.message}`);
  }
}

async function checkSchema() {
  console.log("Database schema (migration-drift guard)");
  if (!SUPA_URL || !SUPA_KEY) return skip("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  const headers = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };

  // Columns added by the stage8 migration — submission fails if they are missing.
  for (const col of ["parent_document_id", "attorney_second_draft_prompt"]) {
    try {
      const r = await http(`${SUPA_URL}/rest/v1/documents?select=${col}&limit=1`, { headers });
      if (r.ok) pass(`documents.${col} present`);
      else fail(`documents.${col} missing or unreadable (HTTP ${r.status})`);
    } catch (e) {
      fail(`documents.${col} check threw: ${e.message}`);
    }
  }

  // Connectivity check via an exact count.
  try {
    const r = await http(`${SUPA_URL}/rest/v1/documents?select=id`, {
      headers: { ...headers, Prefer: "count=exact", Range: "0-0" },
    });
    if (r.ok) pass(`documents table reachable (range: ${r.headers.get("content-range")})`);
    else fail(`documents table unreachable (HTTP ${r.status})`);
  } catch (e) {
    fail(`connectivity check threw: ${e.message}`);
  }
}

console.log(`Instant-Attorney smoke checks against ${BASE}${STRICT ? " (strict)" : ""}\n`);
if (STRICT && !process.env.BASE_URL) {
  fail("BASE_URL is required in strict mode (set the E2E_BASE_URL secret)");
}
await checkLiveness();
await checkAuth();
await checkSchema();

console.log("");
if (failures > 0) {
  console.error(`FAILED: ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All executed checks passed.");

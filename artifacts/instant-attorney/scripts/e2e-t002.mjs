#!/usr/bin/env node
// T002 — LIVE draft generation + SAVE verification (stops BEFORE submit).
//
// Exercises the real shared Supabase backend end-to-end:
//   1. provision a confirmed test user (admin API, bypasses email-confirm wall)
//   2. seed the onboarding gate rows (profiles/subscriptions/consents/agreement/case)
//   3. log in through the app (real auth + cookie round-trip)
//   4. POST /api/wizard -> REAL on-demand AI draft generation (costs credits, slow)
//   5. assert a `documents` row persisted: draft_text non-null, status 'draft',
//      submitted_at null  (NOT pending_review — we never submit, so no attorney email)
//   6. assert the CLIENT can read its own draft via /api/documents/lookup (RLS path)
//   7. clean up (documents, case_files, then admin-delete the user -> cascade)
//
// Writes a sentinel JSON result to RESULT_PATH so a watcher can poll it.
// Uses ONLY native fetch — no imports — so it runs from any cwd without node_modules.
//
// Run as a managed console workflow (AI gen can exceed the bash ~120s kill):
//   node --env-file=.env.local scripts/e2e-t002.mjs

const BASE = (process.env.BASE_URL || "http://localhost:80").replace(/\/$/, "");
const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESULT_PATH = process.env.RESULT_PATH || "/tmp/e2e-t002-result.json";
const WIZARD_TYPE = "demand_letter";

const log = (...a) => console.log("[t002]", ...a);
const checks = [];
const record = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`[t002] ${ok ? "\u2713" : "\u2717"} ${name}${detail ? " — " + detail : ""}`);
};

async function writeSentinel(obj) {
  const fs = await import("node:fs/promises");
  await fs.writeFile(RESULT_PATH, JSON.stringify(obj, null, 2));
  log("sentinel written to", RESULT_PATH);
}

const svcHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

// Service-role PostgREST insert returning the created row(s).
async function restInsert(table, row) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...svcHeaders, Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`insert ${table} -> ${r.status}: ${text}`);
  return JSON.parse(text);
}

// Upsert (merge on conflict) — the live project auto-creates some rows via a
// signup trigger (e.g. profiles), so a plain insert would 409. onConflict names
// the conflict target column(s).
async function restUpsert(table, row, onConflict) {
  const qs = onConflict ? `?on_conflict=${onConflict}` : "";
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}${qs}`, {
    method: "POST",
    headers: { ...svcHeaders, Prefer: "return=representation,resolution=merge-duplicates" },
    body: JSON.stringify(row),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`upsert ${table} -> ${r.status}: ${text}`);
  return JSON.parse(text);
}

async function restDelete(table, filter) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: svcHeaders,
  });
  const ok = r.ok || r.status === 404;
  if (!ok) log(`warn: delete ${table} -> ${r.status}: ${await r.text()}`);
  return ok;
}

function cookieHeaderFrom(res) {
  const arr = res.headers.getSetCookie?.() ?? [];
  return arr.map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  if (!SUPA_URL || !SERVICE_KEY) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

  const email = `e2e-t002-${Date.now()}@instant-attorney-test.dev`;
  const password = `Pw!${Math.random().toString(36).slice(2)}${Date.now()}`;
  let userId, caseFileId;
  let cleanupOk = true;

  try {
    // 1. confirmed user via admin API
    const cu = await fetch(`${SUPA_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: svcHeaders,
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const cuText = await cu.text();
    if (!cu.ok) throw new Error(`admin create user -> ${cu.status}: ${cuText}`);
    userId = JSON.parse(cuText).id;
    record("provision confirmed user", !!userId, `id=${userId?.slice(0, 8)}…`);

    // 2. seed onboarding gate rows (profiles/subscriptions may be auto-created by
    //    a signup trigger, so upsert them; the rest are unique to a fresh user)
    await restUpsert("profiles", { id: userId, email, full_name: "E2E T002 Tester" }, "id");
    await restUpsert("subscriptions", { user_id: userId, status: "active", plan: "phase2" }, "user_id");
    await restInsert("ai_consents", { user_id: userId });
    await restInsert("representation_agreements", { user_id: userId, signature_name: "E2E T002 Tester" });
    const cf = await restInsert("case_files", {
      user_id: userId,
      matter_type: "reactive",
      matter_subtype: "consumer_dispute",
      status: "open",
      goals: ["Recover a $4,200 deposit a contractor refused to return after abandoning the job."],
    });
    caseFileId = cf[0].id;
    // A couple of confirmed facts so the drafter has real substance to work with.
    await restInsert("fact_items", [
      { case_file_id: caseFileId, user_id: userId, status: "confirmed",
        description: "On 2026-02-10 the client paid contractor Dale Briggs a $4,200 deposit for a kitchen remodel." },
      { case_file_id: caseFileId, user_id: userId, status: "confirmed",
        description: "Briggs stopped responding on 2026-03-01 and performed no work; the client demands a full refund." },
    ]);
    record("seed onboarding + case rows", !!caseFileId, `caseFileId=${caseFileId?.slice(0, 8)}…`);

    // 3. log in through the app (real auth + cookie)
    const login = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      redirect: "manual",
    });
    const cookie = cookieHeaderFrom(login);
    record("login returns session cookie", login.status === 200 && cookie.length > 0,
      `status=${login.status}`);
    if (!cookie) throw new Error("no session cookie from login");

    // 4. REAL on-demand draft generation (slow, costs credits)
    log("generating draft via /api/wizard (this can take a few minutes)…");
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 290_000);
    let wiz;
    try {
      const t0 = Date.now();
      const r = await fetch(`${BASE}/api/wizard`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          caseFileId,
          wizardType: WIZARD_TYPE,
          messages: [{ role: "user", content:
            "Please draft a firm but professional demand letter to contractor Dale Briggs " +
            "demanding the immediate return of the $4,200 deposit for work he never performed." }],
        }),
        signal: ac.signal,
      });
      const text = await r.text();
      if (!r.ok) throw new Error(`/api/wizard -> ${r.status}: ${text.slice(0, 400)}`);
      wiz = JSON.parse(text);
      log(`generation completed in ${Math.round((Date.now() - t0) / 1000)}s`);
    } finally {
      clearTimeout(timer);
    }
    record("draft generation returns documentId", !!wiz?.documentId,
      `documentId=${wiz?.documentId ? String(wiz.documentId).slice(0, 8) + "…" : "null"}, textLen=${wiz?.text?.length ?? 0}`);

    // 5. verify persistence directly in the DB (service role)
    const dq = await fetch(
      `${SUPA_URL}/rest/v1/documents?case_file_id=eq.${caseFileId}` +
      `&select=id,status,submitted_at,doc_type,draft_text`,
      { headers: svcHeaders }
    );
    const docs = await dq.json();
    const doc = Array.isArray(docs) ? docs.find((d) => d.doc_type === WIZARD_TYPE) ?? docs[0] : null;
    record("documents row persisted", !!doc, doc ? `id=${doc.id.slice(0, 8)}…` : "none found");
    record("DB row id matches returned documentId", !!doc && !!wiz?.documentId && doc.id === wiz.documentId,
      `db=${doc?.id?.slice(0, 8)}… returned=${String(wiz?.documentId ?? "null").slice(0, 8)}…`);
    record("draft_text is non-null/non-empty", !!(doc && doc.draft_text && doc.draft_text.trim().length > 50),
      doc ? `len=${doc.draft_text?.length ?? 0}` : "n/a");
    record("status is 'draft' (NOT submitted)", doc?.status === "draft", `status=${doc?.status}`);
    record("submitted_at is null (no attorney email)", doc != null && doc.submitted_at == null,
      `submitted_at=${doc?.submitted_at ?? "null"}`);

    // 6. verify the CLIENT can read its own saved draft (RLS-scoped lookup route)
    const lookup = await fetch(
      `${BASE}/api/documents/lookup?caseFileId=${caseFileId}&docType=${WIZARD_TYPE}`,
      { headers: { Cookie: cookie } }
    );
    const lookupBody = await lookup.json().catch(() => ({}));
    record("client file view can read the draft", lookup.status === 200 && lookupBody?.status === "draft" && !!lookupBody?.draft_text,
      `status=${lookup.status}, docStatus=${lookupBody?.status}`);
    record("client lookup returns the same document", lookup.status === 200 && !!wiz?.documentId && lookupBody?.id === wiz.documentId,
      `lookupId=${String(lookupBody?.id ?? "null").slice(0, 8)}…`);
  } finally {
    // 7. cleanup (best-effort; user delete cascades the rest). Track success so
    // leaked test rows are surfaced as a failed check rather than silently logged.
    try {
      if (caseFileId) {
        cleanupOk = (await restDelete("documents", `case_file_id=eq.${caseFileId}`)) && cleanupOk;
        cleanupOk = (await restDelete("case_files", `id=eq.${caseFileId}`)) && cleanupOk;
      }
      if (userId) {
        const d = await fetch(`${SUPA_URL}/auth/v1/admin/users/${userId}`, {
          method: "DELETE", headers: svcHeaders,
        });
        log(`cleanup: deleted test user -> ${d.status}`);
        if (!d.ok) cleanupOk = false;
      }
    } catch (e) {
      cleanupOk = false;
      log("cleanup warning:", e.message);
    }
  }

  record("cleanup left no test residue", cleanupOk, cleanupOk ? "" : "see warnings above");
  const ok = checks.length > 0 && checks.every((c) => c.ok);
  await writeSentinel({ ok, finishedAt: new Date().toISOString(), checks });
  log(ok ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED");
}

main().catch(async (e) => {
  console.error("[t002] FATAL:", e?.message || e);
  await writeSentinel({ ok: false, error: String(e?.message || e), checks }).catch(() => {});
});

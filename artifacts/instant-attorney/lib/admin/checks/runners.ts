import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";
import { pricedModels, hasModelPricing } from "@/lib/usage-tracker";
import { listAcpJobs, ACP_JOB_STUCK_MS } from "@/lib/acp-jobs";
import { crashSummary } from "@/lib/crash-counter";
import { PLAN_PRICE_IDS } from "@/lib/stripe";
import type { CheckResult, CheckRunner, CheckRow } from "./types.ts";

/**
 * The probe implementations, bound to `catalog.ts` entries by id.
 *
 * House rules for anything added here:
 *   * Never throw — `index.ts` will catch it, but a thrown error reads as
 *     "the check is broken", not "the thing being checked is broken".
 *   * Assert a real invariant. A probe that only proves the network works is
 *     noise on the board.
 *   * Say what to do about it in `fix`. A red row with no next action just
 *     moves the diagnosis back onto the reader.
 */

function msg(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

function fmtAge(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

/** fetch with its own deadline, so one hung integration cannot stall the board. */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── database.schema ────────────────────────────────────────────────────────
const schemaCheck: CheckRunner = async () => {
  const db = createServiceClient();
  const { data, error } = await db.rpc("admin_schema_verify");

  if (error) {
    const notInstalled = /does not exist|could not find|PGRST202/i.test(error.message);
    return {
      status: notInstalled ? "warn" : "fail",
      summary: notInstalled
        ? "Schema verifier is not installed, so drift cannot be detected."
        : `Schema verification failed: ${error.message}`,
      detail: notInstalled
        ? "Until this runs, an unapplied migration stays completely invisible — writes to a " +
          "missing table answer PGRST205 and look successful."
        : undefined,
      fix: notInstalled
        ? "Apply supabase/schema-stage48-schema-verifier.sql in the Supabase SQL editor."
        : undefined,
    };
  }

  const rows = (data ?? []) as { object: string; kind: string; status: string }[];
  const missing = rows.filter((r) => r.status !== "OK");

  if (rows.length === 0) {
    return {
      status: "warn",
      summary: "The verifier returned nothing — treat the schema as unverified.",
      fix: "Re-apply supabase/schema-stage48-schema-verifier.sql.",
    };
  }

  if (missing.length === 0) {
    return {
      status: "ok",
      summary: `All ${rows.length} expected objects present.`,
    };
  }

  const dataGaps = missing.filter((m) => m.kind === "data");
  const schemaGaps = missing.filter((m) => m.kind !== "data");

  return {
    status: "fail",
    summary: `${missing.length} of ${rows.length} expectations unmet.`,
    detail:
      schemaGaps.length > 0
        ? "Writes touching these objects will answer PGRST205 and look like they succeeded."
        : "Schema is complete; the gap is a data invariant.",
    rows: missing.slice(0, 30).map<CheckRow>((m) => ({
      label: m.object,
      value: `${m.kind} · missing`,
      bad: true,
    })),
    fix:
      schemaGaps.length > 0
        ? "Apply the outstanding files in supabase/ — schema-catch-up-current.sql covers most of them."
        : dataGaps.length > 0
          ? "Run supabase/schema-stage46-auth-access-repair.sql, or repair the accounts individually under People."
          : undefined,
  };
};

// ── database.storage ───────────────────────────────────────────────────────
const REQUIRED_BUCKETS = ["case-attachments"];

const storageCheck: CheckRunner = async () => {
  const db = createServiceClient();
  const { data, error } = await db.storage.listBuckets();
  if (error) {
    return { status: "fail", summary: `Storage unreachable: ${error.message}` };
  }

  const names = (data ?? []).map((b) => b.name);
  const missing = REQUIRED_BUCKETS.filter((b) => !names.includes(b));

  if (missing.length > 0) {
    return {
      status: "fail",
      summary: `Missing bucket: ${missing.join(", ")}.`,
      detail: "Attachment upload writes into this bucket and will fail without it.",
      rows: names.map<CheckRow>((n) => ({ label: n, value: "present" })),
      fix: "Create the bucket in Supabase → Storage. It must be private.",
    };
  }

  return {
    status: "ok",
    summary: `${names.length} bucket${names.length === 1 ? "" : "s"} reachable.`,
    rows: names.map<CheckRow>((n) => ({ label: n, value: "present" })),
  };
};

// ── integrations.anthropic ─────────────────────────────────────────────────
const anthropicCheck: CheckRunner = async () => {
  const key = process.env.Claude_Instant_Attorney;
  if (!key) {
    return {
      status: "fail",
      summary: "Claude_Instant_Attorney is not set — every AI surface is down.",
      fix: "Set the Anthropic key. Note the non-standard variable name.",
    };
  }

  const model = "claude-haiku-4-5-20251001";
  try {
    const client = new Anthropic({ apiKey: key });
    // Streamed on purpose: a sync create() with a large max_tokens throws and
    // 502s, so the probe uses the same call shape the product does.
    const stream = client.messages.stream({
      model,
      max_tokens: 4,
      messages: [{ role: "user", content: "Reply with the single word: ok" }],
    });
    const final = await stream.finalMessage();
    return {
      status: "ok",
      summary: `Answered on ${model}.`,
      rows: [
        { label: "model", value: model },
        { label: "output tokens", value: String(final.usage?.output_tokens ?? 0) },
      ],
    };
  } catch (e) {
    return {
      status: "fail",
      summary: `Anthropic call failed: ${msg(e)}`,
      fix: "Check the key is valid and the account has credit.",
    };
  }
};

// ── integrations.resend ────────────────────────────────────────────────────
const resendCheck: CheckRunner = async () => {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return {
      status: "fail",
      summary: "RESEND_API_KEY is not set — no transactional email will send.",
      detail: "Confirmation and reset mail is how locked-out people get back in.",
      fix: "Set RESEND_API_KEY.",
    };
  }

  try {
    const res = await fetchWithTimeout(
      "https://api.resend.com/domains",
      { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" },
      6000
    );
    if (res.status === 401 || res.status === 403) {
      return {
        status: "fail",
        summary: `Resend rejected the key (HTTP ${res.status}).`,
        fix: "Rotate RESEND_API_KEY.",
      };
    }
    if (!res.ok) {
      return { status: "warn", summary: `Resend answered HTTP ${res.status}.` };
    }
    const body = (await res.json().catch(() => ({}))) as { data?: { name: string; status: string }[] };
    const domains = body.data ?? [];
    const unverified = domains.filter((d) => d.status !== "verified");
    return {
      status: unverified.length > 0 ? "warn" : "ok",
      summary:
        unverified.length > 0
          ? `${unverified.length} sending domain not verified.`
          : `Key valid; ${domains.length} sending domain${domains.length === 1 ? "" : "s"} verified.`,
      rows: domains.map<CheckRow>((d) => ({
        label: d.name,
        value: d.status,
        bad: d.status !== "verified",
      })),
      fix: unverified.length > 0 ? "Verify the domain in Resend, or mail will land in spam." : undefined,
    };
  } catch (e) {
    return { status: "fail", summary: `Resend unreachable: ${msg(e)}` };
  }
};

// ── integrations.stripe ────────────────────────────────────────────────────
const stripeCheck: CheckRunner = async () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return {
      status: "warn",
      summary: "STRIPE_SECRET_KEY is not set — checkout and billing are disabled.",
      fix: "Set it if this deployment is meant to take payment.",
    };
  }

  const configured = Object.entries(PLAN_PRICE_IDS).filter(([, id]) => !!id);
  if (configured.length === 0) {
    return {
      status: "fail",
      summary: "No plan price IDs are configured — every checkout will fail.",
      fix: "Set STRIPE_PHASE2_PRICE_ID, STRIPE_CONSULT_PRICE_ID and STRIPE_ATTORNEY_PRO_PRICE_ID.",
    };
  }

  const rows: CheckRow[] = [];
  let broken = 0;
  for (const [plan, id] of configured) {
    try {
      const res = await fetchWithTimeout(
        `https://api.stripe.com/v1/prices/${encodeURIComponent(id)}`,
        { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" },
        6000
      );
      if (res.ok) {
        rows.push({ label: plan, value: id });
      } else {
        broken++;
        rows.push({ label: plan, value: `${id} — HTTP ${res.status}`, bad: true });
      }
    } catch (e) {
      broken++;
      rows.push({ label: plan, value: `${id} — ${msg(e)}`, bad: true });
    }
  }

  const unconfigured = Object.entries(PLAN_PRICE_IDS)
    .filter(([, id]) => !id)
    .map(([plan]) => plan);
  for (const plan of unconfigured) rows.push({ label: plan, value: "not configured", bad: true });

  if (broken > 0) {
    return {
      status: "fail",
      summary: `${broken} price ID did not resolve — that plan's checkout fails.`,
      rows,
      fix: "Correct the price ID env vars against the Stripe dashboard.",
    };
  }

  return {
    status: unconfigured.length > 0 ? "warn" : "ok",
    summary:
      unconfigured.length > 0
        ? `${configured.length} price ID${configured.length === 1 ? "" : "s"} valid; ${unconfigured.length} unconfigured.`
        : `All ${configured.length} price IDs resolve.`,
    rows,
  };
};

// ── config.model-pricing ───────────────────────────────────────────────────
const pricingCheck: CheckRunner = async () => {
  const db = createServiceClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from("usage_events")
    .select("model")
    .not("model", "is", null)
    .gte("created_at", since)
    .limit(5000);

  if (error) {
    return { status: "warn", summary: `Could not read usage_events: ${error.message}` };
  }

  const seen = new Set((data ?? []).map((r) => r.model as string).filter(Boolean));
  const unpriced = [...seen].filter((m) => !hasModelPricing(m));

  if (seen.size === 0) {
    return {
      status: "ok",
      summary: "No model calls recorded in the last 30 days.",
      rows: pricedModels().map<CheckRow>((m) => ({ label: m, value: "priced" })),
    };
  }

  if (unpriced.length > 0) {
    return {
      status: "fail",
      summary: `${unpriced.length} model in use has no pricing entry.`,
      detail: "Its cost is being recorded at Sonnet's rate, so cost attribution is wrong with no error anywhere.",
      rows: unpriced.map<CheckRow>((m) => ({ label: m, value: "no pricing entry", bad: true })),
      fix: "Add it to MODEL_PRICING_USD_PER_M in lib/usage-tracker.ts.",
    };
  }

  return {
    status: "ok",
    summary: `All ${seen.size} model${seen.size === 1 ? "" : "s"} seen in 30 days are priced.`,
    rows: [...seen].sort().map<CheckRow>((m) => ({ label: m, value: "priced" })),
  };
};

// ── config.environment ─────────────────────────────────────────────────────
const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "Claude_Instant_Attorney",
  "RESEND_API_KEY",
  "SESSION_SECRET",
];

const envCheck: CheckRunner = async () => {
  const isProd = process.env.NODE_ENV === "production";
  const rows: CheckRow[] = [];
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  for (const k of REQUIRED_ENV) rows.push({ label: k, value: process.env[k] ? "set" : "MISSING", bad: !process.env[k] });

  const bypassOn = process.env.BYPASS_AUTH === "true";
  rows.push({ label: "BYPASS_AUTH", value: bypassOn ? "true" : "off", bad: bypassOn && isProd });

  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").filter((s) => s.trim());
  rows.push({
    label: "ADMIN_EMAILS",
    value: adminEmails.length > 0 ? `${adminEmails.length} address(es)` : "not set",
    bad: adminEmails.length === 0,
  });

  if (bypassOn && isProd) {
    return {
      status: "fail",
      summary: "BYPASS_AUTH is true in production.",
      detail:
        "Admin routes refuse to honour it, but the rest of the app does not — auth, agreements " +
        "and payment are all disabled and every request is a fixed impersonated user.",
      rows,
      fix: "Unset BYPASS_AUTH and NEXT_PUBLIC_BYPASS_AUTH, then redeploy.",
    };
  }

  if (missing.length > 0) {
    return {
      status: "fail",
      summary: `${missing.length} required variable${missing.length === 1 ? "" : "s"} missing.`,
      rows,
      fix: `Set: ${missing.join(", ")}. See .env.local.example.`,
    };
  }

  if (adminEmails.length === 0) {
    return {
      status: "warn",
      summary: "ADMIN_EMAILS is not set — there is no break-glass path into this console.",
      detail:
        "Admin access currently depends entirely on profiles.is_attorney, which is the read " +
        "an RLS mistake has taken down before.",
      rows,
      fix: "Set ADMIN_EMAILS to the operator's own address.",
    };
  }

  return { status: "ok", summary: "All required variables set.", rows };
};

// ── runtime.acp-jobs ───────────────────────────────────────────────────────
const acpJobsCheck: CheckRunner = async () => {
  const jobs = listAcpJobs();
  const running = jobs.filter((j) => !j.done);
  const stuck = jobs.filter((j) => j.stuck);

  if (stuck.length > 0) {
    return {
      status: "fail",
      summary: `${stuck.length} orchestrator turn${stuck.length === 1 ? "" : "s"} stuck for over ${Math.round(ACP_JOB_STUCK_MS / 60000)} minutes.`,
      detail:
        "Later turns on the same case file queue behind these, so the client's composer " +
        "never comes back. finishAcpJob did not run.",
      rows: stuck.map<CheckRow>((j) => ({
        label: `case ${j.caseFileId.slice(0, 8)}…`,
        value: `running ${fmtAge(j.ageMs)}`,
        bad: true,
      })),
      fix: "Restarting the server clears the in-process registry; the persisted messages and drafts survive.",
    };
  }

  return {
    status: "ok",
    summary:
      running.length === 0
        ? "No turns in flight."
        : `${running.length} turn${running.length === 1 ? "" : "s"} in flight, none stuck.`,
    rows: running.map<CheckRow>((j) => ({
      label: `case ${j.caseFileId.slice(0, 8)}…`,
      value: `running ${fmtAge(j.ageMs)}`,
    })),
  };
};

// ── runtime.crash-guard ────────────────────────────────────────────────────
const crashGuardCheck: CheckRunner = async () => {
  const s = crashSummary();
  const total = s.unhandledRejections + s.uncaughtExceptions;
  const uptime = fmtAge(Date.now() - s.bootedAt);

  if (total === 0) {
    return { status: "ok", summary: `No crash-guard events in ${uptime} of uptime.` };
  }

  return {
    status: s.uncaughtExceptions > 0 ? "fail" : "warn",
    summary: `${total} crash-guard event${total === 1 ? "" : "s"} in ${uptime} of uptime.`,
    detail:
      "The server stayed up by design. These are errors that escaped a request lifecycle — " +
      "usually fire-and-forget background work.",
    rows: s.recent.slice(0, 10).map<CheckRow>((e) => ({
      label: new Date(e.at).toLocaleString(),
      value: `${e.kind}: ${e.message.slice(0, 160)}`,
      bad: true,
    })),
    fix: "Trace each message to the background task that raised it; the counts reset on restart.",
  };
};

export const RUNNERS: Record<string, CheckRunner> = {
  "database.schema": schemaCheck,
  "database.storage": storageCheck,
  "integrations.anthropic": anthropicCheck,
  "integrations.resend": resendCheck,
  "integrations.stripe": stripeCheck,
  "config.model-pricing": pricingCheck,
  "config.environment": envCheck,
  "runtime.acp-jobs": acpJobsCheck,
  "runtime.crash-guard": crashGuardCheck,
};

export type { CheckResult };

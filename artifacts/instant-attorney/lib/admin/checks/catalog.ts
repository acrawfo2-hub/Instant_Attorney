import type { CheckMeta } from "./types.ts";

/**
 * Every health check this console knows about.
 *
 * Adding a failure mode means adding an entry here plus a runner in
 * `runners.ts` — never editing the Health page, which renders whatever the
 * catalog contains. `catalog.test.ts` enforces the hygiene rules (unique ids,
 * memo paths that resolve, a runner bound to every entry).
 *
 * The bar for inclusion: the failure must be one this system can actually
 * produce, and one you would not otherwise notice until a client did.
 */
export const CHECK_CATALOG: readonly CheckMeta[] = [
  {
    id: "database.schema",
    title: "Live schema matches the migrations",
    group: "database",
    matters:
      "An unapplied migration answers PGRST205 and the write looks like it succeeded. " +
      "Nothing in the product ever surfaces this — it is the single most invisible failure here.",
    memo: ".agents/memory/instant-attorney-supabase-migrations.md",
    timeoutMs: 12000,
  },
  {
    id: "database.storage",
    title: "Storage buckets reachable",
    group: "database",
    matters: "A missing or unreachable bucket breaks attachment upload and document delivery.",
  },
  {
    id: "integrations.anthropic",
    title: "Anthropic API answers",
    group: "integrations",
    matters: "Every AI surface in the product is down if this is red.",
    memo: ".agents/memory/anthropic-streaming-required.md",
    timeoutMs: 15000,
  },
  {
    id: "integrations.resend",
    title: "Resend (transactional email) answers",
    group: "integrations",
    matters:
      "Confirmation and reset mail is how people get into their accounts. When this is " +
      "down the symptom shows up as a wave of lockouts, not as an email error.",
  },
  {
    id: "integrations.stripe",
    title: "Stripe key and price IDs resolve",
    group: "integrations",
    matters:
      "A wrong or missing price ID fails at checkout, after the client has already decided " +
      "to pay. Nothing catches it until someone tries.",
  },
  {
    id: "config.model-pricing",
    title: "Every model in use has a pricing entry",
    group: "config",
    matters:
      "A model with no entry in lib/usage-tracker.ts silently bills at Sonnet's rate, so " +
      "cost attribution drifts with no error anywhere.",
    memo: ".agents/memory/instant-attorney-model-pricing.md",
  },
  {
    id: "config.environment",
    title: "Environment is configured for production",
    group: "config",
    matters:
      "A missing key degrades one feature; BYPASS_AUTH=true in production disables auth " +
      "entirely and impersonates a fixed user.",
  },
  {
    id: "runtime.acp-jobs",
    title: "No stuck orchestrator turns",
    group: "runtime",
    matters:
      "A turn whose finishAcpJob never ran leaves that case file's later turns queued " +
      "behind it forever — the client just sees the composer never come back.",
    memo: ".agents/memory/instant-attorney-background-turns.md",
  },
  {
    id: "runtime.crash-guard",
    title: "Crash guard has been quiet",
    group: "runtime",
    matters:
      "instrumentation.ts deliberately logs and survives unhandled rejections rather than " +
      "exiting. That keeps the single instance up, and it also means real breakage can " +
      "accumulate with nobody looking at the logs.",
    memo: ".agents/memory/instant-attorney-crash-guard.md",
  },
];

export function findCheck(id: string): CheckMeta | undefined {
  return CHECK_CATALOG.find((c) => c.id === id);
}

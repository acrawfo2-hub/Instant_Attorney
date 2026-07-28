// ── Grounded dynamic form lookup ─────────────────────────────────────────────
//
// When the chat assistant detects a government form that ISN'T in the curated
// registry, we don't let the model free-recall its details (that risks fake form
// numbers, wrong deadlines, dead links). Instead we look the form up grounded in
// its real official page via Anthropic's server-side web_search / web_fetch
// tools, and store the result as a "dynamic" form definition that the guided tool
// can use — always shown to the client as unverified ("confirm against the
// official source").
//
// This file splits into:
//   • pure helpers (slug, provisional def, validation/coercion) — unit-tested
//   • lookupGovernmentForm(...) — the network call (fire-and-forget from chat)

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GovFormDefinition } from "./types.ts";
import type { GovFormFieldType } from "./government-forms.ts";

export interface DynamicCandidate {
  /** Form number/name as the assistant described it, e.g. "DMV Change of Address". */
  name: string;
  agency: string;
  jurisdiction: string;
  /** Official URL if the assistant provided one (preferred to be a .gov). */
  official_url?: string;
  reason?: string;
}

const VALID_FIELD_TYPES: GovFormFieldType[] = [
  "string", "ssn", "date", "number", "boolean", "enum", "address",
];

/** Deterministic, collision-resistant key for a dynamic form within a case. */
export function slugifyFormKey(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `dyn-${slug || "form"}`;
}

/** Is this an official government source we'd trust as a link? */
export function looksOfficial(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return /(^|\.)gov($|[:/])/.test(u.hostname) || u.hostname.endsWith(".gov") || u.hostname.includes(".gov.");
  } catch {
    return false;
  }
}

/** Minimal definition built from the chat descriptor, used immediately while the
 * grounded lookup runs (and retained if the lookup fails). No invented fields. */
export function provisionalFormDef(c: DynamicCandidate): GovFormDefinition {
  const official = looksOfficial(c.official_url) ? c.official_url! : "";
  return {
    key: slugifyFormKey(c.name),
    form_number: c.name,
    title: c.name,
    agency: c.agency || "Unknown agency",
    jurisdiction: c.jurisdiction || "Unknown",
    state_specific: false,
    official_url: official,
    revision: "unverified",
    purpose: c.reason || "",
    who_needs_it: "",
    deadline: "Check the official source for deadlines.",
    fee: "Check the official source for fees.",
    submit_to: "See the official source for where to submit.",
    fields: [],
    common_mistakes: [],
    triggers: [],
  };
}

/** Validate and coerce the JSON a grounded lookup returns into a stored form
 * definition. Returns null if the result isn't trustworthy enough to use
 * (e.g. no official .gov URL, or no usable fields). `base` is the provisional
 * def to fall back on for any missing scalar. */
export function coerceLookedUpForm(
  raw: unknown,
  base: GovFormDefinition
): GovFormDefinition | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  if (r.found === false) return null;

  const official = typeof r.official_url === "string" ? r.official_url : "";
  // The whole point of grounding is a real official link — reject otherwise.
  if (!looksOfficial(official)) return null;

  const rawFields = Array.isArray(r.fields) ? r.fields : [];
  const fields = rawFields
    .map((f) => {
      if (!f || typeof f !== "object") return null;
      const fr = f as Record<string, unknown>;
      const name = typeof fr.name === "string" ? fr.name.trim() : "";
      const label = typeof fr.label === "string" ? fr.label.trim() : "";
      if (!name || !label) return null;
      const type = VALID_FIELD_TYPES.includes(fr.type as GovFormFieldType)
        ? (fr.type as GovFormFieldType)
        : "string";
      const out: GovFormDefinition["fields"][number] = { name, label, type };
      if (typeof fr.help === "string") out.help = fr.help;
      if (Array.isArray(fr.options)) out.options = fr.options.filter((o): o is string => typeof o === "string");
      if (fr.required === false) out.required = false;
      return out;
    })
    .filter((f): f is GovFormDefinition["fields"][number] => f !== null);

  // No usable fields means we can't run a guided interview — degrade to null so
  // the caller marks the lookup "failed" and shows link-only guidance.
  if (fields.length === 0) return null;

  const str = (v: unknown, fallback: string): string =>
    typeof v === "string" && v.trim() ? v.trim() : fallback;

  return {
    key: base.key,
    form_number: str(r.form_number, base.form_number),
    title: str(r.title, base.title),
    agency: str(r.agency, base.agency),
    jurisdiction: str(r.jurisdiction, base.jurisdiction),
    state_specific: typeof r.state_specific === "boolean" ? r.state_specific : base.state_specific,
    official_url: official,
    revision: str(r.revision, "unverified"),
    purpose: str(r.purpose, base.purpose),
    who_needs_it: str(r.who_needs_it, base.who_needs_it),
    deadline: str(r.deadline, base.deadline),
    fee: str(r.fee, base.fee),
    submit_to: str(r.submit_to, base.submit_to),
    fields,
    common_mistakes: Array.isArray(r.common_mistakes)
      ? r.common_mistakes.filter((m): m is string => typeof m === "string")
      : [],
    triggers: [],
  };
}

const LOOKUP_SYSTEM = `You research U.S. government forms. Given a described form, use web_search and web_fetch to find its OFFICIAL government page (prefer a .gov domain) and extract its real details. Never guess a form number, deadline, fee, or URL — only report what the official page states.

Return ONLY a JSON object (no prose, no markdown) with this shape:
{
  "found": boolean,            // false if you cannot verify an official source
  "form_number": string,
  "title": string,
  "agency": string,
  "jurisdiction": string,      // "Federal", a U.S. state, or a locality
  "state_specific": boolean,
  "official_url": string,      // the official government URL you verified (.gov preferred)
  "revision": string,          // form revision/year if shown, else ""
  "purpose": string,
  "who_needs_it": string,
  "deadline": string,
  "fee": string,
  "submit_to": string,
  "fields": [                  // the key fields the applicant fills in
    { "name": "snake_case_id", "label": "Human label", "type": "string|ssn|date|number|boolean|enum|address", "help": "optional", "options": ["for enum"], "required": false }
  ],
  "common_mistakes": [string]
}
If you cannot find a credible official source, return {"found": false}.`;

interface LookupDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  anthropic: any; // Anthropic client
  db: SupabaseClient;
  instrumentId: string;
  candidate: DynamicCandidate;
  model?: string;
  // Attribution for usage metering. Optional so ad-hoc callers still work, but
  // the chat path always supplies them so grounded lookups land on the ledger.
  userId?: string;
  caseFileId?: string;
}

/** Grounded lookup for one dynamic form, run fire-and-forget after detection.
 * Updates the instrument row's form_def + lookup_status. Best-effort: any failure
 * leaves the provisional definition in place and marks lookup_status "failed" so
 * the UI degrades to link-only guidance. */
export async function lookupGovernmentForm(deps: LookupDeps): Promise<void> {
  const { anthropic, db, instrumentId, candidate } = deps;
  const base = provisionalFormDef(candidate);

  try {
    const stream = anthropic.messages.stream({
      model: deps.model ?? "claude-sonnet-4-6",
      max_tokens: 2000,
      system: LOOKUP_SYSTEM,
      tools: [
        { type: "web_search_20260209", name: "web_search" },
        { type: "web_fetch_20260209", name: "web_fetch" },
      ],
      messages: [
        {
          role: "user",
          content: `Look up this government form and return the JSON.\nName: ${candidate.name}\nAgency: ${candidate.agency}\nJurisdiction: ${candidate.jurisdiction}${candidate.official_url ? `\nPossible URL: ${candidate.official_url}` : ""}`,
        },
      ],
    });

    const finalMsg = await stream.finalMessage();

    // Meter the grounded lookup's token spend. NOTE: this call also invokes the
    // Anthropic web_search / web_fetch server tools, which carry a per-use fee
    // (billed separately from tokens) that this token-only cost does NOT capture.
    // The server_tools flag on the event marks it for the server-tool reconciliation
    // pass on the /admin dashboard so that fee tail stays visible.
    if (deps.userId) {
      const searchRequests =
        (finalMsg.usage as { server_tool_use?: { web_search_requests?: number } })
          .server_tool_use?.web_search_requests ?? 0;
      // Lazy import so the pure helpers in this module stay loadable in the node
      // test runner (usage-tracker → supabase/server pulls in next/headers).
      const { recordAiFromMessage } = await import("./usage-tracker.ts");
      await recordAiFromMessage(db, finalMsg, {
        userId: deps.userId,
        actorId: deps.userId,
        caseFileId: deps.caseFileId ?? null,
        feature: "gov_form_lookup",
        metadata: {
          source: "gov_form_lookup",
          server_tools: true,
          web_search_requests: searchRequests,
        },
      });
    }

    const text: string = (finalMsg.content ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((b: any) => b.type === "text")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b: any) => b.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    const coerced = coerceLookedUpForm(parsed, base);

    if (coerced) {
      await db
        .from("form_instruments")
        .update({ form_def: coerced, lookup_status: "ready", updated_at: new Date().toISOString() })
        .eq("id", instrumentId);
    } else {
      await db
        .from("form_instruments")
        .update({ lookup_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", instrumentId);
    }
  } catch (err) {
    console.error("[gov-form-lookup] lookup failed:", err);
    await db
      .from("form_instruments")
      .update({ lookup_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", instrumentId)
      .then(undefined, () => {});
  }
}

/** Fire grounded lookups (fire-and-forget) for every dynamic form in a case file
 * that's still awaiting one. Called from the chat route after detection persists
 * new dynamic candidates. */
export async function triggerPendingLookups(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  anthropic: any,
  db: SupabaseClient,
  caseFileId: string,
  userId: string
): Promise<void> {
  const { data: rows } = await db
    .from("form_instruments")
    .select("id, form_key, reason, form_def")
    .eq("case_file_id", caseFileId)
    .eq("user_id", userId)
    .eq("source", "dynamic")
    .eq("lookup_status", "pending");

  for (const row of (rows ?? []) as Array<{ id: string; form_key: string; reason: string | null; form_def: GovFormDefinition | null }>) {
    const def = row.form_def;
    const candidate: DynamicCandidate = {
      name: def?.form_number ?? row.form_key,
      agency: def?.agency ?? "Unknown agency",
      jurisdiction: def?.jurisdiction ?? "Unknown",
      official_url: def?.official_url || undefined,
      reason: row.reason ?? undefined,
    };
    void lookupGovernmentForm({ anthropic, db, instrumentId: row.id, candidate, userId, caseFileId }).catch(() => {});
  }
}

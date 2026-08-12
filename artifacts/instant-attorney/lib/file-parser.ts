import type { SupabaseClient } from "@supabase/supabase-js";
import type { WizardType, LegalStrategy, PlanEntry } from "./types";

// Valid drafting engines for a DOCUMENT PLAN entry. Kept inline (not imported
// from ./types) so this module stays free of runtime imports the unit-test
// runner can't resolve.
const VALID_ENGINES = new Set<string>([
  "demand_letter",
  "complaint_letter",
  "draft_contract",
  "draft_waiver",
  "wills_trusts",
  "doc_review",
  "general_document",
]);
import { coerceWizardType } from "./types.ts";
import { inferInstrumentKey } from "./instruments/index.ts";
import { isKnownFormKey } from "./government-forms.ts";
import { provisionalFormDef, slugifyFormKey } from "./gov-form-lookup.ts";
import type { DynamicCandidate } from "./gov-form-lookup.ts";
import { placeholderFields } from "./wizard-parsing.ts";

// Extracts the draft text from a ---DRAFT READY--- block.
// Resilient to truncation: if the closing ---END DRAFT--- marker is missing
// (e.g. the model hit its token limit mid-draft), take everything after the
// opening marker up to the next block marker, so a long draft is still saved.
export function extractDraftText(text: string): string | null {
  const closed = text.match(/---DRAFT READY---([\s\S]*?)---END DRAFT---/);
  if (closed) return closed[1].trim();

  const open = text.match(/---DRAFT READY---([\s\S]*)/);
  if (open) {
    // Stop at the next block marker if one started, otherwise take the rest.
    const rest = open[1].split(/---(?:MISSING FACTS|FOLLOW-UP|FILE UPDATE)---/)[0];
    const trimmed = rest.trim();
    return trimmed.length ? trimmed : null;
  }
  return null;
}

// Returns true only when the drafter produced a COMPLETE ---FILE UPDATE--- block
// — both the opening AND closing markers present. A truncated response (e.g. the
// model hit its token limit mid-block) leaves the closing ---END FILE UPDATE---
// marker missing; applying such a half-written block would partially write
// structured sub-sections (facts / legal strategy) and corrupt the Living File.
// The route must gate parseAndUpdateFile on this so a partial apply is impossible.
export function isCompleteFileUpdate(text: string): boolean {
  return text.includes("---FILE UPDATE---") && text.includes("---END FILE UPDATE---");
}

// Returns true when the drafter signals the draft is ready for attorney review.
export function isDraftReadyForReview(text: string): boolean {
  const match = text.match(/---FILE UPDATE---([\s\S]*?)---END FILE UPDATE---/);
  if (!match) return false;
  return match[1].toUpperCase().includes("READY FOR ATTORNEY REVIEW");
}

// Returns true when text contains a complete ---LIVING FILE--- or
// ---LEGAL STRATEGY--- block that parseAndUpdateFile below would actually
// act on — the SAME order-sensitive regexes parseLivingFile/parseLegalStrategy
// use (not a plain substring check), so a caller deciding whether to offer
// "apply this update" can't disagree with what applying it will actually do.
export function hasApplicableUpdate(text: string): boolean {
  return (
    /---LIVING FILE---([\s\S]*?)---END FILE---/.test(text) ||
    /---LEGAL STRATEGY---([\s\S]*?)---END STRATEGY---/.test(text)
  );
}

// Parses all structured blocks from AI output and writes updates to the DB.
// Called at key events only: end of session, wizard completion, document upload.
export async function parseAndUpdateFile(
  db: SupabaseClient,
  caseFileId: string,
  userId: string,
  text: string
): Promise<void> {
  await Promise.all([
    parseLivingFile(db, caseFileId, userId, text),
    parseLegalStrategy(db, caseFileId, text),
    parseRequestedAttachments(db, caseFileId, userId, text),
    parseGovernmentForms(db, caseFileId, userId, text),
  ]);
}

// ── ---GOVERNMENT FORMS--- block ─────────────────────────────────────────────
// Each line: "form_key — plain-language reason this client needs it". Only keys
// that exist in the registry are persisted, so the model can't invent a form.
// Parsed out so it can be unit-tested without a DB.
export interface ParsedGovForm {
  form_key: string;
  reason: string | null;
}

function govFormsBlockLines(text: string): string[] | null {
  const match = text.match(/---GOVERNMENT FORMS---([\s\S]*?)---END FORMS---/);
  if (!match) return null;
  return match[1]
    .split("\n")
    .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
    .filter(Boolean);
}

// Seeded (registry) forms: lines of "form_key — reason". Unknown keys are
// dropped so the model can't invent a registry form. `new:` lines (dynamic
// candidates) are handled by parseDynamicFormCandidates instead.
export function parseGovernmentFormsBlock(text: string): ParsedGovForm[] {
  const lines = govFormsBlockLines(text);
  if (!lines) return [];

  const seen = new Set<string>();
  const out: ParsedGovForm[] = [];
  for (const line of lines) {
    if (/^new\s*:/i.test(line)) continue; // dynamic candidate, not a registry key
    const [rawKey, ...reasonParts] = line.split(" — ");
    const form_key = rawKey.trim();
    if (!isKnownFormKey(form_key) || seen.has(form_key)) continue;
    seen.add(form_key);
    out.push({ form_key, reason: reasonParts.join(" — ").trim() || null });
  }
  return out;
}

// Dynamic candidates: forms not in the registry, marked by the assistant with a
// `new:` prefix and a pipe-delimited descriptor so we can ground a lookup:
//   "new: Form name | Agency | Jurisdiction | official_url(optional) — reason"
export function parseDynamicFormCandidates(text: string): DynamicCandidate[] {
  const lines = govFormsBlockLines(text);
  if (!lines) return [];

  const seen = new Set<string>();
  const out: DynamicCandidate[] = [];
  for (const line of lines) {
    if (!/^new\s*:/i.test(line)) continue;
    const body = line.replace(/^new\s*:/i, "").trim();
    const [descriptor, ...reasonParts] = body.split(" — ");
    const parts = descriptor.split("|").map((p) => p.trim());
    const name = parts[0];
    if (!name) continue;
    const key = slugifyFormKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    const maybeUrl = parts[3];
    out.push({
      name,
      agency: parts[1] || "Unknown agency",
      jurisdiction: parts[2] || "Unknown",
      official_url: maybeUrl && maybeUrl.toLowerCase() !== "unknown" ? maybeUrl : undefined,
      reason: reasonParts.join(" — ").trim() || undefined,
    });
  }
  return out;
}

export async function parseGovernmentForms(
  db: SupabaseClient,
  caseFileId: string,
  userId: string,
  text: string
): Promise<void> {
  const seeded = parseGovernmentFormsBlock(text);
  const dynamic = parseDynamicFormCandidates(text);
  if (!seeded.length && !dynamic.length) return;

  // Registry forms: trusted definition lives in the registry, read by key.
  const seededRows = seeded.map((d) => ({
    case_file_id: caseFileId,
    user_id: userId,
    form_key: d.form_key,
    reason: d.reason,
    status: "needed" as const,
    source: "registry" as const,
  }));

  // Dynamic forms: store a provisional definition immediately (no invented
  // fields) and mark the grounded lookup pending — the chat route kicks off the
  // web lookup which fills in fields + flips lookup_status.
  const dynamicRows = dynamic.map((c) => {
    const def = provisionalFormDef(c);
    return {
      case_file_id: caseFileId,
      user_id: userId,
      form_key: def.key,
      reason: c.reason ?? null,
      status: "needed" as const,
      source: "dynamic" as const,
      form_def: def,
      lookup_status: "pending" as const,
    };
  });

  const rows = [...seededRows, ...dynamicRows];
  // Don't clobber forms the client already started/completed. The unique index
  // (case_file_id, form_key) makes the upsert idempotent across turns.
  const { error } = await db
    .from("form_instruments")
    .upsert(rows, { onConflict: "case_file_id,form_key", ignoreDuplicates: true });
  if (error) {
    // Surface persistence failures (e.g. missing form_instruments table /
    // PGRST205) instead of swallowing them — otherwise forms are silently lost.
    console.error("[file-parser] form_instruments upsert failed:", error.message);
  }
}

// Parses ---REQUESTED ATTACHMENTS--- blocks from intake chat output.
export async function parseRequestedAttachments(
  db: SupabaseClient,
  caseFileId: string,
  userId: string,
  text: string
): Promise<void> {
  const match = text.match(/---REQUESTED ATTACHMENTS---([\s\S]*?)---END REQUESTED---/);
  if (!match) return;

  const lines = match[1]
    .split("\n")
    .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
    .filter(Boolean);

  if (!lines.length) return;

  // Avoid inserting duplicates
  const { data: existing } = await db
    .from("requested_attachments")
    .select("description")
    .eq("case_file_id", caseFileId);

  const existingSet = new Set(
    existing?.map((r: { description: string }) => r.description.toLowerCase()) ?? []
  );

  const toInsert = lines
    .filter((line) => !existingSet.has(line.split(" — ")[0]?.trim().toLowerCase() ?? line.toLowerCase()))
    .map((line) => {
      const parts = line.split(" — ");
      return {
        case_file_id: caseFileId,
        user_id: userId,
        description: parts[0]?.trim() ?? line,
        reason: parts[1]?.trim() ?? null,
        source: "ai" as const,
      };
    });

  if (toInsert.length) {
    await db.from("requested_attachments").insert(toInsert);
  }
}

// ── Draft placeholders → Living File gaps ────────────────────────────────────
// Keep the Living File honest about what a generated document still needs. Every
// unfilled [[placeholder]] in the latest draft becomes a "gap" fact, so a client
// can send an imperfect document and the file (and the attorney) still knows
// exactly what's outstanding. Additive + self-reconciling:
//   • a placeholder not yet tracked (and not already answered) is added as a gap;
//   • a gap that has since been answered — a confirmed "Label: value" fact exists —
//     is cleared, so filling a blank removes it from the outstanding list.
// Unrelated gaps surfaced during chat intake are left untouched unless answered.
export async function syncDraftGapsToLivingFile(
  db: SupabaseClient,
  caseFileId: string,
  userId: string,
  draftText: string
): Promise<void> {
  const labels = placeholderFields(draftText).map((f) => f.label);

  const [{ data: confirmedRows }, { data: gapRows }] = await Promise.all([
    db.from("fact_items").select("description").eq("case_file_id", caseFileId).eq("status", "confirmed"),
    db.from("fact_items").select("id, description").eq("case_file_id", caseFileId).eq("status", "gap"),
  ]);

  const confirmed = (confirmedRows ?? []) as { description: string }[];
  const gaps = (gapRows ?? []) as { id: string; description: string }[];

  // The "name" half of each confirmed "Label: value" fact, used to tell whether a
  // placeholder/gap has already been answered.
  const answered = new Set(confirmed.map((f) => f.description.toLowerCase().split(":")[0].trim()));
  const existingGapDescs = new Set(gaps.map((g) => g.description.toLowerCase()));

  const toInsert = labels
    .filter((l) => {
      const lower = l.toLowerCase();
      return !existingGapDescs.has(lower) && !answered.has(lower);
    })
    .map((description) => ({
      case_file_id: caseFileId,
      user_id: userId,
      description,
      status: "gap" as const,
    }));
  if (toInsert.length) await db.from("fact_items").insert(toInsert);

  // Clear any gap that has now been answered.
  const staleIds = gaps
    .filter((g) => answered.has(g.description.toLowerCase()))
    .map((g) => g.id);
  if (staleIds.length) await db.from("fact_items").delete().in("id", staleIds);
}

// ── ---LIVING FILE--- block ──────────────────────────────────────────────────

async function parseLivingFile(
  db: SupabaseClient,
  caseFileId: string,
  userId: string,
  text: string
): Promise<void> {
  const match = text.match(/---LIVING FILE---([\s\S]*?)---END FILE---/);
  if (!match) return;

  const block = match[1];

  const matterMatch = block.match(/MATTER TYPE:\s*(.+)/i);
  const jurisdictionMatch = block.match(/JURISDICTION:\s*(.+)/i);
  const summaryMatch = block.match(/SUMMARY:\s*([\s\S]*?)(?=\nGOALS:|\nCONFIRMED|\nFACT GAP|\nNEXT ACTION|\nJURISDICTION:|$)/i);
  const nextActionMatch = block.match(/NEXT ACTION:\s*([\s\S]*?)(?=\n---|$)/i);

  const goals = extractBullets(block, "GOALS");
  const confirmedFacts = extractBullets(block, "CONFIRMED FACTS");
  const factGaps = extractBullets(block, "FACT GAPS");

  // Determine matter type/subtype
  let matterType: string | null = null;
  let matterSubtype: string | null = null;
  if (matterMatch) {
    const parts = matterMatch[1].split("—").map((s) => s.trim());
    matterType = parts[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? null;
    if (matterType !== "reactive" && matterType !== "preventive") matterType = null;
    matterSubtype = parts[1] ?? null;
  }

  // Update case file fields
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (matterType) updates.matter_type = matterType;
  if (matterSubtype) updates.matter_subtype = matterSubtype;
  if (summaryMatch) updates.summary = summaryMatch[1].trim();
  if (goals.length) updates.goals = goals;
  if (nextActionMatch) updates.next_action = nextActionMatch[1].trim();
  if (jurisdictionMatch) {
    const jRaw = jurisdictionMatch[1].trim();
    // Store jurisdiction unless it's explicitly unconfirmed
    if (!jRaw.toLowerCase().startsWith("unconfirmed")) {
      updates.jurisdiction = jRaw;
    }
  }

  await db.from("case_files").update(updates).eq("id", caseFileId);

  // Upsert fact items
  await upsertFacts(db, caseFileId, userId, confirmedFacts, "confirmed");
  await upsertFacts(db, caseFileId, userId, factGaps, "gap");
}

// ── ---LEGAL STRATEGY--- block ───────────────────────────────────────────────

async function parseLegalStrategy(
  db: SupabaseClient,
  caseFileId: string,
  text: string
): Promise<void> {
  const match = text.match(/---LEGAL STRATEGY---([\s\S]*?)---END STRATEGY---/);
  if (!match) return;

  const block = match[1];
  const summaryMatch = block.match(/SUMMARY:\s*([\s\S]*?)(?=\nSTRENGTHS:|\nRISKS:|\nSUGGESTED|\nRECOMMENDED|\nDOCUMENT PLAN:|$)/i);

  const consultMatch = block.match(/RECOMMEND_CONSULT:\s*(true|false)/i);
  const rationaleMatch = block.match(/LEAD RATIONALE:\s*([\s\S]*?)(?=\nRECOMMEND_CONSULT:|\n---|$)/i);
  const leadRationale = rationaleMatch?.[1]?.trim();

  const { data: existing } = await db
    .from("case_files")
    .select("legal_strategy")
    .eq("id", caseFileId)
    .single();
  const priorStrategy = (existing?.legal_strategy as LegalStrategy | null) ?? null;
  const priorPlan = priorStrategy?.document_plan ?? [];

  const parsedPlan = parseDocumentPlan(block, priorPlan);
  const documentPlan = parsedPlan.length ? parsedPlan : priorPlan;

  const recommendedWizards: WizardType[] = documentPlan.length
    ? [...new Set(documentPlan.map((e) => e.engine))]
    : extractBullets(block, "RECOMMENDED WIZARDS")
        .map(coerceWizardType)
        .filter((w): w is WizardType => w !== null);

  const priorKeyOverride = priorStrategy?.lead_key_override ?? null;
  const leadKeyOverride = documentPlan.some((e) => e.key === priorKeyOverride)
    ? priorKeyOverride
    : null;

  const strategy: LegalStrategy = {
    summary: summaryMatch?.[1]?.trim() ?? "",
    instruments: extractBullets(block, "SUGGESTED INSTRUMENTS"),
    strengths: extractBullets(block, "STRENGTHS"),
    risks: extractBullets(block, "RISKS"),
    recommended_wizards: recommendedWizards,
    recommend_consult: consultMatch ? consultMatch[1].toLowerCase() === "true" : undefined,
    document_plan: documentPlan.length ? documentPlan : undefined,
    lead_rationale: (documentPlan[0]?.rationale ?? leadRationale) || undefined,
    lead_key_override: leadKeyOverride,
    lead_override: priorStrategy?.lead_override ?? null,
    // Not produced by the extractor — carry the stored Strength Check forward so
    // rewriting the strategy block never wipes it.
    strength_check: priorStrategy?.strength_check,
  };

  await db
    .from("case_files")
    .update({ legal_strategy: strategy, updated_at: new Date().toISOString() })
    .eq("id", caseFileId);
}

// Parse the ---LEGAL STRATEGY--- "DOCUMENT PLAN:" lines into ranked PlanEntries.
export function parseDocumentPlan(block: string, prior: PlanEntry[] = []): PlanEntry[] {
  const sec = block.match(/DOCUMENT PLAN:\s*([\s\S]*?)(?=\nRECOMMEND_CONSULT:|\n---|$)/i);
  if (!sec) return [];

  const priorByTitle = new Map(prior.map((e) => [normalizeTitle(e.title), e]));
  const usedKeys = new Set<string>();
  const entries: PlanEntry[] = [];

  for (const rawLine of sec[1].split("\n")) {
    const line = rawLine.replace(/^\s*\d+[.)]\s*/, "").replace(/^[•\-*]\s*/, "").trim();
    if (!line) continue;

    const parts = line.split("|").map((p) => p.trim());
    const title = parts[0];
    if (!title) continue;

    const engineRaw = (parts[1] ?? "").toLowerCase().replace(/[^a-z_]/g, "");
    const engine = (VALID_ENGINES.has(engineRaw) ? engineRaw : "general_document") as WizardType;
    const rationale = parts[2] || undefined;

    const priorEntry = priorByTitle.get(normalizeTitle(title));
    const base = priorEntry?.key ?? slugifyTitle(title);
    let key = base;
    let n = 2;
    while (usedKeys.has(key)) key = `${base}_${n++}`;
    usedKeys.add(key);

    // A fourth column may name a curated profile. Otherwise derive a durable
    // instrument identity from the title (not from the shared engine).
    const instrument_key = parts[3]?.toLowerCase().replace(/[^a-z0-9_]/g, "")
      || priorEntry?.instrument_key
      || inferInstrumentKey(title, engine);
    entries.push({ key, title, engine, instrument_key, rationale });
  }

  return entries;
}

function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "document"
  );
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractBullets(block: string, section: string): string[] {
  const escapedSection = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionMatch = block.match(
    new RegExp(`${escapedSection}:\\s*([\\s\\S]*?)(?=\\n[A-Z][A-Z ]+:|$)`, "i")
  );
  if (!sectionMatch) return [];
  return sectionMatch[1]
    .split("\n")
    .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
    .filter(Boolean);
}

async function upsertFacts(
  db: SupabaseClient,
  caseFileId: string,
  userId: string,
  descriptions: string[],
  status: "confirmed" | "gap"
): Promise<void> {
  if (!descriptions.length) return;

  // Get existing facts to avoid duplicates
  const { data: existing } = await db
    .from("fact_items")
    .select("description, status")
    .eq("case_file_id", caseFileId)
    .eq("status", status);

  const existingSet = new Set(existing?.map((f: { description: string }) => f.description.toLowerCase()) ?? []);

  const newFacts = descriptions
    .filter((d) => !existingSet.has(d.toLowerCase()))
    .map((description) => ({
      case_file_id: caseFileId,
      user_id: userId,
      description,
      status,
    }));

  if (newFacts.length) {
    await db.from("fact_items").insert(newFacts);
  }
}

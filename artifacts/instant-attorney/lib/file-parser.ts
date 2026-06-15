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

// Returns true when the drafter signals the draft is ready for attorney review.
export function isDraftReadyForReview(text: string): boolean {
  const match = text.match(/---FILE UPDATE---([\s\S]*?)---END FILE UPDATE---/);
  if (!match) return false;
  return match[1].toUpperCase().includes("READY FOR ATTORNEY REVIEW");
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
  ]);
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

  // Read the prior strategy so we can preserve identity that the model doesn't
  // re-emit: document keys (so client progress survives re-parses) and the
  // attorney's lead override.
  const { data: existing } = await db
    .from("case_files")
    .select("legal_strategy")
    .eq("id", caseFileId)
    .single();
  const priorStrategy = (existing?.legal_strategy as LegalStrategy | null) ?? null;
  const priorPlan = priorStrategy?.document_plan ?? [];

  // The new plan; if a strategy block omits it, keep the existing plan.
  const parsedPlan = parseDocumentPlan(block, priorPlan);
  const documentPlan = parsedPlan.length ? parsedPlan : priorPlan;

  // Derive the (deprecated) wizard list from the plan engines for back-compat;
  // fall back to legacy RECOMMENDED WIZARDS bullets when there's no plan.
  const recommendedWizards: WizardType[] = documentPlan.length
    ? [...new Set(documentPlan.map((e) => e.engine))]
    : (extractBullets(block, "RECOMMENDED WIZARDS") as WizardType[]);

  // Keep the attorney's key override only if it still points at a real entry.
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
  };

  await db
    .from("case_files")
    .update({ legal_strategy: strategy, updated_at: new Date().toISOString() })
    .eq("id", caseFileId);
}

// Parse the ---LEGAL STRATEGY--- "DOCUMENT PLAN:" lines into ranked PlanEntries.
// Each line: "1. Title | engine | rationale". The KEY is the document's stable
// identity: we reuse a prior entry's key for the same (normalized) title so the
// client's progress on a document survives strategy regenerations.
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

    entries.push({ key, title, engine, rationale });
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

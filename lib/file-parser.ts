import type { SupabaseClient } from "@supabase/supabase-js";
import type { WizardType, LegalStrategy } from "./types";

// Extracts the draft text from a ---DRAFT READY--- block.
export function extractDraftText(text: string): string | null {
  const match = text.match(/---DRAFT READY---([\s\S]*?)---END DRAFT---/);
  return match ? match[1].trim() : null;
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
  const summaryMatch = block.match(/SUMMARY:\s*([\s\S]*?)(?=\nSTRENGTHS:|\nRISKS:|\nSUGGESTED|\nRECOMMENDED|$)/i);

  const consultMatch = block.match(/RECOMMEND_CONSULT:\s*(true|false)/i);

  const strategy: LegalStrategy = {
    summary: summaryMatch?.[1]?.trim() ?? "",
    instruments: extractBullets(block, "SUGGESTED INSTRUMENTS"),
    strengths: extractBullets(block, "STRENGTHS"),
    risks: extractBullets(block, "RISKS"),
    recommended_wizards: extractBullets(block, "RECOMMENDED WIZARDS") as WizardType[],
    recommend_consult: consultMatch ? consultMatch[1].toLowerCase() === "true" : undefined,
  };

  await db
    .from("case_files")
    .update({ legal_strategy: strategy, updated_at: new Date().toISOString() })
    .eq("id", caseFileId);
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

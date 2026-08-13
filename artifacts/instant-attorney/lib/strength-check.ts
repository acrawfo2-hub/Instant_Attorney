import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildFileContext } from "@/lib/prompts";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import { maxOutputTokensFor } from "@/lib/token-limits";
import {
  parseStrengthCheck,
  STRENGTH_CHECK_DISCLAIMER,
  type StrengthCheck,
} from "@/lib/strength-check-types";
import { saveStrengthCheck } from "@/lib/strength-check-store";
import type { CaseFile, FactItem, Document, Attachment } from "@/lib/types";

// Strength Check engine — the client-facing adversarial stress test. One place
// produces the analysis for BOTH the case-file card (streamed route) and the
// chat orchestrator tool, so the file and the chat never disagree.
//
// SERVER-ONLY (imports the Anthropic SDK). Client code imports from
// lib/strength-check-types instead — see the client/server bundle boundary note
// in lib/document-utils.

const STRENGTH_CHECK_MODEL = "claude-sonnet-4-6";

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });

export const STRENGTH_CHECK_SYSTEM = `You are a seasoned litigator hired to stress-test YOUR OWN CLIENT'S position the way opposing counsel will read it: coldly, looking for the weakest fact, the missing proof, and the fastest way to kill the claim. Your job is to find every hole FIRST, so the client can close it before anything is sent.

You will receive the client's full case file: facts, open gaps, key deadlines, and current document drafts.

Ground rules:
- Plain language a non-lawyer understands. Second person ("your"). No legalese without a one-phrase translation.
- Be honest, not brutal and not falsely reassuring. If a point is genuinely strong, say so; if the case has a serious problem (limitations, missing element, protected opinion, at-will employment), name it plainly.
- Anchor every point in the ACTUAL facts and drafts you were given — quote or reference the specific fact. Never invent facts. If something critical is unknown, that belongs in WEAKEST or EVIDENCE, not in a guess.
- The KEY DEADLINES section of the file is computed deterministically — treat it as authoritative; do not re-derive deadlines.
- Evidence items must be concrete and gatherable ("The 2023 signed lease", "Screenshots of the review including the poster's username and date"), each tied to the weakness it closes.
- 3–6 bullets per section. One idea per bullet.

Respond with EXACTLY this format:

---STRENGTH CHECK---
HEADLINE: <2–3 sentence bottom line: how the position holds up under attack and the single most important thing to fix>
STRONGEST:
- <point, anchored in a specific fact or document>
WEAKEST:
- <weak or missing point and why the other side will exploit it>
COUNTERARGUMENTS:
- ATTACK: <the argument opposing counsel will make> || RESPONSE: <how to blunt it, or what would be needed to>
EVIDENCE:
- ITEM: <specific document/proof to gather> || WHY: <which weakness or attack it closes>
---END STRENGTH CHECK---`;

export function buildStrengthCheckUserMessage(
  caseFile: CaseFile,
  facts: FactItem[],
  documents: Document[],
  attachments: Attachment[],
): string {
  const parts: string[] = [buildFileContext(caseFile, facts, attachments)];
  const drafted = documents.filter((d) => d.draft_text?.trim());
  if (drafted.length) {
    parts.push("=== CURRENT DRAFTS (excerpts) ===");
    for (const d of drafted) {
      const text = (d.draft_text as string).trim();
      parts.push(
        `--- ${d.title || d.doc_type} (status: ${d.status}) ---\n` +
          (text.length > 6000 ? `${text.slice(0, 6000)}\n[…truncated]` : text),
      );
    }
  }
  parts.push(
    "Stress-test this position as opposing counsel would. Follow the required output format exactly.",
  );
  return parts.join("\n\n");
}

export interface RunStrengthCheckArgs {
  caseFileId: string;
  /** The case owner (usage is billed to them). */
  userId: string;
  /** Who triggered it, when different (attorney). */
  actorId?: string;
}

/**
 * Run the adversarial analysis and persist it at
 * case_files.legal_strategy.strength_check. `db` must be a Supabase client that
 * can read this case file (owner-scoped or service). Throws on failure.
 */
export async function runStrengthCheck(
  db: SupabaseClient,
  { caseFileId, userId, actorId }: RunStrengthCheckArgs,
): Promise<StrengthCheck> {
  const [{ data: caseFileRow }, { data: factRows }, { data: docRows }, { data: attRows }] =
    await Promise.all([
      db.from("case_files").select("*").eq("id", caseFileId).single(),
      db.from("fact_items").select("*").eq("case_file_id", caseFileId),
      db
        .from("documents")
        .select("*")
        .eq("case_file_id", caseFileId)
        .is("parent_document_id", null),
      db.from("attachments").select("*").eq("case_file_id", caseFileId).eq("status", "ready"),
    ]);
  if (!caseFileRow) throw new Error("Case file not found");
  const caseFile = caseFileRow as CaseFile;
  const facts = (factRows ?? []) as FactItem[];
  const documents = (docRows ?? []) as Document[];
  const attachments = (attRows ?? []) as Attachment[];

  if (facts.filter((f) => f.status === "confirmed").length === 0) {
    throw new Error(
      "There isn't enough on the file yet to stress-test — talk with your assistant first so the facts get recorded.",
    );
  }

  // Stream + finalMessage: sync create() at our token ceilings is rejected by
  // the SDK ("Streaming is required…").
  const resp = await anthropic.messages
    .stream({
      model: STRENGTH_CHECK_MODEL,
      max_tokens: maxOutputTokensFor(STRENGTH_CHECK_MODEL),
      system: [
        {
          type: "text" as const,
          text: STRENGTH_CHECK_SYSTEM,
          cache_control: { type: "ephemeral" as const },
        },
      ],
      messages: [
        {
          role: "user",
          content: buildStrengthCheckUserMessage(caseFile, facts, documents, attachments),
        },
      ],
    })
    .finalMessage();

  await recordAiFromMessage(db, resp, {
    userId,
    actorId,
    caseFileId,
    feature: "strength_check",
    metadata: { model: STRENGTH_CHECK_MODEL },
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const check = parseStrengthCheck(text);
  if (!check) throw new Error("The analysis came back in an unusable format — try again.");
  check.disclaimer = STRENGTH_CHECK_DISCLAIMER;

  // Persistence is part of the contract: the chat tool and the attorney view
  // read the STORED check, so an unsaved result would silently break parity.
  await saveStrengthCheck(db, caseFileId, check);

  return check;
}

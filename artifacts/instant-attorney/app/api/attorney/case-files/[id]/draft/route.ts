import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth/require-attorney";
import { draftInstrument } from "@/lib/document-drafting";
import { saveDocumentRevision } from "@/lib/document-persistence";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import { coerceInstrumentType, ATTORNEY_ORIGINATED } from "@/lib/types";
import type { CaseFile, FactItem, Attachment, RequestedAttachment } from "@/lib/types";

export const maxDuration = 300;

/**
 * The attorney starts a document from the client's file.
 *
 * Reading a matter and realising what the client actually needs is the attorney's
 * job, and until now there was no way to act on it: every `documents` row began
 * with a client submission, so drafting something the client had not asked for
 * meant asking them to ask for it.
 *
 * This is a way IN, not a second drafting engine. It runs `draftInstrument` like
 * every other generation path — instrument identity, pinned authority, the
 * section spec, the forum gate, refinement, validation — and saves through
 * `saveDocumentRevision`, the one document write boundary. What it adds is
 * origin, and two consequences of it:
 *
 *   * **It does not enter the review queue.** `status` is `draft` and
 *     `submitted_at` stays null. The attorney is the author here; there is
 *     nobody to review it for them, and stamping it `pending_review` would put
 *     their own draft in their own queue on a 48-hour clock.
 *   * **The client cannot see it until it is approved.** The row is owned by the
 *     client, so ownership alone would have exposed a half-formed draft the
 *     attorney was still thinking about. `content_json.source` marks the origin
 *     and `/api/documents/[id]/download` refuses it to a non-attorney until
 *     approval — the same rule the attorney's working copy follows.
 *
 * The attorney says what they want in their own words. `instruction` is passed
 * to the drafter as the request, and `title` names the instrument so the
 * profile, spec and risk classification resolve against something real.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: caseFileId } = await params;
  const { db, userId, isAttorney } = await requireViewer();
  if (!isAttorney) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { title?: unknown; instruction?: unknown };
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!title) return NextResponse.json({ error: "Name the document you want drafted." }, { status: 400 });

  const [{ data: caseFileRow }, { data: factRows }, { data: attachmentRows }, { data: requestedRows }] =
    await Promise.all([
      db.from("case_files").select("*").eq("id", caseFileId).maybeSingle(),
      db.from("fact_items").select("*").eq("case_file_id", caseFileId).order("created_at"),
      db.from("attachments").select("*").eq("case_file_id", caseFileId).eq("status", "ready"),
      db.from("requested_attachments").select("*").eq("case_file_id", caseFileId),
    ]);

  const caseFile = caseFileRow as CaseFile | null;
  if (!caseFile) return NextResponse.json({ error: "Matter not found" }, { status: 404 });

  // The title names the instrument, so a "Demand Letter" resolves the demand
  // profile even when the attorney never picks a type. Anything unrecognised is
  // a general document, which has a real spec rather than an invented one.
  const instrumentType = coerceInstrumentType(title) ?? "general_document";

  const drafted = await draftInstrument(new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 }), {
    instrumentType,
    instrumentLabel: title,
    persona: "attorney",
    caseFile,
    facts: (factRows ?? []) as FactItem[],
    attachments: (attachmentRows ?? []) as Attachment[],
    requestedAttachments: (requestedRows ?? []) as RequestedAttachment[],
    messages: [{
      role: "user",
      content: instruction
        ? `Draft a ${title} for this matter.\n\n${instruction}`
        : `Draft a ${title} for this matter, grounded in the Living File.`,
    }],
  });

  if (drafted.kind === "error") {
    return NextResponse.json(
      { error: "The draft could not be generated just now. Please try again." },
      { status: 502 }
    );
  }
  if (!drafted.draftText) {
    return NextResponse.json(
      { error: `The draft did not come back complete (${drafted.incompleteReason}). Try again.` },
      { status: 502 }
    );
  }

  recordAiFromMessage(db, drafted.message, {
    userId: caseFile.user_id,
    actorId: userId,
    caseFileId,
    feature: "wizard",
    metadata: { engine: instrumentType, attorney_originated: true },
  }).catch((e) => console.error("[attorney/draft] usage record error:", e));

  const draftText = drafted.draftText;
  let documentId: string | null = null;
  const saved = await saveDocumentRevision(db, {
    caseFileId,
    userId: caseFile.user_id,
    draftText,
    persist: async (revisionId) => {
      const { data, error } = await db.from("documents").insert({
        case_file_id: caseFileId,
        // Owned by the client — it is their matter and their document. Origin is
        // what governs visibility, not ownership.
        user_id: caseFile.user_id,
        doc_type: instrumentType,
        title,
        status: "draft",
        draft_text: draftText,
        current_revision_id: revisionId,
        content_json: {
          source: ATTORNEY_ORIGINATED,
          drafted_by: userId,
          instruction: instruction || null,
          forum_deficiency: drafted.forumDeficiency ? drafted.forumDeficiency.code : null,
        },
      }).select("id").single();
      if (error || !data) throw error ?? new Error("Could not create the document");
      documentId = data.id;
      return data.id;
    },
  }).catch((error) => {
    console.error("[attorney/draft] persist error:", error);
    return null;
  });

  if (!saved || !documentId) {
    return NextResponse.json({ error: "The draft was generated but could not be saved." }, { status: 500 });
  }

  return NextResponse.json({
    documentId,
    title,
    href: `/attorney/review/${documentId}`,
    forumDeficiency: drafted.forumDeficiency,
    livingFileSyncPending: saved.syncPending,
  }, { status: 201 });
}

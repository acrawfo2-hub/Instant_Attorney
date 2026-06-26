import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaseFile, FactItem } from "./types";
import { buildFileContext } from "./prompts.ts";
import { recordAiFromMessage } from "./usage-tracker.ts";
import { logTruncation } from "./truncation-logger.ts";
import { maxOutputTokensFor, limitSignalMetadata } from "./token-limits.ts";

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });

/** Remove a failed or abandoned attachment from storage and the database. */
export async function removeAttachment(
  db: SupabaseClient,
  attachmentId: string,
  storagePath?: string | null
): Promise<void> {
  let path = storagePath;
  if (!path) {
    const { data } = await db.from("attachments").select("storage_path").eq("id", attachmentId).single();
    path = data?.storage_path;
  }
  if (path) {
    await db.storage.from("case-attachments").remove([path]).catch((err) => {
      console.error("[attachment-processor] storage remove error:", err);
    });
  }
  await db.from("attachments").delete().eq("id", attachmentId);
}

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const SUPPORTED_TEXT_TYPES = new Set([
  "text/plain", "text/markdown", "text/csv", "text/html",
  "application/json", "application/rtf", "text/rtf",
]);

export type AttachmentContentBlock =
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
  | { type: "text"; text: string };

// Convert any supported file format to Anthropic-compatible content blocks.
// Returns an array — Word documents may include both text and embedded image blocks.
export async function toAnthropicBlock(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<AttachmentContentBlock[]> {
  if (SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    return [{
      type: "image",
      source: { type: "base64", media_type: mimeType, data: buffer.toString("base64") },
    }];
  }

  if (mimeType === "application/pdf") {
    return [{
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
    }];
  }

  // Word documents — extract text AND embedded images via mammoth
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword" ||
    fileName.endsWith(".docx") ||
    fileName.endsWith(".doc")
  ) {
    const [textResult, htmlResult] = await Promise.all([
      mammoth.extractRawText({ buffer }),
      mammoth.convertToHtml({ buffer }, {
        convertImage: mammoth.images.imgElement(async (image) => {
          if (!SUPPORTED_IMAGE_TYPES.has(image.contentType)) return { src: "" };
          const imgBuffer = await image.read() as Buffer;
          return { src: `data:${image.contentType};base64,${imgBuffer.toString("base64")}` };
        }),
      }),
    ]);

    const blocks: AttachmentContentBlock[] = [];

    if (textResult.value.trim()) {
      blocks.push({ type: "text", text: textResult.value });
    }

    // Extract embedded images from the HTML data URIs
    const imgSrcRegex = /src="data:(image\/[^;]+);base64,([^"]+)"/g;
    let imgMatch;
    while ((imgMatch = imgSrcRegex.exec(htmlResult.value)) !== null) {
      const mediaType = imgMatch[1];
      if (SUPPORTED_IMAGE_TYPES.has(mediaType)) {
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: imgMatch[2],
          },
        });
      }
    }

    if (blocks.length === 0) {
      blocks.push({ type: "text", text: "(No readable text or images found in this document)" });
    }

    return blocks;
  }

  // Plain text variants
  if (SUPPORTED_TEXT_TYPES.has(mimeType) || mimeType.startsWith("text/")) {
    return [{ type: "text", text: buffer.toString("utf-8") }];
  }

  // Fallback: try UTF-8 text
  try {
    const text = buffer.toString("utf-8");
    if (text && !text.includes("�")) {
      return [{ type: "text", text }];
    }
  } catch {
    // ignore
  }

  throw new Error(`Unsupported file type: ${mimeType} (${fileName})`);
}

// Standard structured-analysis prompt for documents (PDFs, Word, text, etc.).
function buildDocumentPrompt(fileContext: string): string {
  return `You are analyzing a file attached to an ACP-protected legal case file at Crawford Law PLLC. Produce a concise structured analysis that will be added to the client's Living File.

${fileContext ? `${fileContext}\n\n` : ""}Produce your analysis in EXACTLY this format:

---ATTACHMENT ANALYSIS---
SUMMARY:
[3–5 sentences describing what this document is and its key content]
CASE RELEVANCE:
[How this attachment relates to the current matter and should inform legal strategy — or "General background" if not directly relevant]
KEY SECTIONS:
• [Section name or key finding — keep each to one line]
EXTRACTED FACTS:
• [Specific identifiable facts from this document, captured COMPLETELY so a drafter can use them verbatim instead of leaving a blank. Include: full legal names; complete mailing/street addresses (street number, city, state, ZIP — never abbreviate to just a city or ZIP); EIN/tax ID numbers; all key dates; dollar amounts; party roles; account, license, or registration numbers; registered agent. One fact per bullet, each stated in full. Or "None identified"]
URGENT FINDINGS:
[Time-sensitive items, deadlines, rights, waiver risks, or critical facts — or "None identified"]
CONTRADICTIONS WITH LIVING FILE:
[Any facts in this document that directly conflict with confirmed facts or stated goals already in the Living File above. Be specific: quote the conflicting claim and the confirmed fact. Or "None identified"]
CLARIFYING QUESTIONS:
• [A focused question to resolve a specific contradiction — one concept per question, max 3 questions. Only include this section if CONTRADICTIONS identifies real conflicts.]
REQUESTED ATTACHMENTS:
• [Companion document description] — [Why it matters to the case]
---END ANALYSIS---

Only include CLARIFYING QUESTIONS if CONTRADICTIONS WITH LIVING FILE contains actual conflicts.
If no companion documents are needed, omit the REQUESTED ATTACHMENTS bullets entirely.

If this is an HOA / property-owners'-association governing document (Declaration / CC&Rs, bylaws, rules & regulations, plat, or a violation / fine / assessment / lien / foreclosure notice), be especially precise in KEY SECTIONS and EXTRACTED FACTS: pull out the enforcement and fine provisions, the notice / cure / hearing rights, the architectural-control (ACC) approval procedure, the assessment and lien provisions, the amendment procedure, and — importantly — any attorney-fee / prevailing-party clause (note it under URGENT FINDINGS because it drives the cost-benefit of any dispute). Capture any deadlines a homeowner must meet (hearing request, cure period, records-request response, foreclosure cure) under URGENT FINDINGS.

If this is a PERSONAL INJURY document (police / crash report, incident report, medical record or bill, insurance correspondence, adjuster letter, denial letter, settlement offer, or photographs of injuries / vehicles / scene), be especially precise in EXTRACTED FACTS: capture the date/time/location of the incident, parties and vehicles involved, officer narrative and citations, injury descriptions and diagnoses, treatment dates, itemized charges, policy/claim numbers, coverage limits stated, fault allegations, recorded-statement requests, release language, and any deadlines mentioned. Flag under URGENT FINDINGS any statute-of-limitations dates, policy-limit figures, requests for recorded statements, or proposed releases the client should not sign without review.`;
}

// Screenshot/image prompt. For images — especially captures of text-message, email, or
// chat exchanges — the legally operative content is the EXACT wording and who said what,
// when. So we instruct a faithful, attributed transcription rather than a loose summary,
// and route each quoted message into EXTRACTED FACTS so it lands in the Living File verbatim.
// Section headers are identical to the document prompt so the existing parser is unchanged.
function buildScreenshotPrompt(fileContext: string): string {
  return `You are analyzing a SCREENSHOT (an image) attached to an ACP-protected legal case file at Crawford Law PLLC. Clients use screenshots to bring in key evidence — most often a text-message (SMS/iMessage), email, or chat exchange, but sometimes a photo of a document, a portal, or a notice. The evidentiary value is the EXACT wording, who wrote it, and when. Transcribe faithfully; do not paraphrase, soften, correct, or invent text. Transcribe every visible message, including profanity or threats, verbatim. If a word is cut off or illegible, mark it [illegible].

${fileContext ? `${fileContext}\n\n` : ""}First read the image carefully. Identify the medium (e.g. iMessage thread, SMS, Gmail, WhatsApp), the participants, and any visible dates/timestamps. For a message thread, infer the sender of each bubble from layout (right/blue = the person who took the screenshot unless context says otherwise; left/grey = the other party) and state your attribution assumption in SUMMARY.

Produce your analysis in EXACTLY this format:

---ATTACHMENT ANALYSIS---
SUMMARY:
[2–4 sentences: what the screenshot shows, the medium, who the participants appear to be, the date range, and your assumption about which side is the client. Note any ambiguity in sender attribution.]
CASE RELEVANCE:
[How this exchange relates to the current matter and should inform legal strategy — or "General background" if not directly relevant]
KEY SECTIONS:
• [The single most significant statement(s) in the exchange — e.g. an admission, threat, agreement, or deadline — kept to one line each]
EXTRACTED FACTS:
• [VERBATIM TRANSCRIPT — one bullet per message, in chronological order, formatted exactly as: On [date/time if visible, else "undated"], [Sender] wrote: "[exact text]". Preserve original spelling and punctuation inside the quotes. If the screenshot is NOT a conversation (e.g. a photo of a document or notice), instead extract identifiable facts completely — full legal names, complete street addresses, dates, dollar amounts, account/case numbers. Or "None identified"]
URGENT FINDINGS:
[Time-sensitive items, deadlines, explicit threats, admissions against interest, or statements that waive/assert rights — or "None identified"]
CONTRADICTIONS WITH LIVING FILE:
[Any statement here that directly conflicts with confirmed facts or stated goals already in the Living File above. Be specific: quote the conflicting message and the confirmed fact. Or "None identified"]
CLARIFYING QUESTIONS:
• [A focused question to resolve a specific contradiction or an attribution ambiguity — one concept per question, max 3 questions. Only include this section if there is a real conflict or unclear sender.]
REQUESTED ATTACHMENTS:
• [Companion evidence that would corroborate this exchange] — [Why it matters to the case]
---END ANALYSIS---

Only include CLARIFYING QUESTIONS if CONTRADICTIONS WITH LIVING FILE contains actual conflicts or sender attribution is genuinely unclear.
If no companion evidence is needed, omit the REQUESTED ATTACHMENTS bullets entirely.`;
}

// Run after upload: analyze the attachment, update the DB record, parse requested attachments.
export async function processAttachment(
  db: SupabaseClient,
  attachmentId: string,
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  caseFileId: string
): Promise<void> {
  try {
    // Load case file context for relevance analysis
    const [{ data: caseFileRow }, { data: factRows }] = await Promise.all([
      db.from("case_files").select("*").eq("id", caseFileId).single(),
      db.from("fact_items").select("*").eq("case_file_id", caseFileId),
    ]);

    const caseFile = caseFileRow as CaseFile | null;
    const facts = (factRows ?? []) as FactItem[];
    const fileContext = caseFile ? buildFileContext(caseFile, facts) : "";

    let contentBlocks: AttachmentContentBlock[];
    try {
      contentBlocks = await toAnthropicBlock(buffer, mimeType, fileName);
    } catch (convErr) {
      console.error("[attachment-processor] conversion failed:", convErr);
      await removeAttachment(db, attachmentId);
      return;
    }

    const isScreenshot = mimeType.startsWith("image/");
    const analysisPrompt = isScreenshot
      ? buildScreenshotPrompt(fileContext)
      : buildDocumentPrompt(fileContext);

    const messageContent: Anthropic.MessageParam["content"] = [
      ...contentBlocks as (Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam | Anthropic.TextBlockParam)[],
      { type: "text", text: `File: ${fileName}\n\n${analysisPrompt}` },
    ];

    // Use streaming: a non-streaming create() at this max_tokens ceiling throws the SDK
    // "Streaming is required…" error, which would fall through to the catch and delete the
    // user's uploaded file. finalMessage() yields the same aggregated message shape.
    const response = await anthropic.messages
      .stream({
        model: "claude-sonnet-4-6",
        max_tokens: maxOutputTokensFor("claude-sonnet-4-6"),
        messages: [{ role: "user", content: messageContent }],
      })
      .finalMessage();

    if (caseFile?.user_id) {
      await recordAiFromMessage(db, response, {
        userId: caseFile.user_id,
        caseFileId,
        feature: "attachment_analysis",
        metadata: {
          attachment_id: attachmentId,
          file_name: fileName,
          ...limitSignalMetadata({
            model: response.model,
            outputTokens: response.usage.output_tokens,
            priorLimit: 4000,
            stopReason: response.stop_reason,
          }),
        },
      });
    }

    if (response.stop_reason === "max_tokens") {
      logTruncation({
        endpoint: "attachment-processor",
        feature: "attachment_analysis",
        caseFileId,
        userId: caseFile?.user_id,
        documentId: attachmentId,
        outputTokens: response.usage.output_tokens,
      });
    }

    const analysisText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Parse the structured analysis
    const match = analysisText.match(/---ATTACHMENT ANALYSIS---([\s\S]*?)---END ANALYSIS---/);
    if (!match) {
      await db.from("attachments").update({
        status: "ready",
        ai_summary: analysisText.slice(0, 500),
        updated_at: new Date().toISOString(),
      }).eq("id", attachmentId);
      return;
    }

    const block = match[1];
    const summaryMatch = block.match(/SUMMARY:\s*([\s\S]*?)(?=\nCASE RELEVANCE:|\nKEY SECTIONS:|\nEXTRACTED|\nURGENT|\nCONTRADICTIONS|\nREQUESTED|$)/i);
    const relevanceMatch = block.match(/CASE RELEVANCE:\s*([\s\S]*?)(?=\nKEY SECTIONS:|\nEXTRACTED|\nURGENT|\nCONTRADICTIONS|\nREQUESTED|$)/i);
    const urgentMatch = block.match(/URGENT FINDINGS:\s*([\s\S]*?)(?=\nCONTRADICTIONS|\nCLARIFYING|\nREQUESTED|$)/i);

    // Key sections bullets
    const keySectionsBlock = block.match(/KEY SECTIONS:\s*([\s\S]*?)(?=\nEXTRACTED|\nURGENT|\nCONTRADICTIONS|\nREQUESTED|$)/i);
    const keySections = keySectionsBlock
      ? keySectionsBlock[1].split("\n").map((l) => l.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean)
      : [];

    // Extracted facts from the document (e.g. EIN numbers, legal names, addresses)
    const extractedFactsBlock = block.match(/EXTRACTED FACTS:\s*([\s\S]*?)(?=\nURGENT|\nCONTRADICTIONS|\nCLARIFYING|\nREQUESTED|$)/i);
    const extractedFacts = extractedFactsBlock
      ? extractedFactsBlock[1].split("\n").map((l) => l.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean).filter((l) => !l.toLowerCase().includes("none identified"))
      : [];

    // Contradictions with the living file
    const contradictionsMatch = block.match(/CONTRADICTIONS WITH LIVING FILE:\s*([\s\S]*?)(?=\nCLARIFYING|\nREQUESTED|$)/i);
    const contradictions = contradictionsMatch?.[1]?.trim() ?? null;
    const hasContradictions = !!contradictions && !contradictions.toLowerCase().includes("none identified");

    // Clarifying questions to resolve contradictions
    const clarifyingBlock = block.match(/CLARIFYING QUESTIONS:\s*([\s\S]*?)(?=\nREQUESTED|$)/i);
    const clarifyingQuestions = clarifyingBlock
      ? clarifyingBlock[1].split("\n").map((l) => l.replace(/^[•\-*\d.]\s*/, "").trim()).filter(Boolean)
      : [];

    // Requested attachments bullets
    const requestedBlock = block.match(/REQUESTED ATTACHMENTS:\s*([\s\S]*?)$/i);
    const requestedLines = requestedBlock
      ? requestedBlock[1].split("\n").map((l) => l.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean)
      : [];

    // Build urgent_findings — append contradiction note if present
    let urgentFindings = urgentMatch?.[1]?.trim() ?? null;
    if (hasContradictions) {
      const contradictionNote = `[DOCUMENT CONTRADICTION] ${contradictions}`;
      urgentFindings = urgentFindings && urgentFindings !== "None identified"
        ? `${urgentFindings}\n${contradictionNote}`
        : contradictionNote;
    }

    // Update attachment record
    await db.from("attachments").update({
      status: "ready",
      ai_summary: summaryMatch?.[1]?.trim() ?? null,
      case_relevance: relevanceMatch?.[1]?.trim() ?? null,
      key_sections: keySections,
      urgent_findings: urgentFindings,
      updated_at: new Date().toISOString(),
    }).eq("id", attachmentId);

    // Write extracted facts as confirmed facts to the living file
    if (extractedFacts.length && caseFile) {
      const { data: existingFacts } = await db
        .from("fact_items")
        .select("description")
        .eq("case_file_id", caseFileId)
        .eq("status", "confirmed");

      const existingFactSet = new Set(existingFacts?.map((f: { description: string }) => f.description.toLowerCase()) ?? []);
      const newFacts = extractedFacts
        .filter((d) => !existingFactSet.has(d.toLowerCase()))
        .map((description) => ({
          case_file_id: caseFileId,
          user_id: caseFile.user_id,
          description,
          status: "confirmed" as const,
        }));

      if (newFacts.length) {
        await db.from("fact_items").insert(newFacts);
      }
    }

    // Write clarifying questions as fact gaps so the AI asks them next chat turn
    if (clarifyingQuestions.length && hasContradictions && caseFile) {
      const { data: existingGaps } = await db
        .from("fact_items")
        .select("description")
        .eq("case_file_id", caseFileId)
        .eq("status", "gap");

      const existingGapSet = new Set(existingGaps?.map((f: { description: string }) => f.description.toLowerCase()) ?? []);
      const newGaps = clarifyingQuestions
        .filter((d) => !existingGapSet.has(d.toLowerCase()))
        .map((description) => ({
          case_file_id: caseFileId,
          user_id: caseFile.user_id,
          description: `[Clarification needed] ${description}`,
          status: "gap" as const,
        }));

      if (newGaps.length) {
        await db.from("fact_items").insert(newGaps);
      }
    }

    // Insert any newly requested attachments (avoid duplicates)
    if (requestedLines.length && caseFile) {
      const { data: existing } = await db
        .from("requested_attachments")
        .select("description")
        .eq("case_file_id", caseFileId);

      const existingSet = new Set(existing?.map((r: { description: string }) => r.description.toLowerCase()) ?? []);

      const toInsert = requestedLines
        .filter((line) => !existingSet.has(line.toLowerCase()))
        .map((line) => {
          const parts = line.split(" — ");
          return {
            case_file_id: caseFileId,
            user_id: caseFile.user_id,
            description: parts[0]?.trim() ?? line,
            reason: parts[1]?.trim() ?? null,
            source: "ai" as const,
          };
        });

      if (toInsert.length) {
        await db.from("requested_attachments").insert(toInsert);
      }
    }
  } catch (err) {
    // Do NOT delete the attachment here: the user's uploaded file is valuable even if AI
    // analysis fails (e.g. transient API errors). Keep the file and mark it ready without
    // analysis so the upload is never silently lost. Only unreadable/unsupported files are
    // removed (handled in the toAnthropicBlock conversion catch above).
    console.error("[attachment-processor] analysis failed, keeping attachment:", err);
    const { error: markErr } = await db
      .from("attachments")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", attachmentId);
    if (markErr) {
      console.error("[attachment-processor] failed to mark attachment ready after error:", markErr);
    }
  }
}

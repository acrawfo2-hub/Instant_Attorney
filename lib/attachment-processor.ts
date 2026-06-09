import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaseFile, FactItem, Attachment } from "./types";
import { buildFileContext } from "./prompts";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
      await db.from("attachments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", attachmentId);
      return;
    }

    const analysisPrompt = `You are analyzing a file attached to an ACP-protected legal case file at Crawford Law PLLC. Produce a concise structured analysis that will be added to the client's Living File.

${fileContext ? `${fileContext}\n\n` : ""}Produce your analysis in EXACTLY this format:

---ATTACHMENT ANALYSIS---
SUMMARY:
[3–5 sentences describing what this document is and its key content]
CASE RELEVANCE:
[How this attachment relates to the current matter and should inform legal strategy — or "General background" if not directly relevant]
KEY SECTIONS:
• [Section name or key finding — keep each to one line]
EXTRACTED FACTS:
• [Specific identifiable facts from this document: legal names, EIN/tax ID numbers, addresses, key dates, dollar amounts, party roles, license numbers — one fact per bullet. Or "None identified"]
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
If no companion documents are needed, omit the REQUESTED ATTACHMENTS bullets entirely.`;

    const messageContent: Anthropic.MessageParam["content"] = [
      ...contentBlocks as (Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam | Anthropic.TextBlockParam)[],
      { type: "text", text: `File: ${fileName}\n\n${analysisPrompt}` },
    ];

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content: messageContent }],
    });

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
    console.error("[attachment-processor] error:", err);
    await db.from("attachments").update({
      status: "failed",
      updated_at: new Date().toISOString(),
    }).eq("id", attachmentId);
  }
}

import Anthropic from "@anthropic-ai/sdk";
import { buildDrafterSystemPrompt, wizardFieldGuidance, buildFileContext } from "./prompts.ts";
import { extractDraftText } from "./file-parser.ts";
import { maxOutputTokensFor } from "./token-limits.ts";
import { buildJurisdictionBlock, classifyInstrumentRisk, hasRequiredForum } from "./document-risk.ts";
import type { JurisdictionBlock } from "./document-risk.ts";
import { resolveInstrumentProfile, validateInstrument } from "./instruments/validator.ts";
import type { InstrumentValidationReport } from "./instruments/validator.ts";
import { formatInstrumentAuthorityBlock, resolveInstrumentAuthority } from "./instruments/authority.ts";
import { getDocumentGenerationSpec, specForPrompt } from "./document-generation-spec.ts";
import { parseStructuredSections, stripStructuredSections } from "./document-refinement.ts";
import type { StructuredDraftSection } from "./document-refinement.ts";
import { WIZARD_LABELS } from "./types.ts";
import type { WizardType, CaseFile, FactItem, Attachment, RequestedAttachment } from "./types.ts";

/**
 * The one implementation of "produce legal document text".
 *
 * The Generation pipeline in ARCHITECTURE.md — identity, authority, spec, risk
 * gate, generate, refine, validate — used to live inline in
 * `app/api/wizard/route.ts`, which made it reachable only from the wizard
 * journey. The orchestrator's durable worker had its own twelve-line Anthropic
 * call instead, with a one-sentence system prompt and none of the stages: no
 * pinned authority, no generation spec, **no risk gate**, no validator, and no
 * marker check, so a truncated response was saved as a finished draft.
 *
 * That is the wrong way round. The wizard is meant to be the engine the
 * orchestrator draws on, not a separate place the client goes — so the engine
 * lives here, and both callers use it. The wizard route keeps its conversation
 * handling, persistence and response shaping; the worker keeps its job
 * lifecycle and its shell. Neither owns the drafting.
 *
 * Two rules from ARCHITECTURE.md are enforced here rather than trusted to
 * callers, because both have been broken before:
 *
 *   * **Never default a jurisdiction.** When the governing forum is unknown, the
 *     model is forbidden from naming, assuming or implying one — but the
 *     document is still drafted. The forum becomes a BLOCKING placeholder, so
 *     the client gets a complete, visible, editable artifact with the gap made
 *     unmistakable instead of a refusal. See FORUM_PLACEHOLDER below.
 *   * **A markerless response is not a draft.** `draftText` is null unless the
 *     complete `---DRAFT READY---`/`---END DRAFT---` block arrived. The raw
 *     response is still returned, as recovery material, and callers must not
 *     promote it.
 */

export interface DraftingRequest {
  /** Which drafting engine — decides the spec, field hints and instrument profile. */
  wizardType: WizardType;
  /** Display label, e.g. "Demand Letter". Falls back to the wizard type's label. */
  instrumentLabel?: string | null;
  planKey?: string | null;
  instrumentKey?: string | null;
  /** Attorney-users get targeted-edit follow-ups; clients get a full re-render. */
  persona?: "client" | "attorney";
  caseFile: CaseFile | null;
  facts: FactItem[];
  attachments?: Attachment[];
  requestedAttachments?: RequestedAttachment[];
  /** The drafting instruction(s). The worker sends one; the wizard sends a thread. */
  messages: Anthropic.MessageParam[];
  /**
   * Appended to the file-context system block. The wizard route uses it to pin
   * the exact current draft for an attorney's targeted edit.
   */
  extraContext?: string;
}

export type DraftingResult =
  /** The model call itself failed. Callers surface a friendly message and allow retry. */
  | { kind: "error"; message: string }
  | {
      kind: "generated";
      /** Renderable text, or null when the complete draft block did not arrive. */
      draftText: string | null;
      /** Everything the model returned — recovery material, never renderable. */
      fullResponse: string;
      /** fullResponse with section markup stripped, for showing to a user. */
      renderedResponse: string;
      /** True when the model hit its token ceiling. */
      truncated: boolean;
      /** Why there is no draftText, when there isn't one. */
      incompleteReason: "missing_draft_block" | "truncated_draft_block" | "empty_draft_block" | null;
      /**
       * Set when this instrument needed a governing forum and the file has none.
       * The draft still exists; it carries FORUM_PLACEHOLDER wherever the forum
       * would appear, and callers should surface this to the client.
       */
      forumDeficiency: JurisdictionBlock | null;
      structuredSections: StructuredDraftSection[];
      validationReport: InstrumentValidationReport | null;
      /** The raw message, so callers can meter usage against real token counts. */
      message: Anthropic.Message;
    };

/** Citation-shaped authority references. Prose that merely says "authority" is not enough. */
const AUTHORITY_RE =
  /(?:\b\d+\s+U\.S\.C\.\s*§+\s*[\w.-]+|\b(?:Tex\.|Texas)\s+(?:Gov't|Estates|Property|Trust)\s+Code\s*§+\s*[\w.-]+)/gi;

export const DRAFTING_MODEL = "claude-sonnet-4-6";

/**
 * The placeholder that stands in for an unestablished governing forum.
 *
 * Uses the same `[[LABEL — hint]]` convention as every other missing fact, and
 * says BLOCKING so `placeholderFields` marks it required. That is the whole
 * point: the forum gap travels through the machinery that already exists for
 * missing information, rather than needing a screen of its own.
 */
export const FORUM_PLACEHOLDER =
  "[[GOVERNING COURT OR JURISDICTION — BLOCKING: which state's law governs this, and which court or agency it is for]]";

/** Told to the model when the forum is unknown. It drafts; it does not guess. */
function forumDirective(block: JurisdictionBlock): string {
  return [
    "",
    "=== GOVERNING FORUM NOT ESTABLISHED ===",
    `The ${block.missing} for this ${block.category} is not confirmed on this file.`,
    "",
    "Draft the document IN FULL anyway. Do not refuse, and do not shorten it.",
    "",
    "You must NOT name, assume, or imply which state's law applies, which court or",
    "agency it is for, or which statute governs. Do not fall back on a common or",
    "likely jurisdiction, and do not cite authority you cannot attribute to a",
    "confirmed forum.",
    "",
    "Wherever the document would name or depend on the forum — the caption, the",
    "governing-law clause, statutory citations, filing deadlines, execution",
    `formalities — write exactly this instead:\n${FORUM_PLACEHOLDER}`,
    "",
    "Everything not dependent on the forum should be drafted normally and completely.",
    "=== END GOVERNING FORUM NOTICE ===",
  ].join("\n");
}

/**
 * Run the generation pipeline. `client` is injected so callers share their
 * configured Anthropic instance and tests can substitute a stub.
 */
export async function draftInstrument(
  client: Pick<Anthropic, "messages">,
  request: DraftingRequest
): Promise<DraftingResult> {
  const {
    wizardType,
    caseFile,
    facts,
    attachments = [],
    requestedAttachments = [],
    messages,
    persona = "client",
    extraContext = "",
  } = request;

  // ── Risk gate ────────────────────────────────────────────────────────────
  // This used to refuse outright. It no longer does, because a refusal fails the
  // promise that every drafting request yields a complete, visible, editable
  // artifact — the client was left with nothing rather than something with an
  // obvious hole in it.
  //
  // What it must never do is *guess*. So the gate now shapes the draft instead
  // of blocking it: the model is told the forum is unestablished, forbidden from
  // naming or implying one, and required to write FORUM_PLACEHOLDER everywhere
  // the forum would otherwise appear. The placeholder is BLOCKING, so
  // `placeholderFields` marks it required and the existing "information needed"
  // form surfaces it to the client like any other missing fact.
  const documentLabel =
    request.instrumentLabel?.trim() || WIZARD_LABELS[wizardType];
  const riskProfile = classifyInstrumentRisk(wizardType, documentLabel);
  const confirmedFactText = facts
    .filter((fact) => fact.status === "confirmed")
    .map((fact) => fact.description);
  const forumDeficiency =
    riskProfile.risk === "high" && !hasRequiredForum(riskProfile, caseFile?.jurisdiction, confirmedFactText)
      ? buildJurisdictionBlock(riskProfile)
      : null;

  // ── Identity and authority ───────────────────────────────────────────────
  // Resolved against pinned profiles. An unknown instrument produces a blocking
  // authority block rather than inviting the model to infer legal requirements
  // from its training data.
  const instrumentAuthorityBlock = formatInstrumentAuthorityBlock(
    resolveInstrumentAuthority(documentLabel)
  );

  const fileContext = caseFile
    ? buildFileContext(caseFile, facts, attachments, requestedAttachments)
    : "";

  // ── Generate ─────────────────────────────────────────────────────────────
  // Streamed. The SDK refuses a non-streaming request whose max_tokens is large
  // enough to risk a >10-minute response, throwing before the call leaves the
  // server — which 502'd every draft generation once already.
  let message: Anthropic.Message;
  try {
    const stream = client.messages.stream({
      model: DRAFTING_MODEL,
      max_tokens: maxOutputTokensFor(DRAFTING_MODEL),
      system: [
        { type: "text" as const, text: buildDrafterSystemPrompt(persona, instrumentAuthorityBlock) },
        {
          type: "text" as const,
          text: `Document being drafted: ${documentLabel}\n\n${wizardFieldGuidance(wizardType, request.instrumentKey)}\n\n${specForPrompt(wizardType)}`,
          cache_control: { type: "ephemeral" as const },
        },
        {
          type: "text" as const,
          text: fileContext + extraContext + (forumDeficiency ? forumDirective(forumDeficiency) : ""),
        },
      ],
      messages,
    });
    message = await stream.finalMessage();
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Anthropic API error";
    console.error("[document-drafting] model error:", detail);
    return { kind: "error", message: detail };
  }

  const fullResponse = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("");

  // ── Marker completeness ──────────────────────────────────────────────────
  // The model may finish the draft and then hit its ceiling writing optional
  // metadata; that is safe. An end_turn with no markers is not a draft.
  const draftText = extractDraftText(fullResponse);
  const incompleteReason = draftText
    ? null
    : !fullResponse.includes("---DRAFT READY---")
      ? ("missing_draft_block" as const)
      : !fullResponse.includes("---END DRAFT---")
        ? ("truncated_draft_block" as const)
        : ("empty_draft_block" as const);

  // ── Refine ───────────────────────────────────────────────────────────────
  // Parsed for storage only, never to derive draftText — falling back to the raw
  // response when the markers were missing is exactly the behaviour #111 removed.
  let structuredSections: StructuredDraftSection[] = [];
  try {
    structuredSections = parseStructuredSections(fullResponse, getDocumentGenerationSpec(wizardType));
  } catch (sectionErr) {
    console.error("[document-drafting] structured section parse error:", sectionErr);
  }

  // ── Validate ─────────────────────────────────────────────────────────────
  const authorityReferences = fullResponse.match(AUTHORITY_RE) ?? [];
  const validationReport = draftText
    ? validateInstrument({
        profile: resolveInstrumentProfile({
          wizardType,
          instrument: request.instrumentLabel ?? undefined,
          planKey: request.planKey ?? undefined,
        }),
        document: {
          text: draftText,
          authorityMetadata: authorityReferences.length ? { references: authorityReferences } : undefined,
        },
        livingFile: {
          facts: facts.map((fact) => ({ description: fact.description, status: fact.status })),
          jurisdiction: caseFile?.jurisdiction ?? null,
        },
      })
    : null;

  return {
    kind: "generated",
    draftText,
    forumDeficiency,
    fullResponse,
    renderedResponse: stripStructuredSections(fullResponse),
    truncated: message.stop_reason === "max_tokens",
    incompleteReason,
    structuredSections,
    validationReport,
    message,
  };
}

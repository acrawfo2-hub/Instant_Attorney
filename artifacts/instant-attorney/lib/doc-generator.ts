import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Packer,
  BorderStyle,
  Header,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";
import type { CaseFile, DocumentStatus, FactItem, Profile, WizardType } from "./types";
// Explicit extension: this is a value import, so it is resolved at runtime by
// node --test, which does not infer ".ts". The type-only import above is erased
// before resolution and so never hit this.
import { placeholderFields } from "./wizard-parsing.ts";
import { isFullDepthState, jurisdictionFromCaseFileText, prepModeWatermarkDetail } from "./jurisdiction.ts";
import { DOCUMENT_PROFILES, draftTextToDocumentModel, renderDocumentModel } from "./doc-layout.ts";
import type { DocumentProfileName } from "./doc-layout.ts";
export type { DocumentProfileName, DocumentBlock, IntermediateDocument } from "./doc-layout.ts";
export { DOCUMENT_PROFILES, draftTextToDocumentModel, validateDocumentModel, profileForDocumentType } from "./doc-layout.ts";

// Build a safe Content-Disposition value for a .docx download. HTTP headers must
// be Latin-1, but document titles routinely contain em-dashes ("— Revised Draft")
// and other non-ASCII characters that crash the Response constructor with a
// ByteString error. We provide an ASCII-only `filename` fallback plus an RFC 5987
// `filename*` so modern browsers still get the full Unicode name.
export function docxContentDisposition(title: string): string {
  const base = (title && title.trim().length ? title.trim() : "document").replace(/\.docx$/i, "");
  const ascii = base
    .replace(/[\u2010-\u2015\u2212]/g, "-") // various dashes → hyphen
    .replace(/[\u2018\u2019]/g, "'") // curly single quotes
    .replace(/[\u201C\u201D]/g, '"') // curly double quotes
    .replace(/[^\x20-\x7E]/g, "") // drop any remaining non-ASCII
    .replace(/["]/g, "") // strip quotes that break the header
    .replace(/[\/\\:*?<>|]/g, "-") // path-reserved chars → hyphen (avoid filename/path hazards)
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  const asciiName = `${ascii.length ? ascii : "document"}.docx`;
  const utf8Name = encodeURIComponent(`${base}.docx`).replace(/['()]/g, escape).replace(/\*/g, "%2A");
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`;
}

export interface DocGenInput {
  docType: WizardType;
  wizardData: Record<string, unknown>;
  caseFile: CaseFile;
  facts: FactItem[];
  profile: Profile;
}

export async function generateDocument(input: DocGenInput): Promise<Buffer> {
  switch (input.docType) {
    case "demand_letter":
      return generateDemandLetter(input);
    case "complaint_letter":
      return generateComplaintLetter(input);
    case "draft_contract":
      return generateDraftContract(input);
    case "draft_waiver":
      return generateDraftWaiver(input);
    case "wills_trusts":
      return generateWillsTrusts(input);
    case "doc_review":
      return generateDocReview(input);
    default:
      throw new Error(`Unknown doc type: ${input.docType}`);
  }
}

// ── Shared helpers ───────────────────────────────────────────────────────────

function firmHeader(): Paragraph[] {
  return [
    new Paragraph({
      children: [new TextRun({ text: "CRAWFORD LAW PLLC", bold: true, size: 28 })],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [new TextRun({ text: "Attorney-Client Privileged & Confidential", italics: true, size: 20 })],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 1 } },
      text: "",
    }),
    new Paragraph({ text: "" }),
  ];
}

function heading(text: string): Paragraph {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2 });
}

function body(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun({ text })] });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text })],
    bullet: { level: 0 },
  });
}

function spacer(): Paragraph {
  return new Paragraph({ text: "" });
}

function str(v: unknown): string {
  return v ? String(v) : "Not provided";
}

function bullets(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string") return v.split("\n").map((s) => s.trim()).filter(Boolean);
  return [];
}

async function pack(doc: Document): Promise<Buffer> {
  return Buffer.from(await Packer.toBuffer(doc));
}

// ── Pre-review watermark ──────────────────────────────────────────────────────
// AI Philosophy §4.2 and Terms of Service §7 require that every AI-generated
// document is watermarked/labeled as a pre-review draft — and that it must not be
// filed, signed, served, or relied upon — *until* a licensed attorney approves
// it. The word "until" is the contract: the watermark is a signal of review
// status, present before approval and gone once approved. We render it both as a
// repeating page header (so it appears on EVERY page, not just the last) and as a
// closing footer line, so it cannot be missed by reading or printing only part of
// the document.

// A document is past the watermark stage only once an attorney has approved it
// (or it has been delivered as approved). Every earlier state —
// draft, pending_review, changes_requested — is a pre-review draft.
export function isAttorneyApproved(status: DocumentStatus | null | undefined): boolean {
  return status === "approved" || status === "delivered";
}

const DRAFT_BANNER_HEADLINE = "DRAFT — NOT REVIEWED OR APPROVED BY AN ATTORNEY";
const DRAFT_BANNER_DETAIL =
  "Do not file, sign, serve, or rely on this document until a licensed attorney approves it.";

function draftBannerDetail(jurisdiction?: string | null): string {
  const raw = jurisdiction?.trim() || null;
  if (!raw || /unconfirmed/i.test(raw)) return DRAFT_BANNER_DETAIL;
  const code = jurisdictionFromCaseFileText(raw);
  if (isFullDepthState(code) || /^texas$|^tx$/i.test(raw)) return DRAFT_BANNER_DETAIL;
  return prepModeWatermarkDetail(code ?? raw);
}

// Repeating per-page header banner for pre-review drafts. Lives in the page
// margin, so it prints on every page above the body content.
function draftWatermarkHeader(jurisdiction?: string | null): Header {
  return new Header({
    children: [
      new Paragraph({
        children: [new TextRun({ text: DRAFT_BANNER_HEADLINE, bold: true, color: "CC0000", size: 18 })],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        children: [new TextRun({ text: draftBannerDetail(jurisdiction), italics: true, color: "CC0000", size: 16 })],
        alignment: AlignmentType.CENTER,
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "CC0000" } },
      }),
    ],
  });
}

// Section `headers` entry for a draft, or undefined once approved (no watermark).
function draftSectionHeaders(
  approved: boolean,
  jurisdiction?: string | null,
): { default: Header } | undefined {
  return approved ? undefined : { default: draftWatermarkHeader(jurisdiction) };
}

// Closing footer line for a pre-review draft. Returns nothing once approved.
function draftFooterParagraphs(approved: boolean, jurisdiction?: string | null): Paragraph[] {
  if (approved) return [];
  return [
    new Paragraph({ text: "" }),
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 1 } },
      text: "",
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${DRAFT_BANNER_HEADLINE} · ${draftBannerDetail(jurisdiction)} · Crawford Law PLLC · ${new Date().toLocaleDateString()} · ${jurisdiction ?? "TX"}`,
          bold: true,
          size: 16,
          color: "CC0000",
        }),
      ],
      alignment: AlignmentType.CENTER,
    }),
  ];
}

// ── Intake Summary ───────────────────────────────────────────────────────────

async function generateIntakeSummary({ wizardData, caseFile, facts, profile }: DocGenInput): Promise<Buffer> {
  const confirmed = facts.filter((f) => f.status === "confirmed");
  const gaps = facts.filter((f) => f.status === "gap");

  const doc = new Document({
    sections: [{
      // Generated at submission — always a pre-review draft until an attorney
      // approves it, so the per-page watermark always applies here.
      headers: { default: draftWatermarkHeader() },
      children: [
        ...firmHeader(),
        new Paragraph({ text: "CLIENT INTAKE SUMMARY", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
        spacer(),

        heading("Client Information"),
        body(`Name: ${str(wizardData.client_name || profile.full_name)}`),
        body(`Email: ${profile.email}`),
        body(`Phone: ${str(wizardData.client_phone || profile.phone)}`),
        spacer(),

        heading("Matter"),
        body(`Type: ${caseFile.matter_type ?? "Not classified"} — ${caseFile.matter_subtype ?? ""}`),
        spacer(),

        heading("Client's Narrative"),
        body(str(wizardData.narrative || caseFile.summary)),
        spacer(),

        heading("Key Parties"),
        ...bullets(wizardData.parties).map(bullet),
        spacer(),

        heading("Timeline of Events"),
        ...bullets(wizardData.timeline).map(bullet),
        spacer(),

        heading("Client Goals"),
        ...(caseFile.goals?.map(bullet) ?? [body("None stated")]),
        spacer(),

        heading("Confirmed Facts"),
        ...(confirmed.length ? confirmed.map((f) => bullet(f.description)) : [body("None confirmed yet")]),
        spacer(),

        heading("Outstanding Fact Gaps"),
        ...(gaps.length ? gaps.map((f) => bullet(f.description)) : [body("None identified")]),
        spacer(),

        heading("Documents in Client's Possession"),
        ...bullets(wizardData.documents_held).map(bullet),
        spacer(),

        heading("Prior Legal Representation"),
        body(str(wizardData.prior_counsel)),
        spacer(),

        heading("Urgency / Deadlines"),
        body(str(wizardData.urgency_flags)),
        spacer(),

        heading("Attorney Notes"),
        body("[To be completed by reviewing attorney]"),
        spacer(),

        new Paragraph({
          children: [new TextRun({
            text: `Prepared: ${new Date().toLocaleDateString()} | DRAFT — PENDING ATTORNEY REVIEW`,
            italics: true,
            size: 18,
          })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    }],
  });

  return pack(doc);
}

// ── Demand Letter ────────────────────────────────────────────────────────────

async function generateDemandLetter({ wizardData }: DocGenInput): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      // Generated at submission — always a pre-review draft until an attorney
      // approves it, so the per-page watermark always applies here.
      headers: { default: draftWatermarkHeader() },
      children: [
        ...firmHeader(),
        body(new Date().toLocaleDateString()),
        spacer(),
        body(str(wizardData.recipient_name)),
        body(str(wizardData.recipient_address)),
        spacer(),
        body(`RE: Formal Demand — ${str(wizardData.subject)}`),
        spacer(),
        body(`Dear ${str(wizardData.recipient_salutation)},`),
        spacer(),

        heading("Background"),
        body(str(wizardData.factual_background)),
        spacer(),

        heading("Legal Basis"),
        body(str(wizardData.legal_basis)),
        spacer(),

        heading("Demand"),
        body(str(wizardData.specific_demands)),
        spacer(),

        body(`Please respond in writing by ${str(wizardData.response_deadline)}.`),
        spacer(),
        body(str(wizardData.consequences)),
        spacer(),
        body("This letter is written without prejudice to any and all rights, remedies, and claims, all of which are expressly reserved."),
        spacer(),
        body("Sincerely,"),
        spacer(),
        body("___________________________"),
        body(str(wizardData.sender_name)),
        spacer(),

        new Paragraph({
          children: [new TextRun({ text: "DRAFT — FOR ATTORNEY REVIEW BEFORE SENDING", bold: true, color: "CC0000" })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    }],
  });

  return pack(doc);
}

// ── Complaint Letter ─────────────────────────────────────────────────────────

async function generateComplaintLetter({ wizardData }: DocGenInput): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      // Generated at submission — always a pre-review draft until an attorney
      // approves it, so the per-page watermark always applies here.
      headers: { default: draftWatermarkHeader() },
      children: [
        ...firmHeader(),
        body(new Date().toLocaleDateString()),
        spacer(),
        body(`To: ${str(wizardData.agency_name)}`),
        spacer(),
        body(`RE: Complaint — ${str(wizardData.complaint_type)}`),
        spacer(),

        heading("Complainant"),
        body(str(wizardData.complainant_name)),
        body(str(wizardData.complainant_contact)),
        spacer(),

        heading("Respondent"),
        body(str(wizardData.respondent_name)),
        body(str(wizardData.respondent_address)),
        spacer(),

        heading("Nature of Complaint"),
        body(str(wizardData.complaint_narrative)),
        spacer(),

        heading("Protected Right at Issue"),
        body(str(wizardData.protected_right)),
        spacer(),

        heading("Supporting Evidence"),
        ...bullets(wizardData.evidence).map(bullet),
        spacer(),

        heading("Witnesses"),
        ...bullets(wizardData.witnesses).map(bullet),
        spacer(),

        heading("Relief Requested"),
        body(str(wizardData.relief_requested)),
        spacer(),

        body("I declare that the information above is true and correct to the best of my knowledge."),
        spacer(),
        body("Signature: ___________________________"),
        body(`Name: ${str(wizardData.complainant_name)}`),
        body(`Date: ${new Date().toLocaleDateString()}`),
        spacer(),

        new Paragraph({
          children: [new TextRun({ text: "DRAFT — FOR ATTORNEY REVIEW BEFORE FILING", bold: true, color: "CC0000" })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    }],
  });

  return pack(doc);
}

// ── Draft Contract ───────────────────────────────────────────────────────────

async function generateDraftContract({ wizardData }: DocGenInput): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      // Generated at submission — always a pre-review draft until an attorney
      // approves it, so the per-page watermark always applies here.
      headers: { default: draftWatermarkHeader() },
      children: [
        ...firmHeader(),
        new Paragraph({ text: str(wizardData.contract_type).toUpperCase(), heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
        spacer(),

        body(`This ${str(wizardData.contract_type)} ("Agreement") is entered into as of ${str(wizardData.effective_date)}, by and between:`),
        spacer(),
        body(`${str(wizardData.party_one_name)} ("${str(wizardData.party_one_role)}")`),
        body(`and`),
        body(`${str(wizardData.party_two_name)} ("${str(wizardData.party_two_role)}")`),
        spacer(),

        heading("1. Term"),
        body(str(wizardData.term)),
        spacer(),

        heading("2. Obligations"),
        body(str(wizardData.obligations)),
        spacer(),

        heading("3. Compensation / Consideration"),
        body(str(wizardData.compensation)),
        spacer(),

        heading("4. Confidentiality"),
        body(str(wizardData.confidentiality) || "The parties agree to keep the terms of this Agreement confidential."),
        spacer(),

        heading("5. Intellectual Property"),
        body(str(wizardData.ip_provisions) || "Not applicable."),
        spacer(),

        heading("6. Termination"),
        body(str(wizardData.termination)),
        spacer(),

        heading("7. Dispute Resolution"),
        body(str(wizardData.dispute_resolution)),
        spacer(),

        heading("8. Governing Law"),
        body(`This Agreement shall be governed by the laws of the State of ${str(wizardData.governing_law)}.`),
        spacer(),

        body("IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above."),
        spacer(),
        new Paragraph({
          children: [],
        }),

        new Table({
          rows: [
            new TableRow({
              children: [
                new TableCell({ children: [body(`${str(wizardData.party_one_name)}`), body("Signature: _________________"), body("Date: _________________")] }),
                new TableCell({ children: [body(`${str(wizardData.party_two_name)}`), body("Signature: _________________"), body("Date: _________________")] }),
              ],
            }),
          ],
          width: { size: 100, type: WidthType.PERCENTAGE },
        }),
        spacer(),

        new Paragraph({
          children: [new TextRun({ text: "DRAFT — FOR ATTORNEY REVIEW BEFORE SIGNING", bold: true, color: "CC0000" })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    }],
  });

  return pack(doc);
}

// ── Draft Waiver ─────────────────────────────────────────────────────────────

async function generateDraftWaiver({ wizardData }: DocGenInput): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      // Generated at submission — always a pre-review draft until an attorney
      // approves it, so the per-page watermark always applies here.
      headers: { default: draftWatermarkHeader() },
      children: [
        ...firmHeader(),
        new Paragraph({ text: str(wizardData.waiver_type).toUpperCase(), heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
        spacer(),

        body(`I, ${str(wizardData.releasor_name)} ("Releasor"), in consideration of ${str(wizardData.consideration)}, hereby release and discharge ${str(wizardData.releasee_name)} ("Releasee") from any and all claims, demands, damages, actions, and causes of action arising from or related to:`),
        spacer(),
        body(str(wizardData.covered_activities)),
        spacer(),

        heading("Scope of Release"),
        body(str(wizardData.rights_released)),
        spacer(),

        heading("Duration"),
        body(str(wizardData.duration)),
        spacer(),

        body("By signing below, I acknowledge that I have read and understood this release, that I have had the opportunity to consult with legal counsel, and that I am signing voluntarily."),
        spacer(),
        body("Signature: ___________________________"),
        body(`Printed Name: ${str(wizardData.releasor_name)}`),
        body(`Date: ${new Date().toLocaleDateString()}`),
        spacer(),

        new Paragraph({
          children: [new TextRun({ text: "DRAFT — FOR ATTORNEY REVIEW BEFORE SIGNING", bold: true, color: "CC0000" })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    }],
  });

  return pack(doc);
}

// ── Wills & Trusts ───────────────────────────────────────────────────────────

async function generateWillsTrusts({ wizardData }: DocGenInput): Promise<Buffer> {
  const instrument = str(wizardData.instrument_type);

  const doc = new Document({
    sections: [{
      // Generated at submission — always a pre-review draft until an attorney
      // approves it, so the per-page watermark always applies here.
      headers: { default: draftWatermarkHeader() },
      children: [
        ...firmHeader(),
        new Paragraph({ text: instrument.toUpperCase(), heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
        spacer(),

        body(`I, ${str(wizardData.testator_name)}, a resident of the State of ${str(wizardData.state)}, being of sound mind and disposing memory, hereby make, publish, and declare this my Last Will and Testament, hereby revoking all prior wills and codicils.`),
        spacer(),

        heading("Executor"),
        body(`I appoint ${str(wizardData.executor_name)} as Executor of this Will.`),
        body(`Alternate Executor: ${str(wizardData.alternate_executor)}`),
        spacer(),

        heading("Beneficiaries"),
        ...bullets(wizardData.beneficiaries).map(bullet),
        spacer(),

        heading("Specific Bequests"),
        ...bullets(wizardData.specific_bequests).map(bullet),
        spacer(),

        heading("Residuary Estate"),
        body(str(wizardData.residuary_clause)),
        spacer(),

        ...(wizardData.guardian_name ? [
          heading("Guardianship"),
          body(`I appoint ${str(wizardData.guardian_name)} as guardian of my minor children.`),
          spacer(),
        ] : []),

        body("IN WITNESS WHEREOF, I have set my hand to this Will on this date."),
        spacer(),
        body("Signature: ___________________________"),
        body(`Printed Name: ${str(wizardData.testator_name)}`),
        body(`Date: _________________`),
        spacer(),

        heading("Witnesses"),
        body("Witness 1 Signature: ___________________ Name: ___________________ Date: ___"),
        body("Witness 2 Signature: ___________________ Name: ___________________ Date: ___"),
        spacer(),

        new Paragraph({
          children: [new TextRun({ text: "DRAFT — FOR ATTORNEY REVIEW. NOT A VALID LEGAL DOCUMENT UNTIL PROPERLY EXECUTED.", bold: true, color: "CC0000" })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    }],
  });

  return pack(doc);
}

// ── Document Review ──────────────────────────────────────────────────────────

async function generateDocReview({ wizardData }: DocGenInput): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      // Generated at submission — always a pre-review draft until an attorney
      // approves it, so the per-page watermark always applies here.
      headers: { default: draftWatermarkHeader() },
      children: [
        ...firmHeader(),
        new Paragraph({ text: "DOCUMENT REVIEW ANALYSIS", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
        spacer(),

        heading("Document Reviewed"),
        body(str(wizardData.document_type)),
        body(`Parties: ${str(wizardData.parties)}`),
        spacer(),

        heading("Summary"),
        body(str(wizardData.summary)),
        spacer(),

        heading("Fit to Case"),
        body(str(wizardData.fit_to_case)),
        spacer(),

        heading("Favorable Provisions"),
        ...bullets(wizardData.favorable).map(bullet),
        spacer(),

        heading("Unfavorable Provisions"),
        ...bullets(wizardData.unfavorable).map(bullet),
        spacer(),

        heading("Red Flags"),
        ...bullets(wizardData.red_flags).map((b) =>
          new Paragraph({ children: [new TextRun({ text: b, color: "CC0000", bold: true })], bullet: { level: 0 } })
        ),
        spacer(),

        heading("Recommended Edits"),
        body(str(wizardData.recommended_edits)),
        spacer(),

        heading("Attorney Review Notes"),
        body("[To be completed by reviewing attorney]"),
        spacer(),

        new Paragraph({
          children: [new TextRun({
            text: `Analysis prepared: ${new Date().toLocaleDateString()} | DRAFT — PENDING ATTORNEY REVIEW`,
            italics: true,
            size: 18,
          })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    }],
  });

  return pack(doc);
}

// ── Inline Markdown → docx runs ──────────────────────────────────────────────
// The drafting models emit lightweight Markdown (**bold**, *italic*, # headings,
// [[placeholders]]). Word has no concept of Markdown, so without this pass the
// literal asterisks and hashes land in the .docx. We convert them to real runs.
// NOTE: underscores are intentionally NOT treated as emphasis — legal drafts are
// full of signature rules ("_________________") that would be mangled.

interface InlineToken {
  text: string;
  bold?: boolean;
  italics?: boolean;
}

// Split a run of text on **bold** / *italic* markers. Bold is matched first so
// "**x**" is never mistaken for two italics.
function parseEmphasis(text: string): InlineToken[] {
  const out: InlineToken[] = [];
  const re = /(\*\*)(.+?)\*\*|(\*)([^*]+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    if (m[1]) out.push({ text: m[2], bold: true });
    else out.push({ text: m[4], italics: true });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.filter((t) => t.text.length > 0);
}

// Convert one line of inline Markdown into TextRuns. [[placeholders]] are pulled
// out first (and rendered red/highlighted) so emphasis parsing never touches
// their contents.
function inlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // Emphasis that wraps a [[placeholder]] (e.g. "**[[X]]**") would otherwise be
  // torn apart by the placeholder split below, leaving orphan ** markers. The
  // placeholder run is already styled, so drop the wrapping markers first.
  const normalized = text
    .replace(/\*\*(\[\[[\s\S]*?\]\])\*\*/g, "$1")
    .replace(/\*(\[\[[\s\S]*?\]\])\*/g, "$1");
  const parts = normalized.split(/(\[\[.*?\]\])/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("[[") && part.endsWith("]]")) {
      runs.push(new TextRun({ text: part, bold: true, color: "CC0000", highlight: "yellow" }));
      continue;
    }
    for (const tok of parseEmphasis(part)) {
      // Safety net: a residual ** is always a broken bold marker, never literal
      // text in these drafts — strip it so it never lands in the .docx.
      const clean = tok.text.replace(/\*\*/g, "");
      if (!clean) continue;
      runs.push(new TextRun({ text: clean, bold: tok.bold, italics: tok.italics }));
    }
  }
  return runs.length ? runs : [new TextRun({ text })];
}

// Plain text of a line with all emphasis markers removed (used for headings,
// which are rendered fully bold and must not show literal ** / * characters).
function stripInlineMarkers(text: string): string {
  return parseEmphasis(text).map((t) => t.text).join("").replace(/\*\*/g, "");
}

// If a whole line is wrapped in *…* or **…**, return the inner text (so a line
// like "**1. SERVICES**" can be recognized as a heading). Otherwise unchanged.
function stripWrappingEmphasis(text: string): string {
  const t = text.trim();
  const m = t.match(/^(\*\*|\*)([\s\S]+?)\1$/);
  return m ? m[2].trim() : t;
}

// ── Markdown table + blockquote helpers ──────────────────────────────────────
// Drafting models sometimes emit Markdown tables (| a | b |) and blockquotes
// (> …). Without conversion these render as literal pipes and angle brackets in
// the .docx. Tables become real docx tables; blockquote markers are stripped.

function isTableRow(line: string): boolean {
  return (line.trim().match(/\|/g)?.length ?? 0) >= 2;
}

function parseTableCells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}

function isTableSeparator(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "");
}

function buildTable(rows: string[][]): Table {
  const colCount = Math.max(...rows.map((r) => r.length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((cells, rowIdx) =>
      new TableRow({
        children: Array.from({ length: colCount }, (_, c) => {
          const text = cells[c] ?? "";
          return new TableCell({
            children: [
              new Paragraph({
                children:
                  rowIdx === 0
                    ? [new TextRun({ text: text.replace(/\*\*/g, ""), bold: true })]
                    : inlineRuns(text),
              }),
            ],
          });
        }),
      })
    ),
  });
}

// ── Generate .docx from AI-formatted draft text ──────────────────────────────
// Used by the Drafter agent — wraps near-final AI text in a proper .docx shell
// with firm header, DRAFT watermark, and clean paragraph formatting.

export async function generateDocxFromText(
  title: string, draftText: string, profileName: DocumentProfileName,
  caseFile: { matter_subtype?: string | null; jurisdiction?: string | null } | null,
  status: DocumentStatus | null = null, isAttorneyUserDoc = false
): Promise<Buffer> {
  const approved = isAttorneyApproved(status) || isAttorneyUserDoc;
  const profile = DOCUMENT_PROFILES[profileName];
  const model = draftTextToDocumentModel(title, draftText);
  const doc = renderDocumentModel(
    model, profileName, profile.branded ? firmHeader() : [],
    draftFooterParagraphs(approved, caseFile?.jurisdiction),
    { headers: draftSectionHeaders(approved, caseFile?.jurisdiction) },
  );
  return pack(doc);
}

// ── "Information Still Needed" one-page report ────────────────────────────────
// Deterministically pulls the [[placeholders]] out of a draft (first or second)
// and renders a short client-facing checklist of what is still required. No model
// call — the same blanks that are highlighted in the draft, listed in one place.
// A placeholder is treated as required unless its descriptor says NON-BLOCKING.

export async function generateNeededInfoDocx(
  documentTitle: string,
  draftText: string
): Promise<Buffer> {
  const items = placeholderFields(draftText);
  const required = items.filter((i) => i.required);
  const optional = items.filter((i) => !i.required);

  const children: Paragraph[] = [
    ...firmHeader(),
    new Paragraph({
      children: [new TextRun({ text: "INFORMATION STILL NEEDED", bold: true, size: 26 })],
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [new TextRun({ text: documentTitle, italics: true, size: 22 })],
      alignment: AlignmentType.CENTER,
    }),
    spacer(),
  ];

  if (!items.length) {
    children.push(
      body("This draft has no remaining blanks. Everything we need has been provided."),
    );
  } else {
    children.push(
      body(
        "To finalize your document we still need the items below. Each one appears highlighted in the draft itself. Reply with whatever you can; anything you are unsure of can wait."
      ),
      spacer(),
    );

    if (required.length) {
      children.push(heading("Required to finalize"));
      required.forEach((it, i) =>
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${i + 1}. ${it.label}`, bold: true }),
              ...(it.hint ? [new TextRun({ text: ` — ${it.hint}` })] : []),
            ],
          })
        )
      );
      children.push(spacer());
    }

    if (optional.length) {
      children.push(heading("Helpful, but can be added at signing"));
      optional.forEach((it, i) =>
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${i + 1}. ${it.label}`, bold: true }),
              ...(it.hint ? [new TextRun({ text: ` — ${it.hint}` })] : []),
            ],
          })
        )
      );
      children.push(spacer());
    }
  }

  children.push(
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 1 } },
      text: "",
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Crawford Law PLLC · ${new Date().toLocaleDateString()} · Attorney-Client Privileged & Confidential`,
          italics: true,
          size: 16,
          color: "888888",
        }),
      ],
      alignment: AlignmentType.CENTER,
    })
  );

  return pack(new Document({ sections: [{ children }] }));
}

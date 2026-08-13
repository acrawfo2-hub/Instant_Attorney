import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Packer,
  BorderStyle,
  Header,
} from "docx";
import type { DocumentStatus } from "./types";
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


function spacer(): Paragraph {
  return new Paragraph({ text: "" });
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

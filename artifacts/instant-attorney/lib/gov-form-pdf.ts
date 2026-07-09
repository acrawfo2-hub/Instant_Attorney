// ── PDF template fill (Path A: fillable AcroForm PDFs) ──────────────────────
//
// A client downloads the real government/court PDF from its official source
// and uploads it here. If it's a genuine fillable AcroForm, we read its field
// names (and tooltips, where the form author set them) and auto-map them
// against the GovFormField list already produced by the guided-completion
// interview (lib/gov-form-guide.ts) — the same answers that engine already
// collects. The client (or attorney) confirms the map once, then we stamp
// answers into the real PDF fields and flatten it for download.
//
// Flat/scanned PDFs (no embedded fields) are detected but not auto-filled yet
// — that needs a hand-built coordinate overlay per form revision, which is
// meaningfully more maintenance and is deliberately out of scope here. Those
// templates are marked pdf_status "unsupported" so the UI can degrade to
// "download the blank form and fill it yourself" guidance.

import {
  PDFDocument,
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  PDFField,
  PDFName,
  PDFString,
  PDFHexString,
  StandardFonts,
} from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GovFormField, GovFormFieldType } from "./government-forms.ts";
import type { PdfMode } from "./types.ts";

export const GOV_FORM_TEMPLATES_BUCKET = "gov-form-templates";

// ── Detection ────────────────────────────────────────────────────────────────

export type DetectedPdfFieldType = "text" | "checkbox" | "dropdown" | "radio" | "optionlist" | "other";

export interface DetectedPdfField {
  name: string;
  type: DetectedPdfFieldType;
  /** The field's tooltip/alternate text (PDF "TU" entry), when the form author
   * set one — the best available label for auto-mapping. Null if absent. */
  label: string | null;
  options?: string[];
}

export interface PdfDetectionResult {
  mode: PdfMode;
  fields: DetectedPdfField[];
}

/** Best-effort read of a field's tooltip/alternate-text ("TU") entry. Not every
 * form author sets one; absence just means auto-mapping falls back to the
 * field's raw internal name. */
function getFieldTooltip(field: PDFField): string | null {
  try {
    const tu = field.acroField.dict.get(PDFName.of("TU"));
    if (tu instanceof PDFString || tu instanceof PDFHexString) {
      return tu.decodeText();
    }
  } catch {
    // Best-effort only — malformed/unusual dicts just yield no label.
  }
  return null;
}

function describeField(field: PDFField): DetectedPdfField {
  const name = field.getName();
  const label = getFieldTooltip(field);
  if (field instanceof PDFTextField) return { name, type: "text", label };
  if (field instanceof PDFCheckBox) return { name, type: "checkbox", label };
  if (field instanceof PDFDropdown) return { name, type: "dropdown", label, options: field.getOptions() };
  if (field instanceof PDFRadioGroup) return { name, type: "radio", label, options: field.getOptions() };
  if (field instanceof PDFOptionList) return { name, type: "optionlist", label, options: field.getOptions() };
  return { name, type: "other", label };
}

/** Load a client-uploaded PDF and determine whether it's a real fillable
 * AcroForm (has named fields) or a flat/scanned document (no fields — Path A
 * doesn't cover it). Throws if the bytes aren't a readable PDF at all. */
export async function detectPdfTemplate(bytes: Uint8Array): Promise<PdfDetectionResult> {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const rawFields = pdfDoc.getForm().getFields();
  if (rawFields.length === 0) return { mode: "flat", fields: [] };
  return { mode: "acroform", fields: rawFields.map(describeField) };
}

// ── Auto-mapping ─────────────────────────────────────────────────────────────

const STOPWORDS = new Set(["the", "of", "a", "an", "for", "and", "or", "to", "is", "are", "your", "you"]);

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t.length > 1 && !STOPWORDS.has(t))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function typeCompatible(formType: GovFormFieldType, pdfType: DetectedPdfFieldType): boolean {
  if (formType === "boolean") return pdfType === "checkbox";
  if (formType === "enum") return pdfType === "dropdown" || pdfType === "radio" || pdfType === "optionlist";
  return pdfType === "text"; // string, ssn, date, number, address
}

export interface AutoMapResult {
  /** GovFormField.name -> PDF AcroForm field name. */
  map: Record<string, string>;
  /** GovFormField names with no confident match — needs a human to map by hand
   * (or the form genuinely doesn't ask for that field). */
  unmapped: string[];
  /** GovFormField.name -> match score [0,1], surfaced so a review UI can flag
   * low-confidence guesses for a human to double-check before first fill. */
  confidence: Record<string, number>;
}

const MATCH_THRESHOLD = 0.2;

/** Greedy best-match pairing between our known form fields and the PDF's real
 * AcroForm fields, scored by label/tooltip token overlap with a type-match
 * bonus/penalty. Not globally optimal (no Hungarian algorithm), but this is a
 * proposal for a human to confirm, not a silent autofill — good enough. */
export function autoMapPdfFields(formFields: GovFormField[], pdfFields: DetectedPdfField[]): AutoMapResult {
  const candidates: Array<{ formName: string; pdfName: string; score: number }> = [];
  for (const formField of formFields) {
    const labelTokens = tokenize(`${formField.label} ${formField.name}`);
    for (const pdfField of pdfFields) {
      const pdfTokens = tokenize(pdfField.label || pdfField.name);
      let score = jaccard(labelTokens, pdfTokens);
      score += typeCompatible(formField.type, pdfField.type) ? 0.15 : -0.15;
      candidates.push({ formName: formField.name, pdfName: pdfField.name, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const map: Record<string, string> = {};
  const confidence: Record<string, number> = {};
  const usedForm = new Set<string>();
  const usedPdf = new Set<string>();

  for (const c of candidates) {
    if (c.score < MATCH_THRESHOLD) break;
    if (usedForm.has(c.formName) || usedPdf.has(c.pdfName)) continue;
    map[c.formName] = c.pdfName;
    confidence[c.formName] = Math.round(c.score * 100) / 100;
    usedForm.add(c.formName);
    usedPdf.add(c.pdfName);
  }

  const unmapped = formFields.filter((f) => !usedForm.has(f.name)).map((f) => f.name);
  return { map, unmapped, confidence };
}

// ── Fill ─────────────────────────────────────────────────────────────────────

function isTruthy(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  return ["yes", "y", "true", "1"].includes(String(raw).trim().toLowerCase());
}

export interface FillResult {
  buffer: Buffer;
  filledFieldCount: number;
  /** PDF field names that had an answer but couldn't be set (unknown field,
   * unsupported field kind, or an enum/dropdown value with no matching option). */
  skippedFields: string[];
}

/** Stamp validated answers into the uploaded PDF's real AcroForm fields (via
 * `fieldMap`, GovFormField.name -> PDF field name) and flatten so the values
 * are locked into the page content rather than left as an editable overlay. */
export async function fillAcroForm(
  templateBytes: Uint8Array,
  fieldMap: Record<string, string>,
  answers: Record<string, unknown>
): Promise<FillResult> {
  const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let filledFieldCount = 0;
  const skippedFields: string[] = [];

  for (const [answerKey, pdfFieldName] of Object.entries(fieldMap)) {
    const raw = answers[answerKey];
    if (raw === undefined || raw === null || raw === "") continue;

    let field: PDFField;
    try {
      field = form.getField(pdfFieldName);
    } catch {
      skippedFields.push(pdfFieldName);
      continue;
    }

    try {
      if (field instanceof PDFTextField) {
        field.setText(String(raw));
      } else if (field instanceof PDFCheckBox) {
        if (isTruthy(raw)) field.check();
        else field.uncheck();
      } else if (field instanceof PDFDropdown || field instanceof PDFRadioGroup || field instanceof PDFOptionList) {
        const value = String(raw);
        const match = field.getOptions().find((o) => o.toLowerCase() === value.toLowerCase());
        if (!match) {
          skippedFields.push(pdfFieldName);
          continue;
        }
        field.select(match);
      } else {
        skippedFields.push(pdfFieldName);
        continue;
      }
      filledFieldCount++;
    } catch {
      skippedFields.push(pdfFieldName);
    }
  }

  form.updateFieldAppearances(font);
  form.flatten();

  const bytes = await pdfDoc.save();
  return { buffer: Buffer.from(bytes), filledFieldCount, skippedFields };
}

// ── Storage ──────────────────────────────────────────────────────────────────

/** Upload the client's blank template PDF, creating the bucket on first use
 * (schema-stage32 provisions it too; this fallback covers environments where
 * that migration hasn't run yet — same pattern as document-delivery.ts). */
export async function uploadPdfTemplate(
  db: SupabaseClient,
  path: string,
  bytes: Buffer
): Promise<boolean> {
  const attempt = () =>
    db.storage.from(GOV_FORM_TEMPLATES_BUCKET).upload(path, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });

  let { error } = await attempt();

  if (error && /bucket.*not.*found|not.*found.*bucket|no such bucket/i.test(error.message)) {
    const { error: bucketErr } = await db.storage.createBucket(GOV_FORM_TEMPLATES_BUCKET, { public: false });
    if (bucketErr && !/exist/i.test(bucketErr.message)) {
      console.error("[gov-form-pdf] bucket create failed:", bucketErr.message);
      return false;
    }
    ({ error } = await attempt());
  }

  if (error) {
    console.error("[gov-form-pdf] template upload failed:", error.message);
    return false;
  }
  return true;
}

export async function downloadPdfTemplate(db: SupabaseClient, path: string): Promise<Buffer | null> {
  const { data, error } = await db.storage.from(GOV_FORM_TEMPLATES_BUCKET).download(path);
  if (error || !data) {
    console.error("[gov-form-pdf] template download failed:", error?.message);
    return null;
  }
  return Buffer.from(await data.arrayBuffer());
}

// ── Misc ─────────────────────────────────────────────────────────────────────

/** Same sanitization as doc-generator's docxContentDisposition, for a .pdf. */
export function pdfContentDisposition(title: string): string {
  const base = (title && title.trim().length ? title.trim() : "document").replace(/\.pdf$/i, "");
  const ascii = base
    .replace(/[‐-―−]/g, "-") // various dashes → hyphen
    .replace(/[‘’]/g, "'") // curly single quotes
    .replace(/[“”]/g, '"') // curly double quotes
    .replace(/[^\x20-\x7E]/g, "") // drop any remaining non-ASCII
    .replace(/["]/g, "")
    .replace(/[\/\\:*?<>|]/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  const asciiName = `${ascii.length ? ascii : "document"}.pdf`;
  const utf8Name = encodeURIComponent(`${base}.pdf`).replace(/['()]/g, escape).replace(/\*/g, "%2A");
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`;
}

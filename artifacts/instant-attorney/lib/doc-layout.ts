import { AlignmentType, Document, Footer, Header, HeadingLevel, PageNumber, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";

export type DocumentProfileName = "correspondence" | "agreement" | "pleading" | "estate-instrument" | "memorandum" | "administrative-request";
export type DocumentBlock =
  | { type: "heading"; text: string; level: 1 | 2 | 3 }
  | { type: "paragraph"; text: string; indent: number }
  | { type: "enumerated-clause"; label: string; text: string; level: number }
  | { type: "caption" | "signature-block" | "notary-block"; lines: string[] }
  | { type: "table"; rows: string[][] }
  | { type: "exhibit"; title: string }
  | { type: "page-break" };
export interface IntermediateDocument { title: string; blocks: DocumentBlock[] }
interface LayoutProfile { margin: { top: number; right: number; bottom: number; left: number }; font: string; size: number; branded: boolean; title: "left" | "center" | "caption"; after: number; line: number; clauseIndent: number; pages: boolean; tables: boolean; notary: boolean; exhibits: boolean }
const base = { font: "Times New Roman", size: 24, pages: true };
export const DOCUMENT_PROFILES: Record<DocumentProfileName, LayoutProfile> = {
  correspondence: { ...base, margin: { top: 1080, right: 1440, bottom: 1080, left: 1440 }, branded: true, title: "left", after: 160, line: 276, clauseIndent: 360, tables: false, notary: false, exhibits: false },
  agreement: { ...base, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }, branded: false, title: "center", after: 120, line: 276, clauseIndent: 540, tables: true, notary: true, exhibits: true },
  pleading: { ...base, margin: { top: 1440, right: 1440, bottom: 1440, left: 2160 }, branded: false, title: "caption", after: 120, line: 480, clauseIndent: 720, tables: true, notary: false, exhibits: true },
  "estate-instrument": { ...base, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, branded: false, title: "center", after: 160, line: 360, clauseIndent: 720, tables: true, notary: true, exhibits: true },
  memorandum: { ...base, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }, font: "Arial", size: 22, branded: true, title: "center", after: 140, line: 276, clauseIndent: 540, tables: true, notary: false, exhibits: true },
  "administrative-request": { ...base, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }, font: "Arial", size: 22, branded: false, title: "left", after: 120, line: 276, clauseIndent: 540, tables: true, notary: true, exhibits: true },
};
export function profileForDocumentType(docType: string): DocumentProfileName {
  const profiles: Record<string, DocumentProfileName> = {
    demand_letter: "correspondence", complaint_letter: "administrative-request",
    draft_contract: "agreement", draft_waiver: "agreement", wills_trusts: "estate-instrument",
    doc_review: "memorandum", critical_review: "memorandum", second_draft: "agreement",
  };
  return profiles[docType] ?? "pleading";
}
function cells(line: string) { return line.trim().replace(/^\||\|$/g, "").split("|").map(s => s.trim()); }
export function draftTextToDocumentModel(title: string, source: string): IntermediateDocument {
  const lines = source.replace(/\r\n/g, "\n").split("\n"); const blocks: DocumentBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], text = raw.trim(); if (!text) continue;
    if (text === "[[PAGE BREAK]]") { blocks.push({ type: "page-break" }); continue; }
    const container = text.match(/^\[\[(CAPTION|SIGNATURE|NOTARY)\]\]$/);
    if (container) { const content: string[] = [], end = `[[/${container[1]}]]`; while (++i < lines.length && lines[i].trim() !== end) content.push(lines[i]); if (i === lines.length) throw new Error(`Unclosed ${container[1]} block`); blocks.push({ type: container[1] === "CAPTION" ? "caption" : container[1] === "SIGNATURE" ? "signature-block" : "notary-block", lines: content }); continue; }
    const exhibit = text.match(/^\[\[EXHIBIT:\s*(.+)\]\]$/); if (exhibit) { blocks.push({ type: "exhibit", title: exhibit[1] }); continue; }
    if ((text.match(/\|/g)?.length ?? 0) >= 2) { const rows: string[][] = []; while (i < lines.length && (lines[i].trim().match(/\|/g)?.length ?? 0) >= 2) { const row = cells(lines[i]); if (!row.every(c => /^:?-{2,}:?$/.test(c))) rows.push(row); i++; } i--; blocks.push({ type: "table", rows }); continue; }
    const heading = text.match(/^(#{1,3})\s+(.+)$/); if (heading) { blocks.push({ type: "heading", level: heading[1].length as 1 | 2 | 3, text: heading[2].replace(/\*\*/g, "") }); continue; }
    const clause = text.match(/^((?:\d+(?:\.\d+)*|[A-Z]|[ivx]+)[.)])\s+(.+)$/i); if (clause) { blocks.push({ type: "enumerated-clause", label: clause[1], text: clause[2], level: Math.max(1, (clause[1].match(/\./g)?.length ?? 1)) }); continue; }
    const indent = (raw.match(/^[ \t]*/)?.[0] ?? "").replace(/\t/g, "    ").length;
    blocks.push({ type: "paragraph", text: raw.trimStart(), indent });
  } return { title, blocks };
}
export function validateDocumentModel(model: IntermediateDocument, name: DocumentProfileName) {
  if (!model.title.trim() || !Array.isArray(model.blocks)) throw new Error("Invalid document model"); const p = DOCUMENT_PROFILES[name]; if (!p) throw new Error(`Unknown document profile: ${name}`);
  model.blocks.forEach((b, i) => { if (b.type === "table" && (!p.tables || !b.rows.length || b.rows.some(r => !r.length))) throw new Error(`Table not permitted or empty at block ${i}`); if (b.type === "notary-block" && !p.notary) throw new Error(`Notary block not permitted for ${name}`); if (b.type === "exhibit" && !p.exhibits) throw new Error(`Exhibit not permitted for ${name}`); });
}
const runs = (s: string) => [new TextRun({ text: s.replace(/\*\*/g, "") })];
export function renderDocumentModel(model: IntermediateDocument, name: DocumentProfileName, before: Paragraph[] = [], after: Paragraph[] = [], sectionOptions?: { headers?: { default: Header } }): Document {
  validateDocumentModel(model, name); const p = DOCUMENT_PROFILES[name]; const children: (Paragraph | Table)[] = [...before, new Paragraph({ children: [new TextRun({ text: model.title, bold: true, size: 26 })], alignment: p.title === "left" ? AlignmentType.LEFT : AlignmentType.CENTER, heading: HeadingLevel.HEADING_1 })];
  for (const b of model.blocks) {
    if (b.type === "table") { children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: b.rows.map((r, ri) => new TableRow({ children: r.map(c => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: c, bold: ri === 0 })] })] })) })) })); continue; }
    if (b.type === "page-break") { children.push(new Paragraph({ pageBreakBefore: true })); continue; }
    if (b.type === "heading") { children.push(new Paragraph({ children: runs(b.text), heading: b.level === 1 ? HeadingLevel.HEADING_1 : b.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3 })); continue; }
    if (b.type === "enumerated-clause") { children.push(new Paragraph({ children: [new TextRun({ text: `${b.label} `, bold: true }), ...runs(b.text)], indent: { left: p.clauseIndent * b.level, hanging: 360 }, spacing: { after: p.after, line: p.line } })); continue; }
    if (b.type === "caption") { children.push(...b.lines.map(x => new Paragraph({ children: runs(x), alignment: AlignmentType.CENTER }))); continue; }
    if (b.type === "signature-block" || b.type === "notary-block") { children.push(new Paragraph({ text: "" }), ...b.lines.map(x => new Paragraph({ children: runs(x), keepTogether: true }))); continue; }
    if (b.type === "exhibit") { children.push(new Paragraph({ pageBreakBefore: true, children: [new TextRun({ text: b.title, bold: true })], alignment: AlignmentType.CENTER })); continue; }
    children.push(new Paragraph({ children: runs(b.text), indent: b.indent ? { left: b.indent * 120 } : undefined, spacing: { after: p.after, line: p.line } }));
  }
  children.push(...after); return new Document({ styles: { default: { document: { run: { font: p.font, size: p.size } } } }, sections: [{ properties: { page: { margin: p.margin } }, ...(sectionOptions ?? {}), footers: p.pages ? { default: new Footer({ children: [new Paragraph({ children: [new TextRun({ children: [PageNumber.CURRENT] })], alignment: AlignmentType.CENTER })] }) } : undefined, children }] });
}

import { createHash } from "crypto";

export interface GenerationFactRef { id: string }
export interface GenerationAttachmentRef { id: string; updated_at?: string | null }

/** Canonical inputs persisted with a drafting job (ordering never changes identity). */
export function normalizeGenerationInputs(
  facts: GenerationFactRef[],
  attachments: GenerationAttachmentRef[],
) {
  return {
    factKeys: [...new Set(facts.map((fact) => fact.id).filter(Boolean))].sort(),
    attachmentVersions: attachments
      .filter((attachment) => attachment.id)
      .map((attachment) => ({ id: attachment.id, version: attachment.updated_at ?? "unknown" }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/**
 * A deterministic compatibility key for the old title-only draft protocol.
 * New producers may send `---DRAFT: logical-key | Display title---`; unlike the
 * title fallback, that explicit key remains stable when the display title changes.
 */
export function logicalDocumentKey(header: string): { key: string; title: string } {
  const separator = header.indexOf("|");
  if (separator > 0) {
    const candidate = header.slice(0, separator).trim().toLowerCase();
    const title = header.slice(separator + 1).trim() || "Untitled draft";
    if (/^[a-z0-9][a-z0-9._:-]{2,127}$/.test(candidate)) return { key: candidate, title };
  }
  const title = header.trim() || "Untitled draft";
  const readable = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72);
  const digest = createHash("sha256").update(title.toLowerCase()).digest("hex").slice(0, 12);
  return { key: `legacy:${readable || "draft"}:${digest}`, title };
}

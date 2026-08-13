import type { Document, DocumentDeliverySend } from "./types.ts";

/** Newest send wins when an attorney delivers more than one revision. */
export function latestDeliveryByDocument(
  deliveries: DocumentDeliverySend[],
): Map<string, DocumentDeliverySend> {
  const latest = new Map<string, DocumentDeliverySend>();
  for (const delivery of deliveries) {
    const current = latest.get(delivery.document_id);
    if (!current || delivery.sent_at.localeCompare(current.sent_at) > 0) {
      latest.set(delivery.document_id, delivery);
    }
  }
  return latest;
}

export function latestMatterDelivery(
  deliveries: DocumentDeliverySend[],
): DocumentDeliverySend | null {
  return deliveries.reduce<DocumentDeliverySend | null>(
    (latest, delivery) =>
      !latest || delivery.sent_at.localeCompare(latest.sent_at) > 0
        ? delivery
        : latest,
    null,
  );
}

/**
 * Small, authoritative manifest for chat. The exact body is available through
 * the document download route; the prompt gets only the delivery note and IDs.
 */
export function formatAttorneyWorkProduct(
  documents: Array<Pick<Document, "id" | "title">>,
  deliveries: DocumentDeliverySend[],
): string {
  if (!deliveries.length) return "";
  const documentsById = new Map(
    documents.map((document) => [document.id, document]),
  );
  const lines = [
    "=== ATTORNEY-DELIVERED WORK PRODUCT ===",
    "These are immutable send records. Treat the named revision as the version the attorney sent; do not confuse it with the original draft.",
  ];
  for (const delivery of [...deliveries].sort((a, b) =>
    b.sent_at.localeCompare(a.sent_at),
  )) {
    const parent = documentsById.get(delivery.document_id);
    lines.push(`• ${parent?.title || delivery.attachment_file_name}`);
    lines.push(`  Sent: ${delivery.sent_at}`);
    lines.push(`  Approved revision ID: ${delivery.revision_document_id}`);
    lines.push(
      `  Attorney note: ${delivery.body.trim() || "No note provided."}`,
    );
    if (delivery.consultation_url)
      lines.push("  Follow-up consultation offered: yes");
  }
  lines.push("=== END ATTORNEY-DELIVERED WORK PRODUCT ===", "");
  return lines.join("\n");
}

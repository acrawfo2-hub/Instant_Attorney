import type { DocumentStatus } from "./types.ts";

export type DraftRevisionAction = "unpromoted" | "revise_in_place" | "create_revision";

/** The approved bytes are immutable; every other client-visible working state is revisionable. */
export function draftRevisionAction(status: DocumentStatus | string | null): DraftRevisionAction {
  if (!status) return "unpromoted";
  return status === "approved" || status === "delivered" ? "create_revision" : "revise_in_place";
}

export function nextRevisionMetadata(
  contentJson: unknown,
  now: string,
  previousDocumentId?: string,
): Record<string, unknown> {
  const previous = contentJson && typeof contentJson === "object" && !Array.isArray(contentJson)
    ? contentJson as Record<string, unknown>
    : {};
  const oldVersion = typeof previous.workspace_revision === "number" ? previous.workspace_revision : 1;
  return {
    ...previous,
    workspace_revision: oldVersion + 1,
    workspace_revised_at: now,
    attorney_queue_label: "Revised — review pending",
    ...(previousDocumentId ? { previous_document_id: previousDocumentId } : {}),
  };
}

export function revisionUiMessage(action: DraftRevisionAction): string {
  if (action === "create_revision") {
    return "Saved as a new revision. The approved version was not changed; another attorney review is pending.";
  }
  if (action === "revise_in_place") {
    return "Revision saved. The prior review was superseded and another attorney review is pending.";
  }
  return "Saved";
}

import type { DocumentStatus } from "@/lib/types";

export type FillLifecycle = "draft_in_place" | "review_revision" | "approval_revision";

/** Pure lifecycle decision shared by the route and its regression tests. */
export function placeholderFillLifecycle(status: DocumentStatus): FillLifecycle {
  if (status === "draft" || status === "pre_warmed") return "draft_in_place";
  if (status === "approved" || status === "delivered") return "approval_revision";
  return "review_revision";
}

export function statusAfterPlaceholderFill(status: DocumentStatus): DocumentStatus {
  return placeholderFillLifecycle(status) === "draft_in_place" ? "draft" : "pending_review";
}

export function isReviewResultCurrent(sourceRevision: number | null | undefined, currentRevision: number): boolean {
  return (sourceRevision ?? 1) === currentRevision;
}

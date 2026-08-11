import { test } from "node:test";
import assert from "node:assert/strict";
import { isReviewResultCurrent, placeholderFillLifecycle, statusAfterPlaceholderFill } from "./document-revisions.ts";

test("an unsubmitted draft is filled in place", () => {
  assert.equal(placeholderFillLifecycle("draft"), "draft_in_place");
  assert.equal(statusAfterPlaceholderFill("draft"), "draft");
});

for (const status of ["pending_review", "changes_requested"] as const) {
  test(`${status} creates a review revision`, () => {
    assert.equal(placeholderFillLifecycle(status), "review_revision");
    assert.equal(statusAfterPlaceholderFill(status), "pending_review");
  });
}

for (const status of ["approved", "delivered"] as const) {
  test(`${status} preserves the approved version and requires a new approval`, () => {
    assert.equal(placeholderFillLifecycle(status), "approval_revision");
    assert.equal(statusAfterPlaceholderFill(status), "pending_review");
  });
}

test("a review result is publishable only for the revision it read", () => {
  assert.equal(isReviewResultCurrent(4, 4), true);
  assert.equal(isReviewResultCurrent(4, 5), false, "in-flight revision must stale the review");
});

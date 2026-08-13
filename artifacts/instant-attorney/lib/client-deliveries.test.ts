import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatAttorneyWorkProduct,
  latestDeliveryByDocument,
  latestMatterDelivery,
} from "./client-deliveries.ts";
import type { Document, DocumentDeliverySend } from "./types.ts";

function delivery(
  over: Partial<DocumentDeliverySend> = {},
): DocumentDeliverySend {
  return {
    id: "send-1",
    document_id: "doc-1",
    revision_document_id: "revision-1",
    case_file_id: "case-1",
    user_id: "user-1",
    sent_by: "attorney-1",
    recipient: "client@example.com",
    subject: "Your document is ready",
    body: "Verify the names and dates before signing.",
    consultation_url: null,
    attachment_file_name: "Power of Attorney - approved.docx",
    sent_at: "2026-08-13T12:00:00.000Z",
    ...over,
  };
}

test("delivery selectors use the newest immutable send", () => {
  const older = delivery();
  const newer = delivery({
    id: "send-2",
    revision_document_id: "revision-2",
    sent_at: "2026-08-14T12:00:00.000Z",
  });
  const other = delivery({
    id: "send-3",
    document_id: "doc-2",
    sent_at: "2026-08-13T18:00:00.000Z",
  });
  assert.equal(
    latestDeliveryByDocument([newer, older, other]).get("doc-1")?.id,
    "send-2",
  );
  assert.equal(latestMatterDelivery([older, newer, other])?.id, "send-2");
});

test("assistant manifest identifies the exact sent revision and attorney note", () => {
  const documents = [
    { id: "doc-1", title: "Durable Power of Attorney" },
  ] as Document[];
  const text = formatAttorneyWorkProduct(documents, [
    delivery({ consultation_url: "https://example.com/consult" }),
  ]);
  assert.match(text, /ATTORNEY-DELIVERED WORK PRODUCT/);
  assert.match(text, /Durable Power of Attorney/);
  assert.match(text, /Approved revision ID: revision-1/);
  assert.match(text, /Verify the names and dates before signing/);
  assert.match(text, /Follow-up consultation offered: yes/);
});

test("assistant manifest is omitted when nothing has been delivered", () => {
  assert.equal(formatAttorneyWorkProduct([], []), "");
  assert.equal(latestMatterDelivery([]), null);
});

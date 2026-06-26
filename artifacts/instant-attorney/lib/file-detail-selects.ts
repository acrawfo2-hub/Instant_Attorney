/** Column lists for the client file detail page — omit large blobs not needed for the dashboard view. */

export const CASE_FILE_DETAIL_COLUMNS =
  "id, user_id, matter_type, matter_subtype, status, file_type, title, goals, summary, legal_strategy, attorney_assessment, next_action, opened_at, updated_at";

export const FACT_ITEM_COLUMNS =
  "id, case_file_id, user_id, description, status, kind, created_at, updated_at";

/** Omits content_json, review_report, improved_draft_text, attorney_notes — fetched on review/wizard routes. */
export const DOCUMENT_LIST_COLUMNS =
  "id, case_file_id, user_id, parent_document_id, doc_type, title, status, draft_text, submitted_at, created_at, facts_synced_at";

/** AttachmentPanel loads full rows; dashboard only needs presence/count for mission control. */
export const ATTACHMENT_STATUS_COLUMNS = "id, status";

export const REQUESTED_ATTACHMENT_COLUMNS =
  "id, case_file_id, user_id, description, reason, status, fulfilled_by, source, created_at";

export const FORM_INSTRUMENT_COLUMNS =
  "id, case_file_id, user_id, form_key, status, reason, answers, source, form_def, lookup_status, created_at, updated_at";

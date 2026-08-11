export type SubscriptionStatus = "active" | "canceled" | "past_due" | "trialing" | "bypass";
export type SubscriptionPlan = "phase2" | "consult" | "attorney_pro";
/**
 * A profile's persona. `client` is the ordinary lay user. `attorney_user` is
 * an external/small-firm attorney using the drafting wizards as a
 * professional tool for their OWN clients' matters — separate from
 * `Profile.is_attorney`, which means "Andrew Crawford, the firm's own
 * reviewing attorney" and must never be conflated with this.
 */
export type AccountType = "client" | "attorney_user";
/** Manual-approval gate for attorney_user signups; null for ordinary clients. */
export type AttorneyUserStatus = "pending" | "approved" | "rejected";
export type MatterType = "reactive" | "preventive";
export type CaseStatus = "open" | "closed" | "referred" | "archived";
export type CaseFileType = "standard" | "quick_consult";
export type FactStatus = "confirmed" | "gap";
/** Whether a fact_item is an asserted fact or a hypothetical "what-if" intention. */
export type FactKind = "fact" | "hypothetical";
export type MessageRole = "user" | "assistant";
export type AttachmentType = "document" | "screenshot" | "other";
export type AttachmentStatus = "processing" | "ready" | "failed";
export type RequestedAttachmentStatus = "requested" | "uploaded" | "waived";
export type ReviewStatus = "reviewing" | "review_ready" | "merging" | "merged";
/** @deprecated Legacy table — app uses ConsultRequest / consult_requests instead */
export type ConsultType = "standard" | "quick_consult" | "follow_up";
/** @deprecated Legacy table — app uses ConsultRequest / consult_requests instead */
export type ConsultStatus = "needs_scheduling" | "scheduled" | "completed" | "canceled";

/** @deprecated Legacy table — app uses ConsultRequest / consult_requests instead */
export interface Consult {
  id: string;
  user_id: string;
  case_file_id: string | null;
  consult_type: ConsultType;
  status: ConsultStatus;
  scheduled_at: string | null;
  duration_minutes: number | null;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ConsultRequestStatus = "pending" | "confirmed" | "attorney_proposed" | "cancelled" | "completed";

export type ConsultDisposition =
  | "retain_in_house"
  | "refer_out"
  | "limited_scope"
  | "not_a_fit"
  | "follow_up_needed";

export type ConsultActionKind = "general" | "document";

export interface ConsultActionItem {
  id: string;
  text: string;
  kind: ConsultActionKind;
}

/** Attorney-editable wrap-up form (draft or submitted). */
export interface ConsultWrapUp {
  consultSummary: string;
  /** Short overview of the legal strategy and where the matter stands. */
  strategyOverview: string;
  disposition: ConsultDisposition | "";
  referralNotes: string;
  /** What happens next and roughly when. */
  expectedTimeline: string;
  /** Documents the client should expect to RECEIVE from the firm — not things the client needs to provide (see clientActions for that). */
  expectedDocuments: ConsultActionItem[];
  clientActions: ConsultActionItem[];
  attorneyActions: ConsultActionItem[];
}

/** Attorney-editable fee guidance draft (stored on consult_requests). */
export interface ConsultFeeEstimateDraft {
  version: 1;
  attorneyNotes: string;
  selectedPackageId: string | null;
  customRange: { low: number; high: number } | null;
  adjustmentNote: string;
  updatedAt: string;
}

export interface ConsultRequest {
  id: string;
  user_id: string;
  case_file_id: string | null;
  status: ConsultRequestStatus;
  proposed_times: string[];
  confirmed_time: string | null;
  attorney_proposed_time: string | null;
  client_phone: string | null;
  notes: string | null;
  attorney_notes: string | null;
  wrap_up_draft: ConsultWrapUp | null;
  post_consult_plan: ConsultWrapUp | null;
  wrap_up_submitted_at: string | null;
  fee_estimate_draft: ConsultFeeEstimateDraft | null;
  session_started_at: string | null;
  session_ended_at: string | null;
  recording_consent_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Timestamped notepad entry kept during a live consult session. Attorney/reviewer only — not client-visible. */
export interface ConsultNote {
  id: string;
  consult_request_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

export type ConsultTranscriptStatus = "pending" | "processing" | "ready" | "failed";

/** Audio recording of a consult, transcribed after the call. Attorney/reviewer only — not client-visible. */
export interface ConsultRecording {
  id: string;
  consult_request_id: string;
  recorded_by: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  content_sha256: string | null;
  duration_seconds: number | null;
  byte_size: number | null;
  transcript_status: ConsultTranscriptStatus;
  transcript_text: string | null;
  transcript_error: string | null;
  recorded_at: string;
  transcribed_at: string | null;
}

// All supported wizard types — add new ones here as wizards are built
export type WizardType =
  | "demand_letter"
  | "complaint_letter"
  | "draft_contract"
  | "draft_waiver"
  | "wills_trusts"
  | "doc_review"
  | "general_document"
  | "improve_draft";

/** Child documents created during attorney review (not wizard-generated). */
export type DerivedDocType = "critical_review" | "second_draft";

export type DocType = WizardType | DerivedDocType;

export type DocumentStatus =
  | "pre_warmed"
  | "draft"
  | "pending_review"
  | "approved"
  | "changes_requested"
  | "delivered";

export type BrainstormMessageRole = "user" | "assistant";

/** Attorney-only sounding-board chat scoped to a case file. Never client-visible. */
export interface CaseBrainstormMessage {
  id: string;
  case_file_id: string;
  author_id: string | null;
  role: BrainstormMessageRole;
  content: string;
  /** Set once the attorney has applied this message's proposed Living File/strategy update, if any. */
  applied_at: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  is_attorney: boolean;
  account_type: AccountType;
  attorney_user_status: AttorneyUserStatus | null;
  bar_number: string | null;
  firm_name: string | null;
  /** US state code (or OTHER) for UPL / jurisdiction notices. */
  home_state?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  current_period_end: string | null;
  created_at: string;
}

/**
 * One planned document in a file's strategy. The identity is the stable `key`
 * (a slug derived from the title), NOT the drafting `engine` — so two custom
 * documents that both use the `general_document` engine are still tracked
 * separately. The `engine` only selects interview hints / formatting.
 */
export interface PlanEntry {
  /** Stable slug identity — preserved across strategy re-parses. */
  key: string;
  /** Human-readable document name shown to the user (e.g. "LLC Operating Agreement"). */
  title: string;
  /** Which wizard engine drafts/formats this document. */
  engine: WizardType;
  /** One-line reason this document matters / why its priority. */
  rationale?: string;
}

export interface LegalStrategy {
  summary: string;
  instruments: string[];
  strengths: string[];
  risks: string[];
  /**
   * @deprecated Superseded by `document_plan`. Still derived (unique engines, in
   * order) for back-compat readers; new code should read `document_plan`.
   */
  recommended_wizards: WizardType[];
  recommend_consult?: boolean;
  /** Ordered list of the file's planned documents — the source of truth for tracking. */
  document_plan?: PlanEntry[];
  /** Attorney's override of the lead document, by PlanEntry.key. null = AI's pick. */
  lead_key_override?: string | null;
  /**
   * @deprecated Legacy lead override by wizard type, used only on the pre-
   * `document_plan` path. `lead_key_override` supersedes it.
   */
  lead_override?: WizardType | null;
  /** One-line rationale for why the lead document is the priority. */
  lead_rationale?: string;
  /** Client-facing adversarial stress test (lib/strength-check.ts). Stored here
   *  (JSONB) so it needs no migration; file-parser preserves it across strategy
   *  rewrites. */
  strength_check?: import("./strength-check-types.ts").StrengthCheck;
}

/**
 * How a client's privileged chat behaves:
 * - "intake"    — guided, one focused question at a time, Living File accretes.
 * - "freestyle" — talk-to-Claude: full answers, wide-ranging discussion, and
 *   inline drafting. Still ACP-protected; still able to update the Living File.
 */
export type ChatMode = "intake" | "freestyle";

export interface CaseFile {
  id: string;
  user_id: string;
  matter_type: MatterType | null;
  matter_subtype: string | null;
  status: CaseStatus;
  file_type: CaseFileType;
  /** Persisted chat mode so reopening a file resumes where the client left off. */
  chat_mode?: ChatMode;
  /** created_at of the last intake message the Living File extractor has folded
   *  into the file. The background sweep reads only messages newer than this. */
  last_file_synced_at?: string | null;
  /** UUID tie-breaker paired with last_file_synced_at for a stable cursor. */
  last_file_synced_message_id?: string | null;
  /** True when the reviewing attorney created this file to onboard a client from
   *  their own practice (file is owned by the attorney's account). */
  created_by_attorney?: boolean;
  /** Real client's display name / email for an attorney-onboarded file. */
  client_display_name?: string | null;
  client_email?: string | null;
  title: string | null;
  archive_at: string | null;
  pre_consult_memo: string | null;
  goals: string[];
  summary: string | null;
  legal_strategy: LegalStrategy | null;
  attorney_assessment: string | null;
  next_action: string | null;
  jurisdiction: string | null;
  /** Organized digest of the attorney's last freestyle session (Stage 39).
   *  Attorney-facing working notes; written when they leave freestyle mode. */
  attorney_workspace_summary?: string | null;
  attorney_workspace_summarized_at?: string | null;
  /** Plain-language recap of the client's last freestyle session (Stage 43),
   *  distilled when they leave the mode and shown on their Living File. */
  chat_session_summary?: string | null;
  chat_session_summarized_at?: string | null;
  /** Financial Picture — per-matter representation context (Stage 23). Optional
   *  so rows predating the migration still load. */
  representation_scope?: RepresentationScope;
  partner_role?: PartnerRole;
  partner_consented?: boolean;
  joint_no_secrets_ack?: boolean;
  financial_disclosure_acked_at?: string | null;
  financial_disclosure_version?: string | null;
  /** When the client completed the existing-counsel intake questionnaire. */
  counsel_intake_at?: string | null;
  /** null = not asked yet; false = no other attorney; true = has other counsel. */
  has_existing_counsel?: boolean | null;
  existing_counsel_name?: string | null;
  counsel_engagement_goal?: CounselEngagementGoal | null;
  opened_at: string;
  updated_at: string;
}

/** Why a client with existing counsel is using Instant Attorney. */
export type CounselEngagementGoal =
  | "understand_situation"
  | "document_review"
  | "prepare_for_meeting"
  | "second_opinion";

// ── Financial Picture (asset-dependent matters) ──────────────────────────────
// Milestone 1 of docs/financial-picture-spec.md. A structured sibling to
// fact_items for matters whose strategy/documents depend on assets, debts, or
// income — carrying the three metadata axes (ownership+relationship,
// provenance+verification, phase+privilege).

export type RepresentationScope = "single_client" | "joint_spouses";
export type PartnerRole = "none" | "adverse_party" | "joint_client" | "non_client_third_party";

export type FinancialCategory =
  | "real_property"
  | "vehicle"
  | "financial_account"
  | "retirement_account"
  | "business_interest"
  | "personal_property"
  | "life_insurance"
  | "receivable"
  | "secured_debt"
  | "unsecured_debt"
  | "income_source"
  | "recurring_expense";
export type FinancialOwner = "client" | "partner" | "joint" | "other_third_party";
export type Characterization =
  | "community"
  | "separate_client"
  | "separate_partner"
  | "mixed_or_unknown"
  | "not_applicable";
export type ExemptStatus = "exempt" | "non_exempt" | "partial" | "unknown" | "not_applicable";
export type ValueBasis =
  | "client_estimate"
  | "account_statement"
  | "appraisal"
  | "tax_assessment"
  | "contract_or_title"
  | "other_document";
export type FinancialProvenance = "client_asserted" | "document_extracted" | "attorney_verified";
export type VerificationStatus = "unverified" | "doc_supported" | "attorney_verified";
export type PhaseCollected = "phase_1_unprivileged" | "phase_2_privileged";
export type FinancialItemStatus = "active" | "superseded" | "removed";

export interface FinancialRedFlag {
  code: string;
  severity: "info" | "warn" | "critical";
  message: string;
}

// Encrypted identifier vault (Stage 24 / Milestone 5). The plaintext/ciphertext
// never leave the server; clients only ever see this metadata.
export type SecureRefKind = "ssn" | "account_number" | "routing_number" | "policy_number" | "other";
export interface SecureRefMeta {
  id: string;
  financial_item_id: string;
  kind: SecureRefKind;
  /** Redacted tail only (e.g. "4321") — never the full value. */
  last4: string | null;
  created_at?: string;
}

export interface FinancialItem {
  id: string;
  case_file_id: string;
  user_id: string;
  category: FinancialCategory;
  /** Minimized, human-readable, redacted label (e.g. "Chase checking ••4321"). */
  label: string;
  /** When/how acquired and with what funds — the basis for TX characterization/tracing. */
  acquisition_note: string | null;
  owner: FinancialOwner;
  characterization: Characterization;
  exempt_status: ExemptStatus;
  value_low: number | null;
  value_high: number | null;
  value_basis: ValueBasis;
  valued_as_of: string | null;
  provenance: FinancialProvenance;
  verification_status: VerificationStatus;
  source_attachment_id: string | null;
  phase_collected: PhaseCollected;
  privileged: boolean;
  red_flags: FinancialRedFlag[];
  needs_attorney_review: boolean;
  status: FinancialItemStatus;
  superseded_by: string | null;
  created_at: string;
  updated_at?: string;
}

export interface FactItem {
  id: string;
  case_file_id: string;
  user_id: string;
  description: string;
  status: FactStatus;
  /**
   * "fact" (default) for asserted facts; "hypothetical" for What-If Game answers,
   * which are the client's stated intentions for "what if…" scenarios — NOT facts
   * that have occurred. Optional so rows from a DB predating the column still load.
   */
  kind?: FactKind;
  created_at: string;
  /**
   * Bumped whenever the item changes (gap answered, What-If answer revised). Set
   * by the DB default on insert, so it equals created_at for brand-new items.
   * Optional so rows from a DB predating the column still load.
   */
  updated_at?: string;
}

// ── Government form instruments ──────────────────────────────────────────────
// A government form detected in chat that the client needs to complete. These are
// surfaced as "legal instruments to complete" and guided by the gov-form tool
// (distinct from the document-generation wizard). See lib/government-forms.ts.
export type GovFormStatus = "needed" | "in_progress" | "completed" | "dismissed";

/** How an instrument's form definition is sourced. "registry" forms are curated
 * and source-verified; "dynamic" forms were detected in chat but not seeded —
 * their definition is looked up from the official .gov page and always shown as
 * unverified. */
export type GovFormSource = "registry" | "dynamic";

/** Lifecycle of the grounded lookup for a dynamic form. */
export type GovFormLookupStatus = "pending" | "ready" | "failed";

/** Lifecycle of an uploaded PDF template: no template yet -> (acroform) field
 * map awaiting confirmation -> fillable -> (flat) no auto-fill support yet. */
export type PdfStatus = "needs_template" | "mapping" | "ready" | "unsupported";

/** Detected shape of an uploaded PDF template. */
export type PdfMode = "acroform" | "flat";

export interface GovFormInstrument {
  id: string;
  case_file_id: string;
  user_id: string;
  /** Stable key — into the GOVERNMENT_FORMS registry for "registry" forms, or a
   * generated slug for "dynamic" forms. */
  form_key: string;
  status: GovFormStatus;
  /** Plain-language reason this form was surfaced for this client. */
  reason: string | null;
  /** Field name → client-provided answer, filled in by the guided tool. */
  answers: Record<string, unknown>;
  source: GovFormSource;
  /** Grounded definition for dynamic forms (null for registry forms). Shaped like
   * a GovernmentForm; see lib/government-forms.ts. */
  form_def: GovFormDefinition | null;
  lookup_status: GovFormLookupStatus | null;
  /** Null until the client uploads the official PDF for this form. */
  pdf_status: PdfStatus | null;
  pdf_mode: PdfMode | null;
  /** Storage path in the gov-form-templates bucket. */
  pdf_template_path: string | null;
  /** GovFormField.name -> PDF AcroForm field name (acroform templates only). */
  pdf_field_map: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

/** Structural shape of a stored dynamic form definition. Mirrors GovernmentForm
 * in lib/government-forms.ts without creating an import cycle. */
export interface GovFormDefinition {
  key: string;
  form_number: string;
  title: string;
  agency: string;
  jurisdiction: string;
  state_specific: boolean;
  official_url: string;
  revision: string;
  purpose: string;
  who_needs_it: string;
  deadline: string;
  fee: string;
  submit_to: string;
  fields: Array<{
    name: string;
    label: string;
    type: string;
    help?: string;
    options?: string[];
    required?: boolean;
  }>;
  common_mistakes: string[];
  triggers: string[];
}

// ── Form screenshot verification ─────────────────────────────────────────────
// Fallback path for a government form instrument (see above) when the client
// fills it out by hand instead of a fillable PDF: they upload photos/screenshots
// of the completed form and the AI compares what it reads against `answers`.
export type FormVerificationStatus = "processing" | "verified" | "mismatch" | "needs_review" | "failed";

export interface FieldVerificationResult {
  field: string;
  label: string;
  expected: string;
  /** What the AI read on the page for this field, or null if not found/legible. */
  seen: string | null;
  match: boolean;
  note?: string;
}

export interface FormVerification {
  id: string;
  form_instrument_id: string;
  case_file_id: string;
  user_id: string;
  storage_paths: string[];
  status: FormVerificationStatus;
  summary: string | null;
  field_results: FieldVerificationResult[];
  created_at: string;
  updated_at: string;
}

export interface IntakeMessage {
  id: string;
  case_file_id: string;
  user_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
}

/** A file the attorney dropped into a freestyle message, kept as work-product. */
export interface WorkspaceAttachmentRef {
  fileName: string;
  storagePath: string;
  mimeType: string;
}

/**
 * An attorney's freestyle work-product message, scoped to a client's case file
 * for context but kept OUT of the client's privileged intake_messages record.
 * Only the authoring attorney can read these rows.
 */
export interface AttorneyWorkspaceMessage {
  id: string;
  case_file_id: string;
  attorney_id: string;
  role: MessageRole;
  content: string;
  /** Files the attorney attached inline to this turn (work-product). */
  attachments?: WorkspaceAttachmentRef[];
  created_at: string;
}

/**
 * A freestyle side-panel draft — a working document the associate produced or the
 * attorney started by hand during a freestyle session. Attorney work-product,
 * editable and downloadable in place. NOT the client's `documents` record.
 */
export interface AttorneyWorkspaceDraft {
  id: string;
  case_file_id: string;
  attorney_id: string;
  title: string;
  content: string;
  source: "assistant" | "attorney";
  created_at: string;
  updated_at: string;
}

/**
 * The consumer-side equivalent: a working draft produced (or hand-started) in a
 * client's free-form freestyle session, editable and downloadable in the panel.
 * A potential deliverable — `promoted_document_id` is set once the client sends
 * it into the documents -> attorney-review pipeline.
 */
export interface ClientWorkspaceDraft {
  id: string;
  case_file_id: string;
  user_id: string;
  title: string;
  content: string;
  source: "assistant" | "client";
  promoted_document_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  case_file_id: string;
  user_id: string;
  parent_document_id: string | null;
  doc_type: DocType;
  title: string;
  status: DocumentStatus;
  content_json: Record<string, unknown>;
  draft_text: string | null;
  file_path: string | null;
  attorney_notes: string | null;
  attorney_second_draft_prompt: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_at: string | null;
  review_report: string | null;
  improved_draft_text: string | null;
  review_status: ReviewStatus | null;
  created_at: string;
  updated_at: string;
  /**
   * The moment this draft was last generated/regenerated against the file's
   * facts. A document is "out of date" when any of the case's fact_items changed
   * after this timestamp. Optional/nullable: rows from a DB predating the
   * `facts_synced_at` column load as undefined and are treated as NOT out of date
   * (see isDocumentOutOfDate), so nothing is falsely flagged before the migration
   * runs or before a draft has been (re)generated.
   */
  facts_synced_at?: string | null;
}

/**
 * One immutable audit/snapshot row per document download (schema-stage27). Records
 * what was delivered to the client — review status, watermark state, who pulled
 * it, a SHA-256 of the exact bytes, and a pointer to the byte-for-byte archived
 * .docx. Written service-role only; see lib/document-delivery.ts.
 */
export interface DocumentDelivery {
  id: string;
  document_id: string;
  case_file_id: string;
  user_id: string | null;
  downloaded_by: string | null;
  downloaded_by_is_attorney: boolean;
  document_status: DocumentStatus | null;
  watermarked: boolean;
  content_sha256: string;
  byte_size: number | null;
  storage_bucket: string | null;
  storage_path: string | null;
  created_at: string;
}

/**
 * The most recent moment any fact item changed (created or updated), as a
 * millisecond timestamp, or null when there are none / no parseable timestamps.
 * Uses updated_at when present (it's bumped on gap answers and What-If revisions)
 * and falls back to created_at for new items or DBs predating updated_at.
 */
export function latestFactChangeAt(
  facts: Pick<FactItem, "created_at" | "updated_at">[]
): number | null {
  let max: number | null = null;
  for (const f of facts) {
    const t = Date.parse(f.updated_at ?? f.created_at);
    if (!Number.isNaN(t) && (max === null || t > max)) max = t;
  }
  return max;
}

/**
 * True when `doc` was generated before the file's facts last changed — i.e. the
 * draft no longer reflects the current Living File. Degrades safely: a document
 * with no facts_synced_at (NULL/undefined — pre-migration or never regenerated)
 * is never reported out of date.
 */
export function isDocumentOutOfDate(
  doc: Pick<Document, "facts_synced_at">,
  facts: Pick<FactItem, "created_at" | "updated_at">[]
): boolean {
  if (!doc.facts_synced_at) return false;
  const synced = Date.parse(doc.facts_synced_at);
  if (Number.isNaN(synced)) return false;
  const latest = latestFactChangeAt(facts);
  return latest !== null && latest > synced;
}

// Human-readable labels for wizard types
export const WIZARD_LABELS: Record<WizardType, string> = {
  demand_letter: "Demand Letter",
  complaint_letter: "Complaint Letter",
  draft_contract: "Draft Contract",
  draft_waiver: "Draft Waiver",
  wills_trusts: "Wills & Trusts",
  doc_review: "Document Review",
  general_document: "Legal Document",
  improve_draft: "Improve My Draft",
};

export const DERIVED_DOC_LABELS: Record<DerivedDocType, string> = {
  critical_review: "Critical Review Memo",
  second_draft: "Revised Draft",
};

export function docTypeLabel(docType: string): string {
  if (docType in WIZARD_LABELS) return WIZARD_LABELS[docType as WizardType];
  if (docType in DERIVED_DOC_LABELS) return DERIVED_DOC_LABELS[docType as DerivedDocType];
  return docType.replace(/_/g, " ");
}

/**
 * Resolve a person's display name. `full_name` is collected at registration, but
 * legacy/seed accounts can have an empty string (not null), which the `??`
 * operator does not treat as missing — that left the attorney views showing a
 * blank Client column. Trim and fall back to email, then to `fallback`.
 */
export function personDisplayName(
  profile: { full_name?: string | null; email?: string | null } | null | undefined,
  fallback = "Unknown",
): string {
  const name = profile?.full_name?.trim();
  if (name) return name;
  const email = profile?.email?.trim();
  if (email) return email;
  return fallback;
}

/**
 * Normalize a possibly-annotated recommendation to a clean WizardType.
 * The model sometimes emits bullets like `draft_contract — ready to proceed`
 * or `RECOMMEND_CONSULT: true`; we take the leading identifier token and
 * keep it only if it maps to a real wizard type. Returns null otherwise.
 */
export function isValidWizardType(type: string): type is WizardType {
  return type in WIZARD_LABELS;
}

export function coerceWizardType(raw: string | null | undefined): WizardType | null {
  if (!raw) return null;
  const token = raw.trim().split(/[^a-zA-Z_]/)[0]?.toLowerCase();
  return token && token in WIZARD_LABELS ? (token as WizardType) : null;
}

export function isPrimaryDraft(doc: Pick<Document, "parent_document_id">): boolean {
  return !doc.parent_document_id;
}

export interface Attachment {
  id: string;
  case_file_id: string;
  user_id: string;
  // Set when the attachment is an inline chat screenshot; null for dashboard uploads.
  message_id: string | null;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  attachment_type: AttachmentType;
  status: AttachmentStatus;
  ai_summary: string | null;
  case_relevance: string | null;
  key_sections: string[];
  urgent_findings: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequestedAttachment {
  id: string;
  case_file_id: string;
  user_id: string;
  description: string;
  reason: string | null;
  status: RequestedAttachmentStatus;
  fulfilled_by: string | null;
  source: "ai" | "attorney";
  created_at: string;
}

export interface UsageEvent {
  id: string;
  user_id: string;
  actor_id: string | null;
  case_file_id: string | null;
  category: "ai" | "storage" | "infra";
  feature: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  bytes: number | null;
  cost_usd: number;
  billable: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface UsagePeriodTotal {
  user_id: string;
  period_start: string;
  period_end: string;
  ai_cost_usd: number;
  storage_cost_usd: number;
  infra_cost_usd: number;
  total_cost_usd: number;
  event_count: number;
  updated_at: string;
}

// ── Attorney comments & concerns on a document (document_comments) ──────────
export interface DocumentComment {
  id: string;
  document_id: string;
  author_id: string | null;
  body: string;
  resolved: boolean;
  created_at: string;
  updated_at: string;
}

// ── Attorney review orchestrator (schema-stage44) ───────────────────────────
export type ReviewRunStatus =
  | "queued"
  | "running"
  | "awaiting_attorney"
  | "complete"
  | "failed";

export interface DocumentReviewRun {
  id: string;
  document_id: string;
  case_file_id: string;
  status: ReviewRunStatus;
  stage: string | null;
  error: string | null;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export type ImprovementKind =
  | "blocking"
  | "goal_gap"
  | "clarity"
  | "risk"
  | "compliance"
  | "citation";
export type ImprovementSeverity = "high" | "medium" | "low";
export type ImprovementStatus = "proposed" | "accepted" | "rejected" | "superseded";

export interface DocumentImprovement {
  id: string;
  run_id: string;
  document_id: string;
  seq: number;
  section: string | null;
  kind: ImprovementKind;
  severity: ImprovementSeverity;
  title: string;
  rationale: string;
  proposed_change: string;
  status: ImprovementStatus;
  created_at: string;
}

// ── Authorities QA gate (schema-stage45) ────────────────────────────────────
export type CitationType = "case" | "statute" | "rule" | "other";
export type CitationVerdict = "verified" | "unverified" | "unsupported" | "error";

export interface DocumentQaCitation {
  id: string;
  run_id: string;
  document_id: string;
  raw: string;
  citation_type: CitationType;
  claim: string;
  verdict: CitationVerdict;
  evidence: string;
  source_url: string | null;
  waived: boolean;
  waived_at: string | null;
  created_at: string;
}

/** A citation blocks approval when it is not verified and not waived. */
export function citationBlocksApproval(c: Pick<DocumentQaCitation, "verdict" | "waived">): boolean {
  return !c.waived && c.verdict !== "verified";
}

// The bypass user used in dev when BYPASS_AUTH=true
export const BYPASS_USER_ID = "00000000-0000-0000-0000-000000000001";
export const BYPASS_EMAIL = "test@instant-attorney.dev";

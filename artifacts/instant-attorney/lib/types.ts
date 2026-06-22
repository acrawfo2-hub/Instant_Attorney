export type SubscriptionStatus = "active" | "canceled" | "past_due" | "trialing" | "bypass";
export type SubscriptionPlan = "phase2" | "consult";
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
  created_at: string;
  updated_at: string;
}

// All supported wizard types — add new ones here as wizards are built
export type WizardType =
  | "demand_letter"
  | "complaint_letter"
  | "draft_contract"
  | "draft_waiver"
  | "wills_trusts"
  | "doc_review"
  | "general_document";

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

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  is_attorney: boolean;
  auto_document_review: boolean;
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

export interface LegalStrategy {
  summary: string;
  instruments: string[];
  strengths: string[];
  risks: string[];
  recommended_wizards: WizardType[];
  recommend_consult?: boolean;
}

export interface CaseFile {
  id: string;
  user_id: string;
  matter_type: MatterType | null;
  matter_subtype: string | null;
  status: CaseStatus;
  file_type: CaseFileType;
  title: string | null;
  archive_at: string | null;
  pre_consult_memo: string | null;
  goals: string[];
  summary: string | null;
  legal_strategy: LegalStrategy | null;
  attorney_assessment: string | null;
  next_action: string | null;
  jurisdiction: string | null;
  opened_at: string;
  updated_at: string;
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

export interface IntakeMessage {
  id: string;
  case_file_id: string;
  user_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
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

// The bypass user used in dev when BYPASS_AUTH=true
export const BYPASS_USER_ID = "00000000-0000-0000-0000-000000000001";
export const BYPASS_EMAIL = "test@instant-attorney.dev";

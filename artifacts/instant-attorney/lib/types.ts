export type SubscriptionStatus = "active" | "canceled" | "past_due" | "trialing" | "bypass";
export type SubscriptionPlan = "phase2" | "consult";
export type MatterType = "reactive" | "preventive";
export type CaseStatus = "open" | "closed" | "referred" | "archived";
export type CaseFileType = "standard" | "quick_consult";
export type FactStatus = "confirmed" | "gap";
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
  | "intake_summary"
  | "demand_letter"
  | "complaint_letter"
  | "draft_contract"
  | "draft_waiver"
  | "wills_trusts"
  | "doc_review";

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
  created_at: string;
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
  intake_summary: "Intake Summary",
  demand_letter: "Demand Letter",
  complaint_letter: "Complaint Letter",
  draft_contract: "Draft Contract",
  draft_waiver: "Draft Waiver",
  wills_trusts: "Wills & Trusts",
  doc_review: "Document Review",
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

export function isPrimaryDraft(doc: Pick<Document, "parent_document_id">): boolean {
  return !doc.parent_document_id;
}

export interface Attachment {
  id: string;
  case_file_id: string;
  user_id: string;
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

// The bypass user used in dev when BYPASS_AUTH=true
export const BYPASS_USER_ID = "00000000-0000-0000-0000-000000000001";
export const BYPASS_EMAIL = "test@instant-attorney.dev";

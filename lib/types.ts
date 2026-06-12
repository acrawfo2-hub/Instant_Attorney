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

// All supported wizard types — add new ones here as wizards are built
export type WizardType =
  | "intake_summary"
  | "demand_letter"
  | "complaint_letter"
  | "draft_contract"
  | "draft_waiver"
  | "wills_trusts"
  | "doc_review";

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
  instruments: string[];       // suggested document types / legal instruments
  strengths: string[];
  risks: string[];
  recommended_wizards: WizardType[];
  recommend_consult?: boolean;  // true when the AI determines a live attorney consult is warranted
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
  goals: string[];
  summary: string | null;
  legal_strategy: LegalStrategy | null;
  attorney_assessment: string | null;
  next_action: string | null;
  jurisdiction: string | null;
  pre_consult_memo: string | null;
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

export type ReviewStatus = "reviewing" | "review_ready" | "merging" | "merged";

export type ConsultStatus = "pending" | "confirmed" | "attorney_proposed" | "cancelled" | "completed";

export interface ConsultRequest {
  id: string;
  user_id: string;
  case_file_id: string | null;
  status: ConsultStatus;
  proposed_times: string[];          // ISO timestamps — client's 3 picks
  confirmed_time: string | null;
  attorney_proposed_time: string | null;
  client_phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  case_file_id: string;
  user_id: string;
  doc_type: WizardType;
  title: string;
  status: DocumentStatus;
  content_json: Record<string, unknown>;
  draft_text: string | null;
  file_path: string | null;
  attorney_notes: string | null;
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

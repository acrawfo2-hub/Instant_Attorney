import { createServiceClient } from "@/lib/supabase/server";

export const TICKET_STATUSES = [
  "new",
  "in_progress",
  "waiting",
  "resolved",
  "closed",
] as const;
export const TICKET_PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export interface SupportTicketRow {
  id: string;
  ticket_number: number;
  user_id: string | null;
  requester_email: string;
  category: string;
  subject: string;
  description: string;
  page_path: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  resolution_summary: string | null;
  admin_notes: string | null;
  diagnostics: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function loadSupportQueue(): Promise<{
  tickets: SupportTicketRow[];
  error: string | null;
}> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("support_tickets")
    .select(
      "id, ticket_number, user_id, requester_email, category, subject, description, page_path, status, priority, resolution_summary, admin_notes, diagnostics, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  return {
    tickets: error ? [] : ((data ?? []) as SupportTicketRow[]),
    error: error?.message ?? null,
  };
}

export function validateTicketUpdate(
  input: unknown,
): {
  status: TicketStatus;
  priority: TicketPriority;
  adminNotes: string;
  resolutionSummary: string;
} | null {
  if (!input || typeof input !== "object") return null;
  const body = input as Record<string, unknown>;
  if (
    !TICKET_STATUSES.includes(body.status as TicketStatus) ||
    !TICKET_PRIORITIES.includes(body.priority as TicketPriority)
  )
    return null;
  const adminNotes =
    typeof body.adminNotes === "string"
      ? body.adminNotes.trim().slice(0, 4000)
      : "";
  const resolutionSummary =
    typeof body.resolutionSummary === "string"
      ? body.resolutionSummary.trim().slice(0, 2000)
      : "";
  if (
    (body.status === "resolved" || body.status === "closed") &&
    resolutionSummary.length < 10
  )
    return null;
  return {
    status: body.status as TicketStatus,
    priority: body.priority as TicketPriority,
    adminNotes,
    resolutionSummary,
  };
}

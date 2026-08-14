import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { recordAdminAction } from "@/lib/admin/audit";
import { validateTicketUpdate } from "@/lib/admin/support-desk";
import { createServiceClient } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const update = validateTicketUpdate(await request.json().catch(() => null));
  if (!update)
    return NextResponse.json(
      {
        error:
          "Choose a valid status and priority. Resolved tickets need a resolution summary.",
      },
      { status: 400 },
    );
  const { id } = await params;
  const db = createServiceClient();
  const { data: existing } = await db
    .from("support_tickets")
    .select("ticket_number, user_id, requester_email, status")
    .eq("id", id)
    .maybeSingle();
  if (!existing)
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("support_tickets")
    .update({
      status: update.status,
      priority: update.priority,
      admin_notes: update.adminNotes || null,
      resolution_summary: update.resolutionSummary || null,
      assigned_admin_id: admin.userId,
      first_response_at:
        existing.status === "new" && update.status !== "new" ? now : undefined,
      resolved_at:
        update.status === "resolved" || update.status === "closed" ? now : null,
      updated_at: now,
    })
    .eq("id", id)
    .select("id, status, priority, updated_at")
    .single();
  await recordAdminAction({
    actorId: admin.userId,
    actorEmail: admin.email,
    actorVia: admin.via,
    action: "support.ticket.update",
    targetUserId: existing.user_id,
    targetEmail: existing.requester_email,
    reason:
      update.resolutionSummary ||
      update.adminNotes ||
      `Moved IA-${existing.ticket_number} to ${update.status}`,
    detail: {
      ticketId: id,
      ticketNumber: existing.ticket_number,
      fromStatus: existing.status,
      toStatus: update.status,
      priority: update.priority,
    },
    outcome: error ? "failed" : "ok",
    error: error?.message ?? null,
  });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ticket: data });
}

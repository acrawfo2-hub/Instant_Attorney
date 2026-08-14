import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  categoryPriority,
  validateSupportTicket,
  type SupportTicketInput,
} from "@/lib/support/tickets";
import { notifyAdminSupportTicket } from "@/lib/notify";

export async function POST(request: Request) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json")
  )
    return NextResponse.json({ error: "Expected JSON." }, { status: 415 });
  const input = (await request
    .json()
    .catch(() => null)) as SupportTicketInput | null;
  const validated = input
    ? validateSupportTicket(input)
    : { ok: false as const, error: "Invalid request." };
  if (!validated.ok)
    return NextResponse.json({ error: validated.error }, { status: 400 });

  const db = createServiceClient();
  const session = await createClient();
  const { data: auth } = await session.auth.getUser();
  const { data: profile } = await db
    .from("profiles")
    .select("id")
    .eq("email", validated.ticket.email)
    .maybeSingle();
  const authEmailMatches =
    auth.user?.email?.toLowerCase() === validated.ticket.email;
  const userId = authEmailMatches
    ? (auth.user?.id ?? null)
    : (profile?.id ?? null);

  // Durable per-address throttle. It works across server instances and does not retain IPs.
  const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await db
    .from("support_tickets")
    .select("*", { count: "exact", head: true })
    .eq("requester_email", validated.ticket.email)
    .gte("created_at", oneHourAgo);
  if ((count ?? 0) >= 3)
    return NextResponse.json(
      {
        error:
          "We already received several requests for this email. Please wait for the support team to respond.",
      },
      { status: 429 },
    );

  const { data, error } = await db
    .from("support_tickets")
    .insert({
      user_id: userId,
      requester_email: validated.ticket.email,
      category: validated.ticket.category,
      subject: validated.ticket.subject,
      description: validated.ticket.description,
      page_path: validated.ticket.pagePath,
      priority: categoryPriority(validated.ticket.category),
      diagnostics: {
        submitted_authenticated: Boolean(auth.user),
        auth_email_matches: authEmailMatches,
      },
    })
    .select("ticket_number")
    .single();
  if (error) {
    console.error("[support] ticket insert failed:", error.message);
    return NextResponse.json(
      {
        error: "Support is temporarily unavailable. Please try again shortly.",
      },
      { status: 503 },
    );
  }
  await notifyAdminSupportTicket({
    ticketNumber: data.ticket_number,
    email: validated.ticket.email,
    subject: validated.ticket.subject,
    priority: categoryPriority(validated.ticket.category),
  }).catch((notifyError) =>
    console.error("[support] admin notification failed:", notifyError),
  );
  return NextResponse.json(
    {
      ticketNumber: data.ticket_number,
      message: `Request IA-${data.ticket_number} was sent to the support desk.`,
    },
    { status: 201 },
  );
}

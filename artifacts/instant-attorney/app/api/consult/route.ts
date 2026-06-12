import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { notifyAttorneyConsultRequest } from "@/lib/notify";
import { BYPASS_USER_ID } from "@/lib/types";
import type { ConsultRequest, Profile } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// Validate a time is Mon–Fri 8am–8pm CST and ≥24h from now
function isValidSlot(iso: string): boolean {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  if (d.getTime() < Date.now() + 24 * 60 * 60 * 1000) return false;

  // Check day-of-week and hour in CST
  const cstStr = d.toLocaleString("en-US", { timeZone: "America/Chicago", hour12: false,
    weekday: "short", hour: "numeric", minute: "numeric" });
  // Parse: "Mon, 10:00" etc. — use Intl.DateTimeFormat parts for precision
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(d);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0");

  const isWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday ?? "");
  const minuteVal = hour * 60 + minute;
  // 8:00am = 480, 8:00pm = 1200 (last 30-min slot starts 19:30 = 1170)
  return isWeekday && minuteVal >= 480 && minuteVal <= 1170 && (minuteVal % 30 === 0);
}

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let userId: string;

  if (BYPASS_AUTH) {
    db = createServiceClient();
    userId = BYPASS_USER_ID;
  } else {
    db = await createClient();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;
  }

  const { data } = await db
    .from("consult_requests")
    .select("*")
    .eq("user_id", userId)
    .not("status", "eq", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json(data ?? null);
}

export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let userId: string;

  if (BYPASS_AUTH) {
    db = createServiceClient();
    userId = BYPASS_USER_ID;
  } else {
    db = await createClient();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;
  }

  // Subscription gate
  if (!BYPASS_AUTH) {
    const { data: sub } = await db
      .from("subscriptions")
      .select("status, plan")
      .eq("user_id", userId)
      .maybeSingle();
    if (!sub || sub.plan !== "consult" || !["active", "bypass"].includes(sub.status)) {
      return NextResponse.json({ error: "Consult subscription required" }, { status: 403 });
    }
  }

  // No existing active request
  const { data: existing } = await db
    .from("consult_requests")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["pending", "confirmed", "attorney_proposed"])
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "You already have a pending consult request" }, { status: 409 });
  }

  const { proposedTimes, clientPhone, caseFileId, notes } = await req.json();

  if (!Array.isArray(proposedTimes) || proposedTimes.length !== 3) {
    return NextResponse.json({ error: "Exactly 3 proposed times required" }, { status: 400 });
  }
  if (!clientPhone?.trim()) {
    return NextResponse.json({ error: "Phone number required" }, { status: 400 });
  }
  for (const t of proposedTimes) {
    if (!isValidSlot(t)) {
      return NextResponse.json({ error: `Invalid slot: ${t}. Must be Mon–Fri 8am–8pm CST, at least 24h from now.` }, { status: 400 });
    }
  }

  const { data: inserted, error: insertErr } = await db
    .from("consult_requests")
    .insert({
      user_id: userId,
      case_file_id: caseFileId ?? null,
      proposed_times: proposedTimes,
      client_phone: clientPhone.trim(),
      notes: notes?.trim() ?? null,
    })
    .select("*")
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Notify attorney
  try {
    const { data: profile } = await db.from("profiles").select("*").eq("id", userId).single();
    await notifyAttorneyConsultRequest(inserted as ConsultRequest, profile as Profile);
  } catch (e) {
    console.error("[consult] notify error", e);
  }

  return NextResponse.json(inserted, { status: 201 });
}

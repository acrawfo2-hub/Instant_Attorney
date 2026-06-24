import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  screenMaintenance,
  maintenanceScreenToFact,
  type MaintenanceInput,
} from "@/lib/family-maintenance-calc";
import { BYPASS_USER_ID } from "@/lib/types";

// Texas spousal-maintenance (Chapter 8) eligibility screen.
//
// Pure compute — NO AI call, so it is instant, free, and never touches the token
// meter or billing gate. When tied to an owned case it writes ONE confirmed fact
// (kind='fact') into the Living File so a decree's maintenance terms seed from it.
// It never writes legal_strategy, so the document pipeline is untouched.
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const caseFileId = b.caseFileId;

  const years = Number(b.marriageYears);
  if (!Number.isFinite(years) || years < 0) {
    return NextResponse.json({ error: "Enter the length of the marriage in years." }, { status: 400 });
  }

  const input: MaintenanceInput = {
    marriageYears: years,
    lacksMinimumNeeds: Boolean(b.lacksMinimumNeeds),
    familyViolence: Boolean(b.familyViolence),
    seekingSpouseDisability: Boolean(b.seekingSpouseDisability),
    childWithDisabilityCare: Boolean(b.childWithDisabilityCare),
  };
  if (b.payorAverageMonthlyGrossIncome != null && Number.isFinite(Number(b.payorAverageMonthlyGrossIncome))) {
    input.payorAverageMonthlyGrossIncome = Number(b.payorAverageMonthlyGrossIncome);
  }

  const screen = screenMaintenance(input);

  // ── Without a case file: pure screen, no auth needed ────────────────────────
  if (!caseFileId || typeof caseFileId !== "string") {
    return NextResponse.json({ screen, saved: false });
  }

  // ── With a case file: authenticate, verify ownership, write the fact ────────
  let userId: string;
  const db = BYPASS_AUTH ? createServiceClient() : await createClient();
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const {
      data: { user },
      error,
    } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;

    const { data: ownedCase } = await db
      .from("case_files")
      .select("id")
      .eq("id", caseFileId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!ownedCase) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { label, value } = maintenanceScreenToFact(screen);
  const description = `${label}: ${value}`;
  const prefix = `${label.toLowerCase()}:`;

  const { data: existingRows } = await db
    .from("fact_items")
    .select("id, description")
    .eq("case_file_id", caseFileId)
    .eq("status", "confirmed");
  const existing = (existingRows ?? []) as { id: string; description: string }[];
  const match = existing.find((f) => f.description.toLowerCase().startsWith(prefix));

  let writeError: unknown = null;
  if (match) {
    if (match.description !== description) {
      const stamp = new Date().toISOString();
      let { error } = await db
        .from("fact_items")
        .update({ description, status: "confirmed", kind: "fact", updated_at: stamp })
        .eq("id", match.id);
      if (error) {
        ({ error } = await db
          .from("fact_items")
          .update({ description, status: "confirmed", updated_at: stamp })
          .eq("id", match.id));
      }
      writeError = error;
    }
  } else {
    let { error } = await db
      .from("fact_items")
      .insert({ case_file_id: caseFileId, user_id: userId, description, status: "confirmed", kind: "fact" });
    if (error) {
      ({ error } = await db
        .from("fact_items")
        .insert({ case_file_id: caseFileId, user_id: userId, description, status: "confirmed" }));
    }
    writeError = error;
  }

  if (writeError) {
    console.error("[family/maintenance] fact write failed", writeError);
    return NextResponse.json(
      { screen, saved: false, error: "Screen computed, but couldn't save it to your file. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ screen, saved: true });
}

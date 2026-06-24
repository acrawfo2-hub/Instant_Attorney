import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { runMeansTest, meansTestToFact, type MeansTestInput } from "@/lib/bankruptcy-means-test";
import { BYPASS_USER_ID } from "@/lib/types";

// Chapter 7 means-test (median-income screen).
//
// Pure compute — NO AI call, so it is instant, free, and never touches the token
// meter or billing gate. When tied to an owned case it writes ONE confirmed fact
// (kind='fact') into the Living File so bankruptcy guidance/documents reflect the
// screen result. It never writes legal_strategy, so the document pipeline is
// untouched. Mirrors the family calculators.
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const caseFileId = b.caseFileId;

  const householdSize = Number(b.householdSize);
  if (!Number.isFinite(householdSize) || householdSize < 1) {
    return NextResponse.json({ error: "Enter a household size of at least 1." }, { status: 400 });
  }
  const hasAnnual = b.annualIncome != null && Number.isFinite(Number(b.annualIncome));
  const hasMonthly = b.averageMonthlyIncome != null && Number.isFinite(Number(b.averageMonthlyIncome));
  if (!hasAnnual && !hasMonthly) {
    return NextResponse.json({ error: "Enter your annual or average monthly income." }, { status: 400 });
  }

  const input: MeansTestInput = { householdSize };
  if (hasAnnual) input.annualIncome = Number(b.annualIncome);
  if (hasMonthly) input.averageMonthlyIncome = Number(b.averageMonthlyIncome);
  if (b.medianOverride != null && Number.isFinite(Number(b.medianOverride)) && Number(b.medianOverride) > 0) {
    input.medianOverride = Number(b.medianOverride);
  }

  let result;
  try {
    result = runMeansTest(input);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not run the means test." },
      { status: 400 }
    );
  }

  // ── Without a case file: pure result, no auth needed ────────────────────────
  if (!caseFileId || typeof caseFileId !== "string") {
    return NextResponse.json({ result, saved: false });
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

  const { label, value } = meansTestToFact(result);
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
    console.error("[bankruptcy/means-test] fact write failed", writeError);
    return NextResponse.json(
      { result, saved: false, error: "Result computed, but couldn't save it to your file. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ result, saved: true });
}

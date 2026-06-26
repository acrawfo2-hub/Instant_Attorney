import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  runDisposableIncomeTest,
  disposableIncomeToFact,
  type DisposableIncomeInput,
} from "@/lib/bankruptcy-disposable-income";
import { BYPASS_USER_ID } from "@/lib/types";

// Chapter 7 full means test (§ 707(b)(2) disposable-income determination).
//
// Pure compute — NO AI call, so it is instant, free, and never touches the token
// meter or billing gate. When tied to an owned case it writes ONE confirmed fact
// (kind='fact') into the Living File. It never writes legal_strategy, so the
// document pipeline is untouched. Mirrors the other bankruptcy calculators.
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const caseFileId = b.caseFileId;

  const monthlyCMI = Number(b.monthlyCMI);
  if (!Number.isFinite(monthlyCMI) || monthlyCMI < 0) {
    return NextResponse.json({ error: "Enter your current monthly income." }, { status: 400 });
  }
  const hasTotal = b.monthlyAllowedExpenses != null && Number.isFinite(Number(b.monthlyAllowedExpenses));
  const hasComponents = b.expenseComponents != null && typeof b.expenseComponents === "object";
  if (!hasTotal && !hasComponents) {
    return NextResponse.json({ error: "Enter your allowed monthly expenses." }, { status: 400 });
  }

  const input: DisposableIncomeInput = { monthlyCMI };
  if (hasTotal) input.monthlyAllowedExpenses = Number(b.monthlyAllowedExpenses);
  if (hasComponents) {
    const c = b.expenseComponents as Record<string, unknown>;
    const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
    input.expenseComponents = {
      livingStandards: num(c.livingStandards),
      housingUtilities: num(c.housingUtilities),
      transportation: num(c.transportation),
      taxesAndPayroll: num(c.taxesAndPayroll),
      healthAndInsurance: num(c.healthAndInsurance),
      securedDebtMonthly: num(c.securedDebtMonthly),
      priorityDebtMonthly: num(c.priorityDebtMonthly),
      otherNecessary: num(c.otherNecessary),
    };
  }
  if (b.nonPriorityUnsecuredDebt != null && Number.isFinite(Number(b.nonPriorityUnsecuredDebt))) {
    input.nonPriorityUnsecuredDebt = Number(b.nonPriorityUnsecuredDebt);
  }

  let result;
  try {
    result = runDisposableIncomeTest(input);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not run the test." },
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

  const { label, value } = disposableIncomeToFact(result);
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
    console.error("[bankruptcy/disposable-income] fact write failed", writeError);
    return NextResponse.json(
      { result, saved: false, error: "Result computed, but couldn't save it to your file. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ result, saved: true });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getBillingGate } from "@/lib/topup";
import { getBillingConfig } from "@/lib/billing-config";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

/** Current top-up ledger state for the signed-in customer (drives the UI). */
export async function GET(_req: NextRequest) {
  let userId: string;
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const db = await createClient();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
  }

  const cfg = getBillingConfig();
  const gate = await getBillingGate(userId);

  const serviceDb = createServiceClient();
  const { data: ledger } = await serviceDb
    .from("top_up_ledger")
    .select("meter_usd, status, total_topups, total_topup_usd")
    .eq("user_id", userId)
    .maybeSingle();

  return NextResponse.json({
    allowed: gate.allowed,
    status: gate.status,
    reason: gate.reason ?? null,
    meter_usd: gate.meterUsd,
    threshold_usd: cfg.thresholdUsd,
    charge_usd: cfg.chargeUsd,
    included_allowance_usd: cfg.includedAllowanceUsd,
    lifetime_topups: ledger ? Number(ledger.total_topups) : 0,
    lifetime_topup_usd: ledger ? Number(ledger.total_topup_usd) : 0,
  });
}

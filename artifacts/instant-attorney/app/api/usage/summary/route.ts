import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { computeOverageTiers, resolveBillingPeriod } from "@/lib/usage-tracker";
import { BYPASS_USER_ID } from "@/lib/types";
import type { UsagePeriodTotal } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

/** Read-only usage summary for the current billing period (instrumentation — not billed yet). */
export async function GET(req: NextRequest) {
  const targetUserId = req.nextUrl.searchParams.get("userId");
  let userId: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;

  if (BYPASS_AUTH) {
    db = createServiceClient();
    userId = targetUserId ?? BYPASS_USER_ID;
  } else {
    db = await createClient();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (targetUserId && targetUserId !== user.id) {
      const { data: profile } = await db
        .from("profiles")
        .select("is_attorney")
        .eq("id", user.id)
        .single();
      if (!profile?.is_attorney) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      userId = targetUserId;
    } else {
      userId = user.id;
    }
  }

  const period = await resolveBillingPeriod(db, userId);

  const [{ data: periodTotal }, { data: featureRows }] = await Promise.all([
    db
      .from("usage_period_totals")
      .select("*")
      .eq("user_id", userId)
      .eq("period_start", period.period_start)
      .maybeSingle(),
    db
      .from("usage_events")
      .select("feature, category, cost_usd")
      .eq("user_id", userId)
      .eq("billable", true)
      .gte("created_at", period.period_start)
      .lt("created_at", period.period_end),
  ]);

  const byFeature: Record<string, { cost_usd: number; event_count: number }> = {};
  for (const row of featureRows ?? []) {
    const key = `${row.category}:${row.feature}`;
    if (!byFeature[key]) {
      byFeature[key] = { cost_usd: 0, event_count: 0 };
    }
    byFeature[key].cost_usd += Number(row.cost_usd);
    byFeature[key].event_count += 1;
  }

  const total = periodTotal as UsagePeriodTotal | null;
  const totalCostUsd = total ? Number(total.total_cost_usd) : 0;
  const overageThresholdUsd = Number(process.env.USAGE_OVERAGE_THRESHOLD_USD ?? 4);
  const overageChargeUsd = Number(process.env.USAGE_OVERAGE_CHARGE_USD ?? 5);
  const tiers = computeOverageTiers(totalCostUsd, overageThresholdUsd);

  return NextResponse.json({
    user_id: userId,
    period,
    totals: {
      ai_cost_usd: total ? Number(total.ai_cost_usd) : 0,
      storage_cost_usd: total ? Number(total.storage_cost_usd) : 0,
      infra_cost_usd: total ? Number(total.infra_cost_usd) : 0,
      total_cost_usd: totalCostUsd,
      event_count: total ? total.event_count : 0,
    },
    by_feature: byFeature,
    // Future billing preview — not charged yet
    overage_preview: {
      threshold_usd: overageThresholdUsd,
      charge_per_tier_usd: overageChargeUsd,
      tiers_triggered: tiers,
      estimated_overage_usd: tiers * overageChargeUsd,
      next_tier_at_usd: tiers === 0
        ? overageThresholdUsd
        : overageThresholdUsd * (tiers + 1),
      billing_enabled: false,
    },
  });
}

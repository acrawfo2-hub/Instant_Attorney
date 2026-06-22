import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";

/** Known AI features — used for cost attribution and future billing dashboards. */
export type UsageFeature =
  | "free_chat"
  | "chat_acp"
  | "wizard"
  | "what_if"
  | "title_generator"
  | "attachment_analysis"
  | "auto_critical_review"
  | "attorney_review"
  | "attorney_second_draft_fitness"
  | "attorney_second_draft"
  | "attorney_merge"
  | "attorney_pre_consult"
  | "storage_upload";

export type UsageCategory = "ai" | "storage" | "infra";

/** USD per 1M tokens — update when Anthropic pricing changes. */
const MODEL_PRICING_USD_PER_M: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-opus-4-8": { input: 15, output: 75 },
};

const DEFAULT_MODEL_PRICING = MODEL_PRICING_USD_PER_M["claude-sonnet-4-6"];

/** Amortized monthly storage cost per GB (Supabase overage ~$0.021/GB/mo). */
function storageUsdPerGbMonth(): number {
  const raw = process.env.USAGE_STORAGE_USD_PER_GB_MONTH;
  const parsed = raw ? Number(raw) : 0.021;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0.021;
}

export interface BillingPeriod {
  period_start: string;
  period_end: string;
}

export interface UsageEventInput {
  userId: string;
  actorId?: string | null;
  caseFileId?: string | null;
  category: UsageCategory;
  feature: UsageFeature;
  costUsd: number;
  billable?: boolean;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  bytes?: number | null;
  metadata?: Record<string, unknown>;
}

export function computeAiCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  costMultiplier = 1
): number {
  const pricing = MODEL_PRICING_USD_PER_M[model] ?? DEFAULT_MODEL_PRICING;
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return roundUsd((inputCost + outputCost) * costMultiplier);
}

/** One month of storage cost attributed at upload time (bytes × $/GB/mo). */
export function computeStorageCostUsd(bytes: number): number {
  if (bytes <= 0) return 0;
  const gb = bytes / (1024 ** 3);
  return roundUsd(gb * storageUsdPerGbMonth());
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export async function resolveBillingPeriod(
  db: SupabaseClient,
  userId: string
): Promise<BillingPeriod> {
  const { data: sub } = await db
    .from("subscriptions")
    .select("current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (sub?.current_period_end) {
    const periodEnd = new Date(sub.current_period_end);
    const periodStart = new Date(periodEnd);
    periodStart.setUTCDate(periodStart.getUTCDate() - 30);
    return {
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
    };
  }

  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
  };
}

async function upsertPeriodTotal(
  serviceDb: SupabaseClient,
  userId: string,
  period: BillingPeriod,
  category: UsageCategory,
  costUsd: number
): Promise<void> {
  const { data: existing } = await serviceDb
    .from("usage_period_totals")
    .select("*")
    .eq("user_id", userId)
    .eq("period_start", period.period_start)
    .maybeSingle();

  const aiDelta = category === "ai" ? costUsd : 0;
  const storageDelta = category === "storage" ? costUsd : 0;
  const infraDelta = category === "infra" ? costUsd : 0;

  if (existing) {
    await serviceDb
      .from("usage_period_totals")
      .update({
        ai_cost_usd: roundUsd(Number(existing.ai_cost_usd) + aiDelta),
        storage_cost_usd: roundUsd(Number(existing.storage_cost_usd) + storageDelta),
        infra_cost_usd: roundUsd(Number(existing.infra_cost_usd) + infraDelta),
        total_cost_usd: roundUsd(Number(existing.total_cost_usd) + costUsd),
        event_count: Number(existing.event_count) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("period_start", period.period_start);
    return;
  }

  await serviceDb.from("usage_period_totals").insert({
    user_id: userId,
    period_start: period.period_start,
    period_end: period.period_end,
    ai_cost_usd: aiDelta,
    storage_cost_usd: storageDelta,
    infra_cost_usd: infraDelta,
    total_cost_usd: costUsd,
    event_count: 1,
  });
}

/** Insert a usage event and update period rollups. Failures are logged, never thrown. */
export async function recordUsage(
  db: SupabaseClient,
  input: UsageEventInput
): Promise<void> {
  if (input.costUsd <= 0 && input.category === "ai") {
    return;
  }

  try {
    const serviceDb = createServiceClient();
    const period = await resolveBillingPeriod(db, input.userId);

    await serviceDb.from("usage_events").insert({
      user_id: input.userId,
      actor_id: input.actorId ?? null,
      case_file_id: input.caseFileId ?? null,
      category: input.category,
      feature: input.feature,
      model: input.model ?? null,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      bytes: input.bytes ?? null,
      cost_usd: input.costUsd,
      billable: input.billable ?? true,
      metadata: input.metadata ?? {},
    });

    if (input.billable !== false) {
      await upsertPeriodTotal(serviceDb, input.userId, period, input.category, input.costUsd);
    }
  } catch (err) {
    console.error("[usage-tracker] recordUsage error:", err);
  }
}

export async function recordAiUsage(
  db: SupabaseClient,
  params: {
    userId: string;
    actorId?: string | null;
    caseFileId?: string | null;
    feature: UsageFeature;
    model: string;
    inputTokens: number;
    outputTokens: number;
    billable?: boolean;
    metadata?: Record<string, unknown>;
    /** e.g. 0.5 for Anthropic Message Batches API */
    costMultiplier?: number;
  }
): Promise<void> {
  const costUsd = computeAiCostUsd(
    params.model,
    params.inputTokens,
    params.outputTokens,
    params.costMultiplier ?? 1
  );
  await recordUsage(db, {
    userId: params.userId,
    actorId: params.actorId,
    caseFileId: params.caseFileId,
    category: "ai",
    feature: params.feature,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    costUsd,
    billable: params.billable,
    metadata: params.metadata,
  });
}

export async function recordAiFromMessage(
  db: SupabaseClient,
  message: Pick<Anthropic.Message, "model" | "usage">,
  params: Omit<Parameters<typeof recordAiUsage>[1], "model" | "inputTokens" | "outputTokens">
): Promise<void> {
  await recordAiUsage(db, {
    ...params,
    model: message.model,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  });
}

/** Record token usage after a streaming Anthropic call completes. */
export async function recordAiFromStream(
  db: SupabaseClient,
  stream: { finalMessage(): Promise<Anthropic.Message> },
  params: Omit<Parameters<typeof recordAiUsage>[1], "model" | "inputTokens" | "outputTokens">
): Promise<void> {
  try {
    const message = await stream.finalMessage();
    await recordAiFromMessage(db, message, params);
  } catch (err) {
    console.error("[usage-tracker] recordAiFromStream error:", err);
  }
}

export async function recordStorageUpload(
  db: SupabaseClient,
  params: {
    userId: string;
    actorId?: string | null;
    caseFileId: string;
    bytes: number;
    fileName?: string;
    mimeType?: string;
  }
): Promise<void> {
  const costUsd = computeStorageCostUsd(params.bytes);
  await recordUsage(db, {
    userId: params.userId,
    actorId: params.actorId,
    caseFileId: params.caseFileId,
    category: "storage",
    feature: "storage_upload",
    bytes: params.bytes,
    costUsd,
    metadata: {
      file_name: params.fileName,
      mime_type: params.mimeType,
    },
  });
}

/** Overage tier math for future billing — not charged yet. */
export function computeOverageTiers(totalCostUsd: number, thresholdUsd = 4): number {
  if (totalCostUsd < thresholdUsd) return 0;
  return Math.floor(totalCostUsd / thresholdUsd);
}

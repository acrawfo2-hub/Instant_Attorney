import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { WHAT_IF_SYSTEM_PROMPT, buildFileContext } from "@/lib/prompts";
import { parseWhatIfResponse } from "@/lib/what-if";
import { maxOutputTokensFor } from "@/lib/token-limits";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import { getBillingGate } from "@/lib/topup";
import { BYPASS_USER_ID } from "@/lib/types";
import type { CaseFile, FactItem } from "@/lib/types";

// What-If Game — generates a set of "what if…" strategy scenarios.
//
// Standalone tool: works WITH a case file (reads the Living File for context)
// or WITHOUT one (the user just describes a scenario). It only READS the file;
// it never writes legal_strategy and never touches the wizards. The user's
// answers are persisted later by /api/what-if/apply.
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const MODEL = "claude-sonnet-4-6";

const client = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });

export async function POST(req: NextRequest) {
  const { caseFileId, scenario } = await req.json().catch(() => ({}));
  const scenarioText = typeof scenario === "string" ? scenario.trim() : "";

  if (!caseFileId && !scenarioText) {
    return NextResponse.json(
      { error: "Describe a situation or open this from one of your files." },
      { status: 400 }
    );
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  let userId: string;
  const db = BYPASS_AUTH ? createServiceClient() : await createClient();
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;

    // Pre-call billing gate: block new AI spend while a top-up is pending/failed.
    const gate = await getBillingGate(userId);
    if (!gate.allowed) {
      return NextResponse.json(
        {
          error: "Token top-up required",
          reason: gate.reason,
          meter_usd: gate.meterUsd,
          threshold_usd: gate.thresholdUsd,
        },
        { status: 402 }
      );
    }
  }

  // ── Optional Living File context (read-only) ────────────────────────────────
  let fileContext = "";
  if (caseFileId) {
    // RLS scopes this select to the caller, so a foreign case returns nothing.
    const { data: caseFile } = await db
      .from("case_files")
      .select("*")
      .eq("id", caseFileId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!caseFile) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { data: factRows } = await db
      .from("fact_items")
      .select("*")
      .eq("case_file_id", caseFileId);
    fileContext = buildFileContext(caseFile as CaseFile, (factRows ?? []) as FactItem[]);
  }

  // ── Build the prompt ────────────────────────────────────────────────────────
  const parts: string[] = [];
  if (fileContext) parts.push(fileContext);
  if (scenarioText) {
    parts.push(`THE USER DESCRIBES THEIR SITUATION:\n${scenarioText}`);
  }
  parts.push("Generate the What-If scenarios now as JSON only.");

  // Per the "streaming required" rule: use messages.stream().finalMessage(),
  // never a sync create() with a large max_tokens (that 502s). Scenarios are
  // short, so a moderate cap returns well inside the proxy idle window.
  let raw = "";
  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: Math.min(maxOutputTokensFor(MODEL), 8000),
      system: WHAT_IF_SYSTEM_PROMPT,
      messages: [{ role: "user", content: parts.join("\n\n") }],
    });
    const finalMsg = await stream.finalMessage();
    raw = finalMsg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Best-effort usage telemetry (Sonnet is in the pricing map).
    void recordAiFromMessage(db, finalMsg, {
      userId,
      caseFileId: caseFileId ?? null,
      feature: "what_if",
    }).catch(() => {});
  } catch (err) {
    console.error("[what-if] generation error", err);
    return NextResponse.json({ error: "Could not generate scenarios. Please try again." }, { status: 502 });
  }

  const result = parseWhatIfResponse(raw);
  if (result.scenarios.length === 0) {
    return NextResponse.json(
      { error: "Could not generate scenarios for this. Try adding a bit more detail." },
      { status: 422 }
    );
  }

  // ── Persist the session to its OWN store (best-effort) ──────────────────────
  // This is where What-If strategy output lives — kept clear of legal_strategy.
  // If the migration hasn't been applied on the live DB, this fails silently
  // (PGRST205) and the game still works; we just return without a sessionId.
  let sessionId: string | null = null;
  try {
    const { data: sessionRow } = await db
      .from("what_if_sessions")
      .insert({
        user_id: userId,
        case_file_id: caseFileId ?? null,
        scenario_input: scenarioText || null,
        scenarios: result.scenarios,
      })
      .select("id")
      .maybeSingle();
    sessionId = (sessionRow as { id: string } | null)?.id ?? null;
  } catch (err) {
    console.error("[what-if] session persist skipped", err);
  }

  return NextResponse.json({ sessionId, result });
}

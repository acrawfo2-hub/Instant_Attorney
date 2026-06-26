import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { computeRoadmapFingerprint } from "@/lib/roadmap-fingerprint";
import { resolveRoadmapForCase } from "@/lib/roadmap-build";
import {
  ROADMAP_REFRESH_SYSTEM_PROMPT,
  buildRoadmapRefreshUserPrompt,
  parseRoadmapOverlayFromModel,
} from "@/lib/roadmap-ai";
import { parseRoadmapOverlay, snapshotIsFresh } from "@/lib/roadmap-snapshot";
import type { RoadmapSnapshotRow } from "@/lib/roadmap-types";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import { getBillingGate } from "@/lib/topup";
import { BYPASS_USER_ID } from "@/lib/types";
import type { CaseFile, ConsultRequest, Document, FactItem, RequestedAttachment, Attachment } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const MODEL = "claude-sonnet-4-6";

const client = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const caseFileId = typeof body.caseFileId === "string" ? body.caseFileId : "";
  const force = body.force === true;

  if (!caseFileId) {
    return NextResponse.json({ error: "caseFileId is required" }, { status: 400 });
  }

  let userId: string;
  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;

    const gate = await getBillingGate(userId);
    if (!gate.allowed) {
      return NextResponse.json(
        { error: "Token top-up required", reason: gate.reason },
        { status: 402 },
      );
    }
  }

  const [
    { data: caseFile },
    { data: facts },
    { data: documents },
    { data: consultRow },
    { data: requestedRows },
    { data: attachmentRows },
    { data: existingSnap },
  ] = await Promise.all([
    db.from("case_files").select("*").eq("id", caseFileId).eq("user_id", userId).maybeSingle(),
    db.from("fact_items").select("*").eq("case_file_id", caseFileId),
    db.from("documents").select("*").eq("case_file_id", caseFileId),
    db.from("consult_requests")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["pending", "confirmed", "attorney_proposed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("requested_attachments").select("*").eq("case_file_id", caseFileId),
    db.from("attachments").select("id").eq("case_file_id", caseFileId),
    db.from("roadmap_snapshots").select("*").eq("case_file_id", caseFileId).maybeSingle(),
  ]);

  if (!caseFile) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const fingerprint = computeRoadmapFingerprint({
    caseFile: caseFile as CaseFile,
    facts: (facts ?? []) as FactItem[],
    documents: (documents ?? []) as Document[],
    requestedAttachments: (requestedRows ?? []) as RequestedAttachment[],
    consultRequest: (consultRow as ConsultRequest | null) ?? null,
    attachmentCount: (attachmentRows ?? []).length,
  });

  const roadmap = resolveRoadmapForCase({
    caseFile: caseFile as CaseFile,
    facts: (facts ?? []) as FactItem[],
    documents: (documents ?? []) as Document[],
    requestedAttachments: (requestedRows ?? []) as RequestedAttachment[],
    consultRequest: (consultRow as ConsultRequest | null) ?? null,
  });

  if (!roadmap) {
    return NextResponse.json({ error: "No roadmap for this matter" }, { status: 404 });
  }

  const snap = existingSnap as RoadmapSnapshotRow | null;
  if (!force && snapshotIsFresh(snap, fingerprint, roadmap.blueprintKey)) {
    return NextResponse.json({
      cached: true,
      fingerprint,
      blueprint_key: roadmap.blueprintKey,
      overlay: parseRoadmapOverlay(snap?.ai_overlay),
      generated_at: snap?.generated_at ?? null,
    });
  }

  const confirmedFacts = ((facts ?? []) as FactItem[])
    .filter((f) => f.status === "confirmed")
    .map((f) => f.description)
    .slice(0, 12);

  const userPrompt = buildRoadmapRefreshUserPrompt(
    roadmap,
    (caseFile as CaseFile).summary ?? "",
    confirmedFacts,
  );

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: ROADMAP_REFRESH_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");

  const overlay = parseRoadmapOverlayFromModel(text);

  await recordAiFromMessage(db, response, {
    userId,
    caseFileId,
    feature: "roadmap_refresh",
  });

  const now = new Date().toISOString();
  const { error: upsertError } = await db.from("roadmap_snapshots").upsert(
    {
      case_file_id: caseFileId,
      user_id: userId,
      file_fingerprint: fingerprint,
      blueprint_key: roadmap.blueprintKey,
      blueprint_version: roadmap.blueprintVersion,
      ai_overlay: overlay,
      generated_at: now,
      updated_at: now,
    },
    { onConflict: "case_file_id" },
  );

  if (upsertError) {
    console.error("[roadmap/refresh] snapshot upsert failed:", upsertError);
    return NextResponse.json(
      { error: "Could not save roadmap snapshot" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    cached: false,
    fingerprint,
    blueprint_key: roadmap.blueprintKey,
    overlay,
    generated_at: now,
  });
}

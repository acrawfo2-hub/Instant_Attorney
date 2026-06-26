import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  assertionFactPrefix,
  buildAssertionDescription,
  type RoadmapAssertion,
} from "@/lib/roadmap-assertions";
import { resolveRoadmapForCase } from "@/lib/roadmap-build";
import { BYPASS_USER_ID } from "@/lib/types";
import type { CaseFile, ConsultRequest, Document, FactItem, RequestedAttachment } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const ASSERTIONS = new Set<RoadmapAssertion>(["completed", "not_yet", "dispute"]);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const caseFileId = typeof body?.caseFileId === "string" ? body.caseFileId : "";
  const stageKey = typeof body?.stageKey === "string" ? body.stageKey.trim() : "";
  const assertion = body?.assertion as RoadmapAssertion;
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  if (!caseFileId || !stageKey || !ASSERTIONS.has(assertion)) {
    return NextResponse.json(
      { error: "caseFileId, stageKey, and assertion (completed|not_yet|dispute) are required" },
      { status: 400 },
    );
  }

  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  let userId: string;
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
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

  const [
    { data: caseFile },
    { data: facts },
    { data: documents },
    { data: consultRow },
    { data: requestedRows },
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
  ]);

  if (!caseFile) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const roadmap = resolveRoadmapForCase({
    caseFile: caseFile as CaseFile,
    facts: (facts ?? []) as FactItem[],
    documents: (documents ?? []) as Document[],
    requestedAttachments: (requestedRows ?? []) as RequestedAttachment[],
    consultRequest: (consultRow as ConsultRequest | null) ?? null,
  });

  if (!roadmap?.stages.some((s) => s.key === stageKey)) {
    return NextResponse.json({ error: "Unknown stage for this roadmap" }, { status: 400 });
  }

  const description = buildAssertionDescription(stageKey, assertion, roadmap.blueprintKey, note || undefined);
  const prefix = assertionFactPrefix(stageKey);
  const writeDb = BYPASS_AUTH ? db : createServiceClient();

  const existing = ((facts ?? []) as FactItem[]).find(
    (f) => f.status === "confirmed" && f.description.startsWith(prefix),
  );

  if (existing) {
    const { error: updErr } = await writeDb
      .from("fact_items")
      .update({
        description,
        status: "confirmed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (updErr) {
      console.error("[roadmap/assert] update failed:", updErr.message);
      return NextResponse.json({ error: "Could not save your correction" }, { status: 500 });
    }
  } else {
    const row = {
      case_file_id: caseFileId,
      user_id: userId,
      description,
      status: "confirmed" as const,
    };
    let { error: insErr } = await writeDb.from("fact_items").insert(row);
    if (insErr) {
      ({ error: insErr } = await writeDb.from("fact_items").insert({
        case_file_id: caseFileId,
        user_id: userId,
        description,
        status: "confirmed",
      }));
    }
    if (insErr) {
      console.error("[roadmap/assert] insert failed:", insErr.message);
      return NextResponse.json({ error: "Could not save your correction" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, description, stageKey, assertion });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  computePiFaultImpact,
  piFaultToFact,
  type PiFaultInput,
} from "@/lib/pi-fault-calc";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

function parseInput(body: unknown): PiFaultInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const totalDamages = Number(b.totalDamages);
  const claimantFaultPct = Number(b.claimantFaultPct);
  if (!Number.isFinite(totalDamages) || !Number.isFinite(claimantFaultPct)) return null;
  return { totalDamages, claimantFaultPct };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const caseFileId =
    body && typeof body === "object" ? (body as Record<string, unknown>).caseFileId : null;

  const input = parseInput(body);
  if (!input) {
    return NextResponse.json(
      { error: "Provide totalDamages and claimantFaultPct (0–100)." },
      { status: 400 }
    );
  }

  const result = computePiFaultImpact(input);

  if (!caseFileId || typeof caseFileId !== "string") {
    return NextResponse.json({ result, saved: false });
  }

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

  const { label, value } = piFaultToFact(input, result);
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
    console.error("[personal-injury/fault] fact write failed", writeError);
    return NextResponse.json(
      { result, saved: false, error: "Computed, but couldn't save it to your file." },
      { status: 500 }
    );
  }

  return NextResponse.json({ result, saved: true });
}

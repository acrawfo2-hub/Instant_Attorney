import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  checkExemptions,
  exemptionsToFact,
  type ExemptionAsset,
  type AssetCategory,
} from "@/lib/bankruptcy-exemptions";
import { BYPASS_USER_ID } from "@/lib/types";

// Texas exemption "what you'd keep" checker.
//
// Pure compute — NO AI call, so it is instant, free, and never touches the token
// meter or billing gate. When tied to an owned case it writes ONE confirmed fact
// (kind='fact') into the Living File. It never writes legal_strategy, so the
// document pipeline is untouched. Mirrors the other bankruptcy calculators.
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

const VALID_CATEGORIES: ReadonlySet<string> = new Set<AssetCategory>([
  "homestead",
  "vehicle",
  "household_goods",
  "tools_of_trade",
  "jewelry",
  "firearms",
  "retirement",
  "wages",
  "life_insurance",
  "cash_bank",
  "other_nonexempt",
]);

function parseAssets(raw: unknown): ExemptionAsset[] {
  if (!Array.isArray(raw)) return [];
  const out: ExemptionAsset[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const value = Number(o.value);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (typeof o.category !== "string" || !VALID_CATEGORIES.has(o.category)) continue;
    out.push({
      category: o.category as AssetCategory,
      value,
      ...(typeof o.label === "string" && o.label.trim() ? { label: o.label.trim() } : {}),
    });
  }
  return out;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const caseFileId = b.caseFileId;

  const assets = parseAssets(b.assets);
  if (assets.length === 0) {
    return NextResponse.json({ error: "Add at least one asset with a positive value." }, { status: 400 });
  }
  const isSingle = Boolean(b.isSingle);
  const result = checkExemptions(assets, isSingle);

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

  const { label, value } = exemptionsToFact(result);
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
    console.error("[bankruptcy/exemptions] fact write failed", writeError);
    return NextResponse.json(
      { result, saved: false, error: "Result computed, but couldn't save it to your file. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ result, saved: true });
}

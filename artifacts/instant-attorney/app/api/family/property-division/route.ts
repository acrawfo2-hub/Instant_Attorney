import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  dividePropertyEstate,
  propertyDivisionToFact,
  type PropertyItem,
  type PropertyDivisionInput,
} from "@/lib/family-property-calc";
import { BYPASS_USER_ID } from "@/lib/types";

// Texas community-property division estimator.
//
// Pure compute — NO AI call, so it is instant, free, and never touches the
// token meter or billing gate. Mirrors the child-support estimator and the
// What-If "auto-write facts, not strategy" rule: when tied to a case it writes
// ONE confirmed fact (kind='fact') into the shared Living File, so a Final
// Decree's property section seeds from the figures. It never writes
// legal_strategy, so the document pipeline is untouched.
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

function parseItems(raw: unknown): PropertyItem[] | null {
  if (!Array.isArray(raw)) return null;
  const items: PropertyItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const value = Number(o.value);
    if (!Number.isFinite(value) || value <= 0) continue;
    const kind = o.kind === "debt" ? "debt" : "asset";
    const characterization = o.characterization === "separate" ? "separate" : "community";
    const owner = o.owner === "a" || o.owner === "b" ? (o.owner as "a" | "b") : undefined;
    const label = typeof o.label === "string" && o.label.trim() ? o.label.trim() : "Item";
    items.push({ label, value, kind, characterization, ...(owner ? { owner } : {}) });
  }
  return items;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const caseFileId = b.caseFileId;

  const items = parseItems(b.items);
  if (!items || items.length === 0) {
    return NextResponse.json(
      { error: "Add at least one asset or debt with a positive value." },
      { status: 400 }
    );
  }

  const input: PropertyDivisionInput = { items };
  if (b.communityShareToA != null && Number.isFinite(Number(b.communityShareToA))) {
    input.communityShareToA = Number(b.communityShareToA);
  }

  const estimate = dividePropertyEstate(input);

  // ── Without a case file: pure estimate, no auth needed ──────────────────────
  if (!caseFileId || typeof caseFileId !== "string") {
    return NextResponse.json({ estimate, saved: false });
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

  const { label, value } = propertyDivisionToFact(estimate);
  const description = `${label}: ${value}`;
  const prefix = `${label.toLowerCase()}:`;

  // Dedupe by "<label>:" prefix so re-estimating UPDATES the same fact in place.
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
    console.error("[family/property-division] fact write failed", writeError);
    return NextResponse.json(
      { estimate, saved: false, error: "Estimate computed, but couldn't save it to your file. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ estimate, saved: true });
}

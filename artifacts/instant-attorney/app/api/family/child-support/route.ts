import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  estimateChildSupport,
  childSupportEstimateToFact,
  type ChildSupportInput,
} from "@/lib/family-support-calc";
import { BYPASS_USER_ID } from "@/lib/types";

// Texas guideline child-support estimator.
//
// Pure compute — there is NO AI call here, so it is instant, free, and never
// touches the token meter or billing gate. Mirrors the What-If "auto-write
// facts, not strategy" rule: when tied to a case it writes ONE confirmed fact
// (kind='fact') into the shared Living File, so a Child Support Order / decree
// drafted later seeds from the computed number. It never writes legal_strategy
// and never changes which instruments are recommended, so the document pipeline is
// untouched.
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

function parseInput(body: unknown): ChildSupportInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const net = Number(b.netMonthlyResources);
  const kids = Number(b.childrenBeforeCourt);
  if (!Number.isFinite(net) || !Number.isFinite(kids) || kids < 1) return null;
  const input: ChildSupportInput = {
    netMonthlyResources: net,
    childrenBeforeCourt: Math.floor(kids),
  };
  if (b.otherChildren != null && Number.isFinite(Number(b.otherChildren))) {
    input.otherChildren = Math.max(0, Math.floor(Number(b.otherChildren)));
  }
  if (b.capOverride != null && Number.isFinite(Number(b.capOverride)) && Number(b.capOverride) > 0) {
    input.capOverride = Number(b.capOverride);
  }
  return input;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const caseFileId =
    body && typeof body === "object" ? (body as Record<string, unknown>).caseFileId : null;

  const input = parseInput(body);
  if (!input) {
    return NextResponse.json(
      { error: "Provide monthly net resources and at least 1 child." },
      { status: 400 }
    );
  }

  const estimate = estimateChildSupport(input);

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

    // fact_items RLS does not constrain case_file_id; verify ownership app-side.
    const { data: ownedCase } = await db
      .from("case_files")
      .select("id")
      .eq("id", caseFileId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!ownedCase) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { label, value } = childSupportEstimateToFact(input, estimate);
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
      // kind='fact' is the default; retry without it if the live DB predates the column.
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
    console.error("[family/child-support] fact write failed", writeError);
    return NextResponse.json(
      { estimate, saved: false, error: "Estimate computed, but couldn't save it to your file. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ estimate, saved: true });
}

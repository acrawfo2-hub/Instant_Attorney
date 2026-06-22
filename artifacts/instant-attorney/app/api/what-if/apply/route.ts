import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { answersToFacts, type WhatIfAnswer } from "@/lib/what-if";
import { BYPASS_USER_ID } from "@/lib/types";

// What-If Game — save the user's answers.
//
// Per the product decision "auto-write facts, not strategy":
//   • answers are written into the SHARED Living File as fact_items (the only
//     thing the game writes into shared data the drafter reads);
//   • legal_strategy is NEVER touched, so the wizards are unaffected;
//   • the full scenario+answer session is also stored in what_if_sessions
//     (its own store) on a best-effort basis.
//
// Facts are saved FIRST and independently of anything fragile, mirroring the
// wizard save-answers rule, so a user's thinking is never lost.
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function POST(req: NextRequest) {
  const { caseFileId, sessionId, answers } = await req.json().catch(() => ({}));

  // ── Auth ──────────────────────────────────────────────────────────────────
  let userId: string;
  const db = BYPASS_AUTH ? createServiceClient() : await createClient();
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;
  }

  const pairs = answersToFacts(Array.isArray(answers) ? (answers as WhatIfAnswer[]) : []);

  // ── Write facts into the shared Living File (only when tied to a case) ───────
  let saved = 0;
  if (caseFileId && pairs.length) {
    // Ownership guard: fact_items RLS does NOT constrain case_file_id, so verify
    // the caller owns the case app-side (the RLS-scoped select proves it).
    if (!BYPASS_AUTH) {
      const { data: ownedCase } = await db
        .from("case_files")
        .select("id")
        .eq("id", caseFileId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!ownedCase) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Load existing confirmed facts so re-playing a scenario UPDATES its fact in
    // place (dedupe by "<label>:" prefix) instead of piling up duplicates.
    const { data: existingRows } = await db
      .from("fact_items")
      .select("id, description")
      .eq("case_file_id", caseFileId)
      .eq("status", "confirmed");
    const existing = (existingRows ?? []) as { id: string; description: string }[];

    const toInsert: { case_file_id: string; user_id: string; description: string; status: "confirmed" }[] = [];
    for (const { label, value } of pairs) {
      const description = `${label}: ${value}`;
      const prefix = `${label.toLowerCase()}:`;
      const match = existing.find((f) => f.description.toLowerCase().startsWith(prefix));
      if (match) {
        if (match.description !== description) {
          await db
            .from("fact_items")
            .update({ description, status: "confirmed", updated_at: new Date().toISOString() })
            .eq("id", match.id);
          match.description = description;
          saved++;
        }
      } else {
        toInsert.push({ case_file_id: caseFileId, user_id: userId, description, status: "confirmed" });
        existing.push({ id: "", description });
      }
    }
    if (toInsert.length) {
      await db.from("fact_items").insert(toInsert);
      saved += toInsert.length;
    }
  }

  // ── Persist answers to the session's own store (best-effort) ────────────────
  if (sessionId) {
    try {
      await db
        .from("what_if_sessions")
        .update({ answers: answers ?? [], updated_at: new Date().toISOString() })
        .eq("id", sessionId)
        .eq("user_id", userId);
    } catch (err) {
      console.error("[what-if] session answer persist skipped", err);
    }
  }

  return NextResponse.json({ saved });
}

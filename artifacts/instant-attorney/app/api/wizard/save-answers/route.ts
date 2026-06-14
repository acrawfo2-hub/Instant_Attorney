import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";

// Persists the client's wizard checklist answers as confirmed fact_items.
//
// Why this is its own endpoint: wizard answers are key facts for the file and
// must NEVER be lost. Previously they were only sent to the drafter, so a failed
// or timed-out generation (or a closed tab) discarded everything the client
// typed. The client awaits this fast write FIRST, independent of the slow/fragile
// draft generation — so the answers are committed even if the draft never renders.
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

interface AnswerInput {
  label: string;
  value: string;
}

export async function POST(req: NextRequest) {
  const { caseFileId, answers, extraNote } = await req.json();

  if (!caseFileId) {
    return NextResponse.json({ error: "caseFileId required" }, { status: 400 });
  }

  let userId: string;
  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;

    // Guard against writing facts onto someone else's case. RLS scopes this
    // select to the caller, so a case they don't own returns nothing.
    const { data: ownedCase } = await db
      .from("case_files")
      .select("id")
      .eq("id", caseFileId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!ownedCase) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Normalize the incoming answers into clean {label, value} pairs.
  const list: AnswerInput[] = Array.isArray(answers)
    ? answers
        .filter(
          (a: unknown): a is AnswerInput =>
            !!a &&
            typeof (a as AnswerInput).label === "string" &&
            typeof (a as AnswerInput).value === "string" &&
            (a as AnswerInput).value.trim().length > 0
        )
        .map((a: AnswerInput) => ({ label: a.label.trim(), value: a.value.trim() }))
    : [];

  const note = typeof extraNote === "string" ? extraNote.trim() : "";
  if (note) list.push({ label: "Additional details", value: note });

  if (!list.length) {
    return NextResponse.json({ saved: 0 });
  }

  // Load existing confirmed facts so re-answering a field UPDATES its fact in
  // place (one fact per label) instead of piling up duplicates on every submit.
  const { data: existingRows } = await db
    .from("fact_items")
    .select("id, description")
    .eq("case_file_id", caseFileId)
    .eq("status", "confirmed");

  const existing = (existingRows ?? []) as { id: string; description: string }[];

  const toInsert: {
    case_file_id: string;
    user_id: string;
    description: string;
    status: "confirmed";
  }[] = [];
  let updated = 0;

  for (const { label, value } of list) {
    const description = `${label}: ${value}`;
    const prefix = `${label.toLowerCase()}:`;
    const match = existing.find((f) => f.description.toLowerCase().startsWith(prefix));

    if (match) {
      if (match.description !== description) {
        await db
          .from("fact_items")
          .update({ description, status: "confirmed", updated_at: new Date().toISOString() })
          .eq("id", match.id);
        // Reflect the new value locally so a later answer in the same batch
        // sharing this label doesn't re-trigger an update.
        match.description = description;
        updated++;
      }
    } else {
      const row = {
        case_file_id: caseFileId as string,
        user_id: userId,
        description,
        status: "confirmed" as const,
      };
      toInsert.push(row);
      existing.push({ id: "", description });
    }
  }

  if (toInsert.length) {
    await db.from("fact_items").insert(toInsert);
  }

  return NextResponse.json({ saved: toInsert.length + updated });
}

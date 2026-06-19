import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { applyPlaceholderAnswers, extractPlaceholders, placeholderFields } from "@/lib/wizard-parsing";
import { syncDraftGapsToLivingFile } from "@/lib/file-parser";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// Fill [[placeholders]] in a document's draft with client-supplied values.
// Deterministic text substitution only — no model call, and no character of the
// document changes except the named blanks, so an attorney-approved draft stays
// intact. `answers` is keyed by each placeholder's normalized full text.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const answers = body?.answers;
  if (!answers || typeof answers !== "object") {
    return NextResponse.json({ error: "answers required" }, { status: 400 });
  }

  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  let userId: string;
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
  }

  const { data: profile } = BYPASS_AUTH
    ? { data: { is_attorney: false } }
    : await db.from("profiles").select("is_attorney").eq("id", userId).single();

  const { data: doc, error: docErr } = await db
    .from("documents")
    .select("id, user_id, case_file_id, draft_text, status")
    .eq("id", id)
    .single();

  if (docErr || !doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (doc.user_id !== userId && !profile?.is_attorney) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!doc.draft_text) {
    return NextResponse.json({ error: "No draft text to fill" }, { status: 400 });
  }

  // Only accept string answers; ignore anything else the client might send.
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) clean[k] = v.trim();
  }

  const { text, filled } = applyPlaceholderAnswers(doc.draft_text, clean);

  if (filled === 0) {
    return NextResponse.json({ filled: 0, remaining: extractPlaceholders(text).length, draft_text: doc.draft_text });
  }

  // Persist via the service client. The fill is authorized above, and we touch
  // only draft_text — status and lifecycle are deliberately left unchanged so a
  // completed/approved document is not knocked back a step by filling a blank.
  const writeDb = BYPASS_AUTH ? db : createServiceClient();
  const { error: updErr } = await writeDb
    .from("documents")
    .update({ draft_text: text, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (updErr) {
    console.error("[documents/fill-info] update failed:", updErr.message);
    return NextResponse.json({ error: "Could not save your answers" }, { status: 500 });
  }

  // The Living File must always absorb new key facts as they become available.
  // Each filled blank is a confirmed fact — write it (deduped) so the next draft,
  // review, and any sibling document can use it without re-asking.
  try {
    const labelByKey = new Map(placeholderFields(doc.draft_text).map((f) => [f.key, f.label]));
    const factDescriptions = Object.entries(clean)
      .filter(([k]) => labelByKey.has(k))
      .map(([k, v]) => `${labelByKey.get(k)}: ${v}`);

    if (factDescriptions.length) {
      const { data: existingFacts } = await writeDb
        .from("fact_items")
        .select("description")
        .eq("case_file_id", doc.case_file_id)
        .eq("status", "confirmed");
      const existing = new Set(
        (existingFacts ?? []).map((f: { description: string }) => f.description.toLowerCase())
      );
      const newFacts = factDescriptions
        .filter((d) => !existing.has(d.toLowerCase()))
        .map((description) => ({
          case_file_id: doc.case_file_id,
          user_id: doc.user_id,
          description,
          status: "confirmed" as const,
        }));
      if (newFacts.length) {
        await writeDb.from("fact_items").insert(newFacts);
      }
    }

    // Reconcile Living File gaps against the freshly-filled draft: filled blanks
    // (now confirmed facts) drop off the outstanding list, and any still-unfilled
    // placeholders remain tracked.
    await syncDraftGapsToLivingFile(writeDb, doc.case_file_id, doc.user_id, text);
  } catch (e) {
    // Fact-sync is best-effort: the document was already updated successfully, so
    // never fail the request over a Living File write.
    console.error("[documents/fill-info] living-file sync failed:", e);
  }

  return NextResponse.json({
    filled,
    remaining: extractPlaceholders(text).length,
    draft_text: text,
  });
}

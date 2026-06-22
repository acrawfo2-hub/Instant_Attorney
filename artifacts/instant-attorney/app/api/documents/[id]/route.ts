import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getChildDocuments } from "@/lib/document-utils";
import { placeholderFields } from "@/lib/wizard-parsing";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// A document can be canceled (deleted) by its owner only while it is still in the
// client's court: a fresh "draft" they started, or one the attorney bounced back
// for changes. Once it is "pending_review"/"approved"/"delivered" the attorney is
// working on (or has finished) it, so it is no longer the client's to throw away.
const CANCELABLE_STATUSES = new Set(["draft", "changes_requested"]);

function draftLabels(texts: (string | null | undefined)[]): Set<string> {
  const labels = new Set<string>();
  for (const t of texts) {
    if (!t) continue;
    for (const f of placeholderFields(t)) labels.add(f.label.toLowerCase());
  }
  return labels;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  let userId: string;
  let isAttorney = false;

  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;

    const { data: profile } = await db
      .from("profiles")
      .select("is_attorney")
      .eq("id", user.id)
      .single();

    isAttorney = profile?.is_attorney ?? false;
  }

  const { data: doc, error: docErr } = await db
    .from("documents")
    .select("*, case_files(*), profiles!documents_user_id_fkey(*)")
    .eq("id", id)
    .single();

  if (docErr || !doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!BYPASS_AUTH && doc.user_id !== userId && !isAttorney) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const childDocuments = await getChildDocuments(db, id);

  return NextResponse.json({
    ...doc,
    child_documents: childDocuments,
  });
}

// Cancel (delete) an unwanted draft document the client started but doesn't want.
// Deliberately destructive and one-at-a-time: it removes the document, any child
// drafts (e.g. an attorney revision), and the placeholder "gaps" the draft seeded
// in the Living File so they don't resurface as open fact gaps after the doc is
// gone. Only allowed while the doc is still the client's to discard.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  // Read with the caller's client so RLS confirms they may see it; verify
  // ownership/status before any destructive work.
  const { data: doc, error: docErr } = await db
    .from("documents")
    .select("id, user_id, case_file_id, status, draft_text, improved_draft_text")
    .eq("id", id)
    .single();

  if (docErr || !doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Cancelling is an owner-only action: this is the client discarding their own
  // unwanted draft. Attorneys deliberately have no destructive delete here (they
  // work documents through the review screen, not by throwing them away).
  if (!BYPASS_AUTH && doc.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!CANCELABLE_STATUSES.has(doc.status)) {
    return NextResponse.json(
      {
        error:
          "This document is already with your attorney, so it can't be canceled here.",
      },
      { status: 409 }
    );
  }

  // Mutate with the service client so child-row deletes and fact cleanup aren't
  // blocked by row policies (ownership is already verified above).
  const admin = createServiceClient();

  const children = await getChildDocuments(admin, id);
  const idsToRemove = new Set<string>([id, ...children.map((c) => c.id)]);

  // Placeholder blanks that this draft (and its children) contributed.
  const removedLabels = draftLabels([
    doc.draft_text,
    doc.improved_draft_text,
    ...children.flatMap((c) => [c.draft_text, c.improved_draft_text]),
  ]);

  // Keep any blank still needed by a different document on the same file.
  const keepLabels = new Set<string>();
  if (removedLabels.size > 0) {
    const { data: otherDocs } = await admin
      .from("documents")
      .select("id, draft_text, improved_draft_text")
      .eq("case_file_id", doc.case_file_id);
    for (const od of otherDocs ?? []) {
      if (idsToRemove.has(od.id)) continue;
      for (const l of draftLabels([od.draft_text, od.improved_draft_text])) {
        keepLabels.add(l);
      }
    }

    const orphanLabels = new Set(
      [...removedLabels].filter((l) => !keepLabels.has(l))
    );
    if (orphanLabels.size > 0) {
      const { data: gapRows } = await admin
        .from("fact_items")
        .select("id, description")
        .eq("case_file_id", doc.case_file_id)
        .eq("status", "gap");
      const gapIds = (gapRows ?? [])
        .filter((g) => g.description && orphanLabels.has(g.description.toLowerCase()))
        .map((g) => g.id);
      if (gapIds.length > 0) {
        await admin.from("fact_items").delete().in("id", gapIds);
      }
    }
  }

  // Children first (no FK cascade), then the document itself.
  if (children.length > 0) {
    await admin.from("documents").delete().in("id", children.map((c) => c.id));
  }
  const { error: delErr } = await admin.from("documents").delete().eq("id", id);
  if (delErr) {
    return NextResponse.json(
      { error: "Could not cancel the document. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";
import type { GovFormInstrument, GovFormStatus } from "@/lib/types";
import { getGovernmentForm } from "@/lib/government-forms";
import { applyAnswers, computeProgress, buildSubmissionChecklist } from "@/lib/gov-form-guide";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authed(): Promise<{ db: any; userId: string } | null> {
  if (BYPASS_AUTH) return { db: createServiceClient(), userId: BYPASS_USER_ID };
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return null;
  return { db, userId: user.id };
}

function enrich(row: GovFormInstrument) {
  const form = getGovernmentForm(row.form_key);
  if (!form) return null;
  return {
    instrument: row,
    form,
    progress: computeProgress(form, row.answers ?? {}),
    checklist: buildSubmissionChecklist(form),
  };
}

// GET /api/gov-forms/:id — full form definition + saved answers + progress, used
// by the guided-completion tool.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authed();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: row } = await auth.db
    .from("form_instruments")
    .select("*")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const enriched = enrich(row as GovFormInstrument);
  if (!enriched) return NextResponse.json({ error: "Unknown form" }, { status: 404 });
  return NextResponse.json(enriched);
}

// PATCH /api/gov-forms/:id — save guided answers and/or update status. Answers
// are validated/normalized against the registry; invalid fields are returned as
// errors without being persisted.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authed();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    answers?: Record<string, unknown>;
    status?: GovFormStatus;
  };

  const { data: row } = await auth.db
    .from("form_instruments")
    .select("*")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const instrument = row as GovFormInstrument;
  const form = getGovernmentForm(instrument.form_key);
  if (!form) return NextResponse.json({ error: "Unknown form" }, { status: 404 });

  let errors: Record<string, string> = {};
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.answers) {
    const result = applyAnswers(form, body.answers);
    errors = result.errors;
    // Merge validated answers over what's already saved.
    const merged = { ...(instrument.answers ?? {}), ...result.answers };
    updates.answers = merged;
    // Auto-advance status to in_progress on first answers (unless explicitly set).
    if (!body.status && instrument.status === "needed" && Object.keys(merged).length) {
      updates.status = "in_progress";
    }
  }

  if (body.status) updates.status = body.status;

  const { data: updated } = await auth.db
    .from("form_instruments")
    .update(updates)
    .eq("id", id)
    .eq("user_id", auth.userId)
    .select("*")
    .single();

  const enriched = enrich(updated as GovFormInstrument);
  return NextResponse.json({ ...enriched, errors });
}

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";
import type { GovFormInstrument } from "@/lib/types";
import { resolveForm } from "@/lib/gov-form-guide";
import { verifyFormScreenshots } from "@/lib/form-verification-runner";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB, matches app/api/attachments/upload
const MAX_FILES = 10;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authed(): Promise<{ db: any; userId: string } | null> {
  if (BYPASS_AUTH) return { db: createServiceClient(), userId: BYPASS_USER_ID };
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return null;
  return { db, userId: user.id };
}

// GET /api/gov-forms/:id/verify — verification history for this form instrument
// (most recent first), used to show past attempts and poll a pending one.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authed();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: instrument } = await auth.db
    .from("form_instruments")
    .select("id")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (!instrument) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: verifications } = await auth.db
    .from("form_verifications")
    .select("*")
    .eq("form_instrument_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ verifications: verifications ?? [] });
}

// POST /api/gov-forms/:id/verify — upload photo(s)/screenshot(s) of a hand-filled
// copy of this form and kick off AI verification against the answers already
// collected in the guided tool. Background-processed like attachment analysis;
// the client polls GET for the result.
export async function POST(
  req: NextRequest,
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

  const instrument = row as GovFormInstrument;
  const form = resolveForm(instrument);
  if (!form) return NextResponse.json({ error: "Unknown form" }, { status: 404 });

  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "At least one photo or screenshot is required" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `No more than ${MAX_FILES} photos at a time` }, { status: 400 });
  }
  for (const file of files) {
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ error: `${file.name}: only photo/screenshot images are accepted` }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `${file.name} exceeds 25 MB` }, { status: 413 });
    }
  }

  const verificationId = randomUUID();
  const caseFileId = instrument.case_file_id;
  const serviceDb = createServiceClient();

  const uploaded: { buffer: Buffer; mimeType: string; fileName: string }[] = [];
  const storagePaths: string[] = [];
  for (const [i, file] of files.entries()) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `${auth.userId}/${caseFileId}/form-verifications/${id}/${verificationId}-${i}-${file.name}`;
    const { error: uploadErr } = await serviceDb.storage
      .from("case-attachments")
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });
    if (uploadErr) {
      console.error("[gov-forms/verify] storage error:", uploadErr);
      await serviceDb.storage.from("case-attachments").remove(storagePaths).catch(() => {});
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
    storagePaths.push(storagePath);
    uploaded.push({ buffer, mimeType: file.type, fileName: file.name });
  }

  const { data: verification, error: insertErr } = await auth.db
    .from("form_verifications")
    .insert({
      id: verificationId,
      form_instrument_id: id,
      case_file_id: caseFileId,
      user_id: auth.userId,
      storage_paths: storagePaths,
      status: "processing",
    })
    .select("*")
    .single();

  if (insertErr || !verification) {
    console.error("[gov-forms/verify] insert error:", insertErr);
    await serviceDb.storage.from("case-attachments").remove(storagePaths).catch(() => {});
    return NextResponse.json({ error: "Failed to save upload" }, { status: 500 });
  }

  // Fire-and-forget — the client polls GET for the result, same pattern as
  // attachment analysis (lib/attachment-processor.ts).
  verifyFormScreenshots(serviceDb, {
    verificationId,
    form,
    answers: instrument.answers ?? {},
    images: uploaded,
    userId: auth.userId,
    caseFileId,
  }).catch((err) => console.error("[gov-forms/verify] background verification error:", err));

  return NextResponse.json({ verification });
}

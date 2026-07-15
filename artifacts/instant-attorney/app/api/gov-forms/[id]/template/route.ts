import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";
import type { GovFormInstrument } from "@/lib/types";
import { resolveForm } from "@/lib/gov-form-guide";
import {
  detectPdfTemplate,
  autoMapPdfFields,
  uploadPdfTemplate,
  downloadPdfTemplate,
  type DetectedPdfField,
} from "@/lib/gov-form-pdf";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB — government form PDFs are small

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authed(): Promise<{ db: any; userId: string } | null> {
  if (BYPASS_AUTH) return { db: createServiceClient(), userId: BYPASS_USER_ID };
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return null;
  return { db, userId: user.id };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadInstrument(db: any, id: string, userId: string): Promise<GovFormInstrument | null> {
  const { data } = await db
    .from("form_instruments")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as GovFormInstrument) ?? null;
}

// POST /api/gov-forms/:id/template — upload the client's blank PDF (downloaded
// from the official source), detect whether it's a real fillable AcroForm or a
// flat/scanned document, and for AcroForm templates auto-propose a field map
// (GovFormField -> PDF field name) for the client to review before first fill.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authed();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const instrument = await loadInstrument(auth.db, id, auth.userId);
  if (!instrument) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = resolveForm(instrument);
  if (!form) return NextResponse.json({ error: "Unknown form" }, { status: 404 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });

  if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 15 MB limit" }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  let detection: { mode: "acroform" | "flat"; fields: DetectedPdfField[] };
  try {
    detection = await detectPdfTemplate(bytes);
  } catch (err) {
    console.error("[gov-forms/template] detect failed:", err);
    return NextResponse.json({ error: "Could not read that file as a PDF" }, { status: 400 });
  }

  const path = `${auth.userId}/${instrument.case_file_id}/${instrument.id}.pdf`;
  const serviceDb = createServiceClient();
  const stored = await uploadPdfTemplate(serviceDb, path, bytes);
  if (!stored) {
    return NextResponse.json({ error: "Could not store the uploaded PDF" }, { status: 500 });
  }

  const updates: Record<string, unknown> = {
    pdf_template_path: path,
    pdf_mode: detection.mode,
    updated_at: new Date().toISOString(),
  };

  const mapResult = detection.mode === "acroform" ? autoMapPdfFields(form.fields, detection.fields) : null;
  if (mapResult) {
    updates.pdf_status = "mapping";
    updates.pdf_field_map = mapResult.map;
  } else {
    // Flat/scanned template: no fields to auto-fill (Path A doesn't cover
    // this yet). We still keep the file on record so the client can always
    // pull down the blank form they uploaded.
    updates.pdf_status = "unsupported";
    updates.pdf_field_map = null;
  }

  const { data: updated, error: updErr } = await auth.db
    .from("form_instruments")
    .update(updates)
    .eq("id", id)
    .eq("user_id", auth.userId)
    .select("*")
    .single();

  if (updErr || !updated) {
    return NextResponse.json({ error: "Could not save the template" }, { status: 500 });
  }

  return NextResponse.json({
    instrument: updated as GovFormInstrument,
    pdf_fields: detection.fields,
    ...(mapResult ? { unmapped: mapResult.unmapped, confidence: mapResult.confidence } : {}),
  });
}

// GET /api/gov-forms/:id/template — current template state plus the live list
// of PDF fields (re-detected from the stored file), used to render/edit the
// field-map review UI.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authed();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const instrument = await loadInstrument(auth.db, id, auth.userId);
  if (!instrument) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!instrument.pdf_template_path) {
    return NextResponse.json({ instrument, pdf_fields: [] });
  }

  const bytes = await downloadPdfTemplate(createServiceClient(), instrument.pdf_template_path);
  if (!bytes) return NextResponse.json({ instrument, pdf_fields: [] });

  const detection = await detectPdfTemplate(bytes).catch(
    () => ({ mode: (instrument.pdf_mode ?? "flat") as "acroform" | "flat", fields: [] as DetectedPdfField[] })
  );
  return NextResponse.json({ instrument, pdf_fields: detection.fields });
}

// PATCH /api/gov-forms/:id/template — correct and/or confirm the field map.
// Every proposed PDF field name is revalidated against the live template so a
// stale or mistyped name can't silently no-op at fill time; `confirm: true`
// flips the instrument to "ready" once the client is satisfied with the map.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authed();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const instrument = await loadInstrument(auth.db, id, auth.userId);
  if (!instrument) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (instrument.pdf_mode !== "acroform" || !instrument.pdf_template_path) {
    return NextResponse.json({ error: "No fillable template on file for this form" }, { status: 400 });
  }

  const form = resolveForm(instrument);
  if (!form) return NextResponse.json({ error: "Unknown form" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as
    | { field_map?: Record<string, string>; confirm?: boolean }
    | null;
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const bytes = await downloadPdfTemplate(createServiceClient(), instrument.pdf_template_path);
  if (!bytes) return NextResponse.json({ error: "Stored template could not be read" }, { status: 500 });
  const detection = await detectPdfTemplate(bytes);
  const validPdfFields = new Set(detection.fields.map((f) => f.name));
  const validFormFields = new Set(form.fields.map((f) => f.name));

  let fieldMap = instrument.pdf_field_map ?? {};
  if (body.field_map) {
    const errors: Record<string, string> = {};
    const merged: Record<string, string> = { ...fieldMap };
    for (const [formFieldName, pdfFieldName] of Object.entries(body.field_map)) {
      if (!validFormFields.has(formFieldName)) {
        errors[formFieldName] = "Unknown form field.";
        continue;
      }
      if (pdfFieldName === "") {
        delete merged[formFieldName];
        continue;
      }
      if (!validPdfFields.has(pdfFieldName)) {
        errors[formFieldName] = "Unknown PDF field.";
        continue;
      }
      merged[formFieldName] = pdfFieldName;
    }
    if (Object.keys(errors).length) {
      return NextResponse.json({ error: "Invalid field map", details: errors }, { status: 400 });
    }
    fieldMap = merged;
  }

  const updates: Record<string, unknown> = {
    pdf_field_map: fieldMap,
    updated_at: new Date().toISOString(),
  };
  if (body.confirm) updates.pdf_status = "ready";

  const { data: updated, error: updErr } = await auth.db
    .from("form_instruments")
    .update(updates)
    .eq("id", id)
    .eq("user_id", auth.userId)
    .select("*")
    .single();

  if (updErr || !updated) {
    return NextResponse.json({ error: "Could not save the field map" }, { status: 500 });
  }

  return NextResponse.json({ instrument: updated as GovFormInstrument, pdf_fields: detection.fields });
}

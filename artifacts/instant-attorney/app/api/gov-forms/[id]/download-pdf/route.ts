import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";
import type { GovFormInstrument } from "@/lib/types";
import { resolveForm } from "@/lib/gov-form-guide";
import { downloadPdfTemplate, fillAcroForm, pdfContentDisposition } from "@/lib/gov-form-pdf";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// GET /api/gov-forms/:id/download-pdf — fill the client's uploaded official PDF
// with their saved answers and return it. Only serves AcroForm templates whose
// field map has been confirmed ("ready"); flat/scanned templates and
// unconfirmed maps get a clear, actionable response instead of a raw filled
// (or silently wrong) file — that's the fallback for forms Path A can't cover
// yet, until coordinate-overlay support exists for flat PDFs.
export async function GET(
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
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;
  }

  const { data: row } = await db
    .from("form_instruments")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const instrument = row as GovFormInstrument;

  const form = resolveForm(instrument);
  if (!form) return NextResponse.json({ error: "Unknown form" }, { status: 404 });

  if (!instrument.pdf_template_path || !instrument.pdf_status || instrument.pdf_status === "needs_template") {
    return NextResponse.json(
      {
        error: "no_template",
        message: "Upload the official PDF for this form before downloading a filled copy.",
        official_url: form.official_url,
      },
      { status: 400 }
    );
  }

  if (instrument.pdf_mode === "flat" || instrument.pdf_status === "unsupported") {
    // Path A fallback: we can't auto-fill a flat/scanned PDF yet (that needs a
    // hand-built coordinate overlay per form revision — not built). Hand back
    // the client's answers plus the blank official source so they can still
    // finish the form by hand.
    return NextResponse.json(
      {
        error: "unsupported_template",
        message:
          "This form isn't a fillable PDF, so we can't fill it in automatically yet. Use your saved answers below to fill in the blank form you downloaded.",
        answers: instrument.answers,
        official_url: form.official_url,
      },
      { status: 409 }
    );
  }

  if (instrument.pdf_status === "mapping") {
    return NextResponse.json(
      {
        error: "mapping_unconfirmed",
        message: "Review and confirm how each question maps to the PDF's fields before downloading.",
      },
      { status: 409 }
    );
  }

  const serviceDb = createServiceClient();
  const templateBytes = await downloadPdfTemplate(serviceDb, instrument.pdf_template_path);
  if (!templateBytes) {
    return NextResponse.json({ error: "Stored template could not be read" }, { status: 500 });
  }

  let result;
  try {
    result = await fillAcroForm(templateBytes, instrument.pdf_field_map ?? {}, instrument.answers);
  } catch (err) {
    console.error("[gov-forms/download-pdf] fill failed:", err);
    return NextResponse.json({ error: "Could not fill the PDF" }, { status: 500 });
  }

  return new Response(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": pdfContentDisposition(`${form.form_number} - ${form.title}`),
      "X-Filled-Field-Count": String(result.filledFieldCount),
      "X-Skipped-Field-Count": String(result.skippedFields.length),
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { generateDocument, docxContentDisposition } from "@/lib/doc-generator";
import { finalizeDocumentSubmission, stampFactsSynced } from "@/lib/document-utils";
import { BYPASS_USER_ID, WIZARD_LABELS } from "@/lib/types";
import type { CaseFile, FactItem, Profile, WizardType } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function POST(req: NextRequest) {
  const { caseFileId, wizardType, wizardData, title } = await req.json();

  if (!caseFileId || !wizardType || !wizardData) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
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
  }

  // Load all needed data in parallel
  const [{ data: caseFileRow }, { data: factRows }, { data: profileRow }] =
    await Promise.all([
      db.from("case_files").select("*").eq("id", caseFileId).single(),
      db.from("fact_items").select("*").eq("case_file_id", caseFileId),
      db.from("profiles").select("*").eq("id", userId).single(),
    ]);

  if (!caseFileRow || !profileRow) {
    return NextResponse.json({ error: "Case file or profile not found" }, { status: 404 });
  }

  const caseFile = caseFileRow as CaseFile;
  const facts = (factRows ?? []) as FactItem[];
  const profile = profileRow as Profile;

  // Generate the .docx
  let buffer: Buffer;
  try {
    buffer = await generateDocument({
      docType: wizardType as WizardType,
      wizardData,
      caseFile,
      facts,
      profile,
    });
  } catch (err) {
    console.error("[documents/generate] generation error:", err);
    return NextResponse.json({ error: "Document generation failed" }, { status: 500 });
  }

  // Create the document record
  const docTitle = title ?? WIZARD_LABELS[wizardType as WizardType] ?? wizardType;
  const { data: docRecord, error: docErr } = await db
    .from("documents")
    .insert({
      case_file_id: caseFileId,
      user_id: userId,
      doc_type: wizardType,
      title: docTitle,
      status: "draft",
      content_json: wizardData,
      draft_text: null,
    })
    .select("*")
    .single();

  if (docErr || !docRecord) {
    return NextResponse.json({ error: "Failed to save document record" }, { status: 500 });
  }

  await finalizeDocumentSubmission(db, docRecord.id, userId);

  // Stamp the file state this document was generated against (best-effort), so
  // it can later be flagged "out of date" when the client's facts change.
  await stampFactsSynced(db, docRecord.id);

  // Return the .docx as download (client saves for display; attorney downloads from dashboard)
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": docxContentDisposition(docTitle),
      "X-Document-Id": docRecord.id,
    },
  });
}

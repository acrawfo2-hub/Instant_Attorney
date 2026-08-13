import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";
import { resolveExecution, isQuickSignExecution } from "@/lib/execution";
import { extractRequestAudit } from "@/lib/agreement-sign";
import {
  createSignatureRequest,
  isDropboxSignConfigured,
} from "@/lib/dropbox-sign";
import {
  generateDocxFromText,
  profileForDocumentType,
  isAttorneyApproved,
} from "@/lib/doc-generator";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

/**
 * POST — start or complete execution for an attorney-approved document.
 *
 * Body:
 *   { action: "quick_sign", signatureName: string }
 *   { action: "dropbox_sign", signerEmail?: string, signerName?: string }
 *   { action: "status" }  — returns execution metadata + provider availability
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = (body?.action as string) || "status";

  const userDb = BYPASS_AUTH ? createServiceClient() : await createClient();
  const serviceDb = createServiceClient();

  let userId: string;
  let userEmail = "";
  let userName = "";
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
    userEmail = "test@instant-attorney.dev";
    userName = "Test User";
  } else {
    const {
      data: { user },
      error,
    } = await (userDb as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
    userEmail = user.email ?? "";
    const { data: profile } = await userDb
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .single();
    userName = profile?.full_name || userEmail;
    if (profile?.email) userEmail = profile.email;
  }

  const { data: doc, error: docErr } = await userDb
    .from("documents")
    .select("*")
    .eq("id", id)
    .single();

  if (docErr || !doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (doc.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if ((doc.content_json as Record<string, unknown> | null)?.generation_incomplete === true) {
    return NextResponse.json({ error: "An incomplete generation cannot be signed." }, { status: 409 });
  }
  if (!isAttorneyApproved(doc.status)) {
    return NextResponse.json(
      { error: "Document must be attorney-approved before signing" },
      { status: 400 }
    );
  }

  const planKey =
    typeof doc.instrument_key === "string" && doc.instrument_key.trim()
      ? doc.instrument_key.trim()
      : typeof (doc.content_json as Record<string, unknown> | null)?.plan_key === "string"
      ? ((doc.content_json as Record<string, unknown>).plan_key as string)
      : null;

  const execution = resolveExecution({
    instrumentKey: planKey,
    title: doc.title,
    docType: doc.doc_type,
  });

  if (action === "status") {
    const { data: latest } = await userDb
      .from("document_executions")
      .select("*")
      .eq("document_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      execution,
      dropboxSignConfigured: isDropboxSignConfigured(),
      latest: latest ?? null,
    });
  }

  if (action === "quick_sign") {
    if (!isQuickSignExecution(execution)) {
      return NextResponse.json(
        {
          error:
            "This document needs witnesses, a notary, or a court filing — use the print packet instead of in-app e-sign.",
          execution,
        },
        { status: 400 }
      );
    }
    const signatureName = String(body?.signatureName ?? "").trim();
    if (!signatureName) {
      return NextResponse.json({ error: "signatureName is required" }, { status: 400 });
    }

    const audit = extractRequestAudit(req);
    const draftText = String(doc.draft_text ?? "");
    const content_sha256 = createHash("sha256").update(draftText).digest("hex");

    const { data: row, error: insertErr } = await serviceDb
      .from("document_executions")
      .insert({
        document_id: doc.id,
        case_file_id: doc.case_file_id,
        user_id: userId,
        execution_mode: execution.mode,
        status: "signed",
        signature_name: signatureName,
        content_sha256,
        signer_ip: audit.signer_ip,
        signer_user_agent: audit.signer_user_agent,
        provider: "in_app",
        metadata: {
          instrument_key: planKey,
          badge: execution.badge,
        },
        signed_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // Mark delivered once the client has executed — closes the lifecycle.
    await serviceDb
      .from("documents")
      .update({ status: "delivered", updated_at: new Date().toISOString() })
      .eq("id", doc.id)
      .eq("status", "approved");

    return NextResponse.json({ ok: true, execution: row });
  }

  if (action === "dropbox_sign") {
    if (!execution.esign_allowed) {
      return NextResponse.json(
        {
          error:
            "Dropbox Sign is not appropriate for this instrument — print and follow the formalities packet.",
          execution,
        },
        { status: 400 }
      );
    }
    if (!isDropboxSignConfigured()) {
      return NextResponse.json(
        {
          error: "Dropbox Sign is not configured. Use in-app quick sign, or set DROPBOX_SIGN_API_KEY.",
        },
        { status: 503 }
      );
    }

    const signerName = String(body?.signerName ?? userName).trim() || userName;
    const signerEmail = String(body?.signerEmail ?? userEmail).trim() || userEmail;
    if (!signerEmail) {
      return NextResponse.json({ error: "signerEmail is required" }, { status: 400 });
    }

    const { data: caseFile } = await userDb
      .from("case_files")
      .select("matter_subtype, jurisdiction")
      .eq("id", doc.case_file_id)
      .single();

    const buffer = await generateDocxFromText(
      doc.title,
      String(doc.draft_text ?? ""),
      profileForDocumentType(doc.doc_type),
      caseFile,
      doc.status
    );

    const result = await createSignatureRequest({
      title: doc.title,
      subject: `Please sign: ${doc.title}`,
      message:
        "Please review and sign this attorney-approved document from Crawford Law PLLC / Instant Attorney.",
      signers: [{ name: signerName, email: signerEmail, order: 0 }],
      file: buffer,
      fileName: `${doc.title}.docx`,
      metadata: {
        document_id: doc.id,
        case_file_id: doc.case_file_id,
        user_id: userId,
      },
    });

    if (!result) {
      return NextResponse.json({ error: "Dropbox Sign unavailable" }, { status: 503 });
    }

    const { data: row, error: insertErr } = await serviceDb
      .from("document_executions")
      .insert({
        document_id: doc.id,
        case_file_id: doc.case_file_id,
        user_id: userId,
        execution_mode: "dropbox_sign",
        status: "sent_for_signature",
        signature_name: signerName,
        dropbox_signature_request_id: result.signatureRequestId,
        provider: "dropbox_sign",
        metadata: {
          signer_email: signerEmail,
          instrument_key: planKey,
        },
      })
      .select("*")
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      signatureRequestId: result.signatureRequestId,
      execution: row,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  // Convenience alias for status.
  const fake = new NextRequest(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({ action: "status" }),
  });
  return POST(fake, ctx);
}

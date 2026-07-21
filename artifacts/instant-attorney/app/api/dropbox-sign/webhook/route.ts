import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyDropboxSignEventHash, isDropboxSignConfigured } from "@/lib/dropbox-sign";

/**
 * Dropbox Sign (HelloSign) webhook.
 * Configure the callback URL to /api/dropbox-sign/webhook and enable event hashing.
 *
 * HelloSign posts multipart form fields; we accept JSON-shaped `{ json: "..." }`
 * or a raw JSON body for easier local testing.
 */
export async function POST(req: NextRequest) {
  if (!isDropboxSignConfigured()) {
    return NextResponse.json({ error: "Dropbox Sign not configured" }, { status: 503 });
  }

  const contentType = req.headers.get("content-type") || "";
  let event: {
    event_time?: string;
    event_type?: string;
    event_hash?: string;
    event?: { event_time?: string; event_type?: string; event_hash?: string };
    signature_request?: { signature_request_id?: string; metadata?: Record<string, string> };
  };

  try {
    if (contentType.includes("application/json")) {
      event = await req.json();
    } else {
      const form = await req.formData();
      const raw = form.get("json");
      event = raw ? JSON.parse(String(raw)) : {};
    }
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const eventTime = event.event_time ?? event.event?.event_time ?? "";
  const eventType = event.event_type ?? event.event?.event_type ?? "";
  const eventHash = event.event_hash ?? event.event?.event_hash ?? "";

  if (!eventTime || !eventType || !eventHash) {
    return NextResponse.json({ error: "Missing event fields" }, { status: 400 });
  }

  if (!verifyDropboxSignEventHash({ eventTime, eventType, eventHash })) {
    return NextResponse.json({ error: "Invalid event hash" }, { status: 401 });
  }

  // HelloSign expects a literal "Hello API Event Received" body on success.
  const ok = () =>
    new NextResponse("Hello API Event Received", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });

  const signatureRequestId =
    event.signature_request?.signature_request_id ??
    (event as { signature_request_id?: string }).signature_request_id;

  if (!signatureRequestId) return ok();

  const serviceDb = createServiceClient();
  const completed =
    eventType === "signature_request_all_signed" ||
    eventType === "signature_request_signed";
  const declined =
    eventType === "signature_request_declined" || eventType === "signature_request_canceled";

  if (completed) {
    await serviceDb
      .from("document_executions")
      .update({
        status: eventType === "signature_request_all_signed" ? "completed" : "signed",
        signed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("dropbox_signature_request_id", signatureRequestId);

    if (eventType === "signature_request_all_signed") {
      const { data: exec } = await serviceDb
        .from("document_executions")
        .select("document_id")
        .eq("dropbox_signature_request_id", signatureRequestId)
        .limit(1)
        .maybeSingle();
      if (exec?.document_id) {
        await serviceDb
          .from("documents")
          .update({ status: "delivered", updated_at: new Date().toISOString() })
          .eq("id", exec.document_id)
          .eq("status", "approved");
      }
    }
  } else if (declined) {
    await serviceDb
      .from("document_executions")
      .update({
        status: "declined",
        updated_at: new Date().toISOString(),
      })
      .eq("dropbox_signature_request_id", signatureRequestId);
  }

  return ok();
}

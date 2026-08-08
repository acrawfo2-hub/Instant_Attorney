import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { runStrengthCheck } from "@/lib/strength-check";
import { BYPASS_USER_ID } from "@/lib/types";

// Run the client-facing adversarial Strength Check for a case file.
//
// The generation is a single long Sonnet call (can exceed a minute), so we
// stream NDJSON: periodic heartbeats keep the proxied connection alive while
// the model runs and the final line carries the result — same pattern as the
// attorney second-draft route. See client in components/StrengthCheckCard.tsx.

export const maxDuration = 300;

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: caseFileId } = await params;
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
    const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", userId).maybeSingle();
    isAttorney = Boolean(profile?.is_attorney);
  }

  // Owner or attorney. The attorney reads/writes via the service client (RLS
  // scopes the session client to the owner's rows — see attorney-parity note).
  const svc = createServiceClient();
  const readDb = BYPASS_AUTH || isAttorney ? svc : db;
  const { data: cf } = await readDb
    .from("case_files")
    .select("id, user_id")
    .eq("id", caseFileId)
    .maybeSingle();
  if (!cf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!BYPASS_AUTH && !isAttorney && cf.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          /* controller already closed */
        }
      };
      const heartbeat = setInterval(() => send({ type: "heartbeat" }), 10000);
      send({ type: "heartbeat" });

      try {
        const check = await runStrengthCheck(readDb, {
          caseFileId,
          userId: cf.user_id,
          actorId: isAttorney && userId !== cf.user_id ? userId : undefined,
        });
        send({ type: "result", check });
      } catch (err) {
        const message = err instanceof Error ? err.message : "The analysis failed — try again.";
        console.error("[strength-check] run failed:", message);
        send({ type: "error", error: message });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

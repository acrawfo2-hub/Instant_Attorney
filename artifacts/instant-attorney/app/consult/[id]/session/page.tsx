import { redirect, notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth/require-attorney";
import ConsultSessionView from "@/components/ConsultSessionView";
import type { ConsultRequest, CaseFile, Profile, ConsultNote, ConsultRecording } from "@/lib/types";

export const dynamic = "force-dynamic";

// Companion surface for a live consult happening over Google Meet/Zoom — this
// page never runs the call itself. It renders in one of two modes, both
// backed by the same consult_requests row:
//   - "client":   the client who owns the consult. Sees only that a session
//                 exists; notes/recording/transcript are attorney work
//                 product, not client-visible (see schema-stage32).
//   - "attorney": the attorney working with their own client. Always fully
//                 editable — before, during, and after the call — so notes
//                 can keep being added/corrected after "End session" too.
//                 This is a solo/small-firm tool: the attorney who ran the
//                 call is the only one who ever opens it, so there's no
//                 separate read-only reviewer state to gate around.
export default async function ConsultSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db, userId, isAttorney } = await requireViewer();

  const { data: consultRow } = await db.from("consult_requests").select("*").eq("id", id).single();
  if (!consultRow) notFound();
  const consult = consultRow as ConsultRequest;

  if (!isAttorney) {
    if (consult.user_id !== userId) notFound();
  }

  // Nothing to show before the time is actually confirmed, or after it's
  // been cancelled — send both roles back to where consults are managed.
  if (consult.status !== "confirmed" && consult.status !== "completed") {
    redirect(isAttorney ? "/attorney" : "/dashboard");
  }

  const mode: "client" | "attorney" = isAttorney ? "attorney" : "client";

  const [{ data: caseFileRow }, { data: clientProfileRow }, { data: noteRows }, { data: recordingRows }] =
    await Promise.all([
      consult.case_file_id
        ? db.from("case_files").select("*").eq("id", consult.case_file_id).single()
        : Promise.resolve({ data: null }),
      db.from("profiles").select("*").eq("id", consult.user_id).single(),
      mode === "client"
        ? Promise.resolve({ data: [] })
        : db
            .from("consult_notes")
            .select("*")
            .eq("consult_request_id", id)
            .order("created_at", { ascending: true }),
      mode === "client"
        ? Promise.resolve({ data: [] })
        : db
            .from("consult_recordings")
            .select("*")
            .eq("consult_request_id", id)
            .order("recorded_at", { ascending: true }),
    ]);

  return (
    <ConsultSessionView
      mode={mode}
      consult={consult}
      caseFile={(caseFileRow as CaseFile | null) ?? null}
      clientProfile={(clientProfileRow as Profile | null) ?? null}
      notes={(noteRows ?? []) as ConsultNote[]}
      recordings={(recordingRows ?? []) as ConsultRecording[]}
    />
  );
}

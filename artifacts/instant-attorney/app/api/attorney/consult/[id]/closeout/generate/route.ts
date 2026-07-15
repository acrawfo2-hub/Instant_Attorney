import { NextRequest, NextResponse } from "next/server";
import { requireViewerForRoute } from "@/lib/auth/require-attorney";
import { generateConsultCloseoutDraft } from "@/lib/consult-closeout-generate";

// Attorney-only: draft the closeout report from the consult's notes and
// transcript. Overwrites wrap_up_draft — the attorney reviews/edits the
// result before sending it on via POST /api/attorney/consult/[id]/wrap-up.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const viewer = await requireViewerForRoute();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.isAttorney) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const draft = await generateConsultCloseoutDraft(viewer.db, id, viewer.userId);
    return NextResponse.json({ wrapUp: draft });
  } catch (err) {
    console.error("[consult/closeout/generate] error:", err);
    const message = err instanceof Error ? err.message : "Failed to generate closeout draft";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getClientContext } from "@/lib/client-workspace-auth";
import { docxContentDisposition, generateDocxFromText } from "@/lib/doc-generator";
import type { ClientWorkspaceDraft } from "@/lib/types";

function safeDocumentTitle(title: string): string {
  return (title || "draft")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .trim()
    .slice(0, 80) || "draft";
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getClientContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data, error } = await ctx.db
    .from("client_workspace_drafts")
    .select("*")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  const draft = data as ClientWorkspaceDraft;
  const title = safeDocumentTitle(draft.title);
  let buffer: Buffer;
  try {
    // The shared renderer converts the draft's Markdown structure into native
    // Word headings, paragraphs, lists, and highlighted placeholder runs.
    buffer = await generateDocxFromText(title, draft.content, null);
  } catch (error) {
    console.error("[workspace/drafts/download] docx generation error:", error);
    return NextResponse.json({ error: "Could not build the document file" }, { status: 500 });
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": docxContentDisposition(title),
      "Cache-Control": "no-store",
    },
  });
}

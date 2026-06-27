import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";
import { buildCounselContextPatch, persistCounselContext } from "@/lib/existing-counsel-persist";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

async function resolveOwnedCase(caseFileId: string) {
  let userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let authDb: any;
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
    authDb = createServiceClient();
  } else {
    authDb = await createClient();
    const { data: { user }, error } = await authDb.auth.getUser();
    if (error || !user) return { error: "Unauthorized", status: 401 } as const;
    userId = user.id;
  }
  if (!caseFileId) return { error: "Missing case file", status: 400 } as const;
  const { data: cf } = await authDb
    .from("case_files")
    .select("id, user_id")
    .eq("id", caseFileId)
    .maybeSingle();
  if (!cf || cf.user_id !== userId) return { error: "Not found", status: 404 } as const;
  return { userId, write: createServiceClient(), caseFileId: cf.id } as const;
}

/** Read counsel intake status for a case file. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const owned = await resolveOwnedCase(id);
  if ("error" in owned) return NextResponse.json({ error: owned.error }, { status: owned.status });

  const { data, error } = await owned.write
    .from("case_files")
    .select("counsel_intake_at, has_existing_counsel, existing_counsel_name, counsel_engagement_goal")
    .eq("id", owned.caseFileId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

/** Record whether the client already has another attorney and what they want here. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const owned = await resolveOwnedCase(id);
  if ("error" in owned) return NextResponse.json({ error: owned.error }, { status: owned.status });

  const body = await req.json().catch(() => null);
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const built = buildCounselContextPatch({
    has_existing_counsel: b.has_existing_counsel === true,
    unsure: b.unsure === true,
    existing_counsel_name: typeof b.existing_counsel_name === "string" ? b.existing_counsel_name : null,
    counsel_engagement_goal: b.counsel_engagement_goal as never,
  });

  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  const result = await persistCounselContext(
    owned.write,
    owned.caseFileId,
    owned.userId,
    built,
    b.has_existing_counsel === true
  );
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...built });
}

import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function GET() {
  let userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;

  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
    db = createServiceClient();
  } else {
    db = await createClient();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;
  }

  const { data: files } = await db
    .from("case_files")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["open", "archived"])
    .order("opened_at", { ascending: false });

  return NextResponse.json({ files: files ?? [] });
}

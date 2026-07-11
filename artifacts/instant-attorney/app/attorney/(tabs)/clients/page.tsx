import { createServiceClient } from "@/lib/supabase/server";
import type { CaseFile, Profile } from "@/lib/types";
import AttorneyFileLog from "@/components/AttorneyFileLog";

export const dynamic = "force-dynamic";

export default async function AttorneyClientsPage() {
  const db = createServiceClient();

  const { data: caseFiles } = await db
    .from("case_files")
    .select("*, profiles!case_files_user_id_fkey(*)")
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(200);

  const files = (caseFiles ?? []) as (CaseFile & { profiles: Profile | null })[];

  return (
    <section className="atty-section">
      <h2 className="atty-section-title">
        Client Files
        {files.length > 0 && <span className="atty-count">{files.length}</span>}
      </h2>
      <AttorneyFileLog files={files} />
    </section>
  );
}

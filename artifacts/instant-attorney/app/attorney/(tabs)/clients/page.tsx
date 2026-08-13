import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import type { CaseFile, Profile } from "@/lib/types";
import AttorneyFileLog from "@/components/AttorneyFileLog";
import AttorneyOnboardClient from "@/components/AttorneyOnboardClient";

export const dynamic = "force-dynamic";

function matterLabel(cf: CaseFile) {
  const t = cf.matter_type ?? "Unclassified";
  return cf.matter_subtype ? `${t} — ${cf.matter_subtype}` : t;
}

export default async function AttorneyClientsPage() {
  const db = createServiceClient();

  const [{ data: caseFiles }, { data: myClientFiles }] = await Promise.all([
    db
      .from("case_files")
      .select("*, profiles!case_files_user_id_fkey(*)")
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(200),
    db
      .from("case_files")
      .select("*")
      .eq("created_by_attorney", true)
      .neq("status", "archived")
      .order("updated_at", { ascending: false }),
  ]);

  const files = (caseFiles ?? []) as (CaseFile & { profiles: Profile | null })[];
  const myClients = (myClientFiles ?? []) as CaseFile[];

  return (
    <>
      <section className="atty-section">
        <h2 className="atty-section-title">
          My Clients
          {myClients.length > 0 && <span className="atty-count">{myClients.length}</span>}
          <span className="atty-section-hint">clients you onboarded from your practice · private to you</span>
        </h2>
        <div style={{ marginBottom: 16 }}>
          <AttorneyOnboardClient />
        </div>
        {myClients.length === 0 ? (
          <div className="atty-empty">No onboarded clients yet — use “Onboard a client” to add one.</div>
        ) : (
          <table className="atty-table">
            <thead>
              <tr><th>Client</th><th>Matter</th><th>Updated</th><th /></tr>
            </thead>
            <tbody>
              {myClients.map((cf) => (
                <tr key={cf.id}>
                  <td>{cf.client_display_name || "Unnamed client"}{cf.client_email ? ` · ${cf.client_email}` : ""}</td>
                  <td>{matterLabel(cf)}</td>
                  <td>{new Date(cf.updated_at).toLocaleDateString()}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <Link href={`/chat?caseFileId=${cf.id}&mode=freestyle`} className="atty-row-link atty-row-link--secondary">Ask associate</Link>
                    {" · "}
                    <Link href={`/attorney/workbench/${cf.id}`} className="atty-row-link">Open workbench →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="atty-section">
        <h2 className="atty-section-title">
          Client Files
          {files.length > 0 && <span className="atty-count">{files.length}</span>}
        </h2>
        <AttorneyFileLog files={files} />
      </section>
    </>
  );
}

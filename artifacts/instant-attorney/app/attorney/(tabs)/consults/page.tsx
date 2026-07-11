import { createServiceClient } from "@/lib/supabase/server";
import ConsultRequestQueue, { type ConsultRequestRow } from "@/components/ConsultRequestQueue";

export const dynamic = "force-dynamic";

// The full consult picture — unlike the Dashboard's teaser (pending/upcoming
// only, for quick triage), this includes completed consults so the attorney
// can pull up a past closeout report without hunting through a client's file.
export default async function AttorneyConsultsPage() {
  const db = createServiceClient();

  const { data: consultRequests } = await db
    .from("consult_requests")
    .select("*, profiles!consult_requests_user_id_fkey(*), case_files(*)")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(200);

  const consults = (consultRequests ?? []) as ConsultRequestRow[];

  return (
    <section className="atty-section">
      <h2 className="atty-section-title">
        Consults
        {consults.length > 0 && <span className="atty-count">{consults.length}</span>}
      </h2>
      <ConsultRequestQueue requests={consults} />
    </section>
  );
}

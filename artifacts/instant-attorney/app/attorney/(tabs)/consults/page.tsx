import { createServiceClient } from "@/lib/supabase/server";
import ConsultRequestQueue, { type ConsultRequestRow } from "@/components/ConsultRequestQueue";

export const dynamic = "force-dynamic";

const COMPLETED_DISPLAY_LIMIT = 100;

// The full consult picture — unlike the Dashboard's teaser (pending/upcoming
// only, for quick triage), this includes completed consults so the attorney
// can pull up a past closeout report without hunting through a client's file.
//
// Active consults (pending/proposed/confirmed) are fetched unbounded — that
// set is naturally small, bounded by how many are open at once. Completed
// consults accumulate over the firm's whole history, so that query is capped
// and paired with a visible notice when the cap is hit — a silent cutoff
// would defeat this page's whole point (finding an old closeout report).
export default async function AttorneyConsultsPage() {
  const db = createServiceClient();

  const [{ data: activeRows }, { data: completedRows }] = await Promise.all([
    db
      .from("consult_requests")
      .select("*, profiles!consult_requests_user_id_fkey(*), case_files(*)")
      .in("status", ["pending", "attorney_proposed", "confirmed"])
      .order("created_at", { ascending: false }),
    db
      .from("consult_requests")
      .select("*, profiles!consult_requests_user_id_fkey(*), case_files(*)")
      .eq("status", "completed")
      .order("wrap_up_submitted_at", { ascending: false, nullsFirst: false })
      .limit(COMPLETED_DISPLAY_LIMIT + 1),
  ]);

  const active = (activeRows ?? []) as ConsultRequestRow[];
  const completedFetched = (completedRows ?? []) as ConsultRequestRow[];
  const moreCompleted = completedFetched.length > COMPLETED_DISPLAY_LIMIT;
  const completed = completedFetched.slice(0, COMPLETED_DISPLAY_LIMIT);

  const consults = [...active, ...completed];

  return (
    <section className="atty-section">
      <h2 className="atty-section-title">
        Consults
        {consults.length > 0 && <span className="atty-count">{consults.length}</span>}
      </h2>
      <ConsultRequestQueue requests={consults} moreCompleted={moreCompleted} />
    </section>
  );
}

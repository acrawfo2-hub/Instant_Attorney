import SupportQueue from "@/components/admin/SupportQueue";
import { loadSupportQueue } from "@/lib/admin/support-desk";

export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  const queue = await loadSupportQueue();
  return (
    <>
      <div className="admin-title-row">
        <div>
          <h1 className="admin-page-title">Support Desk</h1>
          <p className="admin-intro">
            The fast path for login and IT issues. Account-access tickets arrive
            urgent, every update is audited, and the People console is one click
            away for diagnosis and repair.
          </p>
        </div>
        <span className="admin-badge">Service-role queue</span>
      </div>
      {queue.error ? (
        <div className="admin-alert admin-alert-danger admin-alert-inline">
          <strong>Support queue unavailable.</strong> {queue.error}. Apply{" "}
          <code>supabase/schema-stage54-support-desk.sql</code>.
        </div>
      ) : (
        <SupportQueue initialTickets={queue.tickets} />
      )}
    </>
  );
}

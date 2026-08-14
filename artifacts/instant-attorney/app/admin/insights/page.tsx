import { loadMarketingSnapshot } from "@/lib/admin/marketing-analytics";

export const dynamic = "force-dynamic";

function value(number: number | null) {
  return number == null ? "—" : number.toLocaleString();
}

export default async function AdminInsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const requested = Number((await searchParams).days ?? 30);
  const snapshot = await loadMarketingSnapshot(Number.isFinite(requested) ? requested : 30);
  const peak = Math.max(1, ...snapshot.trend.map((day) => day.views));

  return (
    <>
      <div className="admin-title-row">
        <div>
          <h1 className="admin-page-title">Growth &amp; Marketing</h1>
          <p className="admin-intro">
            A first-party view of attention, acquisition, and conversion signals. It deliberately
            stores no IP addresses, query strings, search terms, or page contents.
          </p>
        </div>
        <div className="admin-report-actions">
          {[7, 30, 90].map((days) => (
            <a key={days} className={days === snapshot.periodDays ? "admin-btn admin-btn-primary" : "admin-btn"} href={`/admin/insights?days=${days}`}>
              {days} days
            </a>
          ))}
          <a className="admin-btn" href={`/api/admin/reports/marketing?days=${snapshot.periodDays}`}>
            Download report (.csv)
          </a>
        </div>
      </div>

      {snapshot.warnings.length > 0 && (
        <div className="admin-alert admin-alert-danger admin-alert-inline">
          <strong>Some data is unavailable.</strong>
          <ul className="admin-alert-list">{snapshot.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      )}

      <section className="admin-metric-grid">
        <div className="admin-card admin-card-accent"><span className="admin-card-label">Unique visitors</span><span className="admin-card-num">{value(snapshot.visitors)}</span><span className="admin-card-detail">{value(snapshot.sessions)} sessions</span></div>
        <div className="admin-card"><span className="admin-card-label">Page views</span><span className="admin-card-num">{value(snapshot.pageViews)}</span><span className="admin-card-detail">First-party events</span></div>
        <div className="admin-card"><span className="admin-card-label">New client accounts</span><span className="admin-card-num">{value(snapshot.newClients)}</span><span className="admin-card-detail">Created in period</span></div>
        <div className="admin-card"><span className="admin-card-label">Matters opened</span><span className="admin-card-num">{value(snapshot.mattersOpened)}</span><span className="admin-card-detail">Client intent</span></div>
        <div className="admin-card"><span className="admin-card-label">Documents created</span><span className="admin-card-num">{value(snapshot.documentsCreated)}</span><span className="admin-card-detail">Product activation</span></div>
        <div className="admin-card"><span className="admin-card-label">Consult requests</span><span className="admin-card-num">{value(snapshot.consultsRequested)}</span><span className="admin-card-detail">High-intent conversion</span></div>
        <div className="admin-card"><span className="admin-card-label">Active subscriptions</span><span className="admin-card-num">{value(snapshot.activeSubscriptions)}</span><span className="admin-card-detail">Current total</span></div>
      </section>

      <section className="admin-section admin-panel">
        <div className="admin-panel-head"><div><h2 className="admin-section-title">Traffic pulse</h2><p className="admin-note">Daily views for the last {snapshot.periodDays} days.</p></div><span className="admin-badge">Updated {new Date(snapshot.generatedAt).toLocaleString()}</span></div>
        <div className="admin-chart" aria-label="Daily page views">
          {snapshot.trend.map((day) => <div className="admin-chart-column" key={day.date} title={`${day.date}: ${day.views} views, ${day.visitors} visitors`}><span className="admin-chart-value">{day.views || ""}</span><div className="admin-chart-bar" style={{ height: `${Math.max(3, (day.views / peak) * 100)}%` }} /><span className="admin-chart-label">{day.date.slice(5)}</span></div>)}
        </div>
      </section>

      <div className="admin-split-panels">
        <section className="admin-section admin-panel"><h2 className="admin-section-title">Top pages</h2>{snapshot.topPages.length ? <table className="admin-table"><thead><tr><th>Page</th><th>Views</th><th>Visitors</th></tr></thead><tbody>{snapshot.topPages.map((row) => <tr key={row.label}><td className="admin-td-feature">{row.label}</td><td>{row.views}</td><td>{row.visitors}</td></tr>)}</tbody></table> : <div className="admin-empty">No tracked visits in this period.</div>}</section>
        <section className="admin-section admin-panel"><h2 className="admin-section-title">Acquisition sources</h2>{snapshot.topSources.length ? <table className="admin-table"><thead><tr><th>Source</th><th>Views</th><th>Visitors</th></tr></thead><tbody>{snapshot.topSources.map((row) => <tr key={row.label}><td className="admin-td-feature">{row.label}</td><td>{row.views}</td><td>{row.visitors}</td></tr>)}</tbody></table> : <div className="admin-empty">No source data in this period.</div>}</section>
      </div>
    </>
  );
}

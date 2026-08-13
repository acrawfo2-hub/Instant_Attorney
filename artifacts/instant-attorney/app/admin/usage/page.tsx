import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Human labels for the usage_events.feature values that carry token telemetry. */
const FEATURE_LABELS: Record<string, string> = {
  wizard: "Client draft",
  auto_critical_review: "Auto critical review",
  attorney_review: "Attorney review",
  attorney_second_draft_fitness: "Second draft — fitness check",
  attorney_second_draft: "Attorney second draft (Opus)",
  attorney_chat_edit: "Attorney chat edit",
  attorney_merge: "Attorney merge",
  attorney_pre_consult: "Pre-consult memo",
  attorney_consult_closeout: "Consult closeout draft",
  attorney_consult_associate: "Consult associate chat",
  attorney_brainstorm: "Attorney brainstorm chat",
  attachment_analysis: "Attachment analysis",
  chat_acp: "Intake chat",
};

function featureLabel(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature;
}

interface LimitEvent {
  id: string;
  created_at: string;
  feature: string;
  model: string | null;
  output_tokens: number | null;
  metadata: {
    prior_limit?: number;
    model_max?: number;
    output_tokens?: number;
    would_have_truncated?: boolean;
    still_truncated?: boolean;
    document_id?: string;
  } | null;
}

interface FeatureSummary {
  feature: string;
  tracked: number;
  wouldHaveHit: number;
  stillTruncated: number;
  maxOutput: number;
  priorLimit: number | null;
  modelMax: number | null;
}

export default async function AdminUsagePage() {
  // Access is gated by app/admin/layout.tsx.
  // Service client bypasses RLS so we see every client's usage, not just our own.
  const service = createServiceClient();
  const { data: rawEvents } = await service
    .from("usage_events")
    .select("id, created_at, feature, model, output_tokens, metadata")
    .eq("metadata->>token_limit_tracked", "true")
    .order("created_at", { ascending: false })
    .limit(1000);

  const events = (rawEvents ?? []) as LimitEvent[];
  const wouldHaveHit = events.filter((e) => e.metadata?.would_have_truncated);
  const stillTruncated = events.filter((e) => e.metadata?.still_truncated);

  // Roll up per feature.
  const byFeature = new Map<string, FeatureSummary>();
  for (const e of events) {
    const out = e.metadata?.output_tokens ?? e.output_tokens ?? 0;
    const existing = byFeature.get(e.feature);
    if (existing) {
      existing.tracked++;
      if (e.metadata?.would_have_truncated) existing.wouldHaveHit++;
      if (e.metadata?.still_truncated) existing.stillTruncated++;
      existing.maxOutput = Math.max(existing.maxOutput, out);
      if (existing.priorLimit == null && e.metadata?.prior_limit != null)
        existing.priorLimit = e.metadata.prior_limit;
      if (existing.modelMax == null && e.metadata?.model_max != null)
        existing.modelMax = e.metadata.model_max;
    } else {
      byFeature.set(e.feature, {
        feature: e.feature,
        tracked: 1,
        wouldHaveHit: e.metadata?.would_have_truncated ? 1 : 0,
        stillTruncated: e.metadata?.still_truncated ? 1 : 0,
        maxOutput: out,
        priorLimit: e.metadata?.prior_limit ?? null,
        modelMax: e.metadata?.model_max ?? null,
      });
    }
  }

  const featureSummaries = [...byFeature.values()].sort(
    (a, b) => b.wouldHaveHit - a.wouldHaveHit || b.maxOutput - a.maxOutput,
  );

  const recent = wouldHaveHit.slice(0, 100);

  return (
    <>
      <h1 className="admin-page-title">Token Limit Monitor</h1>
      <p className="admin-intro">
        Token caps have been removed pipeline-wide — every model now runs to its
        full output ceiling. This page records each call that{" "}
        <strong>would have been truncated</strong> under the old limits, so you
        can tune prompts and limits without ever shipping a cut-off document.
      </p>

      <section className="admin-cards">
        <div className="admin-card">
          <span className="admin-card-num">{events.length}</span>
          <span className="admin-card-label">Calls tracked</span>
        </div>
        <div className="admin-card admin-card-warn">
          <span className="admin-card-num">{wouldHaveHit.length}</span>
          <span className="admin-card-label">Would have hit old cap</span>
        </div>
        <div className="admin-card admin-card-danger">
          <span className="admin-card-num">{stillTruncated.length}</span>
          <span className="admin-card-label">Still hit model ceiling</span>
        </div>
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">By feature</h2>
        {featureSummaries.length === 0 ? (
          <div className="admin-empty">
            No tracked calls yet. Generate a document to populate this.
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Tracked</th>
                <th>Would-hit</th>
                <th>Still truncated</th>
                <th>Max output</th>
                <th>Old cap</th>
                <th>Model max</th>
              </tr>
            </thead>
            <tbody>
              {featureSummaries.map((f) => (
                <tr
                  key={f.feature}
                  className={f.wouldHaveHit > 0 ? "admin-tr-warn" : ""}
                >
                  <td className="admin-td-feature">
                    {featureLabel(f.feature)}
                  </td>
                  <td>{f.tracked}</td>
                  <td>
                    {f.wouldHaveHit > 0 ? <strong>{f.wouldHaveHit}</strong> : 0}
                  </td>
                  <td>
                    {f.stillTruncated > 0 ? (
                      <strong className="admin-danger-text">
                        {f.stillTruncated}
                      </strong>
                    ) : (
                      0
                    )}
                  </td>
                  <td>{f.maxOutput.toLocaleString()}</td>
                  <td className="admin-td-muted">
                    {f.priorLimit?.toLocaleString() ?? "—"}
                  </td>
                  <td className="admin-td-muted">
                    {f.modelMax?.toLocaleString() ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">
          Recent would-have-hit events
          {recent.length > 0 && (
            <span className="admin-count">{recent.length}</span>
          )}
        </h2>
        {recent.length === 0 ? (
          <div className="admin-empty">
            Nothing has exceeded an old cap yet.
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Feature</th>
                <th>Model</th>
                <th>Output</th>
                <th>Old cap</th>
                <th>Over by</th>
                <th>Still truncated</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((e) => {
                const out = e.metadata?.output_tokens ?? e.output_tokens ?? 0;
                const cap = e.metadata?.prior_limit ?? 0;
                const over = cap > 0 ? out - cap : 0;
                return (
                  <tr key={e.id}>
                    <td className="admin-td-muted">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="admin-td-feature">
                      {featureLabel(e.feature)}
                    </td>
                    <td className="admin-td-muted">{e.model ?? "—"}</td>
                    <td>{out.toLocaleString()}</td>
                    <td className="admin-td-muted">{cap.toLocaleString()}</td>
                    <td>
                      <strong>+{over.toLocaleString()}</strong>
                    </td>
                    <td>
                      {e.metadata?.still_truncated ? (
                        <span className="admin-badge admin-badge-danger">
                          Yes
                        </span>
                      ) : (
                        <span className="admin-badge">No</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { parsePreConsultMemo, type ConsultBriefSnapshot } from "@/lib/consult-brief";
import ConsultWrapUpSection from "@/components/ConsultWrapUpSection";
import ConsultFeeEstimateSection from "@/components/ConsultFeeEstimateSection";
import type { ConsultRequestStatus } from "@/lib/types";

function engagementClass(level: ConsultBriefSnapshot["engagement"]["level"]) {
  if (level === "high") return "cb-engagement-high";
  if (level === "low") return "cb-engagement-low";
  return "cb-engagement-moderate";
}

function engagementLabel(level: ConsultBriefSnapshot["engagement"]["level"]) {
  if (level === "high") return "Highly engaged";
  if (level === "low") return "Low engagement";
  return "Moderately engaged";
}

type BriefTab = "preparation" | "fee-guidance" | "wrap-up";

export default function ConsultBriefPanel({
  caseFileId,
  consultId,
  consultStatus,
  initialMemo,
  autoGenerate = false,
}: {
  caseFileId: string;
  consultId: string;
  consultStatus: ConsultRequestStatus;
  initialMemo: string | null;
  autoGenerate?: boolean;
}) {
  const showWrapUp = consultStatus === "confirmed" || consultStatus === "completed";
  const [expanded, setExpanded] = useState(showWrapUp);
  const [tab, setTab] = useState<BriefTab>(showWrapUp ? "wrap-up" : "preparation");
  const [snapshot, setSnapshot] = useState<ConsultBriefSnapshot | null>(null);
  const [memo, setMemo] = useState<string | null>(initialMemo);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/attorney/case-files/${caseFileId}/consult-brief?consultId=${encodeURIComponent(consultId)}`,
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to load brief");
      }
      const data = (await res.json()) as ConsultBriefSnapshot;
      setSnapshot(data);
      if (data.preConsultMemo) setMemo(data.preConsultMemo);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load brief");
    } finally {
      setLoading(false);
    }
  }, [caseFileId, consultId]);

  const generateMemo = useCallback(async () => {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch(`/api/attorney/case-files/${caseFileId}/pre-consult`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Memo generation failed");
      }
      const data = await res.json();
      setMemo(data.pre_consult_memo ?? null);
      setTruncated(Boolean(data.truncated));
      await loadSnapshot();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Memo generation failed");
    } finally {
      setGenerating(false);
    }
  }, [caseFileId, loadSnapshot]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    if (tab !== "preparation" || !autoGenerate || memo || generating) return;
    void generateMemo();
  }, [tab, autoGenerate, memo, generating, generateMemo]);

  const briefReady = Boolean(memo);
  const sections = memo ? parsePreConsultMemo(memo) : [];

  return (
    <div className="cb-panel">
      <div className="cb-panel-header">
        <button
          type="button"
          className="cb-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <span className="cb-toggle-label">
            Consult workspace
            {tab === "preparation" && (
              <span className={`cb-status ${briefReady ? "cb-status-ready" : generating ? "cb-status-generating" : "cb-status-pending"}`}>
                {generating ? "Generating…" : briefReady ? "Brief ready" : "Brief pending"}
              </span>
            )}
            {snapshot && !expanded && (
              <span className="cb-preview">
                {snapshot.documents.requested > 0 && (
                  <span>{snapshot.documents.uploaded}/{snapshot.documents.requested - snapshot.documents.waived} docs</span>
                )}
                <span className={engagementClass(snapshot.engagement.level)}>
                  {engagementLabel(snapshot.engagement.level)}
                </span>
              </span>
            )}
          </span>
          <span className="cb-chevron">{expanded ? "▾" : "▸"}</span>
        </button>
        <Link href={`/attorney/file/${caseFileId}`} className="cb-full-file-link">
          Full file →
        </Link>
        <Link
          href={`/attorney/file/${caseFileId}/brief-pack${consultId ? `?consultId=${encodeURIComponent(consultId)}` : ""}`}
          className="cb-brief-pack-link"
          title="Living File + gaps + drafts + attachments — print or save as PDF"
        >
          Brief pack ↗
        </Link>
      </div>

      {expanded && (
        <div className="cb-body">
          <div className="atty-panel-tabs">
            <button
              type="button"
              className={`atty-panel-tab${tab === "preparation" ? " atty-panel-tab-active" : ""}`}
              onClick={() => setTab("preparation")}
            >
              Preparation
            </button>
            <button
              type="button"
              className={`atty-panel-tab${tab === "fee-guidance" ? " atty-panel-tab-active" : ""}`}
              onClick={() => setTab("fee-guidance")}
            >
              Fee guidance
            </button>
            {showWrapUp && (
              <button
                type="button"
                className={`atty-panel-tab${tab === "wrap-up" ? " atty-panel-tab-active" : ""}`}
                onClick={() => setTab("wrap-up")}
              >
                Wrap-up &amp; action plan
              </button>
            )}
          </div>

          {tab === "wrap-up" && showWrapUp ? (
            <ConsultWrapUpSection consultId={consultId} consultStatus={consultStatus} />
          ) : tab === "fee-guidance" ? (
            <ConsultFeeEstimateSection consultId={consultId} consultStatus={consultStatus} />
          ) : (
            <>
              {loading && !snapshot && <div className="atty-ai-running">Loading case snapshot…</div>}
              {error && <p className="atty-ai-error">{error}</p>}

              {snapshot && (
                <div className="cb-snapshot">
                  <div className="cb-snapshot-row">
                    <div className="cb-stat">
                      <span className="cb-stat-label">Documents</span>
                      <span className="cb-stat-value">
                        {snapshot.documents.uploaded}/{Math.max(snapshot.documents.requested - snapshot.documents.waived, 0) || "—"}
                        {snapshot.documents.requested > 0 ? " uploaded" : " on file"}
                      </span>
                    </div>
                    <div className="cb-stat">
                      <span className="cb-stat-label">Engagement</span>
                      <span className={`cb-stat-value ${engagementClass(snapshot.engagement.level)}`}>
                        {engagementLabel(snapshot.engagement.level)}
                      </span>
                    </div>
                    {snapshot.timeline.currentStage && (
                      <div className="cb-stat">
                        <span className="cb-stat-label">Stage</span>
                        <span className="cb-stat-value">{snapshot.timeline.currentStage}</span>
                      </div>
                    )}
                  </div>

                  {snapshot.goals.length > 0 && (
                    <div className="cb-block">
                      <div className="cb-block-title">Client goals</div>
                      <ul className="cb-list">
                        {snapshot.goals.slice(0, 3).map((g) => (
                          <li key={g}>{g}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {snapshot.valueHints.length > 0 && (
                    <div className="cb-block">
                      <div className="cb-block-title">Value signals</div>
                      <ul className="cb-list">
                        {snapshot.valueHints.map((v) => (
                          <li key={v.label}>
                            <strong>{v.label}:</strong> {v.range}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {snapshot.timeline.urgentNote && (
                    <div className="cb-urgent">{snapshot.timeline.urgentNote}</div>
                  )}

                  {snapshot.openGaps.length > 0 && (
                    <div className="cb-block">
                      <div className="cb-block-title">Open gaps ({snapshot.openGaps.length})</div>
                      <ul className="cb-list cb-list-muted">
                        {snapshot.openGaps.map((g) => (
                          <li key={g}>{g}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="cb-memo-section">
                <div className="cb-memo-header">
                  <span className="cb-block-title">AI briefing memo</span>
                  <button
                    type="button"
                    className={`atty-ai-btn${memo ? " atty-ai-btn-done" : ""}`}
                    onClick={() => void generateMemo()}
                    disabled={generating}
                  >
                    {generating ? "Generating…" : memo ? "Refresh memo" : "Generate brief"}
                  </button>
                </div>
                {truncated && (
                  <p className="cb-truncation">Memo may be incomplete — output hit the token limit.</p>
                )}
                {generating && !memo && <div className="atty-ai-running">Generating pre-consult memo…</div>}
                {!generating && memo && sections.length > 0 && (
                  <div className="cb-memo-sections">
                    {sections.map((s) => (
                      <div key={s.title} className="cb-memo-block">
                        <div className="cb-memo-block-title">{s.title}</div>
                        <pre className="cb-memo-block-body">{s.body}</pre>
                      </div>
                    ))}
                  </div>
                )}
                {!generating && memo && sections.length === 0 && (
                  <pre className="atty-review-preformatted">{memo}</pre>
                )}
                {!generating && !memo && (
                  <p className="atty-ai-empty">
                    No briefing memo yet. Generate one to prepare for this consult.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

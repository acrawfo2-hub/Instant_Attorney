"use client";

import { useCallback, useEffect, useState } from "react";
import type { CheckReport, CheckStatus } from "@/lib/admin/checks/types";

interface HealthReport {
  overall: CheckStatus;
  checks: CheckReport[];
  ranAt: string;
  durationMs: number;
}

const STATUS_LABEL: Record<CheckStatus, string> = {
  ok: "OK",
  warn: "Warning",
  fail: "Failing",
  skip: "Skipped",
};

const GROUP_LABEL: Record<string, string> = {
  database: "Database",
  routing: "Routing",
  integrations: "Integrations",
  runtime: "Runtime",
  config: "Configuration",
};

function statusClass(status: CheckStatus): string {
  return `admin-check admin-check-${status}`;
}

export default function HealthBoard() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rerunning, setRerunning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/health", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setReport(body as HealthReport);
    } catch {
      setError("Network error running the checks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rerunOne = useCallback(async (id: string) => {
    setRerunning(id);
    try {
      const res = await fetch(`/api/admin/health?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      const fresh = (body.checks ?? [])[0] as CheckReport | undefined;
      if (fresh) {
        setReport((prev) =>
          prev ? { ...prev, checks: prev.checks.map((c) => (c.id === fresh.id ? fresh : c)) } : prev
        );
      }
    } catch {
      // A failed re-run leaves the previous result in place; the board is still true.
    } finally {
      setRerunning(null);
    }
  }, []);

  if (loading && !report) return <div className="admin-empty">Running checks…</div>;
  if (error) return <div className="admin-alert admin-alert-danger">{error}</div>;
  if (!report) return null;

  const failing = report.checks.filter((c) => c.result.status === "fail");
  const warning = report.checks.filter((c) => c.result.status === "warn");
  const groups = [...new Set(report.checks.map((c) => c.group))];

  return (
    <>
      <div className={`admin-verdict ${
        report.overall === "ok"
          ? "admin-verdict-ok"
          : report.overall === "fail"
            ? "admin-verdict-danger"
            : "admin-verdict-warn"
      }`}>
        <span className="admin-verdict-text">
          {report.overall === "ok"
            ? `All ${report.checks.length} checks passing.`
            : `${failing.length} failing, ${warning.length} warning, of ${report.checks.length} checks.`}
        </span>
        <button className="admin-btn" onClick={() => void load()} disabled={loading}>
          {loading ? "Re-running…" : "Re-run all"}
        </button>
      </div>

      <p className="admin-note">
        Ran {new Date(report.ranAt).toLocaleString()} in {(report.durationMs / 1000).toFixed(1)}s.
      </p>

      {groups.map((group) => (
        <section className="admin-section" key={group}>
          <h2 className="admin-section-title">{GROUP_LABEL[group] ?? group}</h2>
          {report.checks
            .filter((c) => c.group === group)
            .map((c) => (
              <CheckCard
                key={c.id}
                check={c}
                busy={rerunning === c.id}
                onRerun={() => void rerunOne(c.id)}
              />
            ))}
        </section>
      ))}
    </>
  );
}

function CheckCard({
  check,
  busy,
  onRerun,
}: {
  check: CheckReport;
  busy: boolean;
  onRerun: () => void;
}) {
  const [open, setOpen] = useState(check.result.status !== "ok");
  const { result } = check;
  const hasDetail = !!result.detail || !!result.fix || (result.rows?.length ?? 0) > 0;

  return (
    <div className={statusClass(result.status)}>
      <div className="admin-check-head">
        <div className="admin-check-title">
          <span className={`admin-dot admin-dot-${result.status}`} aria-hidden />
          <div>
            <strong>{check.title}</strong>
            <div className="admin-check-summary">{result.summary}</div>
          </div>
        </div>
        <div className="admin-check-actions">
          <span className="admin-badge">{STATUS_LABEL[result.status]}</span>
          <span className="admin-check-ms">{check.durationMs}ms</span>
          <button className="admin-btn" onClick={onRerun} disabled={busy}>
            {busy ? "…" : "Re-run"}
          </button>
          {hasDetail && (
            <button className="admin-btn" onClick={() => setOpen((o) => !o)}>
              {open ? "Less" : "More"}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="admin-check-body">
          <p className="admin-check-matters">
            <em>Why it matters:</em> {check.matters}
          </p>
          {result.detail && <p className="admin-check-detail">{result.detail}</p>}

          {result.rows && result.rows.length > 0 && (
            <dl className="admin-fact-list admin-check-rows">
              {result.rows.map((r, i) => (
                <div key={`${r.label}-${i}`} className="admin-fact-row">
                  <dt className={r.bad ? "admin-danger-text" : undefined}>{r.label}</dt>
                  <dd className={r.bad ? "admin-danger-text" : undefined}>{r.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {result.fix && (
            <p className="admin-check-fix">
              <strong>Fix:</strong> {result.fix}
            </p>
          )}
          {check.memo && <p className="admin-finding-memo">{check.memo}</p>}
        </div>
      )}
    </div>
  );
}

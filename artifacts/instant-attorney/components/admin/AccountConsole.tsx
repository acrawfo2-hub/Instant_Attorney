"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AccountSnapshot,
  Diagnosis,
  Finding,
  RepairId,
  RepairSpec,
  Severity,
} from "@/lib/admin/account-diagnosis";

interface AccountMatch {
  userId: string;
  email: string | null;
  fullName: string | null;
  profileMissing: boolean;
}

interface AuditRow {
  id: string;
  created_at: string;
  action: string;
  actor_email: string | null;
  actor_via: string;
  reason: string | null;
  outcome: "ok" | "failed";
  error: string | null;
}

interface AccountDetail {
  snapshot: AccountSnapshot;
  diagnosis: Diagnosis;
  repairSpecs: RepairSpec[];
  audit: AuditRow[];
  auditError: string | null;
}

const GRANTABLE_PLANS = ["phase2", "consult", "attorney_pro"] as const;
const GRANTABLE_STATUSES = ["bypass", "active"] as const;

const SEVERITY_LABEL: Record<Severity, string> = {
  "blocks-signin": "Blocks sign-in",
  "blocks-app": "Blocks the app",
  warn: "Warning",
  info: "Info",
};

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleString() : iso;
}

export default function AccountConsole({ initialId }: { initialId?: string }) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<AccountMatch[] | null>(null);
  const [searchWarnings, setSearchWarnings] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? null);
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadDetail = useCallback(async (userId: string) => {
    setLoadingDetail(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/admin/accounts/${userId}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDetailError(body.error ?? `HTTP ${res.status}`);
        setDetail(null);
        return;
      }
      setDetail(body as AccountDetail);
    } catch {
      setDetailError("Network error loading the account.");
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 3) {
      setSearchWarnings(["Type at least 3 characters."]);
      setMatches([]);
      return;
    }
    setSearching(true);
    setSearchWarnings([]);
    try {
      const res = await fetch(`/api/admin/accounts?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSearchWarnings([body.error ?? `HTTP ${res.status}`]);
        setMatches([]);
        return;
      }
      setMatches(body.matches ?? []);
      setSearchWarnings(body.warnings ?? []);
      if ((body.matches ?? []).length === 1) setSelectedId(body.matches[0].userId);
    } catch {
      setSearchWarnings(["Network error running the search."]);
      setMatches([]);
    } finally {
      setSearching(false);
    }
  }, [query]);

  return (
    <>
      <form
        className="admin-search"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
      >
        <input
          className="admin-search-input"
          placeholder="Email address or name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <button className="admin-btn admin-btn-primary" type="submit" disabled={searching}>
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      {searchWarnings.map((w) => (
        <div key={w} className="admin-alert">
          {w}
        </div>
      ))}

      {matches !== null && matches.length === 0 && !searching && (
        <div className="admin-empty">
          No account matched. Check for typos and alternate addresses before concluding they never
          registered.
        </div>
      )}

      {matches !== null && matches.length > 1 && (
        <table className="admin-table" style={{ marginBottom: 24 }}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>State</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => (
              <tr key={m.userId}>
                <td>{m.email ?? "—"}</td>
                <td className="admin-td-muted">{m.fullName ?? "—"}</td>
                <td>
                  {m.profileMissing ? (
                    <span className="admin-badge admin-badge-danger">no profile row</span>
                  ) : (
                    <span className="admin-badge">ok</span>
                  )}
                </td>
                <td>
                  <button className="admin-btn" onClick={() => setSelectedId(m.userId)}>
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {loadingDetail && <div className="admin-empty">Loading account…</div>}
      {detailError && <div className="admin-alert admin-alert-danger">{detailError}</div>}

      {detail && !loadingDetail && (
        <AccountDetailView
          detail={detail}
          onRepaired={(next) => setDetail({ ...detail, ...next })}
          onReload={() => selectedId && void loadDetail(selectedId)}
        />
      )}
    </>
  );
}

function verdictClass(status: Diagnosis["status"]): string {
  if (status === "healthy") return "admin-verdict admin-verdict-ok";
  if (status === "blocked-signin" || status === "no-account") return "admin-verdict admin-verdict-danger";
  if (status === "blocked-app") return "admin-verdict admin-verdict-warn";
  return "admin-verdict";
}

function AccountDetailView({
  detail,
  onRepaired,
  onReload,
}: {
  detail: AccountDetail;
  onRepaired: (next: Partial<AccountDetail>) => void;
  onReload: () => void;
}) {
  const { snapshot, diagnosis, repairSpecs, audit, auditError } = detail;
  const { authUser, profile, subscription } = snapshot;

  return (
    <>
      <div className={verdictClass(diagnosis.status)}>
        <span className="admin-verdict-text">{diagnosis.headline}</span>
        <button className="admin-btn" onClick={onReload}>
          Re-check
        </button>
      </div>

      <section className="admin-section">
        <h2 className="admin-section-title">What we know</h2>
        <div className="admin-facts">
          <FactGroup
            title="Auth"
            error={snapshot.authError}
            rows={
              authUser
                ? [
                    ["Email", authUser.email ?? "—"],
                    ["User id", authUser.id],
                    ["Email confirmed", fmt(authUser.emailConfirmedAt)],
                    ["Last sign-in", fmt(authUser.lastSignInAt)],
                    ["Banned until", fmt(authUser.bannedUntil)],
                    ["Created", fmt(authUser.createdAt)],
                  ]
                : null
            }
          />
          <FactGroup
            title="Profile"
            error={snapshot.profileError}
            rows={
              profile
                ? [
                    ["Name", profile.fullName ?? "—"],
                    ["Email", profile.email ?? "—"],
                    ["Account type", profile.accountType ?? "—"],
                    ["Attorney", profile.isAttorney ? "yes" : "no"],
                    ["Signup status", profile.attorneyUserStatus ?? "—"],
                  ]
                : null
            }
          />
          <FactGroup
            title="Subscription"
            error={snapshot.subscriptionError}
            rows={
              subscription
                ? [
                    ["Status", subscription.status ?? "—"],
                    ["Plan", subscription.plan ?? "—"],
                    ["Period end", fmt(subscription.currentPeriodEnd)],
                    ["Stripe customer", subscription.stripeCustomerId ?? "—"],
                    ["Consult credits", String(subscription.consultCredits ?? 0)],
                  ]
                : null
            }
          />
        </div>
      </section>

      {diagnosis.findings.length > 0 && (
        <section className="admin-section">
          <h2 className="admin-section-title">Findings</h2>
          {diagnosis.findings.map((f) => (
            <FindingRow key={f.id} finding={f} />
          ))}
        </section>
      )}

      {repairSpecs.length > 0 && (
        <section className="admin-section">
          <h2 className="admin-section-title">Repairs</h2>
          {repairSpecs.map((spec) => (
            <RepairCard
              key={spec.id}
              spec={spec}
              userId={snapshot.authUser?.id ?? ""}
              onRepaired={onRepaired}
            />
          ))}
        </section>
      )}

      <section className="admin-section">
        <h2 className="admin-section-title">History for this account</h2>
        {auditError ? (
          <div className="admin-empty">
            Audit log unreadable: {auditError}. Apply{" "}
            <code>supabase/schema-stage47-admin-console.sql</code>.
          </div>
        ) : audit.length === 0 ? (
          <div className="admin-empty">No admin actions have been taken on this account.</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>By</th>
                <th>Reason</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((r) => (
                <tr key={r.id}>
                  <td className="admin-td-muted">{fmt(r.created_at)}</td>
                  <td className="admin-td-feature">{r.action}</td>
                  <td className="admin-td-muted">{r.actor_email ?? "—"}</td>
                  <td className="admin-td-muted">{r.reason ?? "—"}</td>
                  <td>
                    {r.outcome === "ok" ? (
                      <span className="admin-badge">ok</span>
                    ) : (
                      <span className="admin-badge admin-badge-danger" title={r.error ?? undefined}>
                        failed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function FactGroup({
  title,
  rows,
  error,
}: {
  title: string;
  rows: [string, string][] | null;
  error: string | null;
}) {
  return (
    <div className="admin-fact-group">
      <h3 className="admin-fact-title">{title}</h3>
      {error ? (
        <p className="admin-fact-error">Read failed: {error}</p>
      ) : !rows ? (
        <p className="admin-fact-error">No row.</p>
      ) : (
        <dl className="admin-fact-list">
          {rows.map(([k, v]) => (
            <div key={k} className="admin-fact-row">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  const cls =
    finding.severity === "blocks-signin"
      ? "admin-finding admin-finding-danger"
      : finding.severity === "blocks-app"
        ? "admin-finding admin-finding-warn"
        : "admin-finding";
  return (
    <div className={cls}>
      <div className="admin-finding-head">
        <strong>{finding.title}</strong>
        <span className="admin-badge">{SEVERITY_LABEL[finding.severity]}</span>
      </div>
      <p className="admin-finding-detail">{finding.detail}</p>
      {finding.memo && <p className="admin-finding-memo">{finding.memo}</p>}
    </div>
  );
}

function RepairCard({
  spec,
  userId,
  onRepaired,
}: {
  spec: RepairSpec;
  userId: string;
  onRepaired: (next: Partial<AccountDetail>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [plan, setPlan] = useState<string>("phase2");
  const [status, setStatus] = useState<string>("bypass");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; unaudited?: boolean } | null>(
    null
  );

  const run = useCallback(async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/accounts/${userId}/repair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repair: spec.id as RepairId, reason, password, plan, status }),
      });
      const body = await res.json().catch(() => ({}));
      setResult({
        ok: !!body.ok,
        message: body.message ?? body.error ?? `HTTP ${res.status}`,
        unaudited: body.unaudited,
      });
      if (body.ok) {
        setPassword("");
        if (body.snapshot && body.diagnosis) {
          onRepaired({ snapshot: body.snapshot, diagnosis: body.diagnosis });
        }
      }
    } catch {
      setResult({ ok: false, message: "Network error running the repair." });
    } finally {
      setBusy(false);
    }
  }, [spec.id, userId, reason, password, plan, status, onRepaired]);

  const blocked =
    (spec.requiresReason && reason.trim().length < 5) ||
    (spec.requiresPassword && password.length < 12);

  return (
    <div className="admin-repair">
      <div className="admin-repair-head">
        <div>
          <strong>{spec.label}</strong>
          <p className="admin-repair-desc">{spec.description}</p>
        </div>
        <button className="admin-btn" onClick={() => setOpen((o) => !o)}>
          {open ? "Cancel" : "Run…"}
        </button>
      </div>

      {open && (
        <div className="admin-repair-form">
          {spec.requiresPlan && (
            <div className="admin-field-row">
              <label className="admin-field">
                <span>Status</span>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {GRANTABLE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                <span>Plan</span>
                <select value={plan} onChange={(e) => setPlan(e.target.value)}>
                  {GRANTABLE_PLANS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {spec.requiresPassword && (
            <label className="admin-field">
              <span>Temporary password (min 12 characters)</span>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                placeholder="Read this out — never email it"
              />
            </label>
          )}

          {spec.requiresReason && (
            <label className="admin-field">
              <span>Reason (recorded in the audit trail)</span>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Client called — confirmation email never arrived"
              />
            </label>
          )}

          <button className="admin-btn admin-btn-primary" disabled={busy || blocked} onClick={run}>
            {busy ? "Running…" : `Run ${spec.label}`}
          </button>
        </div>
      )}

      {result && (
        <div className={result.ok ? "admin-result admin-result-ok" : "admin-result admin-result-fail"}>
          {result.message}
          {result.unaudited && (
            <div className="admin-result-warn">
              This action was <strong>not recorded</strong> in the audit log — apply{" "}
              <code>supabase/schema-stage47-admin-console.sql</code>.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

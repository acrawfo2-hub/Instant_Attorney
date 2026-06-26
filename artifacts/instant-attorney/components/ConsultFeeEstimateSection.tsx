"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConsultFeeEstimateDraft, ConsultRequestStatus } from "@/lib/types";
import type { FeeComplexity, MergedFeeEstimate, PackageOption } from "@/lib/consult-fee-estimate";

function fmtRange(r: { low: number; high: number }): string {
  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  return `${fmt(r.low)} – ${fmt(r.high)}`;
}

function complexityLabel(c: FeeComplexity): string {
  return c.replace(/_/g, " ");
}

function billingLabel(model: PackageOption["billingModel"]): string {
  const labels: Record<PackageOption["billingModel"], string> = {
    flat_fee: "Flat fee",
    phased_flat: "Phased flat fee",
    limited_scope_menu: "Limited scope",
    hourly_with_cap: "Hourly with cap",
    contingency: "Contingency",
    subscription_add_on: "Subscription add-on",
  };
  return labels[model];
}

export default function ConsultFeeEstimateSection({
  consultId,
  consultStatus,
}: {
  consultId: string;
  consultStatus: ConsultRequestStatus;
}) {
  const [data, setData] = useState<MergedFeeEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReadOnly = consultStatus === "completed";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/attorney/consult/${consultId}/fee-estimate`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to load fee guidance");
      }
      setData((await res.json()) as MergedFeeEstimate);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load fee guidance");
    } finally {
      setLoading(false);
    }
  }, [consultId]);

  useEffect(() => {
    void load();
  }, [load]);

  const persistDraft = useCallback(async (patch: Partial<ConsultFeeEstimateDraft>) => {
    if (isReadOnly || !data) return;
    setSaving(true);
    setSaveLabel("Saving…");
    try {
      const res = await fetch(`/api/attorney/consult/${consultId}/fee-estimate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attorneyNotes: patch.attorneyNotes ?? data.draft.attorneyNotes,
          selectedPackageId: patch.selectedPackageId !== undefined ? patch.selectedPackageId : data.draft.selectedPackageId,
          customRange: patch.customRange !== undefined ? patch.customRange : data.draft.customRange,
          adjustmentNote: patch.adjustmentNote !== undefined ? patch.adjustmentNote : data.draft.adjustmentNote,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Save failed");
      }
      setData((await res.json()) as MergedFeeEstimate);
      setSaveLabel("Saved");
      setTimeout(() => setSaveLabel(""), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [consultId, data, isReadOnly]);

  function scheduleSave(patch: Partial<ConsultFeeEstimateDraft>) {
    if (isReadOnly || !data) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persistDraft(patch);
    }, 1500);
  }

  function updateDraft(patch: Partial<ConsultFeeEstimateDraft>) {
    if (!data) return;
    const nextDraft = { ...data.draft, ...patch, updatedAt: new Date().toISOString() };
    setData({ ...data, draft: nextDraft });
    scheduleSave(patch);
  }

  function selectPackage(pkg: PackageOption) {
    updateDraft({ selectedPackageId: pkg.id, customRange: null });
  }

  if (loading && !data) {
    return <div className="atty-ai-running">Loading fee guidance…</div>;
  }

  if (!data) {
    return error ? <p className="atty-ai-error">{error}</p> : null;
  }

  const selectedId = data.draft.selectedPackageId ?? data.packages.find((p) => p.recommended)?.id;

  return (
    <div className="cb-fee">
      <div className="cb-fee-ethics">{data.ethicsNotice}</div>

      <div className="cb-fee-phone">
        <div className="cb-block-title">Phone script</div>
        <p className="cb-fee-phone-text">{data.phoneScript}</p>
        <p className="cb-wrap-hint">Adapt freely — this is a starting point, not a script to read verbatim.</p>
      </div>

      <div className="cb-snapshot-row">
        <div className="cb-stat">
          <span className="cb-stat-label">Practice area</span>
          <span className="cb-stat-value">{data.practiceAreaLabel}</span>
        </div>
        <div className="cb-stat">
          <span className="cb-stat-label">Complexity</span>
          <span className="cb-stat-value">{complexityLabel(data.complexity)}</span>
        </div>
        <div className="cb-stat">
          <span className="cb-stat-label">Your quote range</span>
          <span className="cb-stat-value cb-fee-range">{fmtRange(data.effectiveRange)}</span>
        </div>
      </div>

      {data.caveats.length > 0 && (
        <div className="cb-urgent">
          {data.caveats.map((c) => (
            <div key={c}>{c}</div>
          ))}
        </div>
      )}

      <div className="cb-fee-packages">
        <div className="cb-block-title">Package options</div>
        <p className="cb-wrap-hint">Select the package you are discussing — flat and phased fees are preferred over open hourly.</p>
        {data.packages.map((pkg) => {
          const selected = pkg.id === selectedId;
          return (
            <button
              key={pkg.id}
              type="button"
              className={`cb-fee-package${selected ? " cb-fee-package-selected" : ""}${pkg.recommended ? " cb-fee-package-rec" : ""}`}
              disabled={isReadOnly}
              onClick={() => selectPackage(pkg)}
            >
              <div className="cb-fee-package-header">
                <span className="cb-fee-package-label">{pkg.label}</span>
                <span className="cb-fee-package-range">{fmtRange(pkg.range)}</span>
              </div>
              <div className="cb-fee-package-meta">
                {billingLabel(pkg.billingModel)}
                {pkg.recommended && !selected ? " · Recommended" : ""}
                {selected ? " · Selected" : ""}
              </div>
              <p className="cb-fee-package-desc">{pkg.description}</p>
              <ul className="cb-list cb-list-muted">
                <li><strong>Includes:</strong> {pkg.scopeIncluded.slice(0, 3).join("; ")}</li>
                <li><strong>Excludes:</strong> {pkg.scopeExcluded[0]}</li>
              </ul>
            </button>
          );
        })}
      </div>

      {data.complexityFactors.length > 0 && (
        <div className="cb-block">
          <div className="cb-block-title">Complexity factors</div>
          <ul className="cb-list cb-list-muted">
            {data.complexityFactors.map((f) => (
              <li key={f.label}>
                <strong>{f.label}</strong> ({f.impact}): {f.note}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="cb-fee-hourly">
        <div className="cb-block-title">Hourly reference (internal)</div>
        <p className="cb-wrap-hint">{data.hourlyReference.note}</p>
        <p className="cb-fee-hourly-line">
          ${data.hourlyReference.rate}/hr × {data.hourlyReference.estimatedHours.low}–{data.hourlyReference.estimatedHours.high} hrs
          ≈ {fmtRange(data.hourlyReference.estimatedTotal)}
        </p>
      </div>

      {!isReadOnly && (
        <>
          <div className="cb-wrap-block">
            <div className="cb-block-title">Custom range override</div>
            <p className="cb-wrap-hint">If you quote a specific number on the call, enter it here.</p>
            <div className="cb-fee-custom-row">
              <input
                type="number"
                className="cb-fee-custom-input"
                placeholder="Low"
                disabled={isReadOnly}
                value={data.draft.customRange?.low ?? ""}
                onChange={(e) => {
                  const low = Number(e.target.value);
                  const high = data.draft.customRange?.high ?? low;
                  updateDraft({ customRange: Number.isFinite(low) ? { low, high } : null });
                }}
              />
              <span>–</span>
              <input
                type="number"
                className="cb-fee-custom-input"
                placeholder="High"
                disabled={isReadOnly}
                value={data.draft.customRange?.high ?? ""}
                onChange={(e) => {
                  const high = Number(e.target.value);
                  const low = data.draft.customRange?.low ?? high;
                  updateDraft({ customRange: Number.isFinite(high) ? { low, high } : null });
                }}
              />
              <button
                type="button"
                className="cb-add-btn"
                onClick={() => updateDraft({ customRange: null })}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="cb-wrap-block">
            <div className="cb-block-title">Fee notes</div>
            <p className="cb-wrap-hint">Private notes — what you told the client, adjustments, follow-up.</p>
            <textarea
              className="cb-wrap-textarea"
              rows={3}
              placeholder="e.g., Quoted $5,500 flat for uncontested divorce if spouse signs waiver…"
              value={data.draft.attorneyNotes}
              disabled={isReadOnly}
              onChange={(e) => updateDraft({ attorneyNotes: e.target.value })}
            />
          </div>

          <div className="cb-wrap-block">
            <div className="cb-block-title">Adjustment note</div>
            <textarea
              className="cb-wrap-textarea"
              rows={2}
              placeholder="Why you adjusted from the system estimate…"
              value={data.draft.adjustmentNote}
              disabled={isReadOnly}
              onChange={(e) => updateDraft({ adjustmentNote: e.target.value })}
            />
          </div>

          <div className="cb-wrap-actions">
            <button
              type="button"
              className="atty-ai-btn"
              onClick={() => void persistDraft({})}
              disabled={saving}
            >
              {saveLabel || "Save"}
            </button>
            <button
              type="button"
              className="atty-ai-btn"
              onClick={() => void load()}
              disabled={saving}
            >
              Refresh estimate
            </button>
          </div>
        </>
      )}

      {error && <p className="atty-ai-error">{error}</p>}
    </div>
  );
}

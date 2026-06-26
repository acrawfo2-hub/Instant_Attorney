"use client";

import { useCallback, useEffect, useState } from "react";

interface BillingSummary {
  enabled: boolean;
  exempt: boolean;
  status: "ok" | "pending" | "blocked" | "exempt" | "disabled";
  blockReason: "topup_pending" | "topup_failed" | "limit_reached" | null;
  allowed: boolean;
  meterUsd: number;
  thresholdUsd: number;
  chargeUsd: number;
  untilNextTopUpUsd: number;
  monthlyLimitUsd: number;
  monthTopUpUsd: number;
  monthlyRemainingUsd: number;
  nextTopUpExceedsLimit: boolean;
  hasPaymentMethod: boolean;
  lifetimeTopUps: number;
  lifetimeTopUpUsd: number;
  graceOptIn: boolean;
  graceBufferUsd: number;
  graceRemainingUsd: number;
  inGrace: boolean;
}

const usd = (n: number) => `$${n.toFixed(2)}`;

type Tone = "ok" | "info" | "warn" | "danger";

const TONE: Record<Tone, { bg: string; border: string; fg: string; bar: string }> = {
  ok: { bg: "#f6f8fa", border: "#e2e8f0", fg: "#334155", bar: "#3b82f6" },
  info: { bg: "#eff6ff", border: "#bfdbfe", fg: "#1e40af", bar: "#3b82f6" },
  warn: { bg: "#fffbeb", border: "#fde68a", fg: "#92400e", bar: "#f59e0b" },
  danger: { bg: "#fef2f2", border: "#fecaca", fg: "#991b1b", bar: "#ef4444" },
};

export default function BillingMeter() {
  const [data, setData] = useState<BillingSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [portalErr, setPortalErr] = useState<string | null>(null);
  const [editingLimit, setEditingLimit] = useState(false);
  const [limitInput, setLimitInput] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/status", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      /* transient — keep last known state */
    }
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const id = setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(id);
    };
  }, [refresh]);

  const openPortal = useCallback(async () => {
    setBusy(true);
    setPortalErr(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (body.url) {
        window.location.href = body.url;
        return;
      }
      setPortalErr(body.error ?? "Couldn't open the billing portal. Please try again.");
    } catch {
      setPortalErr("Couldn't open the billing portal. Please try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  const retry = useCallback(async () => {
    setBusy(true);
    try {
      await fetch("/api/billing/retry-topup", { method: "POST" });
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const toggleGrace = useCallback(async (next: boolean) => {
    setBusy(true);
    try {
      await fetch("/api/billing/grace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opt_in: next }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const saveLimit = useCallback(async () => {
    const value = Number(limitInput);
    if (!Number.isFinite(value) || value < 0) return;
    setBusy(true);
    try {
      await fetch("/api/billing/limit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit_usd: value }),
      });
      setEditingLimit(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [limitInput, refresh]);

  // Hidden for free / exempt users and when billing is off.
  if (!data || !data.enabled || data.exempt || data.status === "disabled") return null;

  const pct = Math.min(100, Math.round((data.meterUsd / data.thresholdUsd) * 100));
  const monthPct =
    data.monthlyLimitUsd > 0
      ? Math.min(100, Math.round((data.monthTopUpUsd / data.monthlyLimitUsd) * 100))
      : 0;
  const nearThreshold = data.untilNextTopUpUsd <= data.thresholdUsd * 0.25;

  let tone: Tone = "ok";
  let headline: string | null = null;
  let detail: string | null = null;
  let cta: "card" | "limit" | null = null;

  if (data.blockReason === "topup_failed") {
    tone = "danger";
    headline = "Your last top-up couldn't be charged.";
    detail = `Update your card to keep using AI features. ${usd(data.chargeUsd)} is due.`;
    cta = "card";
  } else if (data.blockReason === "limit_reached") {
    tone = "warn";
    headline = `You've reached your ${usd(data.monthlyLimitUsd)} monthly auto-charge limit.`;
    detail = `Raise your limit to continue. The next top-up is ${usd(data.chargeUsd)}.`;
    cta = "limit";
  } else if (data.status === "pending") {
    tone = "info";
    headline = "Processing a top-up…";
    detail = "This usually takes a moment.";
  } else if (data.nextTopUpExceedsLimit) {
    tone = "warn";
    headline = "Your next top-up would exceed your monthly limit.";
    detail = `Raise your ${usd(data.monthlyLimitUsd)} limit now to avoid an interruption.`;
    cta = "limit";
  } else if (!data.hasPaymentMethod) {
    tone = "warn";
    headline = "No card on file for automatic top-ups.";
    detail = "Add a card so usage top-ups don't fail.";
    cta = "card";
  } else if (nearThreshold) {
    tone = "info";
    headline = `About ${usd(data.untilNextTopUpUsd)} of usage until your next ${usd(data.chargeUsd)} top-up.`;
    detail = "Top-ups are automatic up to your monthly limit.";
  }

  // Completion grace is holding a block open — reassure rather than alarm.
  if (data.inGrace) {
    tone = "info";
    headline = "We're finishing your work — you can keep going.";
    detail = `About ${usd(data.graceRemainingUsd)} of completion grace left. Your ${usd(
      data.chargeUsd
    )} top-up will be collected automatically once your card is sorted.`;
  }

  const t = TONE[tone];

  return (
    <div
      style={{
        border: `1px solid ${t.border}`,
        background: t.bg,
        borderRadius: 10,
        padding: "12px 14px",
        margin: "0 0 16px",
        fontSize: 13,
        color: t.fg,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <strong style={{ fontSize: 13 }}>Usage &amp; top-ups</strong>
        <span style={{ fontSize: 12, opacity: 0.75 }}>
          {usd(data.monthTopUpUsd)} of {usd(data.monthlyLimitUsd)} monthly limit used
        </span>
      </div>

      {/* Progress to next top-up */}
      <div style={{ marginTop: 8 }}>
        <div style={{ height: 8, background: "#e5e7eb", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: t.bar, transition: "width .3s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 11.5, opacity: 0.8 }}>
          <span>{usd(data.meterUsd)} used this cycle</span>
          <span>Next top-up at {usd(data.thresholdUsd)}</span>
        </div>
      </div>

      {/* Monthly limit bar */}
      <div style={{ marginTop: 8 }}>
        <div style={{ height: 6, background: "#e5e7eb", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: `${monthPct}%`, height: "100%", background: monthPct >= 100 ? "#ef4444" : "#94a3b8" }} />
        </div>
      </div>

      {headline && (
        <div style={{ marginTop: 10, fontWeight: 600 }}>
          {headline}
          {detail && <div style={{ fontWeight: 400, marginTop: 2, opacity: 0.9 }}>{detail}</div>}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, alignItems: "center" }}>
        {(cta === "card" || data.blockReason === "topup_failed") && (
          <button onClick={openPortal} disabled={busy} style={btn(t.bar)}>
            {busy ? "Opening…" : "Update card"}
          </button>
        )}
        {portalErr && (
          <span style={{ fontSize: 12, color: "#991b1b", fontWeight: 500 }}>{portalErr}</span>
        )}
        {data.blockReason === "topup_failed" && (
          <button onClick={retry} disabled={busy} style={btnGhost(t.fg)}>
            Retry charge
          </button>
        )}

        {!editingLimit ? (
          <button
            onClick={() => {
              setLimitInput(String(data.monthlyLimitUsd));
              setEditingLimit(true);
            }}
            disabled={busy}
            style={btnGhost(t.fg)}
          >
            {cta === "limit" ? "Raise monthly limit" : "Manage limit"}
          </button>
        ) : (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 12 }}>$</span>
            <input
              type="number"
              min={0}
              step="1"
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              style={{ width: 80, padding: "4px 6px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13 }}
            />
            <span style={{ fontSize: 12, opacity: 0.7 }}>/mo</span>
            <button onClick={saveLimit} disabled={busy} style={btn(t.bar)}>
              Save
            </button>
            <button onClick={() => setEditingLimit(false)} disabled={busy} style={btnGhost(t.fg)}>
              Cancel
            </button>
          </span>
        )}
      </div>

      {/* Completion-grace opt-in: finish in-flight documents past a block, pay next cycle. */}
      <label
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          marginTop: 12,
          paddingTop: 10,
          borderTop: `1px solid ${t.border}`,
          cursor: busy ? "default" : "pointer",
          fontSize: 12.5,
        }}
      >
        <input
          type="checkbox"
          checked={data.graceOptIn}
          disabled={busy}
          onChange={(e) => toggleGrace(e.target.checked)}
          style={{ marginTop: 2 }}
        />
        <span>
          <strong>Never interrupt a document I'm working on.</strong>
          <span style={{ display: "block", fontWeight: 400, opacity: 0.85, marginTop: 1 }}>
            If a top-up is pending or your card needs attention, let documents already in progress
            finish (up to {usd(data.graceBufferUsd)} of usage). You're billed for it on your next
            top-up — nothing is waived.
          </span>
        </span>
      </label>
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return {
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: 7,
    padding: "6px 12px",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
  };
}

function btnGhost(fg: string): React.CSSProperties {
  return {
    background: "transparent",
    color: fg,
    border: `1px solid currentColor`,
    borderRadius: 7,
    padding: "6px 12px",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
  };
}

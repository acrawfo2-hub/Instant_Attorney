"use client";

import { useState } from "react";

interface ManageBillingButtonProps {
  /** Visible label. Defaults to the card-management phrasing. */
  label?: string;
  /** Visual weight — primary (gold) or ghost (outlined). */
  variant?: "primary" | "ghost";
}

/**
 * Opens the Stripe Billing Portal, where the customer can update their card and
 * view every invoice and receipt (subscription, consults, usage top-ups). The
 * local pay-history table is a summary; Stripe holds the full, downloadable
 * record.
 */
export default function ManageBillingButton({
  label = "Manage card & view invoices",
  variant = "primary",
}: ManageBillingButtonProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.url) {
        window.location.href = body.url;
        return;
      }
      setErr(body.error ?? "Couldn't open the billing portal. Please try again.");
    } catch {
      setErr("Couldn't open the billing portal. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="acc-portal-wrap">
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className={variant === "primary" ? "acc-btn acc-btn--primary" : "acc-btn acc-btn--ghost"}
      >
        {busy ? "Opening…" : label}
      </button>
      {err && <span className="acc-portal-err">{err}</span>}
    </span>
  );
}

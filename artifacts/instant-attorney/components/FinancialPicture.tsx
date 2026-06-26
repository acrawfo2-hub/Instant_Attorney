"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import FinancialDisclosureModal from "@/components/FinancialDisclosureModal";
import {
  summarizeFinancialPicture,
  CATEGORY_OPTIONS,
  OWNER_OPTIONS,
  CHARACTERIZATION_OPTIONS,
  EXEMPT_OPTIONS,
  VALUE_BASIS_OPTIONS,
  labelFor,
  categoryKind,
  partnerReportOnly,
  allowedPartnerRoles,
  requiresNoSecretsAck,
  swornFilingReadiness,
  type Range,
} from "@/lib/financial-picture";
import { redFlagGuidance } from "@/lib/financial-red-flags";
import { detectGaps, type FinancialMatterArea } from "@/lib/financial-schedules";
import type {
  FinancialItem,
  FinancialCategory,
  FinancialOwner,
  Characterization,
  ExemptStatus,
  ValueBasis,
  PartnerRole,
  RepresentationScope,
  VerificationStatus,
} from "@/lib/types";

const gold = "var(--brand-gold)";
const navy = "var(--brand-navy)";
const textDk = "var(--brand-text-dk)";
const textMd = "var(--brand-text-md)";
const textLt = "var(--brand-text-lt)";
const border = "var(--brand-border)";
const white = "var(--brand-white)";
const serif = "var(--font-playfair), Georgia, serif";

const usd = (v: number) => `$${Math.round(v).toLocaleString()}`;
const fmtRange = (r: Range) => (r.low === 0 && r.high === 0 ? "—" : r.low === r.high ? usd(r.low) : `${usd(r.low)}–${usd(r.high)}`);

const VERIF_BADGE: Record<VerificationStatus, { label: string; bg: string; color: string }> = {
  unverified: { label: "Your estimate", bg: "rgba(120,120,120,0.12)", color: "#666" },
  doc_supported: { label: "Document-backed", bg: "rgba(70,110,160,0.14)", color: "#3a5e86" },
  attorney_verified: { label: "Attorney-verified", bg: "rgba(45,122,79,0.14)", color: "#2d7a4f" },
};

interface Context {
  representation_scope: RepresentationScope;
  partner_role: PartnerRole;
  partner_consented: boolean;
  joint_no_secrets_ack: boolean;
}

interface FormState {
  id?: string;
  category: FinancialCategory;
  label: string;
  owner: FinancialOwner;
  characterization: Characterization;
  exempt_status: ExemptStatus;
  value_low: string;
  value_high: string;
  value_basis: ValueBasis;
  valued_as_of: string;
  acquisition_note: string;
  source_attachment_id: string;
}

const blankForm: FormState = {
  category: "financial_account",
  label: "",
  owner: "client",
  characterization: "mixed_or_unknown",
  exempt_status: "unknown",
  value_low: "",
  value_high: "",
  value_basis: "client_estimate",
  valued_as_of: "",
  acquisition_note: "",
  source_attachment_id: "",
};

const PARTNER_ROLE_LABEL: Record<PartnerRole, string> = {
  none: "No partner involved",
  adverse_party: "Opposing party (e.g. divorce)",
  joint_client: "We're both clients (joint)",
  non_client_third_party: "A partner who isn't a client",
};

export default function FinancialPicture({
  caseFileId,
  initialItems,
  disclosureAcked,
  context: initialContext,
  isFamilyLaw,
  area,
  attachments,
  backHref,
}: {
  caseFileId: string;
  initialItems: FinancialItem[];
  disclosureAcked: boolean;
  context: Context;
  isFamilyLaw: boolean;
  area: FinancialMatterArea;
  attachments: { id: string; file_name: string }[];
  backHref: string;
}) {
  const [acked, setAcked] = useState(disclosureAcked);
  const [items, setItems] = useState<FinancialItem[]>(initialItems);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [ctx, setCtx] = useState<Context>(initialContext);
  const [ctxBusy, setCtxBusy] = useState(false);
  const [ctxSaved, setCtxSaved] = useState(false);

  const summary = useMemo(() => summarizeFinancialPicture(items), [items]);
  const readiness = useMemo(() => swornFilingReadiness(items), [items]);
  const gapReport = useMemo(() => detectGaps(area, items), [area, items]);
  const attachmentName = useMemo(() => new Map(attachments.map((a) => [a.id, a.file_name])), [attachments]);
  const roles = allowedPartnerRoles(isFamilyLaw);
  const needNoSecrets = requiresNoSecretsAck(ctx.representation_scope, ctx.partner_role);

  function startAdd(category?: FinancialCategory) {
    setErr(null);
    setForm({ ...blankForm, ...(category ? { category } : {}) });
  }
  function startEdit(it: FinancialItem) {
    setErr(null);
    setForm({
      id: it.id,
      category: it.category,
      label: it.label,
      owner: it.owner,
      characterization: it.characterization,
      exempt_status: it.exempt_status,
      value_low: it.value_low != null ? String(it.value_low) : "",
      value_high: it.value_high != null ? String(it.value_high) : "",
      value_basis: it.value_basis,
      valued_as_of: it.valued_as_of ?? "",
      acquisition_note: it.acquisition_note ?? "",
      source_attachment_id: it.source_attachment_id ?? "",
    });
  }

  async function saveItem() {
    if (!form) return;
    setBusy(true);
    setErr(null);
    try {
      const payload = { ...form, caseFileId };
      const res = form.id
        ? await fetch(`/api/financials/${form.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/financials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body.error === "disclosure_required" ? "Please acknowledge the disclosure first." : body.error ?? "Couldn't save.");
        return;
      }
      const saved = body.item as FinancialItem;
      setItems((prev) => (form.id ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved]));
      setForm(null);
    } catch {
      setErr("Couldn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id: string) {
    setItems((prev) => prev.filter((p) => p.id !== id));
    try {
      await fetch(`/api/financials/${id}`, { method: "DELETE" });
    } catch {
      /* optimistic; a reload re-syncs */
    }
  }

  async function saveContext() {
    setCtxBusy(true);
    setCtxSaved(false);
    setErr(null);
    try {
      const res = await fetch("/api/financials/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseFileId, action: "set_representation", ...ctx }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body.error === "joint_no_secrets_required" ? "Joint representation needs the no-secrets acknowledgment." : "Couldn't save the context.");
        return;
      }
      setCtxSaved(true);
      setTimeout(() => setCtxSaved(false), 2500);
    } finally {
      setCtxBusy(false);
    }
  }

  if (!acked) {
    return <FinancialDisclosureModal caseFileId={caseFileId} backHref={backHref} onAck={() => setAcked(true)} />;
  }

  const grouped = {
    asset: items.filter((i) => categoryKind(i.category) === "asset"),
    debt: items.filter((i) => categoryKind(i.category) === "debt"),
    income: items.filter((i) => categoryKind(i.category) === "income"),
    expense: items.filter((i) => categoryKind(i.category) === "expense"),
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Summary */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <h2 style={cardTitle}>Your financial picture</h2>
          <span style={{ fontSize: 12, color: textLt }}>{summary.counts.total} item{summary.counts.total !== 1 ? "s" : ""}</span>
        </div>
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginTop: 8 }}>
          <Stat label="Estimated net worth" value={fmtRange(summary.net)} big />
          <Stat label="Assets" value={fmtRange(summary.assets)} />
          <Stat label="Debts" value={fmtRange(summary.debts)} />
        </div>
        {(summary.byCharacterization.community.high > 0 || summary.byCharacterization.separate_client.high > 0 || summary.byCharacterization.separate_partner.high > 0) && (
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12, paddingTop: 12, borderTop: `1px solid ${border}` }}>
            <Stat label="Community (assets)" value={fmtRange(summary.byCharacterization.community)} small />
            <Stat label="Your separate" value={fmtRange(summary.byCharacterization.separate_client)} small />
            <Stat label="Partner's separate" value={fmtRange(summary.byCharacterization.separate_partner)} small />
            <Stat label="Mixed / unsure" value={fmtRange(summary.byCharacterization.mixed_or_unknown)} small />
          </div>
        )}
        <div style={{ marginTop: 12, fontSize: 12, color: textLt }}>
          {summary.verification.percentSupported}% document-backed · {summary.verification.asserted} still your estimate
          {summary.needsReviewCount > 0 ? ` · ${summary.needsReviewCount} flagged for attorney review` : ""}
        </div>
      </div>

      {/* Concealment guidance — shown when anything is flagged. Educates and
          escalates; it never stops the client from continuing. */}
      {summary.redFlagCount > 0 && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#991b1b", marginBottom: 4 }}>A quick, important note</div>
          <p style={{ fontSize: 12.5, color: "#7f1d1d", lineHeight: 1.55, margin: 0 }}>{redFlagGuidance()}</p>
        </div>
      )}

      {/* Representation context */}
      <div style={card}>
        <h2 style={cardTitle}>Who&apos;s involved</h2>
        <p style={{ fontSize: 12.5, color: textLt, margin: "2px 0 12px" }}>
          This tells us how to handle a spouse or partner&apos;s information — and it changes how we treat what you report about them.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Field label="A partner is…">
            <select value={ctx.partner_role} onChange={(e) => setCtx({ ...ctx, partner_role: e.target.value as PartnerRole })} style={input}>
              {roles.map((r) => <option key={r} value={r}>{PARTNER_ROLE_LABEL[r]}</option>)}
            </select>
          </Field>
          {!isFamilyLaw && (
            <Field label="Representation">
              <select value={ctx.representation_scope} onChange={(e) => setCtx({ ...ctx, representation_scope: e.target.value as RepresentationScope })} style={input}>
                <option value="single_client">Just me</option>
                <option value="joint_spouses">Both spouses (joint)</option>
              </select>
            </Field>
          )}
        </div>
        {partnerReportOnly(ctx.partner_role) && (
          <p style={{ fontSize: 12.5, color: "#8a6d2f", background: "rgba(200,169,110,0.12)", border: `1px solid rgba(200,169,110,0.3)`, borderRadius: 8, padding: "8px 10px", marginTop: 10 }}>
            Anything you tell us about their finances is recorded as <strong>your report</strong>, not verified fact. Confirmed numbers come through the formal court process.
          </p>
        )}
        {needNoSecrets && (
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 10, fontSize: 12.5, color: textDk }}>
            <input type="checkbox" checked={ctx.joint_no_secrets_ack} onChange={(e) => setCtx({ ...ctx, joint_no_secrets_ack: e.target.checked })} style={{ marginTop: 2 }} />
            <span>We both understand this is a joint representation with <strong>no secrets between us</strong> — information one of us shares can be shared with the other.</span>
          </label>
        )}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
          <button onClick={saveContext} disabled={ctxBusy} style={btnPrimary}>{ctxBusy ? "Saving…" : "Save"}</button>
          {ctxSaved && <span style={{ fontSize: 12.5, color: "#15803d", fontWeight: 600 }}>Saved ✓</span>}
        </div>
      </div>

      {/* Items */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h2 style={cardTitle}>Assets, debts &amp; income</h2>
          {!form && <button onClick={() => startAdd()} style={btnPrimary}>+ Add item</button>}
        </div>

        {form && (
          <div style={{ border: `1px solid ${gold}`, borderRadius: 10, padding: 14, marginTop: 12, background: "rgba(200,169,110,0.05)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="What is it?">
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as FinancialCategory })} style={input}>
                  {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Whose is it?">
                <select value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value as FinancialOwner })} style={input}>
                  {OWNER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Short description" span2>
                <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Chase checking ••4321" style={input} maxLength={160} />
              </Field>
              <Field label="Value (low)">
                <input value={form.value_low} onChange={(e) => setForm({ ...form, value_low: e.target.value })} inputMode="decimal" placeholder="$" style={input} />
              </Field>
              <Field label="Value (high)">
                <input value={form.value_high} onChange={(e) => setForm({ ...form, value_high: e.target.value })} inputMode="decimal" placeholder="$ (optional)" style={input} />
              </Field>
              <Field label="Based on">
                <select value={form.value_basis} onChange={(e) => setForm({ ...form, value_basis: e.target.value as ValueBasis })} style={input}>
                  {VALUE_BASIS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Valued as of">
                <input type="date" value={form.valued_as_of} onChange={(e) => setForm({ ...form, valued_as_of: e.target.value })} style={input} />
              </Field>
              <Field label="Community or separate?">
                <select value={form.characterization} onChange={(e) => setForm({ ...form, characterization: e.target.value as Characterization })} style={input}>
                  {CHARACTERIZATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Bankruptcy exemption">
                <select value={form.exempt_status} onChange={(e) => setForm({ ...form, exempt_status: e.target.value as ExemptStatus })} style={input}>
                  {EXEMPT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="How / when acquired (helps characterize it)" span2>
                <input value={form.acquisition_note} onChange={(e) => setForm({ ...form, acquisition_note: e.target.value })} placeholder="e.g. bought 2019 during marriage; $40k down from my inheritance" style={input} />
              </Field>
              {attachments.length > 0 && (
                <Field label="Backing document (optional — a much stronger source)" span2>
                  <select value={form.source_attachment_id} onChange={(e) => setForm({ ...form, source_attachment_id: e.target.value })} style={input}>
                    <option value="">None — this is my estimate</option>
                    {attachments.map((a) => <option key={a.id} value={a.id}>{a.file_name}</option>)}
                  </select>
                </Field>
              )}
            </div>
            <p style={{ fontSize: 11.5, color: textLt, margin: "8px 0 0" }}>
              No document? No problem — give your best estimate and keep going. You never have to stop here.
            </p>
            {err && <p style={{ color: "#b91c1c", fontSize: 12.5, margin: "8px 0 0" }}>{err}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={saveItem} disabled={busy} style={btnPrimary}>{busy ? "Saving…" : form.id ? "Save changes" : "Add item"}</button>
              <button onClick={() => { setForm(null); setErr(null); }} style={btnGhost}>Cancel</button>
            </div>
          </div>
        )}

        {items.length === 0 && !form && (
          <p style={{ fontSize: 13, color: textLt, textAlign: "center", padding: "20px 0" }}>
            Nothing added yet. Start with your home, accounts, and any debts — estimates are fine.
          </p>
        )}

        {(["asset", "debt", "income", "expense"] as const).map((kind) =>
          grouped[kind].length === 0 ? null : (
            <div key={kind} style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: textLt, marginBottom: 6 }}>
                {kind === "asset" ? "Assets" : kind === "debt" ? "Debts" : kind === "income" ? "Income" : "Expenses"}
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {grouped[kind].map((it) => {
                  const vb = VERIF_BADGE[it.verification_status];
                  return (
                    <div key={it.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", border: `1px solid ${border}`, borderRadius: 8, padding: "9px 11px" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: textDk }}>{it.label}</span>
                          <Tag>{labelFor.category(it.category)}</Tag>
                          {it.owner !== "client" && <Tag>{labelFor.owner(it.owner)}</Tag>}
                          {it.characterization !== "mixed_or_unknown" && it.characterization !== "not_applicable" && <Tag>{labelFor.characterization(it.characterization)}</Tag>}
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: vb.color, background: vb.bg, padding: "1px 7px", borderRadius: 999 }}>{vb.label}</span>
                        </div>
                        {it.acquisition_note && <div style={{ fontSize: 12, color: textLt, marginTop: 3 }}>{it.acquisition_note}</div>}
                        {it.source_attachment_id && attachmentName.get(it.source_attachment_id) && (
                          <div style={{ fontSize: 11.5, color: "#3a5e86", marginTop: 3 }}>📎 {attachmentName.get(it.source_attachment_id)}</div>
                        )}
                        {Array.isArray(it.red_flags) && it.red_flags.length > 0 && (
                          <div style={{ marginTop: 5, display: "grid", gap: 3 }}>
                            {it.red_flags.map((f, i) => (
                              <div key={i} style={{ fontSize: 11.5, color: "#991b1b", display: "flex", gap: 5, alignItems: "flex-start" }}>
                                <span aria-hidden="true">⚑</span>
                                <span>{f.message}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: navy, fontVariantNumeric: "tabular-nums" }}>{fmtRange({ low: it.value_low ?? 0, high: it.value_high ?? 0 })}</div>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 2 }}>
                          <button onClick={() => startEdit(it)} style={linkBtn}>Edit</button>
                          <button onClick={() => removeItem(it.id)} style={{ ...linkBtn, color: "#b4341f" }}>Remove</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        )}
      </div>

      {/* Gaps — suggestions that help, never blockers */}
      {(gapReport.gaps.length > 0 || gapReport.inferences.length > 0) && (
        <div style={card}>
          <h2 style={cardTitle}>What might be worth adding</h2>
          <p style={{ fontSize: 12.5, color: textLt, margin: "2px 0 12px" }}>
            Suggestions only — you can keep going either way.{" "}
            {gapReport.requiredTotal > 0 ? `${gapReport.requiredCovered}/${gapReport.requiredTotal} key categories covered.` : ""}
          </p>
          {gapReport.gaps.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {gapReport.gaps.map((g) => (
                <button
                  key={g.key}
                  onClick={() => startAdd(g.suggestCategory)}
                  style={{ ...btnGhost, borderColor: g.required ? gold : border, display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 1, textAlign: "left", padding: "7px 12px" }}
                >
                  <span style={{ fontWeight: 600 }}>+ {g.label}</span>
                  <span style={{ fontSize: 10.5, color: textLt, fontWeight: 400 }}>{g.hint}</span>
                </button>
              ))}
            </div>
          )}
          {gapReport.inferences.length > 0 && (
            <ul style={{ margin: "12px 0 0", paddingLeft: 16, fontSize: 12.5, color: textMd, lineHeight: 1.5 }}>
              {gapReport.inferences.map((inf, i) => <li key={i}>{inf.message}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Sworn-filing readiness — informational, the one real gate (and only for
          documents signed under oath). Never blocks general progress. */}
      {summary.counts.total > 0 && (
        <div style={card}>
          <h2 style={cardTitle}>Before you sign anything under oath</h2>
          <p style={{ fontSize: 12.5, color: textLt, margin: "2px 0 10px" }}>
            You can keep building your plan now. But a sworn filing — like a bankruptcy schedule or a divorce inventory — can only be finalized once your attorney has verified each item.
          </p>
          {readiness.ready ? (
            <div style={{ fontSize: 13, color: "#15803d", fontWeight: 600 }}>✓ All {readiness.total} items are attorney-verified — ready to finalize a sworn filing.</div>
          ) : (
            <div style={{ fontSize: 12.5, color: textMd }}>
              <strong>{readiness.attorneyVerified}</strong> of <strong>{readiness.total}</strong> items attorney-verified.{" "}
              {readiness.pending.length > 0 && <>{readiness.pending.length} still need verification.</>}{" "}
              {readiness.openFlagCount > 0 && <span style={{ color: "#991b1b" }}>{readiness.openFlagCount} flagged for attorney review.</span>}
            </div>
          )}
        </div>
      )}

      {/* Always push forward — estimates are enough; never stall on facts */}
      <div style={{ ...card, background: navy, border: "none" }}>
        <div style={{ fontSize: 15.5, fontWeight: 600, fontFamily: serif, marginBottom: 4, color: "var(--brand-cream-heading)" }}>
          Don&apos;t wait on perfect numbers
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.55, margin: "0 0 12px", color: "var(--brand-cream-text)" }}>
          Estimates are enough to move forward. We&apos;ll mark what&apos;s still your estimate and verify it before anything is signed — so you never have to stall here.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href={`/chat?caseFileId=${caseFileId}`} style={{ ...btnPrimary, textDecoration: "none" }}>Get my documents drafted →</Link>
          <Link href="/dashboard" style={{ background: "transparent", color: "var(--brand-cream-heading)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 7, padding: "8px 16px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            Talk to the attorney →
          </Link>
        </div>
      </div>

      <p style={{ fontSize: 12, color: textLt, lineHeight: 1.5, margin: "0 2px" }}>
        Estimates are fine to start — an attorney verifies the numbers before anything is filed under oath.{" "}
        <Link href={backHref} style={{ color: navy }}>Back to your file</Link>
      </p>
    </div>
  );
}

function Stat({ label, value, big, small }: { label: string; value: string; big?: boolean; small?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: textLt, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: big ? 22 : small ? 14 : 17, fontWeight: 700, color: navy, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function Field({ label, children, span2 }: { label: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: span2 ? "1 / -1" : undefined }}>
      <span style={{ fontSize: 11.5, color: textLt, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 10.5, color: textMd, background: "rgba(26,22,18,0.05)", padding: "1px 7px", borderRadius: 999 }}>{children}</span>;
}

const card: React.CSSProperties = { background: white, border: `1px solid ${border}`, borderRadius: 12, padding: "16px 18px" };
const cardTitle: React.CSSProperties = { fontFamily: serif, fontSize: 17, color: textDk, margin: 0 };
const input: React.CSSProperties = { fontSize: 13.5, fontFamily: "inherit", color: textDk, background: white, border: `1px solid ${border}`, borderRadius: 7, padding: "7px 9px", width: "100%" };
const btnPrimary: React.CSSProperties = { background: gold, color: "#1a1008", border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnGhost: React.CSSProperties = { background: "transparent", color: textMd, border: `1px solid ${border}`, borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: textMd, fontSize: 12, cursor: "pointer", padding: 0, fontWeight: 600 };

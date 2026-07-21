"use client";

import { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { GovernmentForm, GovFormField } from "@/lib/government-forms";
import type { GovFormInstrument } from "@/lib/types";
import type { DetectedPdfField } from "@/lib/gov-form-pdf";

interface Progress {
  total_required: number;
  answered_required: number;
  percent: number;
  complete: boolean;
  next_field: GovFormField | null;
}

interface GuideState {
  instrument: GovFormInstrument;
  form: GovernmentForm;
  verified: boolean;
  progress: Progress;
  checklist: string[];
  errors?: Record<string, string>;
}

interface PdfTemplateState {
  instrument: GovFormInstrument;
  pdf_fields: DetectedPdfField[];
}

// Guided government-form completion tool. Distinct from the document-generation
// wizard: it walks the client field by field through a real government form,
// validating answers server-side and tracking progress, then hands off a
// submission checklist pointing to the official source.
export default function GovFormGuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [state, setState] = useState<GuideState | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [pdfState, setPdfState] = useState<PdfTemplateState | null>(null);
  const [fieldMapDraft, setFieldMapDraft] = useState<Record<string, string>>({});
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const hydrate = useCallback((data: GuideState) => {
    setState(data);
    if (data.errors) setErrors(data.errors);
    const seeded: Record<string, string> = {};
    for (const field of data.form.fields) {
      const saved = data.instrument.answers?.[field.name];
      if (saved !== undefined && saved !== null) seeded[field.name] = String(saved);
    }
    setValues((prev) => ({ ...seeded, ...prev }));
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/gov-forms/${id}`);
      if (!res.ok) { setNotFound(true); return; }
      hydrate(await res.json());

      const pdfRes = await fetch(`/api/gov-forms/${id}/template`);
      if (pdfRes.ok) {
        const data = (await pdfRes.json()) as PdfTemplateState;
        setPdfState(data);
        setFieldMapDraft(data.instrument.pdf_field_map ?? {});
      }
    })();
  }, [id, hydrate]);

  async function save(extra?: { status?: GovFormInstrument["status"] }) {
    setSaving(true);
    const res = await fetch(`/api/gov-forms/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: values, ...extra }),
    });
    if (res.ok) {
      const data = await res.json();
      setState(data);
      setErrors(data.errors ?? {});
    }
    setSaving(false);
  }

  async function uploadTemplate(file: File) {
    setPdfBusy(true);
    setPdfError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/gov-forms/${id}/template`, { method: "POST", body: fd });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      setPdfError(data?.error ?? "Could not upload that file.");
      setPdfBusy(false);
      return;
    }
    setPdfState({ instrument: data.instrument, pdf_fields: data.pdf_fields });
    setFieldMapDraft(data.instrument.pdf_field_map ?? {});
    setPdfBusy(false);
  }

  async function confirmFieldMap() {
    setPdfBusy(true);
    setPdfError(null);
    const res = await fetch(`/api/gov-forms/${id}/template`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field_map: fieldMapDraft, confirm: true }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      setPdfError(data?.error ?? "Could not save the field mapping.");
      setPdfBusy(false);
      return;
    }
    setPdfState({ instrument: data.instrument, pdf_fields: data.pdf_fields });
    setPdfBusy(false);
  }

  async function downloadFilledPdf(formNumber: string) {
    setPdfBusy(true);
    setPdfError(null);
    const res = await fetch(`/api/gov-forms/${id}/download-pdf`);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setPdfError(data?.message ?? data?.error ?? "Could not download the filled PDF.");
      setPdfBusy(false);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${formNumber.replace(/[^a-z0-9]+/gi, "_")}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setPdfBusy(false);
  }

  if (notFound) {
    return (
      <main className="gf-wrap">
        <p>This form could not be found.</p>
        <Link href="/dashboard">← Back to your file</Link>
      </main>
    );
  }
  if (!state) return <main className="gf-wrap"><p>Loading…</p></main>;

  const { form, progress } = state;
  const looking = state.instrument.source === "dynamic" && state.instrument.lookup_status === "pending";
  const noFields = form.fields.length === 0;

  // Dynamic form whose grounded lookup hasn't produced a field schema yet.
  if (noFields) {
    return (
      <main className="gf-wrap">
        <Link href="/dashboard" className="gf-back">← Back to your file</Link>
        <header className="gf-header">
          <h1>{form.form_number} — {form.title}</h1>
          <p className="gf-meta">{form.agency} · {form.jurisdiction}</p>
          {!state.verified && <span className="gf-badge-unverified">Unverified — confirm against the official source</span>}
        </header>
        {looking ? (
          <p>We&apos;re looking this form up from its official source. Check back in a moment.</p>
        ) : (
          <p>We couldn&apos;t automatically build a step-by-step guide for this form. Use the official source below to complete it.</p>
        )}
        {form.official_url && (
          <a href={form.official_url} target="_blank" rel="noopener" className="gf-official">
            Open the official form ↗
          </a>
        )}
        <p className="gf-disclaimer">Instant Attorney helps you find and complete government forms — this is form assistance, not legal advice.</p>
      </main>
    );
  }

  return (
    <main className="gf-wrap">
      <Link href="/dashboard" className="gf-back">← Back to your file</Link>

      <header className="gf-header">
        <h1>{form.form_number} — {form.title}</h1>
        <p className="gf-meta">{form.agency} · {form.jurisdiction}</p>
        {!state.verified && (
          <p className="gf-unverified-note">
            <span className="gf-badge-unverified">Unverified</span> We looked this form up from its
            official source but haven&apos;t hand-verified it. Double-check every detail against the
            official form before submitting.
          </p>
        )}
        <p className="gf-purpose">{form.purpose}</p>
        <div className="gf-facts">
          <span>⏱ <strong>Deadline:</strong> {form.deadline}</span>
          <span>💵 <strong>Fee:</strong> {form.fee}</span>
          <span>📨 <strong>Submit to:</strong> {form.submit_to}</span>
        </div>
        <div className="gf-progress">
          <div className="gf-progress-bar"><div style={{ width: `${progress.percent}%` }} /></div>
          <span>{progress.answered_required}/{progress.total_required} required fields · {progress.percent}%</span>
        </div>
      </header>

      <section className="gf-fields">
        {form.fields.map((field) => (
          <div key={field.name} className="gf-field">
            <label htmlFor={field.name}>
              {field.label}{field.required === false && <span className="gf-optional"> (optional)</span>}
            </label>
            {field.help && <p className="gf-help">{field.help}</p>}
            {field.type === "enum" ? (
              <select
                id={field.name}
                value={values[field.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
              >
                <option value="">Select…</option>
                {field.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : field.type === "boolean" ? (
              <select
                id={field.name}
                value={values[field.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
              >
                <option value="">Select…</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            ) : (
              <input
                id={field.name}
                type={field.type === "date" ? "date" : "text"}
                value={values[field.name] ?? ""}
                placeholder={field.type === "ssn" ? "123-45-6789" : ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
              />
            )}
            {errors[field.name] && <p className="gf-error">{errors[field.name]}</p>}
          </div>
        ))}
      </section>

      <div className="gf-actions">
        <button onClick={() => save()} disabled={saving}>{saving ? "Saving…" : "Save progress"}</button>
        <button
          className="gf-complete"
          disabled={saving || !progress.complete}
          onClick={() => save({ status: "completed" })}
          title={progress.complete ? "" : "Fill in all required fields first"}
        >
          Mark complete
        </button>
      </div>

      <section className="gf-pdf">
        <h3>Fill the actual PDF</h3>
        {!pdfState?.instrument.pdf_template_path ? (
          <div className="gf-pdf-upload">
            <p>
              Download the official form from{" "}
              <a href={form.official_url} target="_blank" rel="noopener">{form.agency}</a>, then upload the blank
              PDF here — we&apos;ll fill it in with the answers above.
            </p>
            <input
              type="file"
              accept="application/pdf"
              disabled={pdfBusy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadTemplate(f);
              }}
            />
          </div>
        ) : pdfState.instrument.pdf_status === "unsupported" ? (
          <div className="gf-pdf-unsupported">
            <p>
              This PDF isn&apos;t a fillable form (no editable fields), so we can&apos;t auto-fill it yet. Use your
              saved answers above to fill in the blank form by hand.
            </p>
            <a href={form.official_url} target="_blank" rel="noopener" className="gf-official">
              Open the official blank form ↗
            </a>
          </div>
        ) : pdfState.instrument.pdf_status === "mapping" ? (
          <div className="gf-pdf-mapping">
            <p>We matched your answers to the PDF&apos;s fields — check these before your first download:</p>
            {form.fields.map((field) => (
              <div key={field.name} className="gf-pdf-map-row">
                <label>{field.label}</label>
                <select
                  value={fieldMapDraft[field.name] ?? ""}
                  onChange={(e) => setFieldMapDraft((m) => ({ ...m, [field.name]: e.target.value }))}
                >
                  <option value="">— not on this form —</option>
                  {pdfState.pdf_fields.map((pf) => (
                    <option key={pf.name} value={pf.name}>{pf.label ?? pf.name}</option>
                  ))}
                </select>
              </div>
            ))}
            <button onClick={confirmFieldMap} disabled={pdfBusy}>
              {pdfBusy ? "Saving…" : "Confirm mapping"}
            </button>
          </div>
        ) : (
          <div className="gf-pdf-ready">
            <button onClick={() => downloadFilledPdf(form.form_number)} disabled={pdfBusy}>
              {pdfBusy ? "Preparing…" : "Download filled PDF"}
            </button>
            <label className="gf-pdf-replace">
              Replace template
              <input
                type="file"
                accept="application/pdf"
                disabled={pdfBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadTemplate(f);
                }}
              />
            </label>
          </div>
        )}
        {pdfError && <p className="gf-error">{pdfError}</p>}
      </section>

      {form.common_mistakes.length > 0 && (
        <section className="gf-mistakes">
          <h3>Common mistakes to avoid</h3>
          <ul>{form.common_mistakes.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </section>
      )}

      <section className="gf-checklist">
        <h3>Before you submit</h3>
        <ul>{state.checklist.map((c, i) => <li key={i}>{c}</li>)}</ul>
        <a href={form.official_url} target="_blank" rel="noopener" className="gf-official">
          Open the official form on {form.agency} ↗
        </a>
      </section>

      <p className="gf-disclaimer">
        Instant Attorney helps you find and complete government forms — this is form
        assistance, not legal advice.
      </p>
    </main>
  );
}

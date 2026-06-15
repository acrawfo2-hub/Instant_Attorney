"use client";

import { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { GovernmentForm, GovFormField } from "@/lib/government-forms";
import type { GovFormInstrument } from "@/lib/types";

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
  progress: Progress;
  checklist: string[];
  errors?: Record<string, string>;
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

  return (
    <main className="gf-wrap">
      <Link href="/dashboard" className="gf-back">← Back to your file</Link>

      <header className="gf-header">
        <h1>{form.form_number} — {form.title}</h1>
        <p className="gf-meta">{form.agency} · {form.jurisdiction}</p>
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

"use client";

import { use, useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import type { GovernmentForm, GovFormField } from "@/lib/government-forms";
import type { GovFormInstrument, FormVerification } from "@/lib/types";

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

const SCREENSHOT_TIPS: { label: string; steps: string }[] = [
  { label: "Windows", steps: "Press Win + Shift + S to snip an area of the screen, or Win + PrtScn to capture the whole screen." },
  { label: "Mac", steps: "Press Cmd + Shift + 4 and drag to select an area, or Cmd + Shift + 3 to capture the whole screen." },
  { label: "iPhone", steps: "Press the Side button and Volume Up button at the same time." },
  { label: "Android", steps: "Press the Power button and Volume Down button at the same time (may vary by phone)." },
  { label: "A printed or handwritten page", steps: "Use your phone's camera in good light. Lay the page flat, keep all four corners in frame, and avoid glare or shadows across the text." },
];

const VERIFICATION_STATUS_LABEL: Record<FormVerification["status"], string> = {
  processing: "Checking your photos…",
  verified: "Looks correctly filled out",
  mismatch: "Some answers don't match",
  needs_review: "Needs a closer look",
  failed: "Couldn't read these photos",
};

// Screenshot-verification fallback: once the client has filled out the real form
// (fillable PDF or by hand), they upload photos here and the AI checks what it
// reads against the answers already collected above, field by field.
function VerifyForm({ instrumentId }: { instrumentId: string }) {
  const [verifications, setVerifications] = useState<FormVerification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/gov-forms/${instrumentId}/verify`);
    if (res.ok) {
      const data = await res.json();
      setVerifications(data.verifications ?? []);
    }
    setLoaded(true);
  }, [instrumentId]);

  useEffect(() => { refresh(); }, [refresh]);

  const hasPending = verifications.some((v) => v.status === "processing");
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [hasPending, refresh]);

  async function handleUpload() {
    const files = fileInputRef.current?.files;
    if (!files || files.length === 0) {
      setError("Choose at least one photo or screenshot first.");
      return;
    }
    setError(null);
    setUploading(true);
    const body = new FormData();
    for (const file of Array.from(files)) body.append("files", file);
    const res = await fetch(`/api/gov-forms/${instrumentId}/verify`, { method: "POST", body });
    setUploading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Upload failed. Please try again.");
      return;
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    await refresh();
  }

  const latest = verifications[0] ?? null;

  return (
    <section className="gf-verify">
      <h3>Confirm your filled-out form</h3>
      <p className="gf-verify-intro">
        Once you&apos;ve filled this out — in the fillable PDF, or by hand — upload a photo or
        screenshot of every page and we&apos;ll check it against the answers above.
      </p>

      <button type="button" className="gf-tips-toggle" onClick={() => setShowTips((s) => !s)}>
        {showTips ? "Hide" : "How do I take a screenshot or photo?"}
      </button>
      {showTips && (
        <ul className="gf-tips">
          {SCREENSHOT_TIPS.map((t) => (
            <li key={t.label}><strong>{t.label}:</strong> {t.steps}</li>
          ))}
        </ul>
      )}

      <div className="gf-verify-upload">
        <input ref={fileInputRef} type="file" accept="image/*" multiple disabled={uploading} />
        <button type="button" onClick={handleUpload} disabled={uploading}>
          {uploading ? "Uploading…" : "Verify my filled-out form"}
        </button>
      </div>
      {error && <p className="gf-error">{error}</p>}

      {loaded && latest && (
        <div className={`gf-verify-result gf-verify-${latest.status}`}>
          <p className="gf-verify-status">
            {VERIFICATION_STATUS_LABEL[latest.status]}
            {latest.status === "processing" && <span className="gf-verify-spinner" aria-hidden="true" />}
          </p>
          {latest.summary && <p className="gf-verify-summary">{latest.summary}</p>}
          {latest.field_results.length > 0 && (
            <ul className="gf-verify-fields">
              {latest.field_results.map((r) => (
                <li key={r.field} className={r.match ? "gf-field-match" : "gf-field-mismatch"}>
                  <span className="gf-field-icon" aria-hidden="true">{r.match ? "✅" : "⚠️"}</span>
                  <span className="gf-field-body">
                    <strong>{r.label}:</strong> we read &ldquo;{r.seen ?? "(not found)"}&rdquo;
                    {!r.match && ` — expected ${r.expected}`}
                    {r.note && <span className="gf-field-note"> {r.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
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

      {form.common_mistakes.length > 0 && (
        <section className="gf-mistakes">
          <h3>Common mistakes to avoid</h3>
          <ul>{form.common_mistakes.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </section>
      )}

      <section className="gf-checklist">
        <h3>Before you submit</h3>
        <ul>{state.checklist.map((c, i) => <li key={i}>{c}</li>)}</ul>
        {form.fillable === false ? (
          <p className="gf-fillable-note gf-fillable-note-manual">
            No fillable PDF for this one — {form.fillable_note ?? "print it out and fill it in by hand, or use the official portal below."}
          </p>
        ) : (
          <p className="gf-fillable-note">
            This form has a fillable PDF — open it and type your answers directly into it in your
            browser or PDF reader. Prefer pen and paper? Print it and fill it out by hand instead.
          </p>
        )}
        <a href={form.official_url} target="_blank" rel="noopener" className="gf-official">
          {form.fillable === false ? "Open the official form" : "Open the fillable PDF"} on {form.agency} ↗
        </a>
      </section>

      <VerifyForm instrumentId={state.instrument.id} />

      <p className="gf-disclaimer">
        Instant Attorney helps you find and complete government forms — this is form
        assistance, not legal advice.
      </p>
    </main>
  );
}

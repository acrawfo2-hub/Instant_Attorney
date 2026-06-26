"use client";

import { useState } from "react";
import {
  COUNSEL_GOAL_OPTIONS,
  counselGoalLabel,
  existingCounselDisclosure,
  type CounselEngagementGoal,
} from "@/lib/existing-counsel";

export interface ExistingCounselFormValue {
  has_existing_counsel: boolean;
  unsure?: boolean;
  existing_counsel_name: string;
  counsel_engagement_goal: CounselEngagementGoal | null;
}

interface ExistingCounselFormProps {
  /** When set, POST to counsel-context API on save. When omitted, onComplete only. */
  caseFileId?: string | null;
  initial?: Partial<ExistingCounselFormValue> & { counsel_intake_at?: string | null };
  onComplete: (value: ExistingCounselFormValue) => void;
  onCancel?: () => void;
  /** Phase II privileged channel vs Phase I informational. */
  privileged?: boolean;
  compact?: boolean;
}

type Step = "ask" | "details";

export default function ExistingCounselForm({
  caseFileId,
  initial,
  onComplete,
  onCancel,
  privileged = false,
  compact = false,
}: ExistingCounselFormProps) {
  const [step, setStep] = useState<Step>("ask");
  const [hasCounsel, setHasCounsel] = useState<boolean | null>(
    initial?.has_existing_counsel ?? null
  );
  const [name, setName] = useState(initial?.existing_counsel_name ?? "");
  const [goal, setGoal] = useState<CounselEngagementGoal | null>(
    initial?.counsel_engagement_goal ?? null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function persist(value: ExistingCounselFormValue) {
    if (caseFileId) {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/case-files/${caseFileId}/counsel-context`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            has_existing_counsel: value.has_existing_counsel,
            unsure: value.unsure === true,
            existing_counsel_name: value.existing_counsel_name,
            counsel_engagement_goal: value.counsel_engagement_goal,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? "Could not save");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    onComplete(value);
  }

  function handleNo() {
    void persist({
      has_existing_counsel: false,
      existing_counsel_name: "",
      counsel_engagement_goal: null,
    });
  }

  function handleUnsure() {
    void persist({
      has_existing_counsel: false,
      unsure: true,
      existing_counsel_name: "",
      counsel_engagement_goal: null,
    });
  }

  function handleYes() {
    setHasCounsel(true);
    setStep("details");
  }

  function handleDetailsSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!goal) {
      setError("Please choose what you'd like help with.");
      return;
    }
    void persist({
      has_existing_counsel: true,
      existing_counsel_name: name.trim(),
      counsel_engagement_goal: goal,
    });
  }

  const disclosure = existingCounselDisclosure(privileged);

  return (
    <div className={compact ? "ec-form ec-form-compact" : "ec-form"}>
      <p className="ec-disclosure">{disclosure}</p>

      {step === "ask" && (
        <>
          <p className="ec-question">
            {privileged
              ? "Do you already have another attorney working on this matter?"
              : "Do you already have an attorney on this matter?"}
          </p>
          <div className="ec-choice-row">
            <button type="button" className="ec-btn ec-btn-primary" disabled={saving} onClick={handleYes}>
              Yes
            </button>
            <button type="button" className="ec-btn ec-btn-secondary" disabled={saving} onClick={handleNo}>
              No
            </button>
            <button type="button" className="ec-btn ec-btn-ghost" disabled={saving} onClick={handleUnsure}>
              Not sure
            </button>
          </div>
        </>
      )}

      {step === "details" && hasCounsel && (
        <form onSubmit={handleDetailsSubmit} className="ec-details">
          <p className="ec-question">What would you like Instant Attorney to help with?</p>
          <div className="ec-goal-list">
            {COUNSEL_GOAL_OPTIONS.map((opt) => (
              <label key={opt.value} className={`ec-goal-option${goal === opt.value ? " ec-goal-selected" : ""}`}>
                <input
                  type="radio"
                  name="counsel_goal"
                  value={opt.value}
                  checked={goal === opt.value}
                  onChange={() => setGoal(opt.value)}
                />
                <span className="ec-goal-label">{opt.label}</span>
                <span className="ec-goal-desc">{opt.description}</span>
              </label>
            ))}
          </div>
          <label className="ec-field">
            <span className="ec-field-label">Your attorney&apos;s name or firm (optional)</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jane Doe, Esq. or Smith & Associates"
              maxLength={200}
              className="ec-input"
            />
          </label>
          <div className="ec-choice-row">
            <button type="button" className="ec-btn ec-btn-ghost" disabled={saving} onClick={() => setStep("ask")}>
              Back
            </button>
            <button type="submit" className="ec-btn ec-btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Continue"}
            </button>
          </div>
        </form>
      )}

      {error && <p className="ec-error">{error}</p>}

      {onCancel && step === "ask" && (
        <button type="button" className="ec-cancel" onClick={onCancel} disabled={saving}>
          Skip for now
        </button>
      )}
    </div>
  );
}

/** Read-only summary for the Living File card. */
export function ExistingCounselSummary({
  hasExistingCounsel,
  counselName,
  goal,
}: {
  hasExistingCounsel?: boolean | null;
  counselName?: string | null;
  goal?: CounselEngagementGoal | null;
}) {
  if (hasExistingCounsel == null) {
    return <p className="lf-empty-field">Not recorded yet.</p>;
  }
  if (!hasExistingCounsel) {
    return <p className="lf-summary">No other attorney on this matter.</p>;
  }
  return (
    <div className="ec-summary">
      <p className="lf-summary">
        <strong>Another attorney is involved</strong>
        {counselName?.trim() ? ` — ${counselName.trim()}` : ""}
      </p>
      {goal && (
        <p className="ec-summary-goal">
          Instant Attorney scope: {counselGoalLabel(goal)}
        </p>
      )}
      <p className="ec-summary-note">
        Limited-scope assistance only. Coordinate with your current counsel before acting.
      </p>
    </div>
  );
}

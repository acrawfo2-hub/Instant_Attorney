"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MissionControlBoard as MissionControlData } from "@/lib/mission-control";

interface MissionControlBoardProps {
  board: MissionControlData;
  caseFileId: string;
  mode: "client" | "attorney";
  isAttorneyUser?: boolean;
}

function StepDot({ state, number }: { state: "done" | "current" | "upcoming"; number: number }) {
  return (
    <span className={`lf-step-dot lf-step-dot-${state}`}>
      {state === "done" ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        number
      )}
    </span>
  );
}

function GapAnswerRow({
  caseFileId,
  factId,
  title,
  reason,
  onDone,
}: {
  caseFileId: string;
  factId: string;
  title: string;
  reason?: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!value.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/case-files/${caseFileId}/answer-gap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factId, answer: value.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save");
        return;
      }
      setOpen(false);
      setValue("");
      onDone();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="mc-action mc-action-gap">
      <div className="mc-action-main">
        <span className="mc-action-icon" aria-hidden="true">○</span>
        <div className="mc-action-text">
          <span className="mc-action-title">{title}</span>
          {reason && <span className="mc-action-reason">{reason}</span>}
        </div>
        {!open && (
          <button type="button" className="mc-action-btn" onClick={() => setOpen(true)}>
            Answer →
          </button>
        )}
      </div>
      {open && (
        <div className="mc-gap-form">
          <input
            className="mc-gap-input"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Type your answer…"
            autoFocus
          />
          <div className="mc-gap-form-actions">
            <button type="button" className="mc-action-btn" onClick={save} disabled={saving || !value.trim()}>
              {saving ? "Saving…" : "Save to case file"}
            </button>
            <button type="button" className="mc-action-link-btn" onClick={() => { setOpen(false); setError(""); }}>
              Cancel
            </button>
          </div>
          {error && <span className="mc-action-error">{error}</span>}
        </div>
      )}
    </li>
  );
}

export default function MissionControlBoard({ board, caseFileId, mode, isAttorneyUser = false }: MissionControlBoardProps) {
  const router = useRouter();
  const { hero, actions, openCount, completedCount } = board;
  const isAttorney = mode === "attorney";

  return (
    <section id="mission-control" className={`lf-nextstep lf-nextstep-${hero.tone} mc-board`} aria-label="Mission control">
      {!isAttorney && (
        <div className="mc-board-intro">
          <span className="mc-board-intro-title">
            {isAttorneyUser
              ? "Draft and refine documents for your client"
              : "Generate a legal document for your file and have it reviewed"}
          </span>
          <span className="mc-board-intro-sub">
            {isAttorneyUser
              ? "These five steps take you from gathering facts to a polished draft you can deliver."
              : "These five steps take you from telling your story to a final, attorney-reviewed document."}
          </span>
        </div>
      )}

      <ol className="lf-stepper" aria-label="Your progress">
        {hero.steps.map((step, i) => (
          <li key={step.label} className={`lf-step lf-step-${step.state}`}>
            <StepDot state={step.state} number={i + 1} />
            <span className="lf-step-label">{step.label}</span>
            {i < hero.steps.length - 1 && <span className="lf-step-line" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      <div className="lf-nextstep-hero">
        <div className="lf-nextstep-text">
          <span className="lf-nextstep-eyebrow">
            <span className="lf-nextstep-badge">Step {hero.activeStep} of {hero.steps.length}</span>
            {hero.eyebrow}
          </span>
          <h2 className="lf-nextstep-title">{hero.title}</h2>
          <p className="lf-nextstep-body">{hero.body}</p>
        </div>

        {(hero.cta || hero.secondary) && (
          <div className="lf-nextstep-actions">
            {hero.cta && (
              <Link href={hero.cta.href} className="lf-nextstep-btn">
                {hero.cta.label}
              </Link>
            )}
            {hero.secondary && (
              <Link href={hero.secondary.href} className="lf-nextstep-link">
                {hero.secondary.label}
              </Link>
            )}
          </div>
        )}
      </div>

      {actions.length > 0 && (
        <div className="mc-queue">
          <div className="mc-queue-header">
            <span className="mc-queue-title">
              {isAttorney ? "Client progress & open items" : hero.tone === "waiting" ? "While you wait" : "Also helpful right now"}
            </span>
            <span className="mc-queue-meta">
              {openCount} open{completedCount > 0 ? ` · ${completedCount} items in your case file` : ""}
            </span>
          </div>
          <ul className="mc-action-list">
            {actions.map((action) => {
              if (!isAttorney && action.kind === "gap" && action.factId && action.id !== "gap:more") {
                return (
                  <GapAnswerRow
                    key={action.id}
                    caseFileId={caseFileId}
                    factId={action.factId}
                    title={action.title}
                    reason={action.reason}
                    onDone={() => router.refresh()}
                  />
                );
              }

              const href = action.cta?.href ?? (isAttorney ? action.jumpTo : undefined);
              const label =
                action.cta?.label ??
                (isAttorney && action.jumpTo ? "Jump to section ↓" : undefined);

              return (
                <li key={action.id} className={`mc-action mc-action-${action.kind} mc-action-${action.status}`}>
                  <div className="mc-action-main">
                    <span className="mc-action-icon" aria-hidden="true">
                      {action.status === "in_progress" ? "◐" : action.status === "blocked" ? "…" : "○"}
                    </span>
                    <div className="mc-action-text">
                      <span className="mc-action-title">{action.title}</span>
                      {action.reason && <span className="mc-action-reason">{action.reason}</span>}
                    </div>
                    {href && label && (
                      action.cta?.href?.startsWith("http") ? (
                        <a href={action.cta.href} className="mc-action-btn" target="_blank" rel="noopener noreferrer">
                          {label}
                        </a>
                      ) : href.startsWith("#") ? (
                        <a href={href} className="mc-action-btn">{label}</a>
                      ) : (
                        <Link href={href} className="mc-action-btn">{label}</Link>
                      )
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {!isAttorney && (
            <p className="mc-queue-foot">
              Your legal strategy, instruments, and full file details are below — they update automatically as you complete actions.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

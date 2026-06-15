import Link from "next/link";
import type { CaseFile, Document, FactItem } from "@/lib/types";
import { computeNextStep } from "@/lib/next-step";
import type { PlanStatus } from "@/lib/next-step";

const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  sent: "With attorney",
  changes_requested: "Changes requested",
  approved: "Approved",
};

// ─────────────────────────────────────────────────────────────────────────────
// NextStepGuide — the friendly, plain-language guidance LAYER.
//
// Sits at the very top of the client Living File. Its only job is to make the
// single next action impossible to miss for any user, regardless of reading
// level: a visual progress spine ("where am I?") plus one big, clearly-worded
// button ("what do I click now?"). It adds on top of — and never replaces —
// the detailed Living File below.
// ─────────────────────────────────────────────────────────────────────────────

interface NextStepGuideProps {
  caseFile: CaseFile;
  documents: Document[];
  facts: FactItem[];
  preWarmedByType?: Record<string, string>;
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

export default function NextStepGuide({
  caseFile,
  documents,
  facts,
  preWarmedByType = {},
}: NextStepGuideProps) {
  const guide = computeNextStep(caseFile, documents, facts, preWarmedByType);

  // Show the multi-document context only when the file truly has more than one
  // planned document — single-document files look exactly as before.
  const multiDoc = (guide.activeDocPosition?.total ?? 0) > 1;

  return (
    <section className={`lf-nextstep lf-nextstep-${guide.tone}`} aria-label="What to do next">
      {/* "Document X of N" — tells the user this file has more than one document */}
      {multiDoc && guide.activeDocPosition && (
        <div className="lf-doc-counter">
          <span className="lf-doc-counter-pill">
            Document {guide.activeDocPosition.index} of {guide.activeDocPosition.total}
          </span>
          <span className="lf-doc-counter-note">
            Your file includes several documents — let&apos;s get this one finished first.
          </span>
        </div>
      )}

      {/* Progress spine — visual "where am I in the process" */}
      <ol className="lf-stepper" aria-label="Your progress">
        {guide.steps.map((step, i) => (
          <li key={step.label} className={`lf-step lf-step-${step.state}`}>
            <StepDot state={step.state} number={i + 1} />
            <span className="lf-step-label">{step.label}</span>
            {i < guide.steps.length - 1 && <span className="lf-step-line" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      {/* Hero — the one obvious next action, in plain words */}
      <div className="lf-nextstep-hero">
        <div className="lf-nextstep-text">
          <span className="lf-nextstep-eyebrow">
            <span className="lf-nextstep-badge">Step {guide.activeStep} of {guide.steps.length}</span>
            {guide.eyebrow}
          </span>
          <h2 className="lf-nextstep-title">{guide.title}</h2>
          <p className="lf-nextstep-body">{guide.body}</p>
        </div>

        {(guide.cta || guide.secondary) && (
          <div className="lf-nextstep-actions">
            {guide.cta && (
              <Link href={guide.cta.href} className="lf-nextstep-btn">
                {guide.cta.label}
              </Link>
            )}
            {guide.secondary && (
              <Link href={guide.secondary.href} className="lf-nextstep-link">
                {guide.secondary.label}
              </Link>
            )}
          </div>
        )}
      </div>

      {/* File roadmap — the other documents in this file's plan. Collapsed by
          default so it informs without competing with the one hero action. */}
      {multiDoc && (
        <details className="lf-roadmap">
          <summary className="lf-roadmap-summary">
            See your file&apos;s plan ({guide.plan.length} documents)
          </summary>
          <ol className="lf-roadmap-list">
            {guide.plan.map((item) => {
              const isActive = item.priority === guide.activeDocPosition?.index;
              return (
                <li
                  key={item.key}
                  className={`lf-roadmap-item lf-roadmap-item-${item.status}${isActive ? " lf-roadmap-item-active" : ""}`}
                >
                  <span className="lf-roadmap-num">{item.priority}</span>
                  <span className="lf-roadmap-label">
                    {item.label}
                    {item.isLead && <span className="lf-roadmap-lead">Most important</span>}
                  </span>
                  <span className={`lf-roadmap-status lf-roadmap-status-${item.status}`}>
                    {PLAN_STATUS_LABEL[item.status]}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="lf-roadmap-note">
            You don&apos;t have to do these all at once. Finish your most important
            document first — your attorney can adjust the order any time.
          </p>
        </details>
      )}
    </section>
  );
}

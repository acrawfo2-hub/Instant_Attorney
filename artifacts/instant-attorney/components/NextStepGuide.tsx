import Link from "next/link";
import type { CaseFile, Document, FactItem } from "@/lib/types";
import { computeNextStep } from "@/lib/next-step";

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

  return (
    <section className={`lf-nextstep lf-nextstep-${guide.tone}`} aria-label="What to do next">
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
    </section>
  );
}

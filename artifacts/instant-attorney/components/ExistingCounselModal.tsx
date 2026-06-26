"use client";

import ExistingCounselForm, { type ExistingCounselFormValue } from "@/components/ExistingCounselForm";

interface Props {
  caseFileId?: string | null;
  onComplete: (value: ExistingCounselFormValue) => void;
  onSkip?: () => void;
}

/** Blocking modal before Phase II intake when counsel status is unknown. */
export default function ExistingCounselModal({ caseFileId, onComplete, onSkip }: Props) {
  return (
    <div className="ec-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="ec-modal-title">
      <div className="ec-modal">
        <h2 id="ec-modal-title" className="ec-modal-title">
          Quick question before we begin
        </h2>
        <p className="ec-modal-sub">
          Many clients use Instant Attorney alongside another attorney. A quick answer helps us stay in the right lane.
        </p>
        <ExistingCounselForm
          caseFileId={caseFileId}
          privileged
          onComplete={onComplete}
          onCancel={onSkip}
        />
      </div>
    </div>
  );
}

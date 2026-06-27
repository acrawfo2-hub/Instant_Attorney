"use client";

import { useState } from "react";
import ExistingCounselForm, { ExistingCounselSummary } from "@/components/ExistingCounselForm";
import type { CounselEngagementGoal } from "@/lib/types";
import type { ExistingCounselFormValue } from "@/components/ExistingCounselForm";

interface Props {
  caseFileId: string;
  counselIntakeAt?: string | null;
  hasExistingCounsel?: boolean | null;
  existingCounselName?: string | null;
  counselEngagementGoal?: CounselEngagementGoal | null;
  mode?: "client" | "attorney";
}

export default function ExistingCounselCard({
  caseFileId,
  counselIntakeAt,
  hasExistingCounsel,
  existingCounselName,
  counselEngagementGoal,
  mode = "client",
}: Props) {
  const [editing, setEditing] = useState(false);
  const [ctx, setCtx] = useState({
    counsel_intake_at: counselIntakeAt,
    has_existing_counsel: hasExistingCounsel,
    existing_counsel_name: existingCounselName ?? "",
    counsel_engagement_goal: counselEngagementGoal ?? null,
  });

  const isAttorney = mode === "attorney";

  function handleComplete(value: ExistingCounselFormValue) {
    setCtx({
      counsel_intake_at: new Date().toISOString(),
      has_existing_counsel: value.has_existing_counsel,
      existing_counsel_name: value.existing_counsel_name,
      counsel_engagement_goal: value.counsel_engagement_goal,
    });
    setEditing(false);
  }

  const needsIntake = !ctx.counsel_intake_at;

  if (isAttorney && needsIntake) {
    return (
      <div className="lf-card lf-card-full" id="existing-counsel">
        <div className="lf-card-label">Existing Counsel</div>
        <p className="lf-empty-field">Client has not completed the counsel intake question yet.</p>
      </div>
    );
  }

  return (
    <div className="lf-card lf-card-full" id="existing-counsel">
      <div className="lf-card-label-row">
        <div className="lf-card-label">
          {isAttorney ? "Existing Counsel" : "Your Other Attorney"}
          {!isAttorney && (
            <span className="lf-plain-caption">Helps us scope this file correctly</span>
          )}
        </div>
        {!isAttorney && ctx.counsel_intake_at && !editing && (
          <button type="button" className="ec-edit-btn" onClick={() => setEditing(true)}>
            Update
          </button>
        )}
      </div>

      {needsIntake || editing ? (
        <ExistingCounselForm
          caseFileId={caseFileId}
          initial={{
            has_existing_counsel: ctx.has_existing_counsel ?? undefined,
            existing_counsel_name: ctx.existing_counsel_name,
            counsel_engagement_goal: ctx.counsel_engagement_goal,
          }}
          privileged
          compact={!!ctx.counsel_intake_at}
          onComplete={handleComplete}
          onCancel={ctx.counsel_intake_at ? () => setEditing(false) : undefined}
        />
      ) : (
        <ExistingCounselSummary
          hasExistingCounsel={ctx.has_existing_counsel}
          counselName={ctx.existing_counsel_name}
          goal={ctx.counsel_engagement_goal}
        />
      )}
    </div>
  );
}

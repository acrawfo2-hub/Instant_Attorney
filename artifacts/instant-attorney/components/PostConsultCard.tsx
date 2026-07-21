import type { ConsultWrapUp } from "@/lib/types";
import { CONSULT_DISPOSITION_LABELS } from "@/lib/consult-wrap-up";

export default function PostConsultCard({
  wrapUp,
  submittedAt,
}: {
  wrapUp: ConsultWrapUp;
  submittedAt: string | null;
}) {
  const clientActions = wrapUp.clientActions.filter((a) => a.text.trim());
  const expectedDocuments = wrapUp.expectedDocuments.filter((a) => a.text.trim());
  const dispositionLabel = wrapUp.disposition
    ? CONSULT_DISPOSITION_LABELS[wrapUp.disposition]
    : null;

  return (
    <div className="lf-card lf-card-full lf-post-consult">
      <div className="lf-post-consult-header">
        <span className="lf-consult-rec-badge lf-consult-rec-badge-confirmed">After your consult</span>
        {submittedAt && (
          <span className="lf-post-consult-date">
            {new Date(submittedAt).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        )}
      </div>

      {wrapUp.consultSummary && (
        <p className="lf-post-consult-summary">{wrapUp.consultSummary}</p>
      )}

      {wrapUp.strategyOverview && (
        <div className="lf-post-consult-strategy">
          <div className="lf-card-label">Where things stand</div>
          <p>{wrapUp.strategyOverview}</p>
        </div>
      )}

      {dispositionLabel && (
        <div className="lf-post-consult-disposition">
          Outcome: <strong>{dispositionLabel}</strong>
        </div>
      )}

      {wrapUp.disposition === "refer_out" && wrapUp.referralNotes && (
        <div className="lf-post-consult-referral">
          <div className="lf-card-label">Referral</div>
          <p>{wrapUp.referralNotes}</p>
        </div>
      )}

      {wrapUp.expectedTimeline && (
        <div className="lf-post-consult-timeline">
          <div className="lf-card-label">Expected timeline</div>
          <p>{wrapUp.expectedTimeline}</p>
        </div>
      )}

      {expectedDocuments.length > 0 && (
        <div className="lf-post-consult-documents">
          <div className="lf-card-label">Documents to expect</div>
          <ul className="lf-post-consult-list">
            {expectedDocuments.map((doc) => (
              <li key={doc.id}>{doc.text}</li>
            ))}
          </ul>
        </div>
      )}

      {clientActions.length > 0 && (
        <div className="lf-post-consult-actions">
          <div className="lf-card-label">Your action plan</div>
          <ol className="lf-post-consult-list">
            {clientActions.map((action) => (
              <li key={action.id}>
                {action.text}
                {action.kind === "document" && (
                  <span className="lf-post-consult-tag">Upload needed</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

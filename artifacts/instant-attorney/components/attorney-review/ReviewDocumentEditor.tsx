"use client";

import type { ReviewChange, RevisionSaveState } from "./types";

interface Props {
  title: string;
  text: string;
  source: "second_draft" | "working_copy";
  saveState: RevisionSaveState;
  changes: ReviewChange[];
  onChange: (text: string) => void;
  onBlur: () => void;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onAcceptAll: () => void;
}

export default function ReviewDocumentEditor(props: Props) {
  const status = props.saveState === "saving" ? "Saving…"
    : props.saveState === "error" ? "Save error — changes not yet saved"
      : props.saveState === "saved" ? "Saved" : props.saveState === "dirty" ? "Unsaved changes" : "";
  return (
    <section className="review-workbench-pane review-editor-pane" aria-label="Editable revision">
      <div className="review-pane-heading">
        <div><h2>{props.title}</h2><p>{props.source === "second_draft" ? "Canonical revised draft" : "Working copy seeded from the client submission"}</p></div>
        <span className={`review-save-state review-save-${props.saveState}`} role="status">{status}</span>
      </div>
      {props.changes.length > 0 && (
        <div className="review-proposals">
          <div className="review-proposals-head"><strong>{props.changes.length} proposed change{props.changes.length === 1 ? "" : "s"}</strong><button type="button" onClick={props.onAcceptAll}>Accept all</button></div>
          {props.changes.map((change) => (
            <article key={change.id} className="review-proposal">
              <p>{change.summary}</p>
              <div className="review-change-set"><del>{change.before}</del><ins>{change.after}</ins></div>
              <div><button type="button" onClick={() => props.onAccept(change.id)}>Accept</button><button type="button" onClick={() => props.onReject(change.id)}>Reject</button></div>
            </article>
          ))}
        </div>
      )}
      <textarea className="review-document-textarea" value={props.text} onChange={(e) => props.onChange(e.target.value)} onBlur={props.onBlur} spellCheck />
      <p className="review-editor-footnote">This attorney work product is saved separately. The client&apos;s submitted original remains unchanged.</p>
    </section>
  );
}

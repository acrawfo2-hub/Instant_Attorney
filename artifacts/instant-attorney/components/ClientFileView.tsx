"use client";

import Link from "next/link";
import type { CaseFile, FactItem, Document } from "@/lib/types";
import { WIZARD_LABELS } from "@/lib/types";
import type { WizardType } from "@/lib/types";

interface ClientFileViewProps {
  caseFile: CaseFile;
  facts: FactItem[];
  documents: Document[];
  preWarmedByType: Record<string, string>;
  mode: "client";
}

const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_review: "Awaiting Attorney Review",
  approved: "Approved",
  changes_requested: "Changes Requested",
  delivered: "Delivered",
};

const WIZARD_ICONS: Record<WizardType, string> = {
  demand_letter: "✉️",
  complaint_letter: "📣",
  draft_contract: "📝",
  draft_waiver: "🤝",
  wills_trusts: "⚖️",
  doc_review: "🔍",
};

export default function ClientFileView({ caseFile, facts, documents, preWarmedByType }: ClientFileViewProps) {
  const confirmedFacts = facts.filter((f) => f.status === "confirmed");
  const gapFacts = facts.filter((f) => f.status === "gap");
  const strategy = caseFile.legal_strategy;
  const recommendedWizards: WizardType[] = (strategy?.recommended_wizards ?? []) as WizardType[];

  return (
    <div className="lf-grid">

      {/* Summary card */}
      {(caseFile.summary || caseFile.next_action || caseFile.goals?.length > 0) && (
        <div className="lf-card lf-card-full lf-card-action">
          {caseFile.summary && (
            <div className="lf-summary">
              <div className="lf-card-label">Summary</div>
              <p className="lf-card-value">{caseFile.summary}</p>
            </div>
          )}
          {caseFile.next_action && (
            <div style={{ marginTop: caseFile.summary ? "1rem" : 0 }}>
              <div className="lf-card-label">Next Step</div>
              <p className="lf-card-value lf-next-action">{caseFile.next_action}</p>
            </div>
          )}
          {caseFile.goals?.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <div className="lf-card-label">Goals</div>
              <ul className="lf-list">
                {caseFile.goals.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Facts */}
      {(confirmedFacts.length > 0 || gapFacts.length > 0) && (
        <div className="lf-card lf-card-full">
          <div className="lf-card-label">
            Facts on File
            {confirmedFacts.length > 0 && (
              <span className="lf-count">{confirmedFacts.length} confirmed</span>
            )}
            {gapFacts.length > 0 && (
              <span className="lf-count lf-count-gap">{gapFacts.length} gap{gapFacts.length !== 1 ? "s" : ""}</span>
            )}
          </div>
          {confirmedFacts.length > 0 && (
            <ul className="lf-list lf-list-confirmed" style={{ marginTop: "0.75rem" }}>
              {confirmedFacts.map((f) => <li key={f.id}>{f.description}</li>)}
            </ul>
          )}
          {gapFacts.length > 0 && (
            <ul className="lf-list lf-list-gap" style={{ marginTop: confirmedFacts.length > 0 ? "0.75rem" : "0.5rem" }}>
              {gapFacts.map((f) => <li key={f.id}>{f.description}</li>)}
            </ul>
          )}
          {confirmedFacts.length === 0 && gapFacts.length === 0 && (
            <p className="lf-empty-field">No facts captured yet. Continue your intake chat to build your file.</p>
          )}
        </div>
      )}

      {/* Legal strategy */}
      {strategy && (
        <div className="lf-card lf-card-full lf-card-strategy">
          <div className="lf-card-label">Legal Strategy</div>
          {strategy.summary && (
            <p className="lf-strategy-summary">{strategy.summary}</p>
          )}
          {(strategy.instruments?.length > 0 || strategy.risks?.length > 0 || strategy.strengths?.length > 0) && (
            <div className="lf-strategy-grid">
              {strategy.instruments?.length > 0 && (
                <div>
                  <div className="lf-strategy-sub">Legal instruments</div>
                  <ul className="lf-list lf-instruments">
                    {strategy.instruments.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {strategy.strengths?.length > 0 && (
                <div>
                  <div className="lf-strategy-sub">Strengths</div>
                  <ul className="lf-list lf-list-confirmed">
                    {strategy.strengths.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {strategy.risks?.length > 0 && (
                <div>
                  <div className="lf-strategy-sub">Risk factors</div>
                  <ul className="lf-list lf-list-gap">
                    {strategy.risks.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {caseFile.attorney_assessment && (
            <p className="lf-assessment" style={{ marginTop: "0.75rem" }}>{caseFile.attorney_assessment}</p>
          )}
        </div>
      )}

      {/* Document Wizards */}
      {recommendedWizards.length > 0 && (
        <div className="lf-card lf-card-full">
          <div className="lf-card-label">Document Wizards</div>
          <p className="lf-wizard-hint">Your attorney has suggested the following documents. Launch a wizard to begin drafting.</p>
          <div className="lf-wizard-grid">
            {recommendedWizards.map((wType) => {
              const preWarmedDocId = preWarmedByType[wType];
              const href = preWarmedDocId
                ? `/wizard/${wType}?caseFileId=${caseFile.id}&docId=${preWarmedDocId}`
                : `/wizard/${wType}?caseFileId=${caseFile.id}`;
              return (
                <Link key={wType} href={href} className={`lf-wizard-card${preWarmedDocId ? " lf-wizard-card-ready" : ""}`}>
                  <span className="lf-wizard-icon">{WIZARD_ICONS[wType] ?? "📄"}</span>
                  <div className="lf-wizard-card-body">
                    <span className="lf-wizard-label">{WIZARD_LABELS[wType] ?? wType}</span>
                    {preWarmedDocId && <span className="lf-wizard-ready-badge">Draft ready</span>}
                  </div>
                  <span className="lf-wizard-arrow">→</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Documents */}
      <div className="lf-card lf-card-full">
        <div className="lf-card-label">Your Documents</div>
        {documents.length === 0 ? (
          <p className="lf-empty-field">Documents generated through wizards will appear here once attorney-reviewed.</p>
        ) : (
          <div className="lf-doc-list">
            {documents.map((doc) => (
              <div key={doc.id} className="lf-card lf-card-sm" style={{ margin: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--brand-navy)" }}>
                      {doc.title}
                    </div>
                    <div className="lf-card-meta" style={{ marginTop: "0.2rem" }}>
                      {DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status}
                      {doc.reviewed_at && (
                        <span> · Reviewed {new Date(doc.reviewed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      )}
                    </div>
                  </div>
                  <Link
                    href={`/wizard/${doc.doc_type}?caseFileId=${caseFile.id}&docId=${doc.id}`}
                    style={{
                      fontSize: "0.8rem",
                      padding: "0.3rem 0.75rem",
                      border: "1px solid var(--brand-navy)",
                      borderRadius: "4px",
                      color: "var(--brand-navy)",
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {doc.status === "draft" || doc.status === "pending_review" ? "Continue →" : "View →"}
                  </Link>
                </div>
                {doc.attorney_notes && (
                  <p className="lf-assessment" style={{ marginTop: "0.5rem" }}>
                    Attorney note: {doc.attorney_notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Continue intake CTA — if no strategy yet */}
      {!strategy && facts.length === 0 && (
        <div className="lf-card lf-card-full" style={{ textAlign: "center", padding: "2rem" }}>
          <p className="lf-empty-field" style={{ marginBottom: "1rem" }}>
            Your intake is in progress. Continue the chat to build your Living File.
          </p>
          <Link href={`/chat?caseFileId=${caseFile.id}`} className="lf-begin-btn">
            Continue Intake →
          </Link>
        </div>
      )}

    </div>
  );
}

import Link from "next/link";

const AREAS = [
  ["Family & divorce", "family", "Divorce, custody, support, or another family change"],
  ["Wills & estates", "estate", "Wills, powers of attorney, trusts, or probate"],
  ["Debt & bankruptcy", "bankruptcy", "Debt collection, relief options, or bankruptcy"],
  ["Injury", "personal-injury", "An accident, injury, insurance, or compensation"],
  ["Employment", "employment", "Termination, discrimination, pay, or a non-compete"],
] as const;

export default function NewCasePage() {
  return (
    <div className="lf-shell">
      <header className="lf-header">
        <Link href="/dashboard" className="lf-header-logo">← Your cases</Link>
        <div className="lf-header-center"><span className="lf-header-title">Start a new case</span></div>
        <div className="lf-header-right" />
      </header>
      <main className="lf-main new-case-main">
        <section className="new-case-intro">
          <span className="new-case-kicker">A separate private file</span>
          <h1>What would you like help with?</h1>
          <p>
            Your new case will have its own facts, documents, deadlines, and strategy. We may offer
            to reuse a stable detail such as your address, but we will confirm it with you first and
            will never mix the legal facts from your other cases.
          </p>
        </section>
        <div className="new-case-grid">
          {AREAS.map(([label, area, description]) => (
            <Link key={area} href={`/chat?area=${area}&newCase=1`} className="new-case-card">
              <strong>{label}</strong><span>{description}</span><b aria-hidden="true">→</b>
            </Link>
          ))}
          <Link href="/chat?newCase=1" className="new-case-card new-case-card--other">
            <strong>Something else</strong><span>You do not need to know the legal category</span><b aria-hidden="true">→</b>
          </Link>
        </div>
        <p className="new-case-note">
          Is this actually part of a case you already started? <Link href="/dashboard">Choose an existing case instead.</Link>
        </p>
      </main>
    </div>
  );
}

import Link from "next/link";
import type { LegalSection } from "@/lib/legal/ai-philosophy-content";

interface LegalDocumentPageProps {
  title: string;
  subtitle: string;
  version: string;
  effectiveDate?: string;
  sections: LegalSection[];
  draftNotice?: boolean;
}

export default function LegalDocumentPage({
  title,
  subtitle,
  version,
  effectiveDate,
  sections,
  draftNotice = true,
}: LegalDocumentPageProps) {
  return (
    <div className="legal-shell">
      <header className="legal-header">
        <Link href="/" className="legal-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Instant-Attorney
        </Link>
      </header>

      <main className="legal-main">
        <article className="legal-article">
          {draftNotice && (
            <div className="legal-draft-banner">
              <strong>Draft — pending attorney review.</strong> This statement is not yet
              effective. Do not rely on it until approved by licensed counsel.
            </div>
          )}

          <header className="legal-article-header">
            <p className="legal-eyebrow">Crawford Law PLLC · Texas Bar #24148908</p>
            <h1 className="legal-title">{title}</h1>
            <p className="legal-subtitle">{subtitle}</p>
            <p className="legal-meta">
              {version}
              {effectiveDate && effectiveDate !== "[TO BE SET]" && (
                <> · Effective {effectiveDate}</>
              )}
            </p>
          </header>

          <nav className="legal-toc" aria-label="Table of contents">
            <p className="legal-toc-label">On this page</p>
            <ol>
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.title}</a>
                </li>
              ))}
            </ol>
          </nav>

          {sections.map((section) => (
            <section key={section.id} id={section.id} className="legal-section">
              <h2 className="legal-section-title">{section.title}</h2>
              <div className="legal-section-body">{section.content}</div>
            </section>
          ))}

          <footer className="legal-article-footer">
            <p>
              This statement is maintained in good-faith reliance on the Texas Disciplinary
              Rules of Professional Conduct and Texas Ethics Opinion 705 (February 2025).
            </p>
            <p>
              Instant-Attorney is a product of Crawford Law PLLC. Licensed in Texas and Illinois.
              Nothing on this page constitutes legal advice or creates an attorney-client
              relationship.
            </p>
          </footer>
        </article>
      </main>

      <footer className="legal-site-footer">
        <div className="legal-footer-links">
          <Link href="/legal/ai-philosophy">AI Philosophy</Link>
          <span aria-hidden="true">·</span>
          <Link href="/free-chat">Free Chat</Link>
          <span aria-hidden="true">·</span>
          <Link href="/">Home</Link>
        </div>
        <p className="legal-footer-copy">
          © Crawford Law PLLC · Andrew Crawford, Esq. · TX Bar #24148908
        </p>
      </footer>
    </div>
  );
}

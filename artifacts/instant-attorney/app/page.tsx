"use client";

import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();

  function go(path: string) {
    router.push(path);
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <>
      {/* NAV */}
      <nav className="lp-nav">
        <button className="lp-logo" onClick={() => go("/free-chat")}>
          <div className="lp-logo-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          Instant-Attorney
        </button>
        <div className="lp-nav-links">
          <a href="#phases">Plans</a>
          <a href="#practice-areas">Practice Areas</a>
          <a href="#acp-limits">Privilege</a>
        </div>
        <div className="lp-nav-right">
          <button className="lp-btn-signin" onClick={() => go("/login")}>
            Sign In
          </button>
          <button className="lp-btn-nav" onClick={() => go("/free-chat")}>
            Start for Free
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-trust-badge">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Crawford Law PLLC &nbsp;·&nbsp; TX Bar #24148908 &nbsp;·&nbsp; Andrew Crawford, Esq.
        </div>
        <h1>
          The hardest part of any<br />
          legal problem is knowing<br />
          <em>where to start.</em>
        </h1>
        <p>
          We built a clear three-step path: from free AI-powered legal guidance to a real attorney
          strategy session with Crawford Law PLLC. Whether you need a quick resolution, a drafted
          document, or a live consult, we help you arrive informed, prepared, and in control.
        </p>
        <div className="lp-hero-cta">
          <button className="lp-btn-hero" onClick={() => go("/free-chat")}>
            Start for Free &rarr;
          </button>
          <button className="lp-btn-ghost" onClick={() => scrollTo("phases")}>
            See the Plans
          </button>
        </div>
        <div className="lp-hero-micro-links">
          <button className="lp-micro-link" onClick={() => go("/free-chat")}>
            Get general legal guidance · Free
          </button>
          <span className="lp-micro-divider">·</span>
          <button className="lp-micro-link" onClick={() => go("/register?upgrade=phase2")}>
            Review or generate legal documents with attorney review (target 48 hr) · $9.99/mo + usage-based top-ups
          </button>
          <span className="lp-micro-divider">·</span>
          <button className="lp-micro-link" onClick={() => go("/register?upgrade=consult")}>
            Book a consult · $49.99
          </button>
        </div>
      </section>

      {/* DISCLAIMER BAR */}
      <div className="lp-disclaimer-bar">
        Phase I provides general legal information only (not legal advice) and does not create an
        attorney-client relationship or attorney-client privilege.
        <span style={{ display: "block", marginTop: "0.25rem", fontSize: "11px", opacity: 0.9 }}>
          Designed primarily for Texas legal matters. Users in other states receive general
          information only — Crawford Law PLLC is licensed in Texas and Illinois, not nationwide.
        </span>
      </div>

      {/* THREE PHASES */}
      <section className="lp-section-white" id="phases">
        <h2 className="lp-section-title serif">Your legal journey, clearly mapped.</h2>
        <p className="lp-section-sub">
          Three phases designed around where you actually are and where you need to go.
        </p>

        <div className="lp-phases">
          {/* PHASE I */}
          <div className="lp-phase-card">
            <div className="lp-phase-header">
              <div className="lp-phase-num">Phase I</div>
              <h3 className="lp-phase-name serif">Get Your Bearings</h3>
              <p className="lp-phase-tagline">
                Understand your situation with AI-powered general guidance. No account, no cost.
              </p>
              <div className="lp-phase-price">
                <span className="lp-price-num serif">Free</span>
                <span className="lp-price-label">&nbsp;· no account needed</span>
              </div>
            </div>
            <div className="lp-phase-divider" />
            <div className="lp-phase-body">
              <ul className="lp-feature-list">
                <li><i className="lp-fi lp-fi-check">✓</i>Instant AI-powered general legal information</li>
                <li><i className="lp-fi lp-fi-check">✓</i>Plain-English explanation of the relevant law</li>
                <li><i className="lp-fi lp-fi-check">✓</i>Understand your options and likely next steps</li>
                <li><i className="lp-fi lp-fi-x">✕</i>Not protected by attorney-client privilege</li>
                <li><i className="lp-fi lp-fi-x">✕</i>No document drafting</li>
                <li><i className="lp-fi lp-fi-x">✕</i>Not a substitute for legal advice</li>
              </ul>
              <div className="lp-acp-note">
                <strong>Important:</strong> Phase I is general legal information only. No
                attorney-client relationship is formed and no privilege applies to these
                communications.
              </div>
            </div>
            <div className="lp-phase-footer">
              <button
                className="lp-phase-btn lp-phase-btn-free"
                onClick={() => go("/free-chat")}
              >
                Start for Free
              </button>
            </div>
          </div>

          {/* PHASE II */}
          <div className="lp-phase-card featured">
            <div className="lp-phase-header">
              <div className="lp-badge-featured">Most Popular</div>
              <div className="lp-phase-num">Phase II</div>
              <h3 className="lp-phase-name serif">Build Your Case</h3>
              <p className="lp-phase-tagline">
                Build your case as a Crawford Law client—in a privileged channel supervised by
                Texas counsel, not a public chatbot.
              </p>
              <div className="lp-phase-price">
                <span className="lp-price-num serif">$9.99</span>
                <span className="lp-price-label">&nbsp;/ month + usage</span>
              </div>
            </div>
            <div className="lp-phase-divider" />
            <div className="lp-phase-body">
              <ul className="lp-feature-list">
                <li><i className="lp-fi lp-fi-check">✓</i>Everything in Phase I</li>
                <li>
                  <i className="lp-fi lp-fi-check">✓</i>Deep Fact-Finding chat likely privileged
                  after you sign the Crawford Law intake agreement
                </li>
                <li>
                  <i className="lp-fi lp-fi-check">✓</i>Case Understanding Summary, then AI
                  analysis of issues, risks, and pathways
                </li>
                <li>
                  <i className="lp-fi lp-fi-check">✓</i>Document drafts: watermarked pre-review
                  immediately; attorney review targeted within 48 hours (eligible matters)
                </li>
                <li>
                  <i className="lp-fi lp-fi-info">ℹ</i>Pre-review drafts must not be filed or
                  relied on without attorney approval.
                </li>
                <li>
                  <i className="lp-fi lp-fi-info">ℹ</i>Attorney document review applies to
                  eligible matters. Complex litigation may still use Phase II analysis and a live
                  consult without the 48-hour document queue.
                </li>
              </ul>
              <div className="lp-acp-note">
                Use Phase II only to seek legal guidance—not for ongoing or future criminal
                conduct. Do not share messages with third parties. Privilege may apply after your
                signed agreement; it is not guaranteed in every proceeding. You consent to
                processing by service providers as described in your agreements.{" "}
                <a href="#acp-limits" className="lp-acp-inline-link">
                  Full privilege limits ↓
                </a>
              </div>
              <div className="lp-billing-note" style={{
                marginTop: "0.75rem", fontSize: "11.5px", lineHeight: 1.5, opacity: 0.85,
              }}>
                <strong>Billing:</strong> $9.99/mo auto-renews until cancelled. AI usage is metered;
                when usage since your last top-up reaches $4.75, an automatic $8.50 top-up is charged —
                up to a monthly cap you set (default $25). No refunds or proration; cancel anytime.
                After cancellation, app access ends and the Firm retains your file under its retention
                policy (you can export or request a copy). Your agreement includes binding arbitration.
                Full terms at checkout.
              </div>
            </div>
            <div className="lp-phase-footer">
              <button
                className="lp-phase-btn lp-phase-btn-mid"
                onClick={() => go("/register?upgrade=phase2")}
              >
                Start Phase II — $9.99/mo
              </button>
            </div>
          </div>

          {/* PHASE III */}
          <div className="lp-phase-card">
            <div className="lp-phase-header">
              <div className="lp-phase-num">Phase III</div>
              <h3 className="lp-phase-name serif">Meet Your Attorney</h3>
              <p className="lp-phase-tagline">
                A real strategy session. Crawford Law will take your case, discuss next steps, or
                help you find appropriate counsel when another specialist is a better fit.
              </p>
              <div className="lp-phase-price">
                <span className="lp-price-num serif">$49.99</span>
                <span className="lp-price-label">&nbsp;/ consult</span>
              </div>
            </div>
            <div className="lp-phase-divider" />
            <div className="lp-phase-body">
              <ul className="lp-feature-list">
                <li>
                  <i className="lp-fi lp-fi-check">✓</i>Live strategy session with Andrew
                  Crawford, Esq. or Crawford Law PLLC
                </li>
                <li>
                  <i className="lp-fi lp-fi-check">✓</i>Clear, actionable legal strategy for
                  your situation
                </li>
                <li>
                  <i className="lp-fi lp-fi-check">✓</i>Crawford Law will take your case,
                  discuss next steps, or assist with referrals when needed
                </li>
                <li>
                  <i className="lp-fi lp-fi-check">✓</i>All Phase II analysis and documents
                  carry forward
                </li>
                <li>
                  <i className="lp-fi lp-fi-info">ℹ</i>Available without a Phase II subscription
                </li>
              </ul>
            </div>
            <div className="lp-phase-footer">
              <button
                className="lp-phase-btn lp-phase-btn-top"
                onClick={() => go("/register?upgrade=consult")}
              >
                Book a Consult for $49.99
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* PRACTICE AREAS */}
      <section className="lp-section-areas" id="practice-areas">
        <p className="lp-areas-eyebrow">What we can help with</p>
        <h2 className="lp-areas-title serif">
          One smart path forward for virtually any legal situation.
        </h2>
        <p className="lp-areas-sub">
          Whether you&apos;re facing something urgent or just planning ahead, Crawford Law is your
          first attorney at a cost that makes sense. Many matters can be resolved quickly and
          directly. For complex situations, a live consult helps you understand whether Crawford Law
          can represent you or what your next steps should be.
        </p>

        <div className="lp-areas-grid">
          <div className="lp-area-tile" onClick={() => go("/free-chat?area=contract")}>
            <div className="lp-area-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div className="lp-area-name">Contracts</div>
            <div className="lp-area-desc">Review, draft, or dispute a contract of any kind.</div>
          </div>

          <div className="lp-area-tile" onClick={() => go("/free-chat?area=employment")}>
            <div className="lp-area-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>
            <div className="lp-area-name">Wrongful Termination</div>
            <div className="lp-area-desc">
              Fired without cause, retaliation, or discrimination.
            </div>
          </div>

          <div className="lp-area-tile" onClick={() => go("/free-chat?area=harassment")}>
            <div className="lp-area-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="lp-area-name">Harassment &amp; Retaliation</div>
            <div className="lp-area-desc">
              Workplace harassment, hostile environment, or retaliation claims.
            </div>
          </div>

          <div className="lp-area-tile" onClick={() => go("/free-chat?area=business")}>
            <div className="lp-area-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <div className="lp-area-name">Business Formation</div>
            <div className="lp-area-desc">LLC, corporation, partnership — set up correctly.</div>
          </div>

          <div className="lp-area-tile" onClick={() => go("/free-chat?area=estate")}>
            <div className="lp-area-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </div>
            <div className="lp-area-name">Wills &amp; Estates</div>
            <div className="lp-area-desc">
              Wills, trusts, powers of attorney, and estate planning.
            </div>
          </div>

          <div className="lp-area-tile" onClick={() => go("/free-chat?area=landlord")}>
            <div className="lp-area-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <div className="lp-area-name">Landlord / Tenant</div>
            <div className="lp-area-desc">
              Lease disputes, eviction, security deposits, habitability.
            </div>
          </div>

          <div className="lp-area-tile" onClick={() => go("/free-chat?area=hoa")}>
            <div className="lp-area-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18" />
                <path d="M5 21V7l8-4v18" />
                <path d="M19 21V11l-6-4" />
                <line x1="9" y1="9" x2="9" y2="9.01" />
                <line x1="9" y1="13" x2="9" y2="13.01" />
                <line x1="9" y1="17" x2="9" y2="17.01" />
              </svg>
            </div>
            <div className="lp-area-name">HOA Disputes</div>
            <div className="lp-area-desc">
              Violation notices, fines, records requests, liens, and selective enforcement.
            </div>
          </div>

          <div className="lp-area-tile" onClick={() => go("/free-chat?area=family")}>
            <div className="lp-area-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="lp-area-name">Family Law</div>
            <div className="lp-area-desc">
              Divorce, child custody and support, modifications, and protective orders.
            </div>
          </div>

          <div className="lp-area-tile" onClick={() => go("/free-chat?area=nda")}>
            <div className="lp-area-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div className="lp-area-name">NDAs &amp; Waivers</div>
            <div className="lp-area-desc">
              Non-disclosure agreements, non-competes, liability waivers.
            </div>
          </div>

          <div className="lp-area-tile" onClick={() => go("/free-chat?area=other")}>
            <div className="lp-area-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div className="lp-area-name">Something Else</div>
            <div className="lp-area-desc">
              Not sure where it fits? Start the free chat — we&apos;ll figure it out together.
            </div>
          </div>
        </div>

        <div className="lp-areas-strategy-strip">
          <div className="lp-strategy-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div>
            <div className="lp-strategy-heading">Employment matters are Crawford Law&apos;s core focus.</div>
            <p className="lp-strategy-body">
              <strong>Wrongful termination, harassment, retaliation, and discrimination</strong> are
              the matters Crawford Law handles most — and where Instant Attorney&apos;s intake is
              deepest. Other matter types receive general guidance and, where appropriate, a referral
              to a vetted Texas specialist.{" "}
              <strong>A Phase I chat is always free and always the right place to start.</strong>
            </p>
          </div>
        </div>
      </section>

      {/* DOCUMENT FLOW */}
      <section className="lp-section-flow">
        <h2 className="lp-section-title serif" style={{ color: "var(--brand-text-dk)", marginBottom: "2.5rem" }}>
          From conversation to reviewed document.
        </h2>
        <div className="lp-flow-grid">
          <div className="lp-flow-step">
            <div className="lp-flow-num">1</div>
            <div className="lp-flow-title">You Chat</div>
            <p className="lp-flow-desc">
              The AI gathers your goals, facts, and timeline — patiently, without rushing.
            </p>
          </div>
          <div className="lp-flow-step">
            <div className="lp-flow-num">2</div>
            <div className="lp-flow-title">Case Summary</div>
            <p className="lp-flow-desc">
              A plain-English summary of your situation, key issues, and recommended next actions.
            </p>
          </div>
          <div className="lp-flow-step">
            <div className="lp-flow-num">3</div>
            <div className="lp-flow-title">Draft Generated</div>
            <p className="lp-flow-desc">
              Your document is drafted immediately and available for download.
            </p>
            <div className="lp-watermark-pill">Watermarked · Pre-Review</div>
          </div>
          <div className="lp-flow-step">
            <div className="lp-flow-num">4</div>
            <div className="lp-flow-title">Attorney Reviews</div>
            <p className="lp-flow-desc">
              Crawford Law reviews and approves your draft. Final document delivered within 48 hours.
            </p>
            <div className="lp-reviewed-pill">Attorney Reviewed</div>
          </div>
        </div>
      </section>

      {/* PILLARS */}
      <section className="lp-section-dark">
        <h2 className="lp-dark-title">
          Built on principles that legal work demands.
        </h2>
        <div className="lp-pillars">
          <div className="lp-pillar">
            <div className="lp-pillar-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div className="lp-pillar-title">Privacy First</div>
            <p className="lp-pillar-text">
              Your information is not used to train AI models, and we request zero data retention
              from our AI provider where available. Phase II data is handled as confidential client
              information.
            </p>
          </div>
          <div className="lp-pillar">
            <div className="lp-pillar-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="lp-pillar-title">Privilege Protected</div>
            <p className="lp-pillar-text">
              Phase II conversations are conducted under a signed Crawford Law representation
              agreement and are intended to be protected by attorney-client privilege, subject to
              limits.
            </p>
          </div>
          <div className="lp-pillar">
            <div className="lp-pillar-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div className="lp-pillar-title">Attorney Always in Loop</div>
            <p className="lp-pillar-text">
              No AI-generated draft is delivered to a client without attorney review. This is
              a Texas ethics requirement, not a product choice.
            </p>
          </div>
          <div className="lp-pillar">
            <div className="lp-pillar-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div className="lp-pillar-title">Real Progress</div>
            <p className="lp-pillar-text">
              Your Living File shows what is confirmed, what is missing, and what comes next.
              No progress bars. No scorecards. Just visible work.
            </p>
          </div>
        </div>
      </section>

      {/* PRIVILEGE SECTION */}
      <section className="lp-section-privilege" id="acp-limits">
        <p className="lp-privilege-eyebrow">Attorney-Client Privilege</p>
        <h2 className="lp-privilege-title">
          Your conversations with Crawford Law are{" "}
          <em>intended to be privileged</em> — not just encrypted.
        </h2>
        <p className="lp-privilege-lead">
          Most AI legal tools are public chatbots. What you tell them can be subpoenaed,
          shared, and used against you. Phase II is different.{" "}
          <strong>
            When you sign a Crawford Law representation agreement, your intake conversations
            are conducted within an attorney-client relationship.
          </strong>{" "}
          That means they&apos;re intended to be protected by{" "}
          <em>attorney-client privilege</em> — among the strongest legal protections available —
          subject to important limits like the crime-fraud exception and waiver.
        </p>

        <ul className="lp-privilege-bullets">
          <li>
            <svg className="lp-privilege-bullet-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>
              <strong>Privilege begins when you sign.</strong> The Crawford Law representation
              agreement establishes the attorney-client relationship before any sensitive facts are
              disclosed.
            </span>
          </li>
          <li>
            <svg className="lp-privilege-bullet-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>
              <strong>Not just a privacy policy.</strong> Privilege is a legal right recognized by
              courts that can shield attorney-client communications from disclosure — subject to
              limits such as the crime-fraud exception and waiver by sharing with third parties.
            </span>
          </li>
          <li>
            <svg className="lp-privilege-bullet-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>
              <strong>Phase I has no privilege.</strong> Free general guidance is not protected.
              Do not share confidential or sensitive facts until you have signed an agreement and
              entered Phase II.
            </span>
          </li>
        </ul>

        <div className="lp-privilege-compare">
          <div className="lp-privilege-compare-card">
            <div className="lp-privilege-compare-label">Public AI Chatbot</div>
            <strong>No privilege. No attorney. No protection.</strong> Your conversation is
            data retained by the AI provider, potentially subpoenaed, and never reviewed by a
            licensed attorney.
          </div>
          <div className="lp-privilege-compare-card lp-privilege-compare-card-featured">
            <div className="lp-privilege-compare-label">Instant Attorney · Phase II</div>
            <strong>Intended privilege. Texas-licensed counsel. Attorney review (48-hr target).</strong>{" "}
            Your conversation is conducted within a signed representation agreement and supervised
            by Crawford Law PLLC.
          </div>
        </div>

        <p className="lp-privilege-closer">
          You deserve to speak freely about your legal situation without fear. That&apos;s what
          Phase II is built for.
        </p>

        <div className="lp-privilege-cta">
          <button
            className="lp-btn-privilege-primary"
            onClick={() => go("/register?upgrade=phase2")}
          >
            Start Phase II — $9.99/mo
          </button>
          <button
            className="lp-btn-privilege-ghost"
            onClick={() => go("/free-chat")}
          >
            Start Free First
          </button>
        </div>

        <div className="lp-acp-limits">
          <div className="lp-acp-limits-header">
            <svg className="lp-acp-limits-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <h3 className="lp-acp-limits-title">Privilege Has Limits — Know Them</h3>
          </div>
          <ul className="lp-acp-limits-list">
            <li>
              Privilege does not apply if you use the service to further a crime or fraud (the
              crime-fraud exception).
            </li>
            <li>
              Privilege can be waived if you voluntarily share privileged communications with a
              third party outside the attorney-client relationship.
            </li>
            <li>
              Privilege is not guaranteed in every proceeding — some courts or jurisdictions may
              rule differently on specific facts.
            </li>
            <li>
              Phase I (free chat) is not privileged. Do not share sensitive facts until you have
              signed a Crawford Law agreement.
            </li>
            <li>
              AI-generated drafts are watermarked until reviewed and approved by an attorney. Do
              not file or rely on pre-review drafts.
            </li>
          </ul>
          <p className="lp-acp-limits-foot">
            Crawford Law PLLC is licensed in Texas and Illinois. Representation is subject to a
            signed engagement agreement and applicable rules of professional conduct. Nothing on
            this page constitutes legal advice.
          </p>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="lp-section-cta">
        <h2 className="lp-cta-title">Ready to understand your situation?</h2>
        <p className="lp-cta-sub">
          Start with the free chat. No account required. No commitment. Just clarity.
        </p>
        <button className="lp-btn-cta" onClick={() => go("/free-chat")}>
          Start for Free &rarr;
        </button>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <p className="lp-footer-legal">
          Instant-Attorney is a product of Crawford Law PLLC. Crawford Law PLLC is a Texas law firm
          licensed to practice in Texas and Illinois. Nothing on this website constitutes legal
          advice or creates an attorney-client relationship. Phase I general guidance is not legal
          advice and is not protected by attorney-client privilege. Phase II services require a
          signed representation agreement. AI-generated drafts are watermarked pre-review and must
          not be filed or relied upon without attorney approval. Texas Bar #24148908.
          &nbsp;·&nbsp; www.instant-attorney.com
        </p>
        <div className="lp-footer-logo serif">Instant-Attorney</div>
      </footer>
    </>
  );
}

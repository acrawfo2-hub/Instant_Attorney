"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

/** Count the digits in a phone string (ignores formatting). */
function digitCount(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

const BYPASS_AUTH = process.env.NEXT_PUBLIC_BYPASS_AUTH === "true";

const STEPS = ["Agreement", "AI Consent", "Subscribe"];

const REPRESENTATION_AGREEMENT = `CRAWFORD LAW PLLC — CLIENT REPRESENTATION AGREEMENT (LIMITED SCOPE)
Draft v2.0 — pending attorney review.

This Agreement is between Crawford Law PLLC ("Firm"), a Texas professional limited liability company, Texas Bar #24148908 (responsible attorney: Andrew Crawford, Esq.; licensed in Texas and Illinois), and the person who signs below ("Client"). Typing your name and clicking to sign creates a binding agreement and an electronic signature.

1. SCOPE OF REPRESENTATION (LIMITED)
The Firm represents Client in limited scope through the Instant Attorney platform: (a) AI-assisted intake to gather facts; (b) analysis of legal issues, risks, and pathways; and (c) preparation and attorney review of eligible legal documents. This engagement does NOT include, unless separately agreed in writing and separately priced: court appearances; filing with any court or agency; litigation, hearings, mediation, or arbitration; negotiation with opposing parties; deadline/limitations calendaring; ongoing monitoring; or matters outside Texas and Illinois. Client remains responsible for all deadlines unless the Firm agrees in writing to assume them.

2. WHEN REPRESENTATION BEGINS
Phase I (free) is general information only — NO attorney-client relationship and NO privilege. The attorney-client relationship forms when Client signs this Agreement, the subscription is active, and the Firm completes its conflicts check and accepts the engagement.

3. AI-ASSISTED SERVICES AND ATTORNEY SUPERVISION
The Firm uses AI tools (including models from Anthropic, PBC) under attorney supervision. AI is a tool, not your attorney. A licensed attorney reviews AI-generated documents before delivery as approved. Pre-review drafts are labeled and must not be filed, signed, or relied upon until approved. (See the AI & Privilege consent, incorporated by reference.)

4. FEES AND AUTOMATIC USAGE CHARGES
These are legal fees intended to be reasonable under Tex. Disciplinary R. 1.04. (a) Subscription: $9.99/month, billed in advance, auto-renewing monthly until cancelled. (b) Automatic usage top-ups: when Client's cumulative metered AI usage since the last top-up reaches $4.75, Client authorizes an automatic one-time $8.50 charge to the payment method on file; this may recur whenever the threshold is reached. (c) Spending cap: Client sets a pre-approved monthly cap on automatic top-ups (default $25/month); automatic charging and AI features pause once a top-up would exceed the cap, until Client raises it or the month renews. (d) Declined payments pause AI features until payment succeeds. (e) Cancellation true-up: at cancellation Client authorizes a final charge for metered usage already incurred but not yet charged. Client authorizes the Firm and Stripe to store the payment method and make these charges automatically.

5. CANCELLATION; NO REFUNDS
Client may cancel anytime. Cancellation stops auto-renewal; access continues through the paid period; fees already paid are non-refundable and not prorated (except where required by law); the Section 4(e) true-up applies.

6. FILE RETENTION AND ACCESS
Your interactive app access ends when your subscription ends; this is separate from how long the Firm retains your client file. The Firm retains client matter files for at least five (5) years after the engagement ends, and longer or indefinitely for certain records (e.g., original wills and items of intrinsic value, conflicts records, signed agreements, minors' matters), under its Client File Retention & Destruction Policy. You own your documents: export them during the engagement (you'll be reminded before access ends) and you may request a copy during the retention period. After the retention period, files are securely destroyed only after reasonable notice and a chance to obtain them. This replaces any prior 30-day deletion practice.

7. CONFIDENTIALITY AND PRIVILEGE
The Firm protects Client information under Tex. Disciplinary R. 1.05. Phase II communications to obtain legal services are intended to be privileged, subject to limits including the crime-fraud exception and waiver by third-party disclosure. Privilege is decided by courts and cannot be guaranteed in every proceeding.

8. CLIENT OBLIGATIONS
Provide truthful, complete information; respond promptly; do not rely on pre-approval drafts; use the platform only for lawful purposes and never to commit or further a crime or fraud or plan future unlawful conduct.

9. NO GUARANTEE; CONFLICTS; TERMINATION; GOVERNING LAW
The Firm provides competent, diligent service but guarantees no outcome. The Firm checks conflicts (R. 1.06–1.09) and may decline or withdraw consistent with R. 1.15. Either party may terminate with notice; earned fees and authorized charges survive. This Agreement is governed by Texas law and the Texas Disciplinary Rules of Professional Conduct.

10. BINDING ARBITRATION (PLEASE READ CAREFULLY)
Except as below, you and the Firm agree that any dispute arising out of or relating to this engagement, the Firm's services, fees, or the platform — INCLUDING legal-malpractice and fee disputes — will be resolved by FINAL AND BINDING ARBITRATION on an individual basis, seated in [county], Texas, under the Federal Arbitration Act. This means you GIVE UP your right to a judge or jury trial and most appeal rights, and discovery may be limited. This changes only the FORUM; it does NOT cap, reduce, or waive the Firm's substantive liability (including for malpractice) or any duty under the Texas Disciplinary Rules. Because this affects important rights, you may — and are encouraged to — consult an independent attorney before agreeing. Arbitration does NOT apply to and does NOT waive: your right to file a grievance with the State Bar of Texas; claims that by law cannot be arbitrated; small-claims matters; or requests for emergency/injunctive relief. [Class actions waived; you may opt out in writing within 30 days — pending attorney review.] NOTHING in this Agreement limits or waives any right that cannot be limited or waived by law or the Texas Disciplinary Rules, including any restriction on prospectively limiting the Firm's malpractice liability (R. 1.08(g)).

Crawford Law PLLC · www.instant-attorney.com · Texas Bar #24148908`;

const AI_CONSENT = `CONSENT TO AI-ASSISTED SERVICES & ATTORNEY-CLIENT PRIVILEGE NOTICE
Draft v2.0 — pending attorney review.

By signing, I ("Client") give informed consent to the following and acknowledge the privilege notice below.

PART A — AI-ASSISTED SERVICES
1. AI USE. Crawford Law PLLC uses AI tools, including models from Anthropic, PBC, to assist with intake, analysis, and document drafting. AI is a tool, not my attorney, and does not exercise legal judgment.
2. ATTORNEY REVIEW. A licensed attorney supervises AI use and reviews AI-generated documents before delivery as approved. Pre-review drafts must not be filed, signed, or relied upon. These practices are intended to comply with the Texas Disciplinary Rules and Texas Ethics Opinion 705.
3. AI LIMITATIONS. AI can produce incomplete, outdated, or incorrect output (including "hallucinations"). Attorney review is the safeguard, but no process is perfect; I will raise concerns before acting on a document.
4. CONFIDENTIALITY & DATA. The Firm treats my Phase II information as confidential under Tex. Disciplinary R. 1.05, uses a single AI provider (Anthropic, PBC), does NOT permit my content to be used to train AI models, and is enabling zero-data-retention processing before public launch so prompt/output content is not retained by the AI provider. (See Privacy Policy.)
5. THIRD-PARTY PROVIDERS. I consent to processing by the Firm's service providers acting as its agents under confidentiality and data-protection obligations: AI inference (Anthropic), cloud hosting/storage (Supabase), payments (Stripe), and transactional email (Resend).
6. BILLING. I acknowledge AI usage has a cost, charged via the subscription and automatic usage top-ups described in my Representation Agreement.
7. REVOCATION. I may revoke this consent in writing at any time. Because AI assistance is integral to the service, revocation generally ends the Firm's ability to provide platform services and may end the engagement. Revocation does not affect prior lawful processing or charges already incurred.

PART B — ATTORNEY-CLIENT PRIVILEGE (READ CAREFULLY)
8. Phase I (free) communications are NOT privileged — do not share sensitive facts there. Phase II communications made to obtain legal services, after I sign and while subscribed, are intended to be privileged.
9. LIMITS. Privilege may not apply or may be lost: (a) crime-fraud — communications to commit/further a crime or fraud, or to plan future unlawful conduct, are not privileged; (b) third-party disclosure may waive privilege; (c) my own public use may waive it; (d) privilege is applied by courts and cannot be guaranteed in any particular proceeding.
10. VENDORS. The Firm's use of agents (AI, cloud) under confidentiality obligations is not intended to waive privilege, subject to the limits above.

These practices rely in good faith on Tex. Disciplinary R. 1.05 and Texas Ethics Opinion 705.`;

type Step = 0 | 1 | 2;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [signatureName, setSignatureName] = useState("");
  const [phone, setPhone] = useState("");
  const [repAgreed, setRepAgreed] = useState(false);
  const [aiAgreed, setAiAgreed] = useState(false);
  const [billingAck, setBillingAck] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Pre-fill name/phone from the profile so returning users don't retype.
  useEffect(() => {
    let active = true;
    fetch("/api/account/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        if (data.full_name) setSignatureName((v) => v || data.full_name);
        if (data.phone) setPhone((v) => v || data.phone);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const phoneValid = digitCount(phone) >= 10 && digitCount(phone) <= 15;

  async function signAgreement(type: "representation" | "ai_consent") {
    const res = await fetch("/api/agreements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signatureName, agreementType: type }),
    });
    if (!res.ok) throw new Error("Failed to save agreement");
  }

  async function handleRepNext() {
    if (!repAgreed || !signatureName.trim() || !phoneValid) return;
    setLoading(true);
    setError("");
    try {
      // Capture contact info (name + phone) before representation begins.
      const profRes = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: signatureName.trim(), phone: phone.trim() }),
      });
      if (!profRes.ok) {
        const b = await profRes.json().catch(() => ({}));
        throw new Error(b.error ?? "save_failed");
      }
      await signAgreement("representation");
      setStep(1);
    } catch (e) {
      setError(
        e instanceof Error && e.message && e.message !== "save_failed"
          ? e.message
          : "Failed to save your information. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAiNext() {
    if (!aiAgreed) return;
    setLoading(true);
    setError("");
    try {
      await signAgreement("ai_consent");
      setStep(2);
    } catch {
      setError("Failed to save your consent. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubscribe(plan: "phase2" | "consult") {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/subscriptions/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const { url, error: apiErr } = await res.json();
      if (apiErr) throw new Error(apiErr);
      router.push(url);
    } catch {
      setError("Failed to start checkout. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="ob-shell">
      {/* Header */}
      <div className="ob-header">
        <div className="ob-header-logo">
          <div className="auth-logo-icon" style={{ width: 24, height: 24 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <span>Instant-Attorney</span>
        </div>
        {BYPASS_AUTH && (
          <span className="ob-bypass-badge">Test Mode · Bypass Active</span>
        )}
      </div>

      {/* Step progress */}
      <div className="ob-progress">
        {STEPS.map((label, i) => (
          <div key={i} className={`ob-step ${i === step ? "ob-step-active" : i < step ? "ob-step-done" : ""}`}>
            <div className="ob-step-dot">
              {i < step ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <span>{i + 1}</span>
              )}
            </div>
            <span className="ob-step-label">{label}</span>
            {i < STEPS.length - 1 && <div className="ob-step-line" />}
          </div>
        ))}
      </div>

      <div className="ob-content">
        {/* STEP 0: Representation Agreement */}
        {step === 0 && (
          <div className="ob-card">
            <h2 className="ob-card-title">Representation Agreement</h2>
            <p className="ob-card-sub">
              Read and sign the Crawford Law PLLC representation agreement to establish the attorney-client relationship. This is what makes Phase II conversations privileged.
            </p>
            <div className="ob-agreement-text">{REPRESENTATION_AGREEMENT}</div>

            <div className="ob-field">
              <label className="auth-label" htmlFor="sig">
                Type your full legal name as your electronic signature
              </label>
              <input
                id="sig"
                type="text"
                className="auth-input"
                placeholder="Jane Smith"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
              />
            </div>

            <div className="ob-field">
              <label className="auth-label" htmlFor="phone">
                Phone number
              </label>
              <input
                id="phone"
                type="tel"
                className="auth-input"
                placeholder="(555) 123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
              />
              <p className="ob-field-hint">
                The firm uses this to coordinate your consult and to secure your account.
                {phone.trim() && !phoneValid && (
                  <span className="ob-field-error"> Please enter a valid phone number.</span>
                )}
              </p>
            </div>

            <label className="ob-checkbox-label">
              <input
                type="checkbox"
                className="ob-checkbox"
                checked={repAgreed}
                onChange={(e) => setRepAgreed(e.target.checked)}
              />
              I have read and agree to the Crawford Law PLLC Representation Agreement
            </label>

            {error && <p className="auth-error">{error}</p>}

            <button
              className="auth-btn"
              onClick={handleRepNext}
              disabled={!repAgreed || !signatureName.trim() || !phoneValid || loading}
            >
              {loading ? "Saving…" : "I Agree — Continue →"}
            </button>
          </div>
        )}

        {/* STEP 1: AI Consent */}
        {step === 1 && (
          <div className="ob-card">
            <h2 className="ob-card-title">AI &amp; Third-Party Consent</h2>
            <p className="ob-card-sub">
              Crawford Law uses AI to assist with intake, document drafting, and analysis. An attorney reviews all AI outputs before delivery. Your consent is required before we begin.
            </p>
            <div className="ob-agreement-text">{AI_CONSENT}</div>

            <label className="ob-checkbox-label">
              <input
                type="checkbox"
                className="ob-checkbox"
                checked={aiAgreed}
                onChange={(e) => setAiAgreed(e.target.checked)}
              />
              I have read and consent to AI-assisted services and third-party processing as described above
            </label>

            {error && <p className="auth-error">{error}</p>}

            <button
              className="auth-btn"
              onClick={handleAiNext}
              disabled={!aiAgreed || loading}
            >
              {loading ? "Saving…" : "I Consent — Continue →"}
            </button>
          </div>
        )}

        {/* STEP 2: Subscribe */}
        {step === 2 && (
          <div className="ob-card">
            <h2 className="ob-card-title">Choose your plan</h2>
            <p className="ob-card-sub">
              Your agreement is signed. Choose how you&apos;d like to proceed.
            </p>

            {error && <p className="auth-error">{error}</p>}

            <div className="ob-plans">
              <div className="ob-plan ob-plan-featured">
                <div className="ob-plan-badge">Most Popular</div>
                <div className="ob-plan-name">Phase II — Subscriber</div>
                <div className="ob-plan-price">$9.99<span>/mo</span></div>
                <ul className="ob-plan-features">
                  <li>ACP-protected intake chat</li>
                  <li>Living File — goals, facts, gaps</li>
                  <li>Document drafts (watermarked immediately)</li>
                  <li>Attorney review targeted within 48 hours</li>
                </ul>

                {/* Clear-and-conspicuous pre-purchase billing disclosure */}
                <div className="ob-billing-disclosure" style={{
                  fontSize: 12.5, lineHeight: 1.5, textAlign: "left",
                  background: "#f8fafc", border: "1px solid #e2e8f0",
                  borderRadius: 8, padding: "10px 12px", margin: "12px 0",
                }}>
                  <strong>Before you subscribe — please review:</strong>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    <li><strong>$9.99/month</strong>, charged today and <strong>auto-renewing monthly</strong> until you cancel.</li>
                    <li><strong>Automatic usage top-ups:</strong> when your AI usage since the last top-up reaches <strong>$4.75</strong>, an <strong>$8.50</strong> charge is made automatically. It can recur as you use the service.</li>
                    <li><strong>You set a monthly cap</strong> on top-ups (default <strong>$25</strong>); charging pauses once it would exceed your cap.</li>
                    <li><strong>No refunds and no proration.</strong> Cancel anytime in Account → Billing; access continues through the paid period.</li>
                    <li><strong>Cancellation true-up:</strong> a final charge may apply for usage already incurred.</li>
                    <li><strong>Data:</strong> after cancellation your app access ends, but the Firm retains your file under its retention policy (generally 5+ years) — export anything you want, and you can request a copy later.</li>
                    <li><strong>Disputes:</strong> your agreement includes a <strong>binding arbitration</strong> provision (you waive court/jury trial; it does not limit the Firm&apos;s malpractice liability or your right to file a State Bar grievance).</li>
                  </ul>
                </div>

                <label className="ob-checkbox-label" style={{ fontSize: 12.5, textAlign: "left" }}>
                  <input
                    type="checkbox"
                    className="ob-checkbox"
                    checked={billingAck}
                    onChange={(e) => setBillingAck(e.target.checked)}
                  />
                  I authorize the recurring $9.99/month charge and automatic $8.50 usage top-ups up to my monthly cap, and I agree to the no-refund, cancellation, file-retention, and binding-arbitration terms above.
                </label>

                <button
                  className="auth-btn"
                  onClick={() => handleSubscribe("phase2")}
                  disabled={loading || (!BYPASS_AUTH && !billingAck)}
                >
                  {loading ? "Loading…" : BYPASS_AUTH ? "Activate Test Subscription →" : "Subscribe · $9.99/mo →"}
                </button>
              </div>

              <div className="ob-plan">
                <div className="ob-plan-name">Phase III — Consult</div>
                <div className="ob-plan-price">$49.99<span>/ session</span></div>
                <ul className="ob-plan-features">
                  <li>Live strategy session with Andrew Crawford, Esq.</li>
                  <li>Clear next steps or referral</li>
                  <li>All Phase II analysis carries forward</li>
                  <li>No ongoing subscription required</li>
                </ul>
                <button
                  className="auth-btn ob-btn-secondary"
                  onClick={() => handleSubscribe("consult")}
                  disabled={loading}
                >
                  {loading ? "Loading…" : BYPASS_AUTH ? "Book Test Consult →" : "Book Consult · $49.99 →"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

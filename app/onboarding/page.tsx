"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const BYPASS_AUTH = process.env.NEXT_PUBLIC_BYPASS_AUTH === "true";

const STEPS = ["Agreement", "AI Consent", "Subscribe"];

const REPRESENTATION_AGREEMENT = `CRAWFORD LAW PLLC — CLIENT REPRESENTATION AGREEMENT

This Agreement is entered into between Crawford Law PLLC ("Firm"), a Texas professional limited liability company, Texas Bar #24148908, and the person who signs below ("Client").

1. SCOPE OF REPRESENTATION
The Firm agrees to represent Client in connection with the legal matter(s) disclosed through the Instant Attorney platform. The scope of representation will be defined based on the facts gathered during intake. The Firm may limit representation to advice, document review, or drafting, or may extend to full litigation representation depending on the matter.

2. AI-ASSISTED INTAKE
Client acknowledges that intake conversations on the Instant Attorney platform are conducted with AI assistance and that such conversations, once Client has signed this Agreement, are undertaken within the attorney-client relationship and subject to attorney-client privilege. The Firm's attorney(s) review all AI-generated documents before delivery.

3. ATTORNEY-CLIENT PRIVILEGE
Communications made by Client to the Firm in connection with seeking legal advice are protected by attorney-client privilege, subject to exceptions including the crime-fraud exception and voluntary disclosure to third parties. Phase I (free) conversations are not privileged.

4. FEES AND BILLING
Subscriber fees are as described on the Instant Attorney platform at the time of enrollment. The Firm reserves the right to adjust fees with notice. Fees for services beyond the subscription (e.g., court appearances, extended litigation) will be separately negotiated.

5. CLIENT OBLIGATIONS
Client agrees to provide truthful and complete information, to communicate promptly, and to cooperate with the Firm's requests. Client agrees to use this platform only for lawful purposes.

6. TERMINATION
Either party may terminate this Agreement with written notice. The Firm may withdraw consistent with applicable Rules of Professional Conduct.

7. GOVERNING LAW
This Agreement is governed by the laws of the State of Texas and the Texas Disciplinary Rules of Professional Conduct.

Crawford Law PLLC · www.instant-attorney.com · Texas Bar #24148908`;

const AI_CONSENT = `CONSENT TO AI-ASSISTED SERVICES AND THIRD-PARTY PROCESSING

By signing below, I ("Client") acknowledge and consent to the following:

1. AI-ASSISTED SERVICES
I understand that Crawford Law PLLC uses AI technology, including models provided by Anthropic, PBC, to assist with legal intake, document drafting, and case analysis. All AI outputs are reviewed by a licensed attorney before delivery to me.

2. THIRD-PARTY SERVICE PROVIDERS
I consent to the processing of my information by the following categories of service providers: AI model providers (for inference), cloud infrastructure providers (for hosting and storage), and payment processors. These providers are bound by data processing agreements.

3. DATA RETENTION AND PRIVACY
I understand that Phase II intake conversations are stored securely and associated with my case file. API calls to AI providers are configured for zero data retention where available. My data is never used to train AI models.

4. NO TRAINING DATA
Crawford Law PLLC and its AI service providers will not use my communications to train AI models under any circumstances.

5. REVOCATION
I may revoke this consent at any time by contacting Crawford Law PLLC in writing. Revocation will not affect the lawfulness of processing prior to revocation.

6. TEXAS ETHICS COMPLIANCE
These practices are maintained in compliance with Texas Disciplinary Rule 1.05 (Confidentiality) and Texas Ethics Opinion 705 (AI in legal practice).`;

type Step = 0 | 1 | 2;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [signatureName, setSignatureName] = useState("");
  const [repAgreed, setRepAgreed] = useState(false);
  const [aiAgreed, setAiAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function signAgreement(type: "representation" | "ai_consent") {
    const res = await fetch("/api/agreements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signatureName, agreementType: type }),
    });
    if (!res.ok) throw new Error("Failed to save agreement");
  }

  async function handleRepNext() {
    if (!repAgreed || !signatureName.trim()) return;
    setLoading(true);
    setError("");
    try {
      await signAgreement("representation");
      setStep(1);
    } catch {
      setError("Failed to save your agreement. Please try again.");
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
              disabled={!repAgreed || !signatureName.trim() || loading}
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
                  <li>Attorney review within 48 hours</li>
                </ul>
                <button
                  className="auth-btn"
                  onClick={() => handleSubscribe("phase2")}
                  disabled={loading}
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

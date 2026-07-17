"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { REPRESENTATION_AGREEMENT_TEXT, AI_CONSENT_TEXT } from "@/lib/agreement-sign";

/** Count the digits in a phone string (ignores formatting). */
function digitCount(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

const BYPASS_AUTH = process.env.NEXT_PUBLIC_BYPASS_AUTH === "true";

const STEPS = ["Agreement", "AI Consent", "Subscribe"];

const REPRESENTATION_AGREEMENT = REPRESENTATION_AGREEMENT_TEXT;

const AI_CONSENT = AI_CONSENT_TEXT;

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

            <p className="ob-philosophy-link">
              <a href="/legal/ai-philosophy" target="_blank" rel="noopener noreferrer">
                Read our full AI philosophy statement →
              </a>
            </p>

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
                  <p className="ob-legal-links">
                    Full disclosures:{" "}
                    <a href="/legal/billing" target="_blank" rel="noopener noreferrer">Billing &amp; Refunds</a>
                    {" · "}
                    <a href="/legal/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
                    {" · "}
                    <a href="/legal/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
                    {" · "}
                    <a href="/legal/disclaimers" target="_blank" rel="noopener noreferrer">Legal Disclaimers</a>
                  </p>
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

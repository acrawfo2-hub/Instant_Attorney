"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

/** Count the digits in a phone string (ignores formatting). */
function digitCount(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

const BYPASS_AUTH = process.env.NEXT_PUBLIC_BYPASS_AUTH === "true";

const STEPS = ["Subscriber Terms", "AI Tool Consent", "Subscribe"];

// PLACEHOLDER TEXT — NOT REVIEWED BY ANDREW CRAWFORD OR ANY ATTORNEY.
// This is scaffolding only: it must be replaced with attorney-authored
// subscriber terms before this onboarding path is ever enabled for real
// signups. Unlike the client representation agreement, this intentionally
// establishes NO attorney-client relationship and NO privilege — an
// attorney-user is a software customer, not a client of Crawford Law PLLC.
const ATTORNEY_SUBSCRIBER_TERMS = `INSTANT ATTORNEY FOR ATTORNEYS — SUBSCRIBER TERMS OF SERVICE
DRAFT — PLACEHOLDER TEXT, NOT YET REVIEWED OR APPROVED BY AN ATTORNEY. DO NOT RELY ON THIS LANGUAGE.

This placeholder exists only so the onboarding flow can be built and tested. Before any real
attorney-user is onboarded, this text must be replaced with terms drafted and approved by
Andrew Crawford, Esq. covering AT MINIMUM:

1. NO ATTORNEY-CLIENT RELATIONSHIP. Using Instant Attorney as a subscriber under this plan does
   NOT create an attorney-client relationship between the Subscriber and Crawford Law PLLC, and
   does NOT create any relationship between Crawford Law PLLC and the Subscriber's own clients.
   Crawford Law PLLC does not represent, advise, or owe any duty to the Subscriber's clients.

2. NO PRIVILEGE. Communications with this platform are NOT protected by attorney-client privilege
   running to Crawford Law PLLC. Any privilege that exists between the Subscriber and their own
   client is the Subscriber's responsibility to establish and preserve independently.

3. TOOL, NOT COUNSEL. This is a software drafting tool. The Subscriber, as a licensed attorney,
   is solely responsible for reviewing, verifying, and taking professional responsibility for
   every document produced before using it in their own practice. AI-generated drafts may contain
   errors, omissions, or outdated law and must never be filed, signed, served, or relied upon
   without independent attorney review.

4. LICENSURE. The Subscriber represents that they are a licensed, practicing attorney in good
   standing and that use of this tool complies with the rules of professional conduct in every
   jurisdiction where they practice.

5. FEES, CANCELLATION, DATA HANDLING, ARBITRATION. [Placeholder — to be drafted alongside
   pricing.]

Instant Attorney is a service made available by Crawford Law PLLC. This draft is not a
representation agreement and creates no attorney-client relationship of any kind.`;

const ATTORNEY_AI_CONSENT = `CONSENT TO AI-ASSISTED TOOL USE (ATTORNEY SUBSCRIBERS)
DRAFT — PLACEHOLDER TEXT, NOT YET REVIEWED OR APPROVED BY AN ATTORNEY. DO NOT RELY ON THIS LANGUAGE.

By signing, I acknowledge:

1. I understand Instant Attorney uses AI (including models from Anthropic, PBC) to help draft and
   revise documents, and that AI is a tool — not a substitute for my own professional judgment.
2. I am solely responsible for reviewing every AI-generated draft before using it with my own
   clients, exactly as I would review a draft prepared by a junior associate or template.
3. AI can produce incomplete, outdated, or incorrect output. I will not file, sign, serve, or
   advise a client to rely on any draft without my own independent review.
4. I consent to processing by the platform's service providers (AI inference, cloud hosting,
   payments) under their standard confidentiality terms, described in the Privacy Policy.
5. This consent does not establish, and should not be read to imply, any attorney-client
   relationship or privilege between me and Crawford Law PLLC.`;

type Step = 0 | 1 | 2;
type ApprovalStatus = "pending" | "approved" | "rejected" | null;

export default function AttorneyOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [signatureName, setSignatureName] = useState("");
  const [phone, setPhone] = useState("");
  const [barNumber, setBarNumber] = useState("");
  const [firmName, setFirmName] = useState("");
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [aiAgreed, setAiAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);

  // Pre-fill from the profile, and check the manual-approval status so an
  // attorney returning after applying lands on the right screen.
  useEffect(() => {
    let active = true;
    fetch("/api/account/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        if (data.full_name) setSignatureName((v) => v || data.full_name);
        if (data.phone) setPhone((v) => v || data.phone);
        if (data.bar_number) setBarNumber((v) => v || data.bar_number);
        if (data.firm_name) setFirmName((v) => v || data.firm_name);
        setApprovalStatus(data.attorney_user_status ?? "pending");
      })
      .catch(() => {})
      .finally(() => {
        if (active) setCheckingStatus(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const phoneValid = digitCount(phone) >= 10 && digitCount(phone) <= 15;

  async function signAgreement(agreementType: "attorney_subscriber_terms" | "ai_consent", version: string) {
    const res = await fetch("/api/agreements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signatureName, agreementType, version }),
    });
    if (!res.ok) throw new Error("Failed to save agreement");
  }

  async function handleTermsNext() {
    if (!termsAgreed || !signatureName.trim() || !phoneValid || !barNumber.trim()) return;
    setLoading(true);
    setError("");
    try {
      const profRes = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: signatureName.trim(),
          phone: phone.trim(),
          bar_number: barNumber.trim(),
          firm_name: firmName.trim(),
        }),
      });
      if (!profRes.ok) {
        const b = await profRes.json().catch(() => ({}));
        throw new Error(b.error ?? "save_failed");
      }
      await signAgreement("attorney_subscriber_terms", "1.0-draft");
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
      await signAgreement("ai_consent", "attorney-1.0-draft");
      setStep(2);
    } catch {
      setError("Failed to save your consent. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubscribe() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/subscriptions/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "attorney_pro" }),
      });
      const { url, error: apiErr } = await res.json();
      if (apiErr) throw new Error(apiErr);
      router.push(url);
    } catch {
      setError("Failed to start checkout. Please try again, or contact us if your application is still pending.");
      setLoading(false);
    }
  }

  return (
    <div className="ob-shell">
      <div className="ob-header">
        <div className="ob-header-logo">
          <div className="auth-logo-icon" style={{ width: 24, height: 24 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <span>Instant-Attorney · For Attorneys</span>
        </div>
        {BYPASS_AUTH && (
          <span className="ob-bypass-badge">Test Mode · Bypass Active</span>
        )}
      </div>

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
        {/* STEP 0: Subscriber Terms */}
        {step === 0 && (
          <div className="ob-card">
            <h2 className="ob-card-title">Subscriber Terms of Service</h2>
            <p className="ob-card-sub">
              This is a professional drafting tool, not a Crawford Law engagement — no
              attorney-client relationship or privilege forms between you and Crawford Law PLLC.
            </p>
            <div className="ob-agreement-text">{ATTORNEY_SUBSCRIBER_TERMS}</div>

            <div className="ob-field">
              <label className="auth-label" htmlFor="sig">
                Type your full legal name as your electronic signature
              </label>
              <input
                id="sig" type="text" className="auth-input" placeholder="Jane Smith, Esq."
                value={signatureName} onChange={(e) => setSignatureName(e.target.value)}
              />
            </div>

            <div className="ob-field">
              <label className="auth-label" htmlFor="firm">Firm name</label>
              <input
                id="firm" type="text" className="auth-input" placeholder="Smith Law Group"
                value={firmName} onChange={(e) => setFirmName(e.target.value)}
              />
            </div>

            <div className="ob-field">
              <label className="auth-label" htmlFor="bar">Bar number</label>
              <input
                id="bar" type="text" className="auth-input" placeholder="State bar number"
                value={barNumber} onChange={(e) => setBarNumber(e.target.value)}
              />
              <p className="ob-field-hint">Used to verify your license before your account is approved.</p>
            </div>

            <div className="ob-field">
              <label className="auth-label" htmlFor="phone">Phone number</label>
              <input
                id="phone" type="tel" className="auth-input" placeholder="(555) 123-4567"
                value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel"
              />
              <p className="ob-field-hint">
                {phone.trim() && !phoneValid && (
                  <span className="ob-field-error">Please enter a valid phone number.</span>
                )}
              </p>
            </div>

            <label className="ob-checkbox-label">
              <input
                type="checkbox" className="ob-checkbox"
                checked={termsAgreed} onChange={(e) => setTermsAgreed(e.target.checked)}
              />
              I have read and agree to the Subscriber Terms of Service above
            </label>

            {error && <p className="auth-error">{error}</p>}

            <button
              className="auth-btn"
              onClick={handleTermsNext}
              disabled={!termsAgreed || !signatureName.trim() || !phoneValid || !barNumber.trim() || loading}
            >
              {loading ? "Saving…" : "I Agree — Continue →"}
            </button>
          </div>
        )}

        {/* STEP 1: AI Tool Consent */}
        {step === 1 && (
          <div className="ob-card">
            <h2 className="ob-card-title">AI Tool Consent</h2>
            <p className="ob-card-sub">
              You&apos;re responsible for reviewing every draft before using it with your own clients.
            </p>
            <div className="ob-agreement-text">{ATTORNEY_AI_CONSENT}</div>

            <label className="ob-checkbox-label">
              <input
                type="checkbox" className="ob-checkbox"
                checked={aiAgreed} onChange={(e) => setAiAgreed(e.target.checked)}
              />
              I have read and consent to AI-assisted tool use as described above
            </label>

            {error && <p className="auth-error">{error}</p>}

            <button className="auth-btn" onClick={handleAiNext} disabled={!aiAgreed || loading}>
              {loading ? "Saving…" : "I Consent — Continue →"}
            </button>
          </div>
        )}

        {/* STEP 2: Subscribe — or a pending-approval holding screen */}
        {step === 2 && (
          <div className="ob-card">
            {checkingStatus ? (
              <p className="ob-card-sub">Checking your application status…</p>
            ) : approvalStatus === "approved" ? (
              <>
                <h2 className="ob-card-title">Subscribe</h2>
                <p className="ob-card-sub">
                  You&apos;re approved. Continue to secure checkout to activate your account —
                  pricing is shown on the next screen.
                </p>
                {error && <p className="auth-error">{error}</p>}
                <button className="auth-btn" onClick={handleSubscribe} disabled={loading}>
                  {loading ? "Loading…" : BYPASS_AUTH ? "Activate Test Subscription →" : "Continue to Checkout →"}
                </button>
              </>
            ) : approvalStatus === "rejected" ? (
              <>
                <h2 className="ob-card-title">Application not approved</h2>
                <p className="ob-card-sub">
                  We weren&apos;t able to approve your attorney account. If you believe this is an
                  error, please contact us.
                </p>
              </>
            ) : (
              <>
                <h2 className="ob-card-title">Application under review</h2>
                <p className="ob-card-sub">
                  Thanks for signing up. New attorney accounts are manually reviewed before
                  access unlocks — we verify your bar number and firm before approving. We&apos;ll
                  email you once you&apos;re approved, and you can return to this page anytime to
                  check your status or complete checkout.
                </p>
                <button className="auth-btn ob-btn-secondary" onClick={() => router.push("/dashboard")}>
                  Return home →
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

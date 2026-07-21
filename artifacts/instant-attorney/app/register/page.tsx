"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAttorneySignup = searchParams.get("as") === "attorney";
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const nextPath = isAttorneySignup ? "/onboarding/attorney" : "/onboarding";
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          ...(isAttorneySignup ? { account_type: "attorney_user" } : {}),
        },
        emailRedirectTo: `${location.origin}/api/auth/callback?next=${nextPath}`,
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setDone(true);
    setLoading(false);
  }

  if (done) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-confirm-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h1 className="auth-heading">Check your email</h1>
          <p className="auth-sub" style={{ maxWidth: "320px", margin: "0 auto 1.5rem" }}>
            We sent a confirmation link to <strong>{email}</strong>. Click it to verify your account and begin onboarding.
          </p>
          <button className="auth-btn" onClick={() => router.push("/login")}>
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <span>Instant-Attorney</span>
        </div>

        <h1 className="auth-heading">
          {isAttorneySignup ? "Create your attorney account" : "Create your account"}
        </h1>
        <p className="auth-sub">
          {isAttorneySignup
            ? "You'll complete a subscriber agreement next. New attorney accounts are manually reviewed before access unlocks."
            : "You'll complete your representation agreement and payment next."}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label" htmlFor="fullName">Full Name</label>
            <input
              id="fullName"
              type="text"
              className="auth-input"
              placeholder="Jane Smith"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="auth-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="password">
              Password <span className="auth-label-hint">(min 8 characters)</span>
            </label>
            <input
              id="password"
              type="password"
              className="auth-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? "Creating account…" : "Create Account →"}
          </button>
        </form>

        <p className="auth-footer-link">
          Already have an account?{" "}
          <button className="auth-text-link" onClick={() => router.push("/login")}>
            Sign in
          </button>
        </p>

        <p className="auth-footer-link">
          {isAttorneySignup ? (
            <button className="auth-text-link" onClick={() => router.push("/register")}>
              Not an attorney? Sign up as a client
            </button>
          ) : (
            <button className="auth-text-link" onClick={() => router.push("/register?as=attorney")}>
              Are you an attorney? Use Instant Attorney as a drafting tool →
            </button>
          )}
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="auth-shell">
        <div className="auth-card" style={{ textAlign: "center", color: "#64748b" }}>
          Loading…
        </div>
      </div>
    }>
      <RegisterForm />
    </Suspense>
  );
}

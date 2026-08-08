"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const isAttorneyLogin = params.get("as") === "attorney";
  // An explicit ?redirect= (set by middleware.ts when bouncing an
  // unauthenticated user away from a specific protected page) always wins —
  // that deep-link intent must survive login. Only a PLAIN /login (no param)
  // falls back to the server's role-computed destination below.
  const explicitRedirect = params.get("redirect");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Set when the server reports the account exists but was never confirmed —
  // the one failure a user can fix themselves without leaving this page.
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [resendNotice, setResendNotice] = useState("");
  const [resending, setResending] = useState(false);

  async function handleResend() {
    setResending(true);
    setResendNotice("");
    try {
      const res = await fetch("/api/auth/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setResendNotice(data.message ?? "Check your inbox.");
      if (data.confirmed) {
        setError("");
        setNeedsConfirmation(false);
      }
    } catch {
      setResendNotice("Could not send right now — try again in a moment.");
    }
    setResending(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setResendNotice("");
    setNeedsConfirmation(false);
    setLoading(true);

    let redirectTo = explicitRedirect ?? "/dashboard";
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Sign in failed");
        setNeedsConfirmation(!!data.needsConfirmation);
        setLoading(false);
        return;
      }
      if (!explicitRedirect && data.redirectTo) {
        redirectTo = data.redirectTo;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError("Network error: " + msg);
      setLoading(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
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

        <h1 className="auth-heading">Sign in to your account</h1>
        <p className="auth-sub">
          {isAttorneyLogin
            ? "Subscriber login · Drafting tool for licensed attorneys"
            : "Private case workspace · Attorney-client privileged"}
        </p>

        {params.get("error") && (
          <div className="auth-error">Authentication failed. Please try again.</div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
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
            <label className="auth-label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="auth-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          {needsConfirmation && (
            <button
              type="button"
              className="auth-text-link"
              onClick={handleResend}
              disabled={resending || !email}
            >
              {resending ? "Sending…" : "Resend the confirmation email"}
            </button>
          )}

          {resendNotice && <p className="auth-sub" style={{ margin: 0 }}>{resendNotice}</p>}

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="auth-footer-link">
          <button className="auth-text-link" onClick={() => router.push("/forgot-password")}>
            Forgot your password?
          </button>
        </p>

        <p className="auth-footer-link" style={{ marginTop: "0.5rem" }}>
          Don&apos;t have an account?{" "}
          <button className="auth-text-link" onClick={() => router.push(isAttorneyLogin ? "/register?as=attorney" : "/register")}>
            Create one &rarr;
          </button>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="auth-shell" />}>
      <LoginForm />
    </Suspense>
  );
}

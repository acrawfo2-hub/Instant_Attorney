"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not send the reset link.");
      } else {
        setSent(data.message);
      }
    } catch (e: unknown) {
      setError("Network error: " + (e instanceof Error ? e.message : String(e)));
    }
    setLoading(false);
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

        <h1 className="auth-heading">Reset your password</h1>
        <p className="auth-sub">
          Enter the email you signed up with and we&apos;ll send you a link to choose a new password.
        </p>

        {sent ? (
          <>
            <p className="auth-sub" style={{ marginBottom: "1.5rem" }}>{sent}</p>
            <button className="auth-btn" onClick={() => router.push("/login")}>
              Back to Sign In
            </button>
          </>
        ) : (
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

            {error && <p className="auth-error">{error}</p>}

            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <p className="auth-footer-link">
          Remembered it?{" "}
          <button className="auth-text-link" onClick={() => router.push("/login")}>
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}

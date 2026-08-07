"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Landing page for a Supabase recovery link. /api/auth/callback has already
 * exchanged the code for a session by the time we get here, so the user is
 * authenticated and can call updateUser directly.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!active) return;
        setHasSession(!!data.user);
        setChecking(false);
      })
      .catch(() => {
        if (!active) return;
        setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }
    setDone(true);
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

        {checking ? (
          <p className="auth-sub">Checking your reset link…</p>
        ) : done ? (
          <>
            <h1 className="auth-heading">Password updated</h1>
            <p className="auth-sub">You&apos;re signed in with your new password.</p>
            <button className="auth-btn" onClick={() => router.push("/dashboard")}>
              Continue →
            </button>
          </>
        ) : !hasSession ? (
          <>
            <h1 className="auth-heading">This link has expired</h1>
            <p className="auth-sub">
              Password reset links are single-use and time-limited. Request a fresh one.
            </p>
            <button className="auth-btn" onClick={() => router.push("/forgot-password")}>
              Send a new link
            </button>
          </>
        ) : (
          <>
            <h1 className="auth-heading">Choose a new password</h1>
            <p className="auth-sub">Pick something you haven&apos;t used here before.</p>

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-field">
                <label className="auth-label" htmlFor="password">
                  New password <span className="auth-label-hint">(min 8 characters)</span>
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

              <div className="auth-field">
                <label className="auth-label" htmlFor="confirm">Confirm new password</label>
                <input
                  id="confirm"
                  type="password"
                  className="auth-input"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>

              {error && <p className="auth-error">{error}</p>}

              <button type="submit" className="auth-btn" disabled={loading}>
                {loading ? "Saving…" : "Update password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

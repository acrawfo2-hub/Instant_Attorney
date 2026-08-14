"use client";

import { useState, type FormEvent } from "react";

export default function SupportTicketForm({
  initialEmail = "",
}: {
  initialEmail?: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [category, setCategory] = useState("login");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    const form = event.currentTarget as HTMLFormElement;
    const website = new FormData(form).get("website");
    try {
      const response = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          category,
          subject,
          description,
          pagePath: window.location.pathname,
          website,
        }),
      });
      const body = await response.json();
      if (!response.ok) setError(body.error ?? "Could not send your request.");
      else {
        setSuccess(body.message);
        setSubject("");
        setDescription("");
      }
    } catch {
      setError("Could not reach support. Check your connection and try again.");
    }
    setLoading(false);
  }

  return (
    <form className="support-form" onSubmit={submit}>
      <input
        name="website"
        className="support-honeypot"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
      <div className="support-form-grid">
        <label className="auth-label">
          Account email
          <input
            className="auth-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="auth-label">
          What do you need help with?
          <select
            className="auth-input"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="login">Cannot sign in</option>
            <option value="password">Password or reset link</option>
            <option value="account_access">
              Account access or subscription
            </option>
            <option value="billing">Billing</option>
            <option value="technical">Something is not working</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <label className="auth-label">
        Short subject
        <input
          className="auth-input"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          minLength={5}
          maxLength={120}
          required
          placeholder="For example: Reset link keeps returning to sign in"
        />
      </label>
      <label className="auth-label">
        What happened?
        <textarea
          className="auth-input support-textarea"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          minLength={20}
          maxLength={4000}
          required
          placeholder="Tell us what you tried, what you expected, and the exact error message. Never include your password or a verification code."
        />
      </label>
      <p className="support-safety">
        <strong>
          Never send us your password, one-time code, SSN, or legal case
          details.
        </strong>{" "}
        Support only needs the error and the email on the account.
      </p>
      {error && <div className="auth-error">{error}</div>}
      {success && (
        <div className="support-success">
          {success} We will use the account email if we need more information.
        </div>
      )}
      <button className="auth-btn" type="submit" disabled={loading}>
        {loading ? "Sending securely…" : "Send to support"}
      </button>
    </form>
  );
}

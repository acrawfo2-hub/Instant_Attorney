"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ProfileEditFormProps {
  initialName: string;
  initialPhone: string;
  email: string;
}

/**
 * Inline editor for the user's name and phone on the account page. Starts in a
 * read-only summary; "Edit" reveals the fields. Saves via POST /api/account/profile.
 */
export default function ProfileEditForm({ initialName, initialPhone, email }: ProfileEditFormProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [savedName, setSavedName] = useState(initialName);
  const [savedPhone, setSavedPhone] = useState(initialPhone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: name.trim(), phone: phone.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't save your changes.");
        return;
      }
      setSavedName(name.trim());
      setSavedPhone(phone.trim());
      setEditing(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
      router.refresh(); // keep the header / other server views in sync
    } catch {
      setError("Couldn't save your changes. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setName(savedName);
    setPhone(savedPhone);
    setError(null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div>
        <dl className="acc-rows">
          <div className="acc-row">
            <dt>Name</dt>
            <dd>{savedName.trim() || <span className="acc-muted">Not provided</span>}</dd>
          </div>
          <div className="acc-row">
            <dt>Email</dt>
            <dd>{email || <span className="acc-muted">—</span>}</dd>
          </div>
          <div className="acc-row">
            <dt>Phone</dt>
            <dd>{savedPhone.trim() || <span className="acc-muted">Not provided</span>}</dd>
          </div>
        </dl>
        <div className="acc-actions">
          <button type="button" className="acc-btn acc-btn--ghost" onClick={() => setEditing(true)}>
            Edit profile
          </button>
          {justSaved && <span className="acc-saved-note">Saved ✓</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="acc-edit">
      <div className="acc-field">
        <label className="acc-field-label" htmlFor="acc-name">Name</label>
        <input
          id="acc-name"
          type="text"
          className="acc-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          placeholder="Jane Smith"
        />
      </div>
      <div className="acc-field">
        <label className="acc-field-label" htmlFor="acc-email">Email</label>
        <input id="acc-email" type="email" className="acc-input" value={email} disabled />
        <span className="acc-field-hint">Email changes aren&apos;t supported here yet — contact the firm.</span>
      </div>
      <div className="acc-field">
        <label className="acc-field-label" htmlFor="acc-phone">Phone</label>
        <input
          id="acc-phone"
          type="tel"
          className="acc-input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          placeholder="(555) 123-4567"
        />
        <span className="acc-field-hint">Used for consult coordination and, later, account security.</span>
      </div>

      {error && <p className="acc-portal-err" style={{ marginTop: 4 }}>{error}</p>}

      <div className="acc-actions">
        <button type="button" className="acc-btn acc-btn--primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button type="button" className="acc-btn acc-btn--ghost" onClick={cancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}

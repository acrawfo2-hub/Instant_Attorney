"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

// Attorney-only: create a new ACP-protected file for a client onboarded from the
// attorney's own practice, then drop into the (freestyle) intake chat for it.
export default function AttorneyOnboardClient({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/attorney/client-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName: name.trim(), clientEmail: email.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Could not create the client file.");
      }
      const { id } = await res.json();
      // Freestyle is the natural mode for an attorney entering info + uploading.
      router.push(`/chat?caseFileId=${id}&mode=freestyle`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button className="atty-upgrade-btn" onClick={() => setOpen(true)} style={btnStyle}>
        + {compact ? "New client or matter" : "Onboard a client"}
      </button>
    );
  }

  return (
    <form className={compact ? "atty-onboard-form atty-onboard-form--compact" : "atty-onboard-form"} onSubmit={submit} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Client name"
        className="atty-onboard-input"
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Client email (optional)"
        type="email"
        className="atty-onboard-input"
      />
      <button type="submit" disabled={!name.trim() || submitting} style={{ ...btnStyle, opacity: !name.trim() || submitting ? 0.5 : 1 }}>
        {submitting ? "Creating…" : "Create & start intake"}
      </button>
      <button type="button" onClick={() => { setOpen(false); setError(null); }} style={{ ...btnStyle, background: "transparent" }}>
        Cancel
      </button>
      {error && <span style={{ color: "#e07a7a", fontSize: 12, width: "100%" }}>{error}</span>}
    </form>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 999,
  border: "1px solid rgba(200,169,110,0.35)",
  background: "var(--brand-gold)",
  color: "#1a1206",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

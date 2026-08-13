"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "Reading this file, I think they need X." — the attorney starts a document.
 *
 * Deliberately two fields and nothing else. The title names the instrument, so
 * the drafting engine resolves a real profile, spec and risk classification
 * against it; the instruction is free text, because the point is the attorney's
 * judgement about this matter, and a form cannot anticipate it.
 *
 * It creates the draft and then gets out of the way: the attorney lands in the
 * review workbench, where the associate, the file and the revision history
 * already live. This is a way in, not another room.
 */
export default function AttorneyStartDraft({ caseFileId }: { caseFileId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    const named = title.trim();
    if (!named || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/attorney/case-files/${caseFileId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: named, instruction: instruction.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "The draft could not be started.");
        return;
      }
      router.push(data.href as string);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="asd">
        <button type="button" className="atty-btn" onClick={() => setOpen(true)}>
          Draft a document for this matter
        </button>
        <p className="asd-hint">
          Starts a draft from this file and opens it in the workbench. The client
          does not see it until you approve it.
        </p>
      </div>
    );
  }

  return (
    <div className="asd asd-open">
      <label htmlFor="asd-title">What document?</label>
      <input
        id="asd-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Demand Letter, Non-Disclosure Agreement, Original Petition…"
        disabled={busy}
      />

      <label htmlFor="asd-instruction">Anything it must do (optional)</label>
      <textarea
        id="asd-instruction"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={3}
        placeholder="Demand return of the $2,400 deposit, cite the 30-day statutory deadline, keep the tone firm but not litigious…"
        disabled={busy}
      />

      {error && <p className="asd-error" role="alert">{error}</p>}

      <div className="asd-actions">
        <button type="button" className="atty-btn atty-btn-primary" onClick={() => void start()} disabled={busy || !title.trim()}>
          {busy ? "Drafting…" : "Start draft"}
        </button>
        <button type="button" className="atty-btn" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}

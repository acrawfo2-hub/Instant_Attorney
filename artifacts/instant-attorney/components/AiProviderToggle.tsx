"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AI_PROVIDER_LABELS,
  type PreferredAiProvider,
} from "@/lib/ai/providers";

interface AiProviderToggleProps {
  initialProvider: PreferredAiProvider;
  xaiOffered: boolean;
}

/**
 * Account-page control for preferred AI workhorse provider (Claude vs Grok).
 * Saves via POST /api/account/profile.
 */
export default function AiProviderToggle({
  initialProvider,
  xaiOffered,
}: AiProviderToggleProps) {
  const router = useRouter();
  const [provider, setProvider] = useState<PreferredAiProvider>(initialProvider);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  async function save(next: PreferredAiProvider) {
    if (next === provider || busy) return;
    setError(null);
    setBusy(true);
    const prev = provider;
    setProvider(next);
    try {
      const res = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferred_ai_provider: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProvider(prev);
        setError(body.error ?? "Couldn't save your AI preference.");
        return;
      }
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
      router.refresh();
    } catch {
      setProvider(prev);
      setError("Couldn't save your AI preference. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="acc-note" style={{ marginTop: 0 }}>
        Choose which model powers your Living File chat (intake). Document drafting,
        web research, and attorney premium drafts stay on Claude for now. Grok
        usage is metered at a lower model cost, so your top-ups should stretch further.
      </p>

      <fieldset className="acc-ai-fieldset" disabled={busy}>
        <legend className="acc-field-label">Preferred model</legend>
        <label className="acc-ai-option">
          <input
            type="radio"
            name="preferred_ai_provider"
            value="anthropic"
            checked={provider === "anthropic"}
            onChange={() => save("anthropic")}
          />
          <span>
            <strong>{AI_PROVIDER_LABELS.anthropic}</strong>
            <span className="acc-field-hint">Default — full feature set</span>
          </span>
        </label>
        <label className={`acc-ai-option${!xaiOffered ? " acc-ai-option--disabled" : ""}`}>
          <input
            type="radio"
            name="preferred_ai_provider"
            value="xai"
            checked={provider === "xai"}
            disabled={!xaiOffered}
            onChange={() => save("xai")}
          />
          <span>
            <strong>{AI_PROVIDER_LABELS.xai}</strong>
            <span className="acc-field-hint">
              {xaiOffered
                ? "Lower usage cost on Living File chat"
                : "Unavailable until XAI_API_KEY and xAI ZDR are configured"}
            </span>
          </span>
        </label>
      </fieldset>

      {error && <p className="acc-portal-err" style={{ marginTop: 8 }}>{error}</p>}
      {justSaved && <p className="acc-saved-note" style={{ marginTop: 8 }}>Saved ✓</p>}
    </div>
  );
}

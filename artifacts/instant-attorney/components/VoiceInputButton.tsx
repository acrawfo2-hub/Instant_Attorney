"use client";

import { useVoiceInput, useVoiceCapability } from "@/lib/voice/useVoiceInput";

interface VoiceInputButtonProps {
  /** Receives the transcribed text; caller decides how to merge it into a field. */
  onTranscript: (text: string) => void;
  /** Disable while the surrounding form is busy (e.g. a draft is generating). */
  disabled?: boolean;
  /** Compact icon-only variant for inline use beside a single input. */
  compact?: boolean;
  /**
   * When voice isn't available on this device, render a short explanatory note
   * instead of nothing. Use on the primary surface (chat) so the client
   * understands why there's no mic; omit beside every small field.
   */
  showUnsupportedNote?: boolean;
}

const UNSUPPORTED_COPY =
  "Voice typing runs privately on your device to protect your confidentiality — but this device can't run it smoothly, so please type instead.";

// Standalone note for surfaces that want to explain the absence of a mic in a
// different spot than the input itself (e.g. a hint line). Renders nothing when
// voice IS available.
export function VoiceUnsupportedNote() {
  const capability = useVoiceCapability();
  // Wait for detection, then show only when voice truly isn't available.
  if (!capability.detected || capability.supported) return null;
  return (
    <span className="voice-unsupported-note" role="note">
      {UNSUPPORTED_COPY}
    </span>
  );
}

export default function VoiceInputButton({
  onTranscript,
  disabled,
  compact = false,
  showUnsupportedNote = false,
}: VoiceInputButtonProps) {
  const { capability, detected, status, modelProgress, error, start, stop, busy } = useVoiceInput(onTranscript);

  // Render nothing until the client-side probe has run (no SSR/first-paint flash).
  if (!detected) return null;

  // Auto-detect + hide: no mic on devices that can't run it. Optionally explain.
  if (!capability.supported) {
    return showUnsupportedNote ? (
      <span className="voice-unsupported-note" role="note">
        {UNSUPPORTED_COPY}
      </span>
    ) : null;
  }

  const recording = status === "recording";
  const label = recording
    ? "Stop recording"
    : status === "loading-model"
      ? "Preparing voice…"
      : status === "transcribing"
        ? "Transcribing…"
        : "Dictate with your voice";

  const onClick = () => {
    if (recording) stop();
    else if (!busy) start();
  };

  return (
    <span className={`voice-input ${compact ? "voice-input-compact" : ""}`}>
      <button
        type="button"
        className={`voice-mic-btn${recording ? " voice-mic-recording" : ""}${busy && !recording ? " voice-mic-working" : ""}`}
        onClick={onClick}
        disabled={disabled || (busy && !recording)}
        aria-label={label}
        aria-pressed={recording}
        title={label}
      >
        {recording ? (
          // Stop square
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="7" y="7" width="10" height="10" rx="2" />
          </svg>
        ) : (
          // Microphone
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="2" width="6" height="11" rx="3" />
            <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
            <line x1="12" y1="18" x2="12" y2="22" />
          </svg>
        )}
      </button>

      {status === "loading-model" && (
        <span className="voice-status" role="status">
          {modelProgress !== null ? `Downloading voice model… ${modelProgress}%` : "Preparing voice…"}
        </span>
      )}
      {status === "transcribing" && (
        <span className="voice-status" role="status">Transcribing…</span>
      )}
      {recording && <span className="voice-status voice-status-rec" role="status">Listening — tap to stop</span>}
      {status === "error" && error && <span className="voice-status voice-status-err">{error}</span>}
    </span>
  );
}

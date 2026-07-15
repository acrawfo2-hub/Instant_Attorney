"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { detectVoiceCapability, readBrowserEnv } from "@/lib/voice/capability";
import { blobToPcm16k, getTranscriber } from "@/lib/voice/transcriber";
import type { ConsultRecording } from "@/lib/types";

interface Props {
  consultId: string;
  initialRecordings: ConsultRecording[];
  /** Whether recording consent has already been logged for this consult. */
  hasConsent: boolean;
}

type RecorderState = "idle" | "awaiting-consent" | "capturing" | "uploading" | "transcribing" | "error";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Mixes the attorney's mic with the shared Meet/Zoom tab's audio (if granted)
// into one stream, so the recording captures both sides of the call. Tab
// audio requires the attorney to check "Share tab audio" in the browser's
// share picker — if they don't (or the browser/OS doesn't support it), we
// fall back to mic-only rather than failing outright.
async function captureCombinedStream(): Promise<{
  stream: MediaStream;
  cleanup: () => void;
  tabAudioCaptured: boolean;
}> {
  const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  let displayStream: MediaStream | null = null;
  let tabAudioCaptured = false;
  if (navigator.mediaDevices.getDisplayMedia) {
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      tabAudioCaptured = displayStream.getAudioTracks().length > 0;
      displayStream.getVideoTracks().forEach((t) => t.stop());
    } catch {
      displayStream = null; // attorney cancelled the share picker — mic-only is fine
    }
  }

  const AudioCtx =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const dest = ctx.createMediaStreamDestination();

  ctx.createMediaStreamSource(micStream).connect(dest);
  if (displayStream && tabAudioCaptured) {
    ctx.createMediaStreamSource(new MediaStream(displayStream.getAudioTracks())).connect(dest);
  }

  const cleanup = () => {
    micStream.getTracks().forEach((t) => t.stop());
    displayStream?.getTracks().forEach((t) => t.stop());
    void ctx.close();
  };

  return { stream: dest.stream, cleanup, tabAudioCaptured };
}

export default function ConsultRecorder({ consultId, initialRecordings, hasConsent }: Props) {
  const [recordings, setRecordings] = useState<ConsultRecording[]>(initialRecordings);
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [tabAudioWarning, setTabAudioWarning] = useState(false);
  const [consentGiven, setConsentGiven] = useState(hasConsent);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cleanupRef = useRef<(() => void) | null>(null);
  const startedAtRef = useRef<number>(0);

  // Stop the mic/tab-share/AudioContext if the attorney navigates away while
  // still recording — without this, leaving the page mid-capture (rather
  // than clicking "Stop recording") leaves the mic indicator lit and the
  // shared-tab capture running indefinitely.
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const beginCapture = useCallback(async () => {
    setError(null);
    setTabAudioWarning(false);
    try {
      const { stream, cleanup, tabAudioCaptured } = await captureCombinedStream();
      cleanupRef.current = cleanup;
      if (!tabAudioCaptured) setTabAudioWarning(true);

      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => void handleStop(recorder.mimeType || "audio/webm");
      recorder.start();
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setState("capturing");
    } catch (err) {
      const denied = err instanceof DOMException && err.name === "NotAllowedError";
      setError(denied ? "Microphone access was blocked. Enable it in your browser settings and try again." : "Couldn't start recording on this device.");
      setState("error");
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!consentGiven) {
      setState("awaiting-consent");
      return;
    }
    void beginCapture();
  }, [consentGiven, beginCapture]);

  const confirmConsent = useCallback(async () => {
    try {
      await fetch(`/api/attorney/consult/${consultId}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "consent" }),
      });
    } catch {
      // Best-effort logging — don't block the attorney from recording if the
      // consent write hiccups; the recording itself is the more important byte.
    }
    setConsentGiven(true);
    void beginCapture();
  }, [consultId, beginCapture]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  async function handleStop(mimeType: string) {
    cleanupRef.current?.();
    cleanupRef.current = null;
    recorderRef.current = null;

    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];
    if (!blob.size) {
      setState("idle");
      return;
    }

    const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);

    setState("uploading");
    let recording: ConsultRecording;
    try {
      const res = await fetch(`/api/attorney/consult/${consultId}/recordings`, {
        method: "POST",
        headers: { "Content-Type": mimeType, "X-Recording-Duration": String(durationSeconds) },
        body: blob,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      recording = data.recording as ConsultRecording;
      setRecordings((prev) => [...prev, recording]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload recording");
      setState("error");
      return;
    }

    await transcribe(recording, blob);
    setState("idle");
  }

  async function transcribe(recording: ConsultRecording, blob: Blob) {
    setState("transcribing");
    const capability = detectVoiceCapability(readBrowserEnv());
    if (!capability.supported) {
      await patchTranscript(recording.id, { error: "On-device transcription isn't supported on this device/browser." });
      return;
    }
    try {
      await patchTranscript(recording.id, { status: "processing" });
      const pcm = await blobToPcm16k(blob);
      const transcribeFn = await getTranscriber(capability.accel);
      const text = await transcribeFn(pcm);
      const updated = await patchTranscript(recording.id, { text });
      if (updated) setRecordings((prev) => prev.map((r) => (r.id === recording.id ? updated : r)));
    } catch {
      const updated = await patchTranscript(recording.id, { error: "Transcription failed. You can still listen to the recording later." });
      if (updated) setRecordings((prev) => prev.map((r) => (r.id === recording.id ? updated : r)));
    }
  }

  async function patchTranscript(
    recordingId: string,
    body: { text?: string; error?: string; status?: "processing" }
  ): Promise<ConsultRecording | null> {
    try {
      const res = await fetch(`/api/attorney/consult/${consultId}/recordings/${recordingId}/transcript`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      return res.ok ? (data.recording as ConsultRecording) : null;
    } catch {
      return null;
    }
  }

  return (
    <div className="lf-card lf-card-full">
      <div className="lf-card-label">Recording</div>

      {state === "awaiting-consent" && (
        <div className="lf-session-consent">
          <p style={{ margin: "0 0 0.6rem" }}>
            Confirm the client has been told this call is being recorded before starting. This is logged once per consult.
          </p>
          <div className="atty-second-draft-actions">
            <button className="atty-btn atty-btn-primary" onClick={() => void confirmConsent()}>
              Client has been notified — start recording
            </button>
            <button className="atty-btn" onClick={() => setState("idle")}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {state !== "awaiting-consent" && (
        <>
          {state === "idle" && (
            <button className="lf-begin-btn" onClick={startRecording}>
              Start recording
            </button>
          )}
          {state === "capturing" && (
            <>
              <div className="lf-card-meta">● Recording…</div>
              <button className="lf-begin-btn" onClick={stopRecording}>
                Stop recording
              </button>
            </>
          )}
          {state === "uploading" && <div className="lf-card-meta">Saving recording…</div>}
          {state === "transcribing" && (
            <div className="lf-card-meta">Transcribing on this device — this can take a few minutes for a longer call.</div>
          )}
          {tabAudioWarning && state !== "idle" && (
            <div className="lf-card-meta">
              Only your microphone is being captured — the client&apos;s side won&apos;t be in this recording. Choose &quot;this tab&quot; and check &quot;Share tab audio&quot; to capture both sides next time.
            </div>
          )}
          {error && <div className="lf-session-error">{error}</div>}
        </>
      )}

      {recordings.length === 0 ? (
        <div className="lf-card-meta">No recording yet.</div>
      ) : (
        recordings.map((r) => (
          <div key={r.id} className="lf-session-note">
            <div className="lf-card-meta">
              {formatTimestamp(r.recorded_at)}
              {r.duration_seconds ? ` · ${formatDuration(r.duration_seconds)}` : ""}
              {" · "}
              {r.transcript_status === "ready"
                ? "Transcribed"
                : r.transcript_status === "processing"
                  ? "Transcribing…"
                  : r.transcript_status === "failed"
                    ? "Transcription failed"
                    : "Transcript pending"}
            </div>
            {r.transcript_status === "failed" && r.transcript_error && (
              <div className="lf-session-error">{r.transcript_error}</div>
            )}
            {r.transcript_status === "ready" && r.transcript_text && (
              <>
                <button className="lf-expand-btn" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                  {expandedId === r.id ? "Hide transcript" : "Show transcript"}
                </button>
                {expandedId === r.id && <p style={{ margin: "0.4rem 0", whiteSpace: "pre-wrap" }}>{r.transcript_text}</p>}
              </>
            )}
          </div>
        ))
      )}
    </div>
  );
}

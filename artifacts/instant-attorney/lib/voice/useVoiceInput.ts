"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { detectVoiceCapability, readBrowserEnv, type VoiceCapability } from "./capability";
import { blobToPcm16k, getTranscriber, type ModelLoadProgress } from "./transcriber";

export type VoiceStatus =
  | "idle"
  | "loading-model" // downloading/initializing the on-device model (first use)
  | "recording"
  | "transcribing"
  | "error";

export interface UseVoiceInput {
  capability: VoiceCapability;
  /** False until the client-side capability probe has run (avoids SSR flash). */
  detected: boolean;
  status: VoiceStatus;
  /** 0–100 while the model downloads on first use; null otherwise. */
  modelProgress: number | null;
  error: string | null;
  /** Begin recording (requests mic permission on first call). */
  start: () => Promise<void>;
  /** Stop recording and transcribe; the result is delivered via onTranscript. */
  stop: () => void;
  /** True while recording or transcribing. */
  busy: boolean;
}

// Lightweight client-only capability probe for callers that just need to know
// whether voice is offered (e.g. to show an explanatory note), without wiring up
// the full recorder. `detected` is false until the post-mount probe runs so the
// caller can avoid rendering anything during SSR/first paint.
export function useVoiceCapability(): VoiceCapability & { detected: boolean } {
  const [state, setState] = useState<VoiceCapability & { detected: boolean }>({
    supported: false,
    accel: "wasm",
    detected: false,
  });
  useEffect(() => {
    setState({ ...detectVoiceCapability(readBrowserEnv()), detected: true });
  }, []);
  return state;
}

// Hook powering the mic button. Capture happens on the main thread; only the
// (lazy) model download + decode are heavy, and they run off the click. The
// transcribed text is handed back via `onTranscript` so the caller can append it
// to whatever field the user is filling — voice is always additive to typing.
export function useVoiceInput(onTranscript: (text: string) => void): UseVoiceInput {
  // Capability is read once on mount (client-only) so SSR renders nothing.
  const [capability, setCapability] = useState<VoiceCapability>({ supported: false, accel: "wasm" });
  const [detected, setDetected] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    setCapability(detectVoiceCapability(readBrowserEnv()));
    setDetected(true);
  }, []);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  // Tear down any live mic on unmount so we never hold the recording indicator.
  useEffect(() => cleanupStream, [cleanupStream]);

  const onProgress = useCallback((p: ModelLoadProgress) => {
    if (typeof p.progress === "number") setModelProgress(Math.round(p.progress));
  }, []);

  const start = useCallback(async () => {
    if (!capability.supported || status === "recording" || status === "transcribing") return;
    setError(null);
    try {
      // Warm the model first (no-op after the first time) so the user isn't left
      // recording into a model that isn't ready yet.
      setStatus("loading-model");
      await getTranscriber(capability.accel, onProgress);
      setModelProgress(null);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        cleanupStream();
        if (!blob.size) {
          setStatus("idle");
          return;
        }
        setStatus("transcribing");
        try {
          const pcm = await blobToPcm16k(blob);
          const transcribe = await getTranscriber(capability.accel);
          const text = await transcribe(pcm);
          if (text) onTranscriptRef.current(text);
          setStatus("idle");
        } catch {
          setError("We couldn't transcribe that. Please try again, or just type.");
          setStatus("error");
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      setStatus("recording");
    } catch (err) {
      cleanupStream();
      setModelProgress(null);
      const denied = err instanceof DOMException && err.name === "NotAllowedError";
      setError(
        denied
          ? "Microphone access was blocked. You can enable it in your browser settings, or just type."
          : "Voice input couldn't start on this device. Please type instead.",
      );
      setStatus("error");
    }
  }, [capability, status, onProgress, cleanupStream]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  return {
    capability,
    detected,
    status,
    modelProgress,
    error,
    start,
    stop,
    busy: status === "recording" || status === "transcribing" || status === "loading-model",
  };
}

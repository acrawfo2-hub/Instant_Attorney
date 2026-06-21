// Capability detection for on-device ("private") voice input.
//
// Voice typing runs a small speech model ENTIRELY in the browser so the audio
// never leaves the client's device — this is what keeps it inside the
// attorney-client-privilege / zero-retention posture (no third-party speech
// service ever sees the audio). The tradeoff is that it needs real hardware to
// run acceptably, so we detect capability up front and simply hide the mic on
// devices that can't handle it (the client just types instead).
//
// This module is pure and environment-injected so it can be unit-tested without
// a browser. `readBrowserEnv()` is the thin runtime adapter.

export type VoiceAccelerator = "webgpu" | "wasm";

export type VoiceUnsupportedReason =
  | "no-media-devices" // no microphone API (very old / locked-down browser)
  | "insecure-context" // getUserMedia requires HTTPS or localhost
  | "weak-hardware"; // no GPU acceleration and not enough CPU/RAM to be usable

export interface VoiceCapability {
  supported: boolean;
  /** Why voice is unavailable, when `supported` is false. */
  reason?: VoiceUnsupportedReason;
  /** The backend we'd run the model on. WebGPU is the fast path. */
  accel: VoiceAccelerator;
}

export interface CapabilityEnv {
  /** Page served over HTTPS or localhost (required for mic access). */
  isSecureContext?: boolean;
  /** navigator.mediaDevices?.getUserMedia is available. */
  hasMediaDevices?: boolean;
  /** WebGPU present (`"gpu" in navigator`). */
  hasWebGPU?: boolean;
  /** navigator.deviceMemory, in GB (Chromium only; undefined elsewhere). */
  deviceMemory?: number;
  /** navigator.hardwareConcurrency (logical cores). */
  hardwareConcurrency?: number;
}

// Decide whether to offer on-device voice input, and on which backend.
//
// Rules, in order:
//  • No mic API or insecure context → never offer (it physically can't work).
//  • WebGPU present → offer it (fast path, works well even on modest devices).
//  • No WebGPU → we'd fall back to slow WASM, so only offer it on a clearly
//    capable machine. deviceMemory is the best signal (Chromium-only, capped at
//    8GB); when it's unknown we use core count as a coarse proxy and, if we know
//    nothing at all, lean toward NOT offering it rather than risk a frozen tab.
export function detectVoiceCapability(env: CapabilityEnv): VoiceCapability {
  const accel: VoiceAccelerator = env.hasWebGPU ? "webgpu" : "wasm";

  if (!env.hasMediaDevices) return { supported: false, reason: "no-media-devices", accel };
  if (env.isSecureContext === false) return { supported: false, reason: "insecure-context", accel };

  if (accel === "webgpu") return { supported: true, accel };

  const mem = env.deviceMemory;
  const cores = env.hardwareConcurrency;
  const tooLittleRam = mem !== undefined && mem < 4;
  const tooFewCores = mem === undefined && cores !== undefined && cores < 4;
  const unknownHardware = mem === undefined && cores === undefined;

  if (tooLittleRam || tooFewCores || unknownHardware) {
    return { supported: false, reason: "weak-hardware", accel };
  }
  return { supported: true, accel };
}

// Read the live browser environment. Safe to call during render; every field is
// optional/guarded so it never throws on the server or in older browsers.
export function readBrowserEnv(): CapabilityEnv {
  if (typeof navigator === "undefined") return { hasMediaDevices: false };
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    gpu?: unknown;
  };
  return {
    isSecureContext: typeof window !== "undefined" ? window.isSecureContext : undefined,
    hasMediaDevices: !!nav.mediaDevices && typeof nav.mediaDevices.getUserMedia === "function",
    hasWebGPU: "gpu" in nav && !!nav.gpu,
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
  };
}

// Lazy, on-device speech-to-text via transformers.js (Whisper).
//
// The library and model weights are imported only when the client first uses the
// mic, so typing-only users never pay the download/parse cost. The model runs in
// the browser (WebGPU, or WASM fallback); the recorded audio is converted to the
// 16kHz mono PCM Whisper expects and never leaves the device.
//
// NOTE: requires the `@huggingface/transformers` dependency and downloads the
// model from the Hugging Face CDN on first use (cached by the browser
// thereafter). For a stricter deployment the model files can be self-hosted and
// `env.allowRemoteModels`/`env.localModelPath` pointed at your own origin — the
// privacy posture is identical either way since inference is local.

import type { VoiceAccelerator } from "./capability";

// English base model: a good accuracy/size balance for legal intake. Swap to
// `whisper-tiny.en` for a smaller/faster download on weaker hardware, or a
// multilingual model if non-English intake is needed.
export const VOICE_MODEL = "onnx-community/whisper-base.en";

export interface ModelLoadProgress {
  status: string;
  file?: string;
  progress?: number; // 0–100 while a weight file downloads
}

type Transcribe = (audio: Float32Array) => Promise<string>;

// Loose typing on purpose: transformers.js is dynamically imported so the build
// stays lean and we don't hard-depend on its types at this layer.
type AsrPipeline = (
  audio: Float32Array,
  opts: Record<string, unknown>,
) => Promise<{ text: string } | Array<{ text: string }>>;

let transcriberPromise: Promise<Transcribe> | null = null;

// Resolve (loading once) a transcribe() function bound to a ready Whisper
// pipeline. Concurrent callers share the same load; a failed load is cleared so
// a later attempt can retry cleanly.
export function getTranscriber(
  accel: VoiceAccelerator,
  onProgress?: (p: ModelLoadProgress) => void,
): Promise<Transcribe> {
  if (!transcriberPromise) {
    transcriberPromise = loadTranscriber(accel, onProgress).catch((err) => {
      transcriberPromise = null;
      throw err;
    });
  }
  return transcriberPromise;
}

async function loadTranscriber(
  accel: VoiceAccelerator,
  onProgress?: (p: ModelLoadProgress) => void,
): Promise<Transcribe> {
  const mod = (await import(
    /* webpackChunkName: "transformers" */ "@huggingface/transformers"
  )) as unknown as {
    pipeline: (
      task: string,
      model: string,
      opts: Record<string, unknown>,
    ) => Promise<AsrPipeline>;
  };

  const asr = await mod.pipeline("automatic-speech-recognition", VOICE_MODEL, {
    device: accel,
    progress_callback: onProgress,
  });

  return async (audio: Float32Array): Promise<string> => {
    const out = await asr(audio, { chunk_length_s: 30, stride_length_s: 5 });
    const text = Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text;
    return text.trim();
  };
}

// Decode a recorded audio Blob into the 16kHz mono Float32 PCM Whisper needs.
// Uses an OfflineAudioContext to resample regardless of the device's native
// sample rate (typically 44.1/48kHz).
export async function blobToPcm16k(blob: Blob): Promise<Float32Array> {
  const TARGET_RATE = 16000;
  const arrayBuf = await blob.arrayBuffer();

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const decodeCtx = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuf);
  } finally {
    decodeCtx.close();
  }

  // Already at target rate and mono — no resample needed.
  if (decoded.sampleRate === TARGET_RATE && decoded.numberOfChannels === 1) {
    return decoded.getChannelData(0).slice();
  }

  const frames = Math.ceil(decoded.duration * TARGET_RATE);
  const offline = new OfflineAudioContext(1, frames, TARGET_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}

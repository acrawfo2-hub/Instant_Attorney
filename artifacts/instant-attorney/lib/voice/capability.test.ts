import { test } from "node:test";
import assert from "node:assert/strict";
import { detectVoiceCapability } from "./capability.ts";

test("offers WebGPU whenever it's present, even on a modest device", () => {
  const cap = detectVoiceCapability({
    hasMediaDevices: true,
    isSecureContext: true,
    hasWebGPU: true,
    deviceMemory: 2,
    hardwareConcurrency: 2,
  });
  assert.equal(cap.supported, true);
  assert.equal(cap.accel, "webgpu");
});

test("never offers voice without a microphone API", () => {
  const cap = detectVoiceCapability({ hasMediaDevices: false, hasWebGPU: true });
  assert.equal(cap.supported, false);
  assert.equal(cap.reason, "no-media-devices");
});

test("never offers voice in an insecure (non-HTTPS) context", () => {
  const cap = detectVoiceCapability({
    hasMediaDevices: true,
    isSecureContext: false,
    hasWebGPU: true,
  });
  assert.equal(cap.supported, false);
  assert.equal(cap.reason, "insecure-context");
});

test("WASM fallback is offered on a capable machine with enough RAM", () => {
  const cap = detectVoiceCapability({
    hasMediaDevices: true,
    isSecureContext: true,
    hasWebGPU: false,
    deviceMemory: 8,
    hardwareConcurrency: 8,
  });
  assert.equal(cap.supported, true);
  assert.equal(cap.accel, "wasm");
});

test("WASM fallback is hidden on a low-RAM device", () => {
  const cap = detectVoiceCapability({
    hasMediaDevices: true,
    isSecureContext: true,
    hasWebGPU: false,
    deviceMemory: 2,
    hardwareConcurrency: 8,
  });
  assert.equal(cap.supported, false);
  assert.equal(cap.reason, "weak-hardware");
});

test("with no memory signal, falls back to core count", () => {
  const fewCores = detectVoiceCapability({
    hasMediaDevices: true,
    isSecureContext: true,
    hasWebGPU: false,
    hardwareConcurrency: 2,
  });
  assert.equal(fewCores.supported, false);
  assert.equal(fewCores.reason, "weak-hardware");

  const manyCores = detectVoiceCapability({
    hasMediaDevices: true,
    isSecureContext: true,
    hasWebGPU: false,
    hardwareConcurrency: 8,
  });
  assert.equal(manyCores.supported, true);
});

test("with no hardware signal at all and no WebGPU, does not offer voice", () => {
  const cap = detectVoiceCapability({
    hasMediaDevices: true,
    isSecureContext: true,
    hasWebGPU: false,
  });
  assert.equal(cap.supported, false);
  assert.equal(cap.reason, "weak-hardware");
});

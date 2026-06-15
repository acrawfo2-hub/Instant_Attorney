import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GOVERNMENT_FORMS,
  getGovernmentForm,
  isKnownFormKey,
  formCatalogForPrompt,
  matchFormsByText,
} from "./government-forms.ts";

test("registry is non-empty and every form cites an official .gov source", () => {
  assert.ok(GOVERNMENT_FORMS.length >= 1);
  for (const form of GOVERNMENT_FORMS) {
    assert.ok(form.official_url.startsWith("https://"), `${form.key} url`);
    assert.ok(form.official_url.includes(".gov"), `${form.key} should cite a .gov source`);
    assert.ok(form.form_number && form.title && form.deadline, `${form.key} core fields`);
    assert.ok(form.fields.length > 0, `${form.key} has fields`);
  }
});

test("form keys are unique", () => {
  const keys = GOVERNMENT_FORMS.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("lookup + key membership helpers", () => {
  assert.ok(isKnownFormKey("irs-w4"));
  assert.ok(!isKnownFormKey("totally-made-up"));
  assert.equal(getGovernmentForm("irs-w4")?.form_number, "Form W-4");
  assert.equal(getGovernmentForm("nope"), undefined);
});

test("prompt catalog lists every key", () => {
  const catalog = formCatalogForPrompt();
  for (const form of GOVERNMENT_FORMS) {
    assert.ok(catalog.includes(form.key), `catalog missing ${form.key}`);
  }
});

test("offline keyword fallback catches an obvious situation", () => {
  const matched = matchFormsByText("I just moved to Texas and started a new job");
  const keys = matched.map((f) => f.key);
  assert.ok(keys.includes("dmv-address-change-tx"));
  assert.ok(keys.includes("irs-w4"));
});

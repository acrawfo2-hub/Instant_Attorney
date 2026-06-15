import { test } from "node:test";
import assert from "node:assert/strict";
import {
  slugifyFormKey,
  looksOfficial,
  provisionalFormDef,
  coerceLookedUpForm,
} from "./gov-form-lookup.ts";

test("slugifyFormKey produces a stable dyn- key", () => {
  assert.equal(slugifyFormKey("CA DMV Change of Address"), "dyn-ca-dmv-change-of-address");
  assert.equal(slugifyFormKey("  Form!! 123  "), "dyn-form-123");
  assert.equal(slugifyFormKey(""), "dyn-form");
});

test("looksOfficial accepts https .gov, rejects others", () => {
  assert.equal(looksOfficial("https://www.dmv.ca.gov/portal/"), true);
  assert.equal(looksOfficial("https://uscis.gov/i-90"), true);
  assert.equal(looksOfficial("http://www.dmv.ca.gov"), false); // not https
  assert.equal(looksOfficial("https://forms.example.com"), false);
  assert.equal(looksOfficial(undefined), false);
  assert.equal(looksOfficial("not a url"), false);
});

test("provisionalFormDef drops a non-official url and has no invented fields", () => {
  const def = provisionalFormDef({
    name: "CA DMV Change of Address",
    agency: "California DMV",
    jurisdiction: "California",
    official_url: "https://shady.example.com/form",
    reason: "moved to CA",
  });
  assert.equal(def.key, "dyn-ca-dmv-change-of-address");
  assert.equal(def.official_url, ""); // non-.gov rejected
  assert.deepEqual(def.fields, []);
  assert.equal(def.revision, "unverified");
});

test("coerceLookedUpForm requires an official source and usable fields", () => {
  const base = provisionalFormDef({ name: "X", agency: "A", jurisdiction: "CA" });

  // Missing official url → reject.
  assert.equal(
    coerceLookedUpForm({ found: true, official_url: "https://example.com", fields: [{ name: "a", label: "A", type: "string" }] }, base),
    null
  );
  // No fields → reject.
  assert.equal(
    coerceLookedUpForm({ found: true, official_url: "https://dmv.ca.gov", fields: [] }, base),
    null
  );
  // found: false → reject.
  assert.equal(coerceLookedUpForm({ found: false }, base), null);

  // Valid → coerced, unknown field type defaults to string.
  const ok = coerceLookedUpForm(
    {
      found: true,
      form_number: "DL 933",
      title: "Change of Address",
      agency: "California DMV",
      jurisdiction: "California",
      official_url: "https://www.dmv.ca.gov/portal/",
      deadline: "Within 10 days",
      fields: [
        { name: "full_name", label: "Full name", type: "string" },
        { name: "weird", label: "Weird", type: "captcha" },
        { junk: true },
      ],
      common_mistakes: ["x"],
    },
    base
  );
  assert.ok(ok);
  assert.equal(ok!.form_number, "DL 933");
  assert.equal(ok!.official_url, "https://www.dmv.ca.gov/portal/");
  assert.equal(ok!.fields.length, 2); // junk dropped
  assert.equal(ok!.fields[1].type, "string"); // unknown type coerced
});

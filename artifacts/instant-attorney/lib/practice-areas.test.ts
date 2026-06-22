import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRACTICE_AREAS,
  getPracticeArea,
  isKnownPracticeArea,
} from "./practice-areas.ts";

test("registry is non-empty with complete fields", () => {
  assert.ok(PRACTICE_AREAS.length >= 1);
  for (const a of PRACTICE_AREAS) {
    assert.ok(a.slug && a.label && a.opener, `${a.slug} core fields`);
    assert.ok(a.opener.length > 40, `${a.slug} opener is substantive`);
  }
});

test("slugs are unique", () => {
  const slugs = PRACTICE_AREAS.map((a) => a.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test("covers the slugs the landing page links to", () => {
  // Tiles in app/page.tsx route to /free-chat?area=<slug>.
  for (const slug of ["contract", "employment", "harassment", "business", "estate", "landlord", "hoa", "nda", "other"]) {
    assert.ok(isKnownPracticeArea(slug), `missing practice area: ${slug}`);
  }
});

test("lookup is case-insensitive and safe on empty input", () => {
  assert.equal(getPracticeArea("HOA")?.slug, "hoa");
  assert.equal(getPracticeArea(null), undefined);
  assert.equal(getPracticeArea(""), undefined);
  assert.equal(getPracticeArea("not-an-area"), undefined);
});

test("hoa opener references governing documents and Texas law", () => {
  const hoa = getPracticeArea("hoa");
  assert.ok(hoa);
  assert.match(hoa.opener, /governing documents|CC&Rs/);
  assert.match(hoa.opener, /Texas/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPROVED_INSTRUMENT_AUTHORITY_DOMAINS,
  INSTRUMENT_AUTHORITIES,
  confirmInstrumentAuthority,
  formatInstrumentAuthorityBlock,
  isApprovedAuthorityUrl,
  resolveInstrumentAuthority,
} from "./authority.ts";

test("representative profiles contain pinned official authority", () => {
  assert.equal(INSTRUMENT_AUTHORITIES.length, 5);
  for (const profile of INSTRUMENT_AUTHORITIES) {
    assert.ok(profile.exactName);
    assert.ok(profile.jurisdiction);
    assert.ok(profile.retrievedAt && profile.effectiveAt);
    assert.ok(profile.requiredSections.length && profile.requiredClauses.length);
    assert.ok(profile.formalities.length && profile.authoritySnapshot.length);
    assert.ok(profile.authorities.every((authority) => isApprovedAuthorityUrl(authority.url)));
  }
  assert.ok(APPROVED_INSTRUMENT_AUTHORITY_DOMAINS.includes("statutes.capitol.texas.gov"));
});

test("known instruments resolve to a delimited pinned block", () => {
  const resolution = resolveInstrumentAuthority("Texas will");
  assert.equal(resolution.status, "resolved");
  const block = formatInstrumentAuthorityBlock(resolution);
  assert.match(block, /^=== BEGIN INSTRUMENT AUTHORITY \(PINNED\) ===/);
  assert.match(block, /Last Will and Testament \(Texas\)/);
  assert.match(block, /PINNED NORMALIZED EXTRACT:/);
  assert.match(block, /=== END INSTRUMENT AUTHORITY \(PINNED\) ===$/);
});

test("unknown instruments resolve to a blocking gap", () => {
  const resolution = resolveInstrumentAuthority("Martian mineral lease");
  assert.equal(resolution.status, "blocking_gap");
  assert.match(formatInstrumentAuthorityBlock(resolution), /STATUS: BLOCKING GAP/);
});

test("promotion rejects unofficial sources and requires attorney confirmation", () => {
  const candidate = { ...INSTRUMENT_AUTHORITIES[0], reusableStatus: "pending_attorney_confirmation" as const };
  assert.throws(
    () => confirmInstrumentAuthority({ ...candidate, authorities: [{ title: "Blog", url: "https://example.com" }] }, { attorneyId: "tx-1", confirmedAt: "2026-08-11" }),
    /approved official/
  );
  assert.throws(() => confirmInstrumentAuthority(candidate, { attorneyId: "", confirmedAt: "2026-08-11" }), /attorney confirmation/);
  assert.equal(confirmInstrumentAuthority(candidate, { attorneyId: "tx-1", confirmedAt: "2026-08-11" }).reusableStatus, "attorney_confirmed");
});

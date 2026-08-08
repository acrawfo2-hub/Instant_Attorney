import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseStrengthCheck,
  formatStrengthCheckForModel,
  STRENGTH_CHECK_DISCLAIMER,
  type StrengthCheck,
} from "./strength-check-types.ts";
import { saveStrengthCheck } from "./strength-check-store.ts";

const SAMPLE = `Some preamble the model shouldn't emit but might.
---STRENGTH CHECK---
HEADLINE: Your position is solid on liability but exposed on damages.
The missing repair invoice is the single most important fix.
STRONGEST:
- The signed lease (June 1, 2023) puts the repair duty squarely on the landlord.
- Your written notice on March 3 is documented.
WEAKEST:
- No proof of the out-of-pocket repair cost.
COUNTERARGUMENTS:
- ATTACK: You never gave us a chance to fix it. || RESPONSE: The March 3 email shows notice 30 days before the repair.
- ATTACK: The damage was pre-existing.
EVIDENCE:
- ITEM: The repair invoice or bank statement showing the payment || WHY: Closes the damages gap.
- ITEM: Move-in inspection photos
---END STRENGTH CHECK---`;

test("parses the full marker format", () => {
  const c = parseStrengthCheck(SAMPLE, new Date("2026-08-08T12:00:00Z"));
  assert.ok(c);
  assert.match(c!.headline, /solid on liability/);
  assert.match(c!.headline, /single most important fix/); // multi-line headline collapsed
  assert.equal(c!.strongest.length, 2);
  assert.equal(c!.weakest.length, 1);
  assert.equal(c!.counterarguments.length, 2);
  assert.equal(c!.counterarguments[0].response, "The March 3 email shows notice 30 days before the repair.");
  assert.equal(c!.counterarguments[1].response, undefined);
  assert.equal(c!.evidence.length, 2);
  assert.equal(c!.evidence[0].why, "Closes the damages gap.");
  assert.equal(c!.evidence[1].item, "Move-in inspection photos");
  assert.equal(c!.disclaimer, STRENGTH_CHECK_DISCLAIMER);
  assert.equal(c!.generated_at, "2026-08-08T12:00:00.000Z");
});

// ── saveStrengthCheck — optimistic concurrency ───────────────────────────────

// Minimal fake of the two supabase chains saveStrengthCheck uses. `rows` is the
// live case_files row; `raceOnce` simulates a concurrent writer bumping
// updated_at between our read and our guarded update.
function fakeDb(row: { legal_strategy: object | null; updated_at: string | null }, opts: { raceTimes?: number; failUpdate?: boolean } = {}) {
  let races = opts.raceTimes ?? 0;
  const db = {
    updates: [] as object[],
    from() {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { ...row }, error: null }),
          }),
        }),
        update(payload: { legal_strategy: object; updated_at: string }) {
          const guarded = {
            select: async () => {
              if (opts.failUpdate) return { data: null, error: { message: "boom" } };
              if (races > 0) {
                races--;
                // Concurrent writer won: bump the row, guard matches nothing.
                row.updated_at = new Date(Date.now() + races + 1).toISOString();
                row.legal_strategy = { summary: "rewritten" };
                return { data: [], error: null };
              }
              row.legal_strategy = payload.legal_strategy;
              row.updated_at = payload.updated_at;
              db.updates.push(payload);
              return { data: [{ id: "cf1" }], error: null };
            },
          };
          return { eq: () => ({ eq: () => guarded, is: () => guarded }) };
        },
      };
    },
  };
  return db;
}

const CHECK: StrengthCheck = parseStrengthCheck(SAMPLE)!;

test("saveStrengthCheck merges into the CURRENT strategy after losing a race", async () => {
  const db = fakeDb({ legal_strategy: { summary: "original" }, updated_at: "2026-08-08T00:00:00Z" }, { raceTimes: 1 });
  await saveStrengthCheck(db, "cf1", CHECK);
  assert.equal(db.updates.length, 1);
  const saved = db.updates[0] as { legal_strategy: { summary: string; strength_check?: StrengthCheck } };
  // The winning write is based on the RE-READ (post-race) strategy, not the stale one.
  assert.equal(saved.legal_strategy.summary, "rewritten");
  assert.equal(saved.legal_strategy.strength_check?.headline, CHECK.headline);
});

test("saveStrengthCheck handles a null updated_at row", async () => {
  const db = fakeDb({ legal_strategy: null, updated_at: null });
  await saveStrengthCheck(db, "cf1", CHECK);
  assert.equal(db.updates.length, 1);
});

test("saveStrengthCheck throws when the update keeps failing", async () => {
  const db = fakeDb({ legal_strategy: {}, updated_at: "2026-08-08T00:00:00Z" }, { failUpdate: true });
  await assert.rejects(() => saveStrengthCheck(db, "cf1", CHECK), /Could not save/);
});

test("saveStrengthCheck throws after exhausting retries", async () => {
  const db = fakeDb({ legal_strategy: {}, updated_at: "2026-08-08T00:00:00Z" }, { raceTimes: 99 });
  await assert.rejects(() => saveStrengthCheck(db, "cf1", CHECK, 3), /Could not save/);
  assert.equal(db.updates.length, 0);
});

test("returns null on garbage", () => {
  assert.equal(parseStrengthCheck("I cannot analyze this."), null);
});

test("tolerates a missing END marker", () => {
  const c = parseStrengthCheck(SAMPLE.replace("---END STRENGTH CHECK---", ""));
  assert.ok(c);
  assert.equal(c!.evidence.length, 2);
});

test("formatStrengthCheckForModel includes every section and the disclaimer", () => {
  const c = parseStrengthCheck(SAMPLE)!;
  const out = formatStrengthCheckForModel(c);
  assert.match(out, /Strongest points:/);
  assert.match(out, /Likely attacks/);
  assert.match(out, /→ Response:/);
  assert.match(out, /Evidence to gather:/);
  assert.match(out, new RegExp(STRENGTH_CHECK_DISCLAIMER.slice(0, 30)));
});

import assert from "node:assert/strict";
import test from "node:test";
import { persistDrafts, type DraftPersistenceAdapter } from "./draft-persistence.ts";

const draft = (title = "Motion") => ({ title, content: `${title} body` });

test("reports an insert failure after bounded retries", async () => {
  let inserts = 0;
  const adapter: DraftPersistenceAdapter = {
    find: async () => ({ id: null, error: null }),
    update: async () => ({ error: null }),
    insert: async () => { inserts++; return { id: null, error: new Error("insert failed") }; },
  };
  const result = await persistDrafts([draft()], adapter, { attempts: 2, sleep: async () => {} });
  assert.equal(inserts, 2);
  assert.equal(result.persisted.length, 0);
  assert.match(result.failed[0].error, /insert failed/);
});

test("reports an update failure after bounded retries", async () => {
  const adapter: DraftPersistenceAdapter = {
    find: async () => ({ id: "existing", error: null }),
    update: async () => ({ error: { message: "update failed" } }),
    insert: async () => ({ id: "unused", error: null }),
  };
  const result = await persistDrafts([draft()], adapter, { attempts: 2, sleep: async () => {} });
  assert.equal(result.failed.length, 1);
  assert.equal(result.persisted.length, 0);
});

test("temporary failure retries and succeeds", async () => {
  let calls = 0;
  const adapter: DraftPersistenceAdapter = {
    find: async () => ({ id: null, error: null }),
    update: async () => ({ error: null }),
    insert: async () => ++calls === 1 ? { id: null, error: new Error("temporary") } : { id: "saved", error: null },
  };
  const result = await persistDrafts([draft()], adapter, { sleep: async () => {} });
  assert.deepEqual(result.persisted, [{ id: "saved", title: "Motion" }]);
  assert.equal(result.failed.length, 0);
});

test("one failed draft does not discard other persisted draft ids", async () => {
  const adapter: DraftPersistenceAdapter = {
    find: async () => ({ id: null, error: null }),
    update: async () => ({ error: null }),
    insert: async (value) => value.title === "Bad"
      ? { id: null, error: new Error("nope") }
      : { id: `id-${value.title}`, error: null },
  };
  const result = await persistDrafts([draft("Good"), draft("Bad")], adapter, { attempts: 1 });
  assert.deepEqual(result.persisted, [{ id: "id-Good", title: "Good" }]);
  assert.equal(result.failed[0].title, "Bad");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchDocumentPlan, documentJobIdempotencyKey, parseDocumentPlan } from "./document-plan.ts";

test("parses a bounded structured document plan", () => {
  const plan = parseDocumentPlan('before\n---DOCUMENT PLAN---\n{"revision":2,"inputFactRevision":9,"documents":[{"identity":"demand-letter","documentType":"demand_letter","title":"Demand Letter","priority":80}]}\n---END DOCUMENT PLAN---');
  assert.equal(plan?.documents.length, 1);
  assert.equal(plan?.documents[0].documentType, "demand_letter");
});

test("rejects plans with more than three documents or unsafe fields", () => {
  const docs = Array.from({ length: 4 }, (_, i) => ({ identity: `doc-${i}`, documentType: "letter", title: "Letter" }));
  assert.equal(parseDocumentPlan(`---DOCUMENT PLAN---\n${JSON.stringify({ revision: 1, inputFactRevision: 1, documents: docs })}\n---END DOCUMENT PLAN---`), null);
  assert.equal(parseDocumentPlan('---DOCUMENT PLAN---\n{"revision":1,"inputFactRevision":0,"documents":[{"identity":"BAD VALUE","documentType":"letter","title":"x"}]}\n---END DOCUMENT PLAN---'), null);
});

test("idempotency keys are stable and scope identity by case and revision", () => {
  const key = documentJobIdempotencyKey("case-a", "demand-letter", 2);
  assert.equal(key, documentJobIdempotencyKey("case-a", "demand-letter", 2));
  assert.notEqual(key, documentJobIdempotencyKey("case-a", "demand-letter", 3));
  assert.notEqual(key, documentJobIdempotencyKey("case-b", "demand-letter", 2));
});

function stubPlanDb() {
  const jobs: Array<Record<string, unknown>> = [];
  const drafts: Array<Record<string, unknown>> = [];
  let n = 0;
  const db = {
    from(table: string) {
      if (table === "document_generation_jobs") {
        return {
          async upsert(rows: Record<string, unknown>[]) {
            for (const row of rows) {
              if (jobs.some((job) => job.idempotency_key === row.idempotency_key)) continue;
              jobs.push({ id: `job-${++n}`, workspace_draft_id: null, ...row });
            }
            return { error: null };
          },
          select() {
            return {
              async in(_column: string, keys: string[]) {
                return { data: jobs.filter((job) => keys.includes(job.idempotency_key as string)), error: null };
              },
            };
          },
          update(patch: Record<string, unknown>) {
            return {
              async eq(_column: string, id: string) {
                const job = jobs.find((row) => row.id === id);
                if (job) Object.assign(job, patch);
                return { error: null };
              },
            };
          },
        };
      }
      if (table === "client_workspace_drafts") {
        return {
          insert(row: Record<string, unknown>) {
            const id = `draft-${++n}`;
            drafts.push({ id, ...row });
            return {
              select() {
                return {
                  async single() {
                    return { data: { id }, error: null };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { db, jobs, drafts };
}

test("dispatch creates a visible empty shell before a worker claims the job", async () => {
  const { db, jobs, drafts } = stubPlanDb();
  const plan = parseDocumentPlan('---DOCUMENT PLAN---\n{"revision":1,"inputFactRevision":0,"documents":[{"identity":"demand-letter","documentType":"demand_letter","title":"Demand Letter"}]}\n---END DOCUMENT PLAN---');
  assert.ok(plan);
  const ids = await dispatchDocumentPlan(db as never, { caseFileId: "case-1", userId: "user-1", plan });
  assert.equal(ids.length, 1);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].content, "");
  assert.equal(drafts[0].title, "Demand Letter");
  assert.equal(jobs[0].workspace_draft_id, drafts[0].id);
});

test("a second dispatch of the same plan does not mint another shell", async () => {
  const { db, drafts } = stubPlanDb();
  const plan = parseDocumentPlan('---DOCUMENT PLAN---\n{"revision":1,"inputFactRevision":0,"documents":[{"identity":"demand-letter","documentType":"demand_letter","title":"Demand Letter"}]}\n---END DOCUMENT PLAN---');
  assert.ok(plan);
  await dispatchDocumentPlan(db as never, { caseFileId: "case-1", userId: "user-1", plan });
  await dispatchDocumentPlan(db as never, { caseFileId: "case-1", userId: "user-1", plan });
  assert.equal(drafts.length, 1);
});

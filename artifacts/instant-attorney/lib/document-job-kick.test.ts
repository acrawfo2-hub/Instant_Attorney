import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { documentJobProcessTarget } from "./document-job-worker.ts";

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

test("document job fan-out uses APP_URL, then VERCEL_URL, and needs CRON_SECRET", () => {
  assert.equal(documentJobProcessTarget({}), null);
  assert.equal(documentJobProcessTarget({ CRON_SECRET: "s" }), null);
  assert.equal(documentJobProcessTarget({ APP_URL: "https://example.com" }), null);
  assert.deepEqual(
    documentJobProcessTarget({ CRON_SECRET: "s", APP_URL: "https://example.com/" }),
    { url: "https://example.com/api/document-jobs/process", secret: "s" },
  );
  assert.deepEqual(
    documentJobProcessTarget({ CRON_SECRET: "s", VERCEL_URL: "preview.vercel.app" }),
    { url: "https://preview.vercel.app/api/document-jobs/process", secret: "s" },
  );
});

test("chat-acp kicks generation after dispatch — not the archival cron", async () => {
  const chat = stripComments(await readFile(new URL("../app/api/chat-acp/route.ts", import.meta.url), "utf8"));
  const dispatchAt = chat.indexOf("dispatchDocumentPlan(");
  const kickAt = chat.indexOf("kickDocumentGenerationJobs(");
  assert.ok(dispatchAt >= 0, "chat-acp must dispatch the document plan");
  assert.ok(kickAt >= 0, "chat-acp must kick the worker after dispatch");
  assert.ok(kickAt > dispatchAt, "the kick must follow dispatch so the shells exist before claim");

  const cron = await readFile(new URL("../scripts/archival-cron.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(
    stripComments(cron),
    /call\([^)]*document-jobs/,
    "The retention cron must not generate documents. Drafting is request-driven.",
  );
  assert.match(cron, /archives\/run/);
  assert.match(cron, /archives\/destroy-run/);
});

test("drafts-panel status poll is a backup kick for queued jobs", async () => {
  const src = stripComments(await readFile(new URL("../app/api/workspace/drafts/status/route.ts", import.meta.url), "utf8"));
  assert.match(src, /kickDocumentGenerationJobs/);
  assert.match(src, /status === "queued"/);
});

test("process route runs named jobIds and still drains the queue without a body", async () => {
  const src = stripComments(await readFile(new URL("../app/api/document-jobs/process/route.ts", import.meta.url), "utf8"));
  assert.match(src, /runDocumentGenerationJobs/);
  assert.match(src, /jobIds/);
  assert.match(src, /processQueuedDocumentJobs/);
});

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const libUrl = (name: string) => pathToFileURL(path.join(ROOT, "lib", name)).href;

const draft = {
  id: "draft-1",
  title: "Demand / Letter\r\n.docx",
  content: "# Background\n\nFirst paragraph\nwith a second line.\n\n- One item\n- [[CLIENT NAME]]",
};

const builder = {
  select: () => builder,
  eq: () => builder,
  single: async () => ({ data: draft, error: null }),
};

mock.module(libUrl("client-workspace-auth.ts"), {
  namedExports: {
    getClientContext: async () => ({
      userId: "user-1",
      db: { from: () => builder },
    }),
  },
});

const routeUrl = pathToFileURL(
  path.join(ROOT, "app/api/workspace/drafts/[id]/download/route.ts")
).href;
const { GET } = await import(routeUrl);

test("workspace draft download returns a real DOCX with Word headers", async () => {
  const response = await GET({} as never, { params: Promise.resolve({ id: draft.id }) });

  assert.equal(
    response.headers.get("content-type"),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  const disposition = response.headers.get("content-disposition") ?? "";
  assert.match(disposition, /^attachment;/);
  assert.match(disposition, /filename="Demand_-_Letter\.docx"/);
  assert.doesNotMatch(disposition, /[\r\n]/);

  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0, 2).toString("ascii"), "PK", "DOCX must be a ZIP archive");
  assert.notEqual(bytes.subarray(0, 1).toString("utf8"), "#", "response must not be Markdown");

  // A DOCX package must contain both the OPC manifest and Word document part,
  // and end in a ZIP end-of-central-directory record.
  const archiveIndex = bytes.toString("latin1");
  assert.match(archiveIndex, /\[Content_Types\]\.xml/);
  assert.match(archiveIndex, /word\/document\.xml/);
  assert.ok(bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])) >= bytes.length - 65_557);
});

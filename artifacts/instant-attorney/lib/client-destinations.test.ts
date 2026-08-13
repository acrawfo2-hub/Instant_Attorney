import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CLIENT_DESTINATIONS, parseClientDestination } from "./client-destinations.ts";

const ROOT = join(import.meta.dirname, "..");

// Everywhere a client-facing link to a ?view= destination can be built: the
// tile map, and the memo's "see more" links.
const LINK_SOURCES = [
  "lib/file-deck.ts",
  "components/ClientCaseMemo.tsx",
  "components/ClientFileView.tsx",
  "components/FileTiles.tsx",
];

test("parseClientDestination accepts known views and rejects anything else", () => {
  assert.equal(parseClientDestination("facts"), "facts");
  assert.equal(parseClientDestination("case-details"), "case-details");
  assert.equal(parseClientDestination(undefined), null);
  assert.equal(parseClientDestination("financials"), null, "financials is its own route, not a ?view=");
  assert.equal(parseClientDestination("../admin"), null);
});

// The regression guard. A destination the router serves but nothing links to is
// unreachable content: it renders, it routes, and no client can ever get there.
// That is precisely what happened to case-details when the eight-tile map
// replaced the six-tile one and dropped the tile that pointed at it.
test("every routed destination is reachable from at least one client-facing link", () => {
  const sources = LINK_SOURCES.map((rel) => readFileSync(join(ROOT, rel), "utf8")).join("\n");

  const orphaned = CLIENT_DESTINATIONS.filter(
    (destination) => !sources.includes(`?view=${destination}`),
  );

  assert.deepEqual(
    orphaned,
    [],
    `these destinations render but nothing links to them: ${orphaned.join(", ")}. ` +
      `Either link them from a tile or the case memo, or drop them from CLIENT_DESTINATIONS.`,
  );
});

// The cover-sheet buttons must seed the composer with the param chat actually
// reads. A prior version wrote `prompt=`, which opened a blank box.
test("case memo seeds chat with ask=, the param the composer reads", () => {
  const memo = readFileSync(join(ROOT, "components/ClientCaseMemo.tsx"), "utf8");
  const chat = readFileSync(join(ROOT, "app/chat/page.tsx"), "utf8");
  assert.match(memo, /ask=\$\{encodeURIComponent\(ask\)\}/);
  assert.doesNotMatch(memo, /prompt=\$\{/);
  assert.match(chat, /searchParams\.get\("ask"\)/);
});

test("client file landing actually renders the cover sheet and tile map", () => {
  const view = readFileSync(join(ROOT, "components/ClientFileView.tsx"), "utf8");
  assert.match(view, /<ClientCaseMemo/);
  assert.match(view, /<FileTiles tiles=\{deck\.tiles\}/);
  assert.match(view, /clientDestination === "documents"/);
});

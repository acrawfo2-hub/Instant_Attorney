import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

/**
 * "What should this client do next?" is answered by one chain, not by peers.
 *
 * The audit read `next-step`, `mission-control`, `file-deck` and `case-cta` as
 * four modules independently computing the next action, which could therefore
 * disagree, and proposed collapsing them into one `CaseGuidance` result. Two of
 * those were real problems and are gone: `case-cta` was orphaned, and the
 * roadmap — the one subsystem that genuinely proposed a competing spine — was
 * unreachable. What remains cannot disagree, because each layer consumes the one
 * below it:
 *
 *     next-step.computeNextStep          the hero action
 *       ↓  mission-control is its only caller
 *     mission-control.computeMissionControl
 *       ↓  matter-tasks wraps the board
 *     matter-tasks.buildMatterTasks
 *       ↓  file-deck ranks the tasks
 *     file-deck.buildFileDeck
 *
 * Two surfaces read it, at different heights, because they serve different
 * people: the client sees the deck (ClientFileView, and the chat rail through
 * /api/case-files/[id]/deck), the attorney sees the board. That is one engine
 * with two presentations, which is the goal — so this chunk did not rewrite the
 * chain into a new abstraction. Rewriting a working pipeline for the shape of it
 * is the change this codebase keeps being damaged by.
 *
 * What must not happen is a *second* entry into the hero. This test pins that:
 * `computeNextStep` has exactly one importer. A new surface that wants the next
 * action reads the chain through `buildMatterTasks` or `computeMissionControl`;
 * it does not compute its own.
 */

const HERO_OWNER = "lib/mission-control.ts";

async function sourceFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      found.push(...(await sourceFiles(path)));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

test("computeNextStep has exactly one caller — the chain has one head", async () => {
  const callers: string[] = [];

  for (const root of ["app", "lib", "components"]) {
    for (const path of await sourceFiles(root)) {
      if (path === "lib/next-step.ts") continue;
      const src = stripComments(await readFile(path, "utf8"));
      if (/\bcomputeNextStep\b/.test(src)) callers.push(path);
    }
  }

  assert.deepEqual(
    callers.sort(),
    [HERO_OWNER],
    `computeNextStep is the head of the guidance chain and ${HERO_OWNER} is its ` +
      `only caller. Another caller is a second opinion about the client's next ` +
      `action, which is what the roadmap and case-cta each became. Read the chain ` +
      `through buildMatterTasks (bucketed tasks), buildFileDeck (the client deck), ` +
      `or computeMissionControl (the attorney board) instead:\n  ${callers.join("\n  ")}`
  );
});

test("the chain's layers stay in order", async () => {
  // Each layer may only reach downward. An upward import would make the chain a
  // cycle and let a lower layer be influenced by a higher one's presentation.
  const forbidden: Array<{ file: string; mustNotImport: string[] }> = [
    { file: "lib/next-step.ts", mustNotImport: ["mission-control", "matter-tasks", "file-deck"] },
    { file: "lib/mission-control.ts", mustNotImport: ["matter-tasks", "file-deck"] },
    { file: "lib/matter-tasks.ts", mustNotImport: ["file-deck"] },
  ];

  for (const { file, mustNotImport } of forbidden) {
    const src = stripComments(await readFile(file, "utf8"));
    for (const lower of mustNotImport) {
      assert.equal(
        new RegExp(`from\\s+"\\.\\/${lower}\\.ts"`).test(src),
        false,
        `${file} imports ${lower}, which sits above it. The guidance chain runs ` +
          `next-step → mission-control → matter-tasks → file-deck and must only ` +
          `ever reach downward.`
      );
    }
  }
});

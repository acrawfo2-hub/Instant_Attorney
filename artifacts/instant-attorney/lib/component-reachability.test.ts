import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

/**
 * Every component must be reachable from a page.
 *
 * Unreachable UI is how this codebase hides its duplication. The roadmap was
 * described as a second case spine competing with Mission Control for the
 * client's attention — but `RoadmapSpine`, the root of the whole panel tree, had
 * no importer at all, and neither did `NextStepGuide`, the only direct consumer
 * of `computeNextStep` outside mission-control. Both had been quietly
 * disconnected and left in place, along with the API routes only they called and
 * a `roadmapOverlay` prop that `ClientFileView` accepted, defaulted, and never
 * read. Five more components were orphaned the same way.
 *
 * Nothing failed, which is the point. Dead UI still typechecks, still passes its
 * own tests, still shows up in every search, and still reads to the next agent
 * as a feature that must be preserved or extended. Removing it is cheap;
 * discovering it is not.
 *
 * Reachability starts at everything under `app/` — pages, layouts, error and
 * loading boundaries, and route handlers — and follows `@/components/...`
 * imports transitively.
 *
 * If this fails, the component is not rendered by anything. Delete it, together
 * with whatever else only it used. If you are adding a component before the page
 * that renders it, land them in the same change.
 */

const COMPONENT_IMPORT = /from\s+"@\/components\/([A-Za-z0-9_\-/]+)"/g;

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

test("every component is reachable from a page", async () => {
  const appFiles = await sourceFiles("app");
  const componentFiles = (await sourceFiles("components")).filter((f) => f.endsWith(".tsx"));

  const importsOf = new Map<string, string[]>();
  for (const file of [...appFiles, ...componentFiles]) {
    const src = await readFile(file, "utf8");
    importsOf.set(file, [...src.matchAll(COMPONENT_IMPORT)].map((m) => m[1]));
  }

  // Breadth-first from every app/ entry point through the component graph.
  const reached = new Set<string>();
  const queue = [...appFiles];
  while (queue.length > 0) {
    for (const name of importsOf.get(queue.pop()!) ?? []) {
      if (reached.has(name)) continue;
      reached.add(name);
      const path = `components/${name}.tsx`;
      if (importsOf.has(path)) queue.push(path);
    }
  }

  const orphans = componentFiles
    .map((f) => f.replace(/^components\//, "").replace(/\.tsx$/, ""))
    .filter((name) => !reached.has(name))
    .sort();

  assert.deepEqual(
    orphans,
    [],
    `No page renders these components, directly or through another component. ` +
      `Dead UI reads to the next agent as a feature to preserve. Delete each one ` +
      `along with anything only it used — routes, lib modules, props threaded to ` +
      `reach it:\n  ${orphans.join("\n  ")}`
  );
});

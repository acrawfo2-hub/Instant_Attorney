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

// Any import specifier. Resolution to a lib/ path is done separately, because a
// relative specifier resolves against the importing file's own directory —
// `./schema.ts` inside lib/instruments/ is lib/instruments/schema.ts, not
// lib/schema.ts. Getting that wrong reports live modules as orphans.
const ANY_IMPORT = /from\s+"([^"]+)"/g;

async function sourceFiles(dir: string, ext = /\.tsx?$/): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      found.push(...(await sourceFiles(path, ext)));
    } else if (ext.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
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

/**
 * The same rule, for `lib/`.
 *
 * `lib/starter-fold.ts` staged the client's starter answers for folding into a
 * draft. Its partner endpoint, `/api/wizard/save-answers`, was deleted in chunk
 * 5; the module stayed, with its own nine-test suite, importing cleanly and
 * reachable from nothing. The component guard above could not see it, because it
 * only walks `components/`.
 *
 * A whole orphaned module is the cheapest kind of dead code to find and the
 * easiest to mistake for load-bearing: it has tests, it has a considered header
 * comment, and every search turns it up.
 *
 * This does NOT catch a dead export inside a live module — `generateDocument`
 * sat in an imported `doc-generator.ts` for months. That is what the pinned
 * export lists in `doc-generator.test.ts` and `placeholder-parsing.test.ts` are
 * for. Two different failures, two different guards.
 */

test("every lib module is reachable from a page", async () => {
  const appFiles = await sourceFiles("app");
  const libFiles = (await sourceFiles("lib")).filter((f) => f.endsWith(".ts"));
  const componentFiles = (await sourceFiles("components")).filter((f) => f.endsWith(".tsx"));
  // `scripts/` are entry points too — CI runs them (`pnpm schema:strict`), and a
  // module reachable only from a script is reachable, not dead.
  // `.mjs` included: check-schema.mjs is the one that imports lib/schema-guard.ts.
  const scriptFiles = await sourceFiles("scripts", /\.(tsx?|mjs)$/);

  // Resolve an import specifier, as written in `from`, to the lib file it names.
  // Both `lib/x.ts` and `lib/x/index.ts` are real shapes in this tree.
  const libPaths = new Set(libFiles);
  const resolve = (spec: string, fromFile: string): string | null => {
    let base: string;
    if (spec.startsWith("@/lib/")) {
      base = `lib/${spec.slice("@/lib/".length)}`;
    } else if (spec.startsWith(".")) {
      // Resolve against the importing file's directory, the way node does.
      const dir = fromFile.slice(0, fromFile.lastIndexOf("/"));
      const parts = `${dir}/${spec}`.split("/");
      const stack: string[] = [];
      for (const part of parts) {
        if (part === "." || part === "") continue;
        if (part === "..") stack.pop();
        else stack.push(part);
      }
      base = stack.join("/");
    } else {
      return null; // a package, or an alias into app/ or components/
    }
    base = base.replace(/\.tsx?$/, "");
    for (const candidate of [`${base}.ts`, `${base}/index.ts`]) {
      if (libPaths.has(candidate)) return candidate;
    }
    return null;
  };

  const importsOf = new Map<string, string[]>();
  for (const file of [...appFiles, ...libFiles, ...componentFiles, ...scriptFiles, "middleware.ts"]) {
    const src = await readFile(file, "utf8");
    const specs = [...src.matchAll(ANY_IMPORT)].map((m) => m[1]);
    importsOf.set(file, specs.map((s) => resolve(s, file)).filter((p): p is string => p !== null));
  }

  // Entry points: everything routable, plus every component (already proven
  // reachable by the test above) and the middleware.
  const reached = new Set<string>();
  const queue = [...appFiles, ...componentFiles, ...scriptFiles, "middleware.ts"];
  while (queue.length > 0) {
    for (const path of importsOf.get(queue.pop()!) ?? []) {
      if (reached.has(path)) continue;
      reached.add(path);
      queue.push(path);
    }
  }

  const orphans = libFiles
    .filter((f) => !/\.test\.ts$/.test(f))
    .filter((f) => !reached.has(f))
    .sort();

  assert.deepEqual(
    orphans,
    [],
    `Nothing under app/, components/, scripts/ or middleware reaches these ` +
      `modules, directly or transitively. Delete each one with its test file and ` +
      `anything only it used:\n  ${orphans.join("\n  ")}`
  );
});

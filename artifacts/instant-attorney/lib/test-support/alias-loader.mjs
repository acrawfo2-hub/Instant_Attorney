import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// node:test runs plain `node --test` with no bundler and no tsconfig path
// resolution, so the `@/...` alias the app code uses (route handlers, lib
// modules) cannot be loaded out of the box. This resolve hook maps `@/<x>` to
// the artifact root and tries the same extension order Next/tsc would, so route
// handlers can be imported into tests exactly as the app imports them.
//
// It only ever touches specifiers beginning with `@/`; every other specifier
// (relative paths, node_modules packages) falls straight through to the default
// resolver, so existing relative-import tests are unaffected.
const ROOT = process.cwd();
const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".mjs", ".json"];

// `next/server` and `next/headers` are declared through conditional package
// exports that plain `node --test` does not satisfy, so both fail to resolve
// even though the files exist. Route tests only need NextResponse/NextRequest,
// and `next/headers` is reached transitively (usage-tracker -> supabase/server
// -> cookies()), so both map to local stubs.
const STUB_DIR = dirname(fileURLToPath(import.meta.url));
const STUB_SPECIFIERS = {
  "next/server": pathToFileURL(join(STUB_DIR, "next-server-stub.mjs")).href,
  "next/headers": pathToFileURL(join(STUB_DIR, "next-headers-stub.mjs")).href,
};

function resolveAlias(specifier) {
  const rel = specifier.slice(2); // strip leading "@/"
  const base = join(ROOT, rel);
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  const indexCandidate = join(base, "index.ts");
  if (existsSync(indexCandidate) && statSync(indexCandidate).isFile()) {
    return pathToFileURL(indexCandidate).href;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (STUB_SPECIFIERS[specifier]) {
    return nextResolve(STUB_SPECIFIERS[specifier], context);
  }
  if (specifier.startsWith("@/")) {
    const url = resolveAlias(specifier);
    if (url) {
      return nextResolve(url, context);
    }
  }
  return nextResolve(specifier, context);
}

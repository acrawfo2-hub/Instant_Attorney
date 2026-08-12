import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { NEXT_OWNED_API_PREFIXES } from "./api-surface.ts";

/**
 * Guards the routing failure mode that typecheck and tests otherwise miss
 * entirely: a new `app/api/<x>/` directory that nobody added to
 * `.replit-artifact/artifact.toml`, which the proxy then hands to Express.
 *
 * This test is the build-time half. The `routing.api-shadow` health check is
 * the runtime half — only the deployment can prove which server actually
 * answers.
 */

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "../..");

function apiDirPrefixes(): string[] {
  return readdirSync(resolve(appRoot, "app/api"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `/api/${e.name}`)
    .sort();
}

function tomlPaths(): string[] {
  const toml = readFileSync(resolve(appRoot, ".replit-artifact/artifact.toml"), "utf8");
  return [...toml.matchAll(/"(\/api\/[a-z0-9-]+)"/g)].map((m) => m[1]).sort();
}

test("the prefix list matches the directories under app/api", () => {
  const dirs = apiDirPrefixes();
  const listed = [...NEXT_OWNED_API_PREFIXES].sort();

  const missing = dirs.filter((d) => !listed.includes(d));
  const extra = listed.filter((l) => !dirs.includes(l));

  assert.deepEqual(
    missing,
    [],
    `app/api directories missing from NEXT_OWNED_API_PREFIXES: ${missing.join(", ")}`
  );
  assert.deepEqual(
    extra,
    [],
    `NEXT_OWNED_API_PREFIXES lists prefixes with no app/api directory: ${extra.join(", ")}`
  );
});

test("every owned prefix is declared in artifact.toml, or the proxy gives it to Express", () => {
  const declared = tomlPaths();
  const undeclared = NEXT_OWNED_API_PREFIXES.filter((p) => !declared.includes(p));

  assert.deepEqual(
    undeclared,
    [],
    `These prefixes exist in app/api but are absent from .replit-artifact/artifact.toml, ` +
      `so the proxy routes them to the Express api-server and they 404 in the deployed ` +
      `artifact: ${undeclared.join(", ")}. Add them to the paths array.`
  );
});

test("the prefix list has no duplicates and is sorted", () => {
  const listed = [...NEXT_OWNED_API_PREFIXES];
  assert.equal(new Set(listed).size, listed.length, "duplicate prefix");
  assert.deepEqual(listed, [...listed].sort(), "keep the list sorted so diffs stay readable");
});

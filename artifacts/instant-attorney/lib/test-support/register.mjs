import { register } from "node:module";

// Registered via `node --import ./lib/test-support/register.mjs` so the `@/`
// alias resolve hook is active for the whole test run (see alias-loader.mjs).
register("./alias-loader.mjs", import.meta.url);

// Plain-Node stub for `next/headers`, the sibling of next-server-stub.mjs.
//
// `node_modules/next/headers.js` exists on disk but Next declares the subpath
// through conditional package exports that plain `node --test` does not
// satisfy, so importing it fails with ERR_MODULE_NOT_FOUND.
//
// It is reached transitively rather than directly: a unit test importing
// lib/attorney-review-qa.ts pulls in usage-tracker.ts, which imports
// createServiceClient from lib/supabase/server.ts, which imports cookies()
// here. Nothing in that chain is exercised by those tests — only the module
// graph has to load — so the stub implements the cookie-store surface
// server.ts touches (getAll/set) over an in-memory map.

export function cookies() {
  const store = new Map();
  return {
    getAll() {
      return [...store.entries()].map(([name, value]) => ({ name, value }));
    },
    get(name) {
      return store.has(name) ? { name, value: store.get(name) } : undefined;
    },
    set(name, value) {
      store.set(name, value);
    },
    delete(name) {
      store.delete(name);
    },
  };
}

export function headers() {
  return new Map();
}

export function draftMode() {
  return { isEnabled: false, enable() {}, disable() {} };
}

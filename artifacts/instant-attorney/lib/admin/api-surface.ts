/**
 * The `/api/*` prefixes this Next app owns.
 *
 * WHY THIS LIST EXISTS
 * The reverse proxy matches most-specific path first, and the Express
 * api-server owns bare `/api`. Any `/api/<x>` not listed in
 * `.replit-artifact/artifact.toml` → `paths` silently falls through to Express
 * and 404s, while typecheck and tests stay green. It has already happened to
 * `/api/attorney` once (.agents/memory/instant-attorney-routing.md).
 *
 * Two things keep this honest, and they catch different failures:
 *   * `api-surface.test.ts` asserts this list equals the directories under
 *     `app/api/` AND is covered by artifact.toml — build-time drift.
 *   * The `routing.api-shadow` health check HEADs each prefix against the live
 *     deployment and flags any that answer with `X-Powered-By: Express` —
 *     deploy-time reality, which is the only thing that actually proves it.
 *
 * No imports: this module is read by a node:test that cannot resolve `@/`.
 */
export const NEXT_OWNED_API_PREFIXES: readonly string[] = [
  "/api/account",
  "/api/admin",
  "/api/agreements",
  "/api/assess-matter",
  "/api/attachments",
  "/api/attorney",
  "/api/auth",
  "/api/bankruptcy",
  "/api/billing",
  "/api/case-files",
  "/api/chat",
  "/api/chat-acp",
  "/api/consult",
  "/api/documents",
  "/api/dropbox-sign",
  "/api/family",
  "/api/financials",
  "/api/gov-forms",
  "/api/personal-injury",
  "/api/roadmap",
  "/api/subscriptions",
  "/api/usage",
  "/api/what-if",
  "/api/wizard",
  "/api/workspace",
];

/**
 * Suffix appended when probing a prefix for shadowing.
 *
 * Deliberately a path no route implements: Next answers its own 404 (no
 * `X-Powered-By`), Express answers its 404 with `X-Powered-By: Express`. That
 * difference is the whole signal, and probing a non-route means the check can
 * never trigger a side effect.
 */
export const SHADOW_PROBE_SUFFIX = "/__shadow-probe";

/**
 * Shared env helpers for Playwright e2e tests.
 * Mirrors conventions in scripts/e2e.mjs and scripts/e2e-t002.mjs.
 */

export function getBaseUrl(): string {
  return (
    process.env.PLAYWRIGHT_BASE_URL ??
    process.env.BASE_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function hasE2eCredentials(): boolean {
  return Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD);
}

export function hasSupabaseAdmin(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function getSupabaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
}

export function getServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

/** Parse Set-Cookie headers from a fetch Response into a Cookie request header. */
export function cookieHeaderFrom(response: Response): string {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const arr = headers.getSetCookie?.() ?? [];
  if (arr.length) {
    return arr.map((c) => c.split(";")[0]).join("; ");
  }
  const single = response.headers.get("set-cookie");
  return single ? single.split(";")[0] : "";
}

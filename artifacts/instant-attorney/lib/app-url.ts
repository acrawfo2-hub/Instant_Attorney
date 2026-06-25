/**
 * Returns the canonical public origin for this deployment.
 *
 * Priority:
 *   1. APP_URL env var  ← set this to https://instant-attorney.com
 *   2. REPLIT_DOMAINS   ← Replit auto-provides the live domain(s)
 *   3. req.nextUrl.origin fallback (correct in local dev only)
 *
 * Why not req.nextUrl.origin everywhere?
 *   Replit's reverse proxy forwards requests internally on localhost:PORT,
 *   so nextUrl.origin resolves to that internal address in production —
 *   not the public domain. Any URL we hand to Stripe, Supabase, or email
 *   links must use the real public origin.
 */
export function getAppUrl(reqOriginFallback?: string): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, "");
  }
  if (process.env.REPLIT_DOMAINS) {
    return `https://${process.env.REPLIT_DOMAINS.split(",")[0].trim()}`;
  }
  return reqOriginFallback ?? "http://localhost:3000";
}

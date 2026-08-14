export interface PageViewInput {
  path?: unknown;
  visitorId?: unknown;
  sessionId?: unknown;
  referrer?: unknown;
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
}

export interface ValidPageView {
  pagePath: string;
  visitorId: string;
  sessionId: string;
  referrerHost: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function shortText(value: unknown, max = 120): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  return clean ? clean.slice(0, max) : null;
}

/** Keeps analytics useful without ever retaining query strings or fragments. */
export function sanitizePageView(input: PageViewInput): ValidPageView | null {
  const visitorId = shortText(input.visitorId, 36);
  const sessionId = shortText(input.sessionId, 36);
  if (!visitorId || !sessionId || !UUID.test(visitorId) || !UUID.test(sessionId)) return null;

  const suppliedPath = shortText(input.path, 500);
  if (!suppliedPath || !suppliedPath.startsWith("/") || suppliedPath.startsWith("//")) return null;
  const pagePath = suppliedPath.split(/[?#]/, 1)[0].slice(0, 240) || "/";

  let referrerHost: string | null = null;
  const referrer = shortText(input.referrer, 500);
  if (referrer) {
    try {
      referrerHost = new URL(referrer).hostname.toLowerCase().slice(0, 255) || null;
    } catch {
      referrerHost = null;
    }
  }

  return {
    pagePath,
    visitorId,
    sessionId,
    referrerHost,
    utmSource: shortText(input.utmSource),
    utmMedium: shortText(input.utmMedium),
    utmCampaign: shortText(input.utmCampaign),
  };
}

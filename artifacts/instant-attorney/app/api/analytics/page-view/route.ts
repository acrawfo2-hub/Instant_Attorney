import { NextResponse } from "next/server";
import { sanitizePageView, type PageViewInput } from "@/lib/analytics/page-view";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Expected JSON." }, { status: 415 });
  }

  const body = (await request.json().catch(() => null)) as PageViewInput | null;
  const event = body ? sanitizePageView(body) : null;
  if (!event) return NextResponse.json({ error: "Invalid page view." }, { status: 400 });

  const session = await createClient();
  const { data } = await session.auth.getUser();
  const service = createServiceClient();
  const { error } = await service.from("analytics_page_views").insert({
    visitor_id: event.visitorId,
    session_id: event.sessionId,
    user_id: data.user?.id ?? null,
    page_path: event.pagePath,
    referrer_host: event.referrerHost,
    utm_source: event.utmSource,
    utm_medium: event.utmMedium,
    utm_campaign: event.utmCampaign,
  });

  // Tracking must never make the product appear broken when its migration is pending.
  if (error) console.warn("[analytics] page view was not recorded:", error.message);
  return new NextResponse(null, { status: 204 });
}

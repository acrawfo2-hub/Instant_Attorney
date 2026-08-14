import { createServiceClient } from "@/lib/supabase/server";

export interface MarketingSnapshot {
  generatedAt: string;
  periodDays: number;
  visitors: number | null;
  sessions: number | null;
  pageViews: number | null;
  newClients: number | null;
  mattersOpened: number | null;
  documentsCreated: number | null;
  consultsRequested: number | null;
  activeSubscriptions: number | null;
  trend: { date: string; views: number; visitors: number }[];
  topPages: { label: string; views: number; visitors: number }[];
  topSources: { label: string; views: number; visitors: number }[];
  warnings: string[];
}

interface AnalyticsRow {
  occurred_at: string;
  visitor_id: string;
  session_id: string;
  page_path: string;
  referrer_host: string | null;
  utm_source: string | null;
}

function rollup(rows: AnalyticsRow[], key: (row: AnalyticsRow) => string) {
  const groups = new Map<string, { views: number; visitors: Set<string> }>();
  for (const row of rows) {
    const label = key(row);
    const current = groups.get(label) ?? { views: 0, visitors: new Set<string>() };
    current.views += 1;
    current.visitors.add(row.visitor_id);
    groups.set(label, current);
  }
  return [...groups.entries()]
    .map(([label, value]) => ({ label, views: value.views, visitors: value.visitors.size }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);
}

async function countSince(table: string, column: string, since: string) {
  const db = createServiceClient();
  return db.from(table).select("*", { count: "exact", head: true }).gte(column, since);
}

/** One canonical analytics read used by both the dashboard and downloadable report. */
export async function loadMarketingSnapshot(periodDays = 30): Promise<MarketingSnapshot> {
  const days = Math.max(7, Math.min(365, Math.round(periodDays)));
  const generatedAt = new Date().toISOString();
  const sinceDate = new Date(Date.now() - days * 86_400_000);
  const since = sinceDate.toISOString();
  const warnings: string[] = [];
  const db = createServiceClient();

  const [analytics, profiles, matters, documents, consults, subscriptions] = await Promise.all([
    db
      .from("analytics_page_views")
      .select("occurred_at, visitor_id, session_id, page_path, referrer_host, utm_source")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: true })
      .limit(50_000),
    countSince("profiles", "created_at", since),
    countSince("case_files", "opened_at", since),
    countSince("documents", "created_at", since),
    countSince("consult_requests", "created_at", since),
    db
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .in("status", ["active", "trialing", "bypass"]),
  ]);

  const counts = [profiles, matters, documents, consults, subscriptions];
  const labels = ["new clients", "matters", "documents", "consults", "subscriptions"];
  counts.forEach((result, index) => {
    if (result.error) warnings.push(`Could not read ${labels[index]}: ${result.error.message}`);
  });

  let rows: AnalyticsRow[] = [];
  if (analytics.error) {
    warnings.push(
      `Website tracking is not available: ${analytics.error.message}. Apply supabase/schema-stage53-marketing-analytics.sql.`,
    );
  } else {
    rows = (analytics.data ?? []) as AnalyticsRow[];
    if (rows.length === 50_000) warnings.push("Page-view detail reached the 50,000-row dashboard limit.");
  }

  const visitorIds = new Set(rows.map((row) => row.visitor_id));
  const sessionIds = new Set(rows.map((row) => row.session_id));
  const trendMap = new Map<string, { views: number; visitors: Set<string> }>();
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
    trendMap.set(date, { views: 0, visitors: new Set() });
  }
  for (const row of rows) {
    const date = row.occurred_at.slice(0, 10);
    const bucket = trendMap.get(date);
    if (bucket) {
      bucket.views += 1;
      bucket.visitors.add(row.visitor_id);
    }
  }

  return {
    generatedAt,
    periodDays: days,
    visitors: analytics.error ? null : visitorIds.size,
    sessions: analytics.error ? null : sessionIds.size,
    pageViews: analytics.error ? null : rows.length,
    newClients: profiles.error ? null : profiles.count,
    mattersOpened: matters.error ? null : matters.count,
    documentsCreated: documents.error ? null : documents.count,
    consultsRequested: consults.error ? null : consults.count,
    activeSubscriptions: subscriptions.error ? null : subscriptions.count,
    trend: [...trendMap.entries()].map(([date, value]) => ({
      date,
      views: value.views,
      visitors: value.visitors.size,
    })),
    topPages: rollup(rows, (row) => row.page_path),
    topSources: rollup(rows, (row) => row.utm_source || row.referrer_host || "Direct / unknown"),
    warnings,
  };
}

function csvCell(value: string | number | null): string {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function marketingSnapshotCsv(snapshot: MarketingSnapshot): string {
  const rows: (string | number | null)[][] = [
    ["Instant Attorney marketing report"],
    ["Generated", snapshot.generatedAt],
    ["Period (days)", snapshot.periodDays],
    [],
    ["Metric", "Value"],
    ["Unique visitors", snapshot.visitors],
    ["Sessions", snapshot.sessions],
    ["Page views", snapshot.pageViews],
    ["New client accounts", snapshot.newClients],
    ["Matters opened", snapshot.mattersOpened],
    ["Documents created", snapshot.documentsCreated],
    ["Consults requested", snapshot.consultsRequested],
    ["Active subscriptions (current)", snapshot.activeSubscriptions],
    [],
    ["Top page", "Views", "Unique visitors"],
    ...snapshot.topPages.map((row) => [row.label, row.views, row.visitors]),
    [],
    ["Source", "Views", "Unique visitors"],
    ...snapshot.topSources.map((row) => [row.label, row.views, row.visitors]),
    [],
    ["Date", "Views", "Unique visitors"],
    ...snapshot.trend.map((row) => [row.date, row.views, row.visitors]),
  ];
  if (snapshot.warnings.length) rows.push([], ["Warnings"], ...snapshot.warnings.map((warning) => [warning]));
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

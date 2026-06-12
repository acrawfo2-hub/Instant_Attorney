import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";
import type { CaseFile } from "@/lib/types";
import SchedulerClient from "./SchedulerClient";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let userId: string;

  if (BYPASS_AUTH) {
    db = createServiceClient();
    userId = BYPASS_USER_ID;
  } else {
    db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) redirect("/login");
    userId = user.id;
  }

  // Subscription gate
  if (!BYPASS_AUTH) {
    const { data: sub } = await db
      .from("subscriptions")
      .select("status, plan")
      .eq("user_id", userId)
      .maybeSingle();
    if (!sub || sub.plan !== "consult" || !["active"].includes(sub.status)) {
      redirect("/onboarding?step=payment&plan=consult");
    }
  }

  // Already has a pending/confirmed request
  const { data: existing } = await db
    .from("consult_requests")
    .select("id, status")
    .eq("user_id", userId)
    .in("status", ["pending", "confirmed", "attorney_proposed"])
    .maybeSingle();
  if (existing) redirect("/dashboard?consult=pending");

  // Case files for the optional selector
  const { data: files } = await db
    .from("case_files")
    .select("id, title, matter_type, matter_subtype")
    .eq("user_id", userId)
    .eq("status", "open")
    .order("opened_at", { ascending: false });

  const caseFiles = (files ?? []) as Pick<CaseFile, "id" | "title" | "matter_type" | "matter_subtype">[];

  return (
    <div className="cs-shell">
      <header className="cs-header">
        <div className="cs-header-inner">
          <div className="cs-brand">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Instant Attorney</span>
          </div>
          <span className="cs-header-title">Schedule Your Consult</span>
        </div>
      </header>
      <main className="cs-main">
        <div className="cs-intro">
          <h1 className="cs-intro-title serif">Book Your 30-Minute Strategy Session</h1>
          <p className="cs-intro-sub">
            Select <strong>3 preferred times</strong> — Andrew Crawford, Esq. will confirm one.
            All times are US Central. Calls are Mon–Fri, 8:00am–8:00pm CST.
          </p>
        </div>
        <SchedulerClient caseFiles={caseFiles} />
      </main>
    </div>
  );
}

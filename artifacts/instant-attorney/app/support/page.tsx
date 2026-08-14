import Link from "next/link";
import SupportTicketForm from "@/components/SupportTicketForm";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const db = await createClient();
  const { data } = await db.auth.getUser();
  return (
    <main className="support-shell">
      <section className="support-hero">
        <Link href="/" className="support-back">
          ← Instant-Attorney
        </Link>
        <span className="support-eyebrow">ACCOUNT &amp; TECHNICAL SUPPORT</span>
        <h1>Let&apos;s get you back to your work.</h1>
        <p>
          Start with the fastest safe fix. If it does not solve the problem,
          send a support request that arrives in the administrator&apos;s
          priority queue with the details needed to diagnose it.
        </p>
      </section>
      <section className="support-options">
        <article className="support-option">
          <span className="support-step">1</span>
          <div>
            <h2>Forgotten password?</h2>
            <p>
              Send yourself a secure password-reset link. Administrators will
              never ask for your existing password.
            </p>
            <Link
              href="/forgot-password"
              className="admin-btn admin-btn-primary"
            >
              Reset my password
            </Link>
          </div>
        </article>
        <article className="support-option">
          <span className="support-step">2</span>
          <div>
            <h2>Still locked out?</h2>
            <p>
              Open a ticket below. Login and access requests are automatically
              marked urgent.
            </p>
            <a href="#support-ticket" className="admin-btn">
              Contact support
            </a>
          </div>
        </article>
      </section>
      <section id="support-ticket" className="support-ticket-card">
        <div className="support-ticket-head">
          <div>
            <span className="support-eyebrow">ESCALATE TO A PERSON</span>
            <h2>Open a support request</h2>
          </div>
          <span className="admin-badge">Audited support desk</span>
        </div>
        <SupportTicketForm initialEmail={data.user?.email ?? ""} />
      </section>
    </main>
  );
}

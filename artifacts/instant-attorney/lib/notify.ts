import { Resend } from "resend";
import type { Document, CaseFile, Profile, ConsultRequest, ConsultWrapUp } from "./types";
import { docTypeLabel } from "./types.ts";
import { CONSULT_DISPOSITION_LABELS } from "./consult-wrap-up.ts";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY!);
  return _resend;
}

const ATTORNEY_EMAIL = process.env.ATTORNEY_EMAIL ?? "andrew@crawfordlaw.net";
const FROM_EMAIL = "noreply@instant-attorney.com";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Alert the help desk without copying the request description into email. */
export async function notifyAdminSupportTicket(ticket: { ticketNumber: number; email: string; subject: string; priority: string }): Promise<void> {
  if (process.env.BYPASS_AUTH === "true" || !process.env.RESEND_API_KEY) {
    console.log(`[notify] skipping support-ticket email for IA-${ticket.ticketNumber}`);
    return;
  }
  const adminEmail = (process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim()).find(Boolean) ?? ATTORNEY_EMAIL;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://instant-attorney.com";
  await getResend().emails.send({
    from: FROM_EMAIL,
    to: adminEmail,
    subject: `[Instant Attorney] ${ticket.priority.toUpperCase()} support ticket IA-${ticket.ticketNumber}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px"><h2>New support request IA-${ticket.ticketNumber}</h2><p><strong>Account:</strong> ${escapeHtml(ticket.email)}</p><p><strong>Subject:</strong> ${escapeHtml(ticket.subject)}</p><p>The request description remains inside the audited admin console.</p><p><a href="${base}/admin/support" style="display:inline-block;background:#1a1a2e;color:white;padding:12px 18px;text-decoration:none;border-radius:6px">Open Support Desk</a></p></div>`,
  });
}

export async function notifyClientDocumentDelivery(to: string, opts: { subject: string; body: string; consultationUrl: string | null; revisionDocumentId: string; fileName: string }): Promise<void> {
  if (process.env.BYPASS_AUTH === "true" || !process.env.RESEND_API_KEY) {
    console.log(`[notify] skipping document delivery email to ${to}`);
    return;
  }
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://instant-attorney.com";
  await getResend().emails.send({
    from: FROM_EMAIL, to, subject: opts.subject,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px"><div style="white-space:pre-wrap">${escapeHtml(opts.body)}</div><p><a href="${base}/api/documents/${opts.revisionDocumentId}/download">Download ${escapeHtml(opts.fileName)}</a></p><p><a href="${base}/dashboard">View the document and delivery note in your matter</a></p>${opts.consultationUrl ? `<p><a href="${escapeHtml(opts.consultationUrl)}" style="display:inline-block;background:#1a1a2e;color:white;padding:12px 18px;text-decoration:none;border-radius:6px">Schedule a consultation</a></p>` : ""}</div>`,
  });
}

export async function notifyAttorneyDocumentReady(
  document: Document,
  caseFile: CaseFile,
  clientProfile: Profile
): Promise<void> {
  if (process.env.BYPASS_AUTH === "true" || !process.env.RESEND_API_KEY) {
    console.log(
      `[notify] BYPASS or no RESEND_API_KEY — skipping email for doc ${document.id}`
    );
    return;
  }

  const docLabel = docTypeLabel(document.doc_type);
  const reviewUrl = `https://instant-attorney.com/attorney/review/${document.id}`;

  await getResend().emails.send({
    from: FROM_EMAIL,
    to: ATTORNEY_EMAIL,
    subject: `[Instant Attorney] ${docLabel} ready for review — ${clientProfile.full_name ?? clientProfile.email}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a2e;">Document Ready for 48-Hour Review</h2>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 8px; font-weight: bold; width: 140px;">Client</td>
            <td style="padding: 8px;">${clientProfile.full_name ?? "—"} (${clientProfile.email})</td>
          </tr>
          <tr style="background: #f5f5f5;">
            <td style="padding: 8px; font-weight: bold;">Document Type</td>
            <td style="padding: 8px;">${docLabel}</td>
          </tr>
          <tr>
            <td style="padding: 8px; font-weight: bold;">Matter</td>
            <td style="padding: 8px;">${caseFile.matter_type ?? "Unknown"} — ${caseFile.matter_subtype ?? ""}</td>
          </tr>
          <tr style="background: #f5f5f5;">
            <td style="padding: 8px; font-weight: bold;">Case File ID</td>
            <td style="padding: 8px; font-size: 12px; color: #666;">${caseFile.id}</td>
          </tr>
        </table>
        <p style="margin: 24px 0;">
          <a href="${reviewUrl}" style="background: #1a1a2e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Review Document →
          </a>
        </p>
        <p style="font-size: 12px; color: #888; margin-top: 32px; border-top: 1px solid #eee; padding-top: 12px;">
          This document was generated by the Instant Attorney intake system. It is marked DRAFT and requires attorney review before delivery to the client.
          Crawford Law PLLC · Texas Bar #24148908
        </p>
      </div>
    `,
  });
}

/**
 * Notify a former client that their archived file has reached the end of its
 * retention period and is scheduled for destruction, with how to request a copy.
 */
export async function notifyClientArchiveDestruction(
  toEmail: string,
  opts: { matterTitle: string | null; noticeDays: number }
): Promise<void> {
  if (process.env.BYPASS_AUTH === "true" || !process.env.RESEND_API_KEY) {
    console.log(`[notify] BYPASS or no RESEND_API_KEY — skipping destruction notice to ${toEmail}`);
    return;
  }

  const matter = opts.matterTitle ? `"${opts.matterTitle}"` : "your matter";

  await getResend().emails.send({
    from: FROM_EMAIL,
    to: toEmail,
    subject: "[Crawford Law] Your archived file is scheduled for destruction",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a2e;">Records destruction notice</h2>
        <p>The file for ${matter} has reached the end of its retention period and is
        scheduled to be securely destroyed in <strong>${opts.noticeDays} days</strong>.</p>
        <p>If you would like a copy of your file before it is destroyed, reply to this
        email or contact us at ${ATTORNEY_EMAIL}. After destruction we cannot recover it.</p>
        <p style="font-size: 12px; color: #888; margin-top: 32px; border-top: 1px solid #eee; padding-top: 12px;">
          Crawford Law PLLC · Texas Bar #24148908
        </p>
      </div>
    `,
  });
}

export async function notifyClientDocumentApproved(
  document: Document,
  clientProfile: Profile
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;

  const docLabel = docTypeLabel(document.doc_type);

  await getResend().emails.send({
    from: FROM_EMAIL,
    to: clientProfile.email,
    subject: `Your ${docLabel} is ready — Instant Attorney`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a2e;">Your Document Has Been Reviewed</h2>
        <p>Your <strong>${docLabel}</strong> has been reviewed and approved by Andrew Crawford, Esq. at Crawford Law PLLC.</p>
        <p style="margin: 24px 0;">
          <a href="https://instant-attorney.com/dashboard" style="background: #1a1a2e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            View in Your File →
          </a>
        </p>
        <p style="font-size: 12px; color: #888; margin-top: 32px; border-top: 1px solid #eee; padding-top: 12px;">
          Crawford Law PLLC · Texas Bar #24148908 · This document is attorney-client privileged.
        </p>
      </div>
    `,
  });
}

function fmtCST(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export async function notifyAttorneyConsultRequest(
  consult: ConsultRequest,
  clientProfile: Profile
): Promise<void> {
  if (process.env.BYPASS_AUTH === "true" || !process.env.RESEND_API_KEY) {
    console.log(`[notify] skipping consult-request email for ${consult.id}`);
    return;
  }
  const rows = consult.proposed_times
    .map((t, i) => `<tr${i % 2 === 0 ? "" : ' style="background:#f5f5f5;"'}><td style="padding:8px;font-weight:bold;">Option ${i + 1}</td><td style="padding:8px;">${fmtCST(t)}</td></tr>`)
    .join("");
  await getResend().emails.send({
    from: FROM_EMAIL,
    to: ATTORNEY_EMAIL,
    subject: `[Instant Attorney] New consult request — ${clientProfile.full_name ?? clientProfile.email}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a1a2e;">New Consult Request</h2>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px;font-weight:bold;width:140px;">Client</td><td style="padding:8px;">${clientProfile.full_name ?? "—"} (${clientProfile.email})</td></tr>
          <tr style="background:#f5f5f5;"><td style="padding:8px;font-weight:bold;">Phone</td><td style="padding:8px;">${consult.client_phone ?? "—"}</td></tr>
          ${rows}
          ${consult.notes ? `<tr><td style="padding:8px;font-weight:bold;">Notes</td><td style="padding:8px;">${consult.notes}</td></tr>` : ""}
        </table>
        <p style="margin:24px 0;">
          <a href="https://instant-attorney.com/attorney" style="background:#1a1a2e;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;">
            Review &amp; Confirm →
          </a>
        </p>
        <p style="font-size:12px;color:#888;margin-top:32px;border-top:1px solid #eee;padding-top:12px;">
          Crawford Law PLLC · Texas Bar #24148908
        </p>
      </div>
    `,
  });
}

export async function notifyClientConsultConfirmed(
  consult: ConsultRequest,
  clientProfile: Profile
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  const time = consult.confirmed_time ?? consult.attorney_proposed_time;
  const timeStr = time ? fmtCST(time) : "TBD";
  const isProposed = consult.status === "attorney_proposed";
  await getResend().emails.send({
    from: FROM_EMAIL,
    to: clientProfile.email,
    subject: isProposed
      ? "Attorney proposed a new consult time — Instant Attorney"
      : "Your consult is confirmed — Instant Attorney",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a1a2e;">${isProposed ? "New Time Proposed" : "Consult Confirmed"}</h2>
        ${isProposed
          ? `<p>Andrew Crawford, Esq. has proposed a new time for your consult. Please log in to confirm or request a different time.</p>`
          : `<p>Your 30-minute phone consultation with Andrew Crawford, Esq. is confirmed.</p>`}
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px;font-weight:bold;width:140px;">${isProposed ? "Proposed Time" : "Date &amp; Time"}</td><td style="padding:8px;">${timeStr}</td></tr>
          <tr style="background:#f5f5f5;"><td style="padding:8px;font-weight:bold;">Format</td><td style="padding:8px;">Phone call — Andrew will call you at ${consult.client_phone ?? "the number on file"}</td></tr>
        </table>
        <p style="margin:24px 0;">
          <a href="https://instant-attorney.com/dashboard" style="background:#1a1a2e;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;">
            View in Dashboard →
          </a>
        </p>
        <p style="font-size:12px;color:#888;margin-top:32px;border-top:1px solid #eee;padding-top:12px;">
          Crawford Law PLLC · Texas Bar #24148908 · This communication is attorney-client privileged.
        </p>
      </div>
    `,
  });
}

export async function notifyClientConsultClosingReport(
  consult: ConsultRequest,
  clientProfile: Profile,
  wrapUp: ConsultWrapUp
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  const dispositionLabel = wrapUp.disposition ? CONSULT_DISPOSITION_LABELS[wrapUp.disposition] : null;

  await getResend().emails.send({
    from: FROM_EMAIL,
    to: clientProfile.email,
    subject: "Your consult summary is ready — Instant Attorney",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a1a2e;">Your Consult Summary</h2>
        <p>Andrew Crawford, Esq. has posted a summary of your consult, including next steps and what to expect, to your dashboard.</p>
        ${dispositionLabel ? `<table style="width:100%;border-collapse:collapse;margin:16px 0;"><tr><td style="padding:8px;font-weight:bold;width:140px;">Outcome</td><td style="padding:8px;">${dispositionLabel}</td></tr></table>` : ""}
        <p style="margin:24px 0;">
          <a href="https://instant-attorney.com/dashboard" style="background:#1a1a2e;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;">
            View Your Summary →
          </a>
        </p>
        <p style="font-size:12px;color:#888;margin-top:32px;border-top:1px solid #eee;padding-top:12px;">
          Crawford Law PLLC · Texas Bar #24148908 · This communication is attorney-client privileged.
        </p>
      </div>
    `,
  });
}

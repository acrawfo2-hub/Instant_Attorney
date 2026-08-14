export const SUPPORT_CATEGORIES = [
  "login",
  "password",
  "account_access",
  "billing",
  "technical",
  "other",
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export interface SupportTicketInput {
  email?: unknown;
  category?: unknown;
  subject?: unknown;
  description?: unknown;
  pagePath?: unknown;
  website?: unknown;
}

export interface ValidSupportTicket {
  email: string;
  category: SupportCategory;
  subject: string;
  description: string;
  pagePath: string | null;
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .slice(0, max);
}

export function validateSupportTicket(
  input: SupportTicketInput,
): { ok: true; ticket: ValidSupportTicket } | { ok: false; error: string } {
  // Hidden honeypot field. Humans never see or fill it.
  if (text(input.website, 100))
    return { ok: false, error: "Unable to submit this request." };

  const email = text(input.email, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { ok: false, error: "Enter a valid email address." };
  if (!SUPPORT_CATEGORIES.includes(input.category as SupportCategory))
    return { ok: false, error: "Choose a support category." };

  const subject = text(input.subject, 120);
  if (subject.length < 5) return { ok: false, error: "Add a short subject." };
  const description = text(input.description, 4000);
  if (description.length < 20)
    return {
      ok: false,
      error: "Tell us what happened in at least 20 characters.",
    };
  if (/\b(password|passcode)\s*(is|:|=)\s*\S+/i.test(description)) {
    return {
      ok: false,
      error:
        "Do not include a password or passcode. Describe the error instead.",
    };
  }

  const candidatePath = text(input.pagePath, 240).split(/[?#]/, 1)[0];
  const pagePath =
    candidatePath.startsWith("/") && !candidatePath.startsWith("//")
      ? candidatePath
      : null;
  return {
    ok: true,
    ticket: {
      email,
      category: input.category as SupportCategory,
      subject,
      description,
      pagePath,
    },
  };
}

export function categoryPriority(
  category: SupportCategory,
): "urgent" | "normal" {
  return category === "login" ||
    category === "password" ||
    category === "account_access"
    ? "urgent"
    : "normal";
}

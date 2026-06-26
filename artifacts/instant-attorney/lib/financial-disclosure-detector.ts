// ── Free-chat financial-disclosure detector ──────────────────────────────────
//
// Milestone 2 of docs/financial-picture-spec.md. The free chat (Phase I) is NOT
// privileged, so detailed finances don't belong there. This pure detector spots
// when a user is about to dump account numbers, balances, or a full asset
// rundown into the free chat, so the UI can gently warn them and route the
// financial picture to privileged Phase II.
//
// Tuned to catch real disclosure (identifiers, or asset talk paired with dollar
// amounts) while tolerating ordinary money mentions ("they owe me $500").
//
// Pure + testable. General information, not legal advice.

export interface DisclosureSignal {
  triggered: boolean;
  reasons: string[];
}

// Identifiers that should never be in an unprivileged channel.
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/;
const SSN_WORD_RE = /\bsocial security\b/i;
const ACCOUNT_WORD_RE = /\b(account|routing)\s*(number|no\.?|#)\b/i;
const LONG_DIGITS_RE = /\b\d{9,}\b/; // account-number-like run

// Asset / finance nouns that, paired with a dollar figure, indicate a rundown.
const ASSET_TERMS_RE =
  /\b(401\s?k|403\s?b|ira|roth|pension|annuity|brokerage|checking|savings|bank account|net worth|portfolio|mutual fund|crypto|home equity|retirement account|life insurance)\b/i;
const DOLLARS_RE = /\$\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*\s?(?:dollars|k\b)/i;

// Explicit "here's my financial detail" phrasing.
const RUNDOWN_RE =
  /\b(my balance|account balance|my accounts are|here('?| i)s my (financial|assets|accounts)|list of my (assets|accounts)|my bank statement)\b/i;

/**
 * Whether a piece of free-chat text looks like sensitive financial disclosure
 * that belongs in privileged Phase II rather than the free chat.
 */
export function detectFinancialDisclosure(text: string | null | undefined): DisclosureSignal {
  const reasons: string[] = [];
  if (!text || !text.trim()) return { triggered: false, reasons };

  if (SSN_RE.test(text) || SSN_WORD_RE.test(text)) reasons.push("a Social Security number");
  if (ACCOUNT_WORD_RE.test(text) || LONG_DIGITS_RE.test(text)) reasons.push("an account or routing number");
  if (RUNDOWN_RE.test(text)) reasons.push("a rundown of your accounts");
  if (ASSET_TERMS_RE.test(text) && DOLLARS_RE.test(text)) reasons.push("account balances or asset values");

  // De-duplicate while preserving order.
  const unique = [...new Set(reasons)];
  return { triggered: unique.length > 0, reasons: unique };
}

const NOTICE =
  "Heads up — this free chat isn't covered by attorney-client privilege, so it isn't the place for account numbers, balances, or a full financial rundown. When you're ready, Phase II is the secure, privileged space to map your finances with attorney oversight.";

export function freeChatFinanceNotice(): string {
  return NOTICE;
}

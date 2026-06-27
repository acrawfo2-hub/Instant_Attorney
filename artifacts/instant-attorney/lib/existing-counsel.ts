// ── Existing-counsel intake & disclosures ────────────────────────────────────
//
// When a user already has another attorney, Instant Attorney can still help —
// but only with clear scope (general information in Phase I; limited-scope work
// in Phase II). Pure helpers + copy; general information, not legal advice.

import type { CounselEngagementGoal } from "./types.ts";

export type { CounselEngagementGoal };

export const COUNSEL_ENGAGEMENT_GOALS: CounselEngagementGoal[] = [
  "understand_situation",
  "document_review",
  "prepare_for_meeting",
  "second_opinion",
];

export interface CounselGoalOption {
  value: CounselEngagementGoal;
  label: string;
  description: string;
}

export const COUNSEL_GOAL_OPTIONS: CounselGoalOption[] = [
  {
    value: "understand_situation",
    label: "Understand my situation",
    description: "Plain-English explanation of the legal landscape and my options",
  },
  {
    value: "document_review",
    label: "Review a document",
    description: "A limited look at a contract, letter, or filing with attorney oversight",
  },
  {
    value: "prepare_for_meeting",
    label: "Prepare for a meeting",
    description: "Organize facts and questions before my next conversation with my attorney",
  },
  {
    value: "second_opinion",
    label: "Second opinion on one issue",
    description: "A scoped, limited-scope perspective — not replacing my current counsel",
  },
];

export interface ExistingCounselContext {
  counsel_intake_at?: string | null;
  has_existing_counsel?: boolean | null;
  existing_counsel_name?: string | null;
  counsel_engagement_goal?: CounselEngagementGoal | null;
}

export function isCounselIntakeComplete(ctx: ExistingCounselContext): boolean {
  return !!ctx.counsel_intake_at;
}

export function isValidCounselGoal(value: unknown): value is CounselEngagementGoal {
  return typeof value === "string" && (COUNSEL_ENGAGEMENT_GOALS as string[]).includes(value);
}

export function counselGoalLabel(goal: CounselEngagementGoal | null | undefined): string {
  if (!goal) return "";
  return COUNSEL_GOAL_OPTIONS.find((o) => o.value === goal)?.label ?? goal.replace(/_/g, " ");
}

export function counselGoalDescription(goal: CounselEngagementGoal | null | undefined): string {
  if (!goal) return "";
  return COUNSEL_GOAL_OPTIONS.find((o) => o.value === goal)?.description ?? "";
}

/** Client-facing disclosure when they already have another attorney. */
export function existingCounselDisclosure(hasPrivilege: boolean): string {
  if (hasPrivilege) {
    return (
      "You told us you already have another attorney on this matter. Crawford Law is providing " +
      "limited-scope assistance — not taking over your case and not telling you to ignore your " +
      "current counsel. Talk with your existing attorney before acting on anything here, especially " +
      "if advice could conflict."
    );
  }
  return (
    "If you already have an attorney, this free chat is general legal information only — not a " +
    "second legal opinion and not protected by privilege. Do not paste confidential communications " +
    "from your current lawyer here. Phase II or a consult is the right place for a scoped second " +
    "look under a Crawford Law representation agreement."
  );
}

/** Phase I nudge when the user mentions existing counsel. */
export function freeChatExistingCounselNotice(): string {
  return existingCounselDisclosure(false);
}

/** Phase II banner copy when existing counsel is on file. */
export function phase2ExistingCounselNotice(
  counselName: string | null | undefined,
  goal: CounselEngagementGoal | null | undefined
): string {
  const who = counselName?.trim() ? ` (${counselName.trim()})` : "";
  const goalLabel = counselGoalLabel(goal);
  const goalPart = goalLabel ? ` You asked us to help you: ${goalLabel.toLowerCase()}.` : "";
  return (
    `Limited-scope assistance — you indicated another attorney is already involved${who}.${goalPart} ` +
    "Coordinate with your current counsel before filing, signing, or changing course."
  );
}

export interface CounselMentionSignal {
  triggered: boolean;
  reasons: string[];
}

const EXISTING_COUNSEL_RE =
  /\b(my|our|current|existing|another|outside|different)\s+(attorney|lawyer|counsel|law\s+firm|firm)\b/i;
const REPRESENTED_RE = /\b(represented\s+by|working\s+with\s+(an?\s+)?(attorney|lawyer|firm))\b/i;
const SECOND_OPINION_RE = /\bsecond\s+opinion\b/i;
const PRIOR_COUNSEL_RE = /\bprior\s+counsel\b/i;

/** Detect when free-chat text suggests the user already has counsel. */
export function detectExistingCounselMention(text: string | null | undefined): CounselMentionSignal {
  const reasons: string[] = [];
  if (!text?.trim()) return { triggered: false, reasons };

  if (EXISTING_COUNSEL_RE.test(text)) reasons.push("a reference to existing counsel");
  if (REPRESENTED_RE.test(text)) reasons.push("that you are already represented");
  if (SECOND_OPINION_RE.test(text)) reasons.push("a request for a second opinion");
  if (PRIOR_COUNSEL_RE.test(text)) reasons.push("prior counsel");

  const unique = [...new Set(reasons)];
  return { triggered: unique.length > 0, reasons: unique };
}

/** Mirror structured counsel context into a confirmed-fact line for the attorney file. */
export function counselContextFactLine(ctx: {
  has_existing_counsel: boolean;
  existing_counsel_name?: string | null;
  counsel_engagement_goal?: CounselEngagementGoal | null;
}): string | null {
  if (!ctx.has_existing_counsel) return null;
  const name = ctx.existing_counsel_name?.trim();
  const goal = counselGoalLabel(ctx.counsel_engagement_goal);
  if (name && goal) return `Prior counsel: ${name} — client seeks ${goal.toLowerCase()} (limited scope)`;
  if (name) return `Prior counsel: ${name} — client has existing representation on this matter`;
  if (goal) return `Client has existing counsel — seeks ${goal.toLowerCase()} (limited scope)`;
  return "Client has existing counsel on this matter (limited-scope Instant Attorney assistance requested)";
}

/** Inject block for buildFileContext / prompts. */
export function formatCounselContextForPrompt(ctx: ExistingCounselContext): string[] {
  if (!ctx.counsel_intake_at) {
    return [
      "",
      "EXISTING COUNSEL STATUS: Not yet recorded — ask early whether the client already has an attorney on this matter, what they want from Instant Attorney, and the counsel's name if known.",
    ];
  }

  if (!ctx.has_existing_counsel) {
    return ["", "EXISTING COUNSEL STATUS: Client reports no other attorney on this matter."];
  }

  const lines = [
    "",
    "EXISTING COUNSEL STATUS: Client already has another attorney on this matter.",
    "SCOPE: Limited-scope assistance only — do NOT position Crawford Law as replacing their counsel or contradicting their attorney without flagging the conflict for human review.",
  ];
  if (ctx.existing_counsel_name?.trim()) {
    lines.push(`OTHER COUNSEL: ${ctx.existing_counsel_name.trim()}`);
  }
  if (ctx.counsel_engagement_goal) {
    lines.push(`CLIENT REQUEST FROM INSTANT ATTORNEY: ${counselGoalLabel(ctx.counsel_engagement_goal)} — ${counselGoalDescription(ctx.counsel_engagement_goal)}`);
  }
  return lines;
}

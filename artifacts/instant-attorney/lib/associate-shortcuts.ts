/**
 * Shortcut labels the review workbench renders. Client-safe: no server imports.
 * The associate's actual specialist calls live in associate-tools.ts.
 */

export const ASSOCIATE_SHORTCUTS = [
  {
    id: "adversarial",
    label: "Adversarial review",
    instruction: "Run adversarial review on this revision, then fix the dangerous issues.",
  },
  {
    id: "qa",
    label: "Full QA",
    instruction: "Run full QA on this revision, then fix what you can.",
  },
  {
    id: "placeholders",
    label: "Placeholders & execution",
    instruction: "Run the placeholders and execution checks, then fill or flag what the file already supports.",
  },
  {
    id: "formatting",
    label: "Formatting & filing",
    instruction: "Run formatting and filing checks, then fix what you can without inventing a court.",
  },
  {
    id: "authorities",
    label: "Authorities",
    instruction: "Run the authorities check, then fix or flag unverifiable citations. Do not invent a cite.",
  },
  {
    id: "explain",
    label: "Explain / second opinion",
    instruction: "Critique this revision: what is weak, risky, or missing? Fix the dangerous issues in the same turn.",
  },
] as const;

export type AssociateShortcutId = (typeof ASSOCIATE_SHORTCUTS)[number]["id"];

export function shortcutById(id: string | undefined): (typeof ASSOCIATE_SHORTCUTS)[number] | undefined {
  return ASSOCIATE_SHORTCUTS.find((item) => item.id === id);
}

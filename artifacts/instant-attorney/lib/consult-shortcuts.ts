/**
 * Shortcut labels the consult workbench renders. Client-safe: no server imports.
 * The associate's specialist calls live in consult-associate-tools.ts.
 */

export const CONSULT_SHORTCUTS = [
  {
    id: "brief",
    label: "Case brief",
    instruction: "Load the consult brief snapshot and tell me what matters for this call. Fix the closeout draft if the file already supports it.",
  },
  {
    id: "fee",
    label: "Fee guidance",
    instruction: "Run the existing fee estimate for this file and tell me what to say on the call. Do not invent a quote.",
  },
  {
    id: "closeout",
    label: "Draft closeout",
    instruction: "Draft the closeout report from my notes and transcript, then apply it to the working draft.",
  },
  {
    id: "memo",
    label: "Pre-consult memo",
    instruction: "Generate the pre-consult memo from the Living File, then tell me the weak spots.",
  },
  {
    id: "explain",
    label: "Explain / second opinion",
    instruction: "Critique this consult: what is weak, missing, or not ready to deliver? Fix the closeout draft in the same turn when you have enough.",
  },
] as const;

export type ConsultShortcutId = (typeof CONSULT_SHORTCUTS)[number]["id"];

export function consultShortcutById(id: string | undefined): (typeof CONSULT_SHORTCUTS)[number] | undefined {
  return CONSULT_SHORTCUTS.find((item) => item.id === id);
}

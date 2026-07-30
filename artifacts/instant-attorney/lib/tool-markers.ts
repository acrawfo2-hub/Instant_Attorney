// Client-side helpers for the orchestrator tool-run stream markers. The server
// emits \x02TOOL:<name>:<running|done>\x02 inline while a tool runs; the chat UIs
// strip these from the display and turn them into transient "running…" chips.

export const TOOL_MARKER = /\x02TOOL:([^:]+):(running|done)\x02/g;

export const TOOL_LABELS: Record<string, string> = {
  run_means_test: "Running the Chapter 7 means test",
  estimate_child_support: "Estimating child support",
  screen_pi_sol: "Checking the filing deadline",
  estimate_maintenance: "Screening spousal maintenance",
  assess_defamation: "Screening the defamation claim",
  assess_noncompete: "Screening the non-compete",
  run_what_if: "Building what-if scenarios",
  estimate_property_split: "Estimating the property division",
  possession_schedule: "Building the possession schedule",
  estimate_bankruptcy_exemptions: "Checking exemptions",
  estimate_probate: "Comparing probate options",
  estimate_pi_fault: "Applying comparative fault",
  assess_matter: "Reviewing where the matter stands",
  record_fact: "Saving to the file",
  request_document: "Adding to the checklist",
  resolve_document_request: "Updating your checklist",
  add_government_form: "Adding an official form",
  open_uploaded_document: "Opening your document to edit",
};

/** Remove tool markers (including a trailing partial one still streaming) for display. */
export function stripToolMarkers(text: string): string {
  let out = text.replace(TOOL_MARKER, "");
  const i = out.indexOf("\x02");
  if (i !== -1) out = out.slice(0, i);
  return out;
}

/** Tools with a running marker and no later done marker are still in flight. */
export function activeToolNames(text: string): string[] {
  const running = new Map<string, number>();
  const done = new Map<string, number>();
  const re = new RegExp(TOOL_MARKER.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    (m[2] === "running" ? running : done).set(m[1], m.index);
  }
  const active: string[] = [];
  for (const [name, idx] of running) {
    const d = done.get(name);
    if (d === undefined || d < idx) active.push(name);
  }
  return active;
}

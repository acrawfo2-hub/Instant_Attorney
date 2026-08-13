import type { LabeledAnswer } from "./placeholder-parsing.ts";

// Answers the client saved during the wizard's starter-questions phase, staged to
// be folded into the draft once it lands. `filled` are label/value answers; `note`
// is any free-form addition.
export interface StagedStarter {
  filled: LabeledAnswer[];
  note: string;
}

// Merge a freshly-saved batch of starter answers into whatever is already staged,
// instead of overwriting it. The client can Save more than once — including while
// an earlier fold is still awaiting async work — so a plain overwrite would
// silently drop the earlier batch. Dedupe answers by label (latest value wins),
// and concatenate notes. This is the property that guarantees no staged answer is
// ever lost across rapid multi-save during an in-flight fold.
export function mergeStagedStarter(
  prev: StagedStarter | null,
  filled: LabeledAnswer[],
  note: string
): StagedStarter {
  const mergedByLabel = new Map<string, string>();
  for (const a of prev?.filled ?? []) mergedByLabel.set(a.label, a.value);
  for (const a of filled) mergedByLabel.set(a.label, a.value);
  const mergedNote = [prev?.note, note].filter(Boolean).join("\n");
  return {
    filled: Array.from(mergedByLabel, ([label, value]) => ({ label, value })),
    note: mergedNote,
  };
}

// A minimal mutable holder modelling React's `useRef` so this loop can be unit
// tested without a component.
export interface StagedRef {
  current: StagedStarter | null;
}

// Drain everything staged in `ref`, folding it in via `fold`. Loops so any answers
// staged WHILE an earlier fold was awaiting async work (deterministic fill + AI
// refine pass) are still folded in, instead of being stranded in the ref. Bounded
// to avoid an unlikely runaway loop.
export async function drainStagedStarter(
  ref: StagedRef,
  fold: (staged: StagedStarter) => Promise<void>,
  maxPasses = 5
): Promise<void> {
  for (let pass = 0; pass < maxPasses; pass++) {
    const staged = ref.current;
    ref.current = null;
    if (!staged || (!staged.filled.length && !staged.note)) return;
    await fold(staged);
    // If nothing new was staged during the fold above, we're done.
    if (!ref.current) return;
  }
}

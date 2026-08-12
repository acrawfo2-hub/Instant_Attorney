import type { ParsedDraft } from "@/lib/freestyle-drafts";

export interface PersistedDraft {
  id: string;
  title: string;
}

export interface FailedDraft {
  title: string;
  content: string;
  error: string;
}

export interface DraftPersistenceResult {
  persisted: PersistedDraft[];
  failed: FailedDraft[];
}

export interface DraftPersistenceAdapter {
  /**
   * Receives the whole draft, not just its title: a draft carries a stable
   * draft-id and matching on that rather than the title is what lets a
   * revision be recognised as a revision after a rename.
   */
  find(draft: ParsedDraft): Promise<{ id: string | null; error: unknown }>;
  update(id: string, draft: ParsedDraft): Promise<{ error: unknown }>;
  insert(draft: ParsedDraft): Promise<{ id: string | null; error: unknown }>;
}

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error ?? "Unknown persistence error");

/** Persist every completed model draft independently, retrying each bounded operation. */
export async function persistDrafts(
  drafts: ParsedDraft[],
  adapter: DraftPersistenceAdapter,
  options: { attempts?: number; backoffMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<DraftPersistenceResult> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const backoffMs = options.backoffMs ?? 150;
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const result: DraftPersistenceResult = { persisted: [], failed: [] };

  for (const draft of drafts) {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const found = await adapter.find(draft);
        if (found.error) throw found.error;
        if (found.id) {
          const updated = await adapter.update(found.id, draft);
          if (updated.error) throw updated.error;
          result.persisted.push({ id: found.id, title: draft.title });
        } else {
          const inserted = await adapter.insert(draft);
          if (inserted.error) throw inserted.error;
          if (!inserted.id) throw new Error("Draft insert returned no id");
          result.persisted.push({ id: inserted.id, title: draft.title });
        }
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        if (attempt + 1 < attempts) await sleep(backoffMs * 2 ** attempt);
      }
    }
    if (lastError) result.failed.push({ title: draft.title, content: draft.content, error: errorText(lastError) });
  }
  return result;
}

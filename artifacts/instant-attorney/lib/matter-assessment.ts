import { buildMatterTasks, type MatterTasksResult } from "./matter-tasks.ts";
import type { CaseFile, FactItem, Document, RequestedAttachment, GovFormInstrument } from "./types.ts";

// Shared data-loading for the matter synthesizer, used by both the
// /api/assess-matter endpoint and the assess_matter orchestrator tool. Keeps the
// pure transform (buildMatterTasks) separate from the DB read.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Load a case's data and build its bucketed, ranked task view. */
export async function loadMatterTasks(db: Db, caseFileId: string): Promise<MatterTasksResult | null> {
  const [{ data: cfRow }, { data: factRows }, { data: docRows }, { data: reqRows }, { data: formRows }] =
    await Promise.all([
      db.from("case_files").select("*").eq("id", caseFileId).single(),
      db.from("fact_items").select("*").eq("case_file_id", caseFileId),
      db.from("documents").select("*").eq("case_file_id", caseFileId),
      db.from("requested_attachments").select("*").eq("case_file_id", caseFileId),
      db.from("form_instruments").select("*").eq("case_file_id", caseFileId),
    ]);

  const caseFile = cfRow as CaseFile | null;
  if (!caseFile) return null;

  return buildMatterTasks({
    caseFile,
    facts: (factRows ?? []) as FactItem[],
    documents: (docRows ?? []) as Document[],
    requestedAttachments: (reqRows ?? []) as RequestedAttachment[],
    govForms: (formRows ?? []) as GovFormInstrument[],
    mode: "client",
  });
}

/** Render the bucketed tasks as a compact block for a model to read. */
export function formatMatterTasks(tasks: MatterTasksResult): string {
  const listFor = (label: string, items: MatterTasksResult["all"]) =>
    items.length
      ? `${label}:\n${items
          .map((t) => `- ${t.title}${t.blockedBy?.length ? ` (waiting on: ${t.blockedBy.join(", ")})` : ""}`)
          .join("\n")}`
      : "";
  return [
    listFor("DOABLE NOW", tasks.doableNow),
    listFor("BLOCKED", tasks.blocked),
    listFor("DONE", tasks.done),
  ].filter(Boolean).join("\n\n");
}

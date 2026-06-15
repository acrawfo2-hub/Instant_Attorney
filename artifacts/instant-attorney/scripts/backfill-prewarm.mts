import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

for (const line of readFileSync(join(__dirname, "..", ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!m) continue;
  const key = m[1];
  let val = m[2].trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

const { createClient } = await import("@supabase/supabase-js");
const { triggerPreWarm } = await import("../lib/pre-warm.ts");

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const targets = [
  {
    email: "vicky.crawford12@gmail.com",
    caseFileId: "ba7d20f0-fdd1-4bc1-bdbc-63bbd88c4b5c",
    userId: "b15e54d5-c9af-495c-beee-845d87d3fd48",
    wizardType: "draft_contract" as const,
  },
  {
    email: "acrawfo2@gmail.com",
    caseFileId: "84fb7333-6c89-4238-9b21-cbd58cc44b5e",
    userId: "476c0481-e4b9-4089-bd6b-b97eab2b95dc",
    wizardType: "draft_contract" as const,
  },
];

for (const t of targets) {
  console.log(`\n=== Backfilling ${t.email} (${t.wizardType}) ===`);
  await triggerPreWarm(db, t.caseFileId, t.userId, t.wizardType);

  const { data: docs } = await db
    .from("documents")
    .select("id,status,doc_type,title,draft_text")
    .eq("case_file_id", t.caseFileId);

  for (const d of docs ?? []) {
    const len = d.draft_text ? String(d.draft_text).length : 0;
    console.log(`  doc ${d.id} status=${d.status} type=${d.doc_type} draft_chars=${len}`);
  }
}

console.log("\nDone.");
process.exit(0);

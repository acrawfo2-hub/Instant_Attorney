/**
 * Provision and tear down isolated Supabase rows for Playwright API tests.
 * Pattern adapted from scripts/e2e-t002.mjs — no AI, no Stripe.
 */

import {
  cookieHeaderFrom,
  getBaseUrl,
  getServiceRoleKey,
  getSupabaseUrl,
} from "./env";

export interface ProvisionedClient {
  email: string;
  password: string;
  userId: string;
  caseFileId: string;
  documentId: string;
  sessionCookie: string;
}

function svcHeaders() {
  const key = getServiceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function restInsert<T extends Record<string, unknown>>(
  table: string,
  row: T | T[]
): Promise<unknown[]> {
  const r = await fetch(`${getSupabaseUrl()}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...svcHeaders(), Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`insert ${table} -> ${r.status}: ${text}`);
  return JSON.parse(text) as unknown[];
}

async function restUpsert<T extends Record<string, unknown>>(
  table: string,
  row: T,
  onConflict: string
): Promise<unknown[]> {
  const r = await fetch(
    `${getSupabaseUrl()}/rest/v1/${table}?on_conflict=${onConflict}`,
    {
      method: "POST",
      headers: {
        ...svcHeaders(),
        Prefer: "return=representation,resolution=merge-duplicates",
      },
      body: JSON.stringify(row),
    }
  );
  const text = await r.text();
  if (!r.ok) throw new Error(`upsert ${table} -> ${r.status}: ${text}`);
  return JSON.parse(text) as unknown[];
}

async function restDelete(table: string, filter: string): Promise<void> {
  const r = await fetch(`${getSupabaseUrl()}/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: svcHeaders(),
  });
  if (!r.ok && r.status !== 404) {
    const text = await r.text();
    console.warn(`delete ${table} -> ${r.status}: ${text}`);
  }
}

/** Create a confirmed user with onboarding rows and a seeded draft document. */
export async function provisionClientWithDraft(): Promise<ProvisionedClient> {
  const email = `pw-e2e-${Date.now()}@instant-attorney-test.dev`;
  const password = `Pw!${Math.random().toString(36).slice(2)}${Date.now()}`;

  const cu = await fetch(`${getSupabaseUrl()}/auth/v1/admin/users`, {
    method: "POST",
    headers: svcHeaders(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const cuText = await cu.text();
  if (!cu.ok) throw new Error(`admin create user -> ${cu.status}: ${cuText}`);
  const userId = (JSON.parse(cuText) as { id: string }).id;

  await restUpsert(
    "profiles",
    { id: userId, email, full_name: "Playwright E2E" },
    "id"
  );
  await restUpsert(
    "subscriptions",
    { user_id: userId, status: "active", plan: "phase2" },
    "user_id"
  );
  await restInsert("ai_consents", { user_id: userId });
  await restInsert("representation_agreements", {
    user_id: userId,
    signature_name: "Playwright E2E",
  });

  const caseRows = (await restInsert("case_files", {
    user_id: userId,
    matter_type: "reactive",
    matter_subtype: "consumer_dispute",
    status: "open",
    goals: ["Recover a deposit from a contractor who abandoned the job."],
  })) as { id: string }[];
  const caseFileId = caseRows[0].id;

  const docRows = (await restInsert("documents", {
    case_file_id: caseFileId,
    user_id: userId,
    doc_type: "demand_letter",
    title: "Demand Letter — Playwright Fixture",
    status: "draft",
    draft_text:
      "Dear Contractor,\n\nThis letter demands the immediate return of the $4,200 deposit.\n\nSincerely,\nClient",
    content_json: {},
  })) as { id: string }[];
  const documentId = docRows[0].id;

  const login = await fetch(`${getBaseUrl()}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  const sessionCookie = cookieHeaderFrom(login);
  if (login.status !== 200 || !sessionCookie) {
    throw new Error(`login failed: status=${login.status}`);
  }

  return {
    email,
    password,
    userId,
    caseFileId,
    documentId,
    sessionCookie,
  };
}

/** Best-effort cleanup after a provisioned client test. */
export async function cleanupProvisionedClient(
  client: Pick<ProvisionedClient, "userId" | "caseFileId">
): Promise<void> {
  if (client.caseFileId) {
    await restDelete("documents", `case_file_id=eq.${client.caseFileId}`);
    await restDelete("case_files", `id=eq.${client.caseFileId}`);
  }
  if (client.userId) {
    await fetch(`${getSupabaseUrl()}/auth/v1/admin/users/${client.userId}`, {
      method: "DELETE",
      headers: svcHeaders(),
    });
  }
}

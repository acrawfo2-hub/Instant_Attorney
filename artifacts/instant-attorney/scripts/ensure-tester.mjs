#!/usr/bin/env node
/**
 * Provision or repair a QA tester account end to end, without depending on
 * transactional email arriving.
 *
 * Creates the auth user if missing, marks the email confirmed, optionally sets
 * a known password, ensures the profiles row, and grants the always-paid
 * `bypass` subscription that every subscription gate in the app checks.
 *
 * Usage (from artifacts/instant-attorney):
 *   node scripts/ensure-tester.mjs vicky.crawford12@gmail.com
 *   node scripts/ensure-tester.mjs vicky.crawford12@gmail.com --password 'NewPass123!'
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
 * environment (both are in .env.local).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnvLocal() {
  try {
    for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const value = m[2].trim().replace(/^["']|["']$/g, "").replace(/\s+#.*$/, "");
      if (!process.env[m[1]]) process.env[m[1]] = value;
    }
  } catch {
    // No .env.local — rely on the ambient environment.
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const args = process.argv.slice(2);
const email = (args.find((a) => !a.startsWith("--")) ?? "").trim().toLowerCase();
const pwIndex = args.indexOf("--password");
const password = pwIndex >= 0 ? args[pwIndex + 1] : null;

if (!email) {
  console.error("Usage: node scripts/ensure-tester.mjs <email> [--password <password>]");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

async function findUserByEmail(target) {
  const perPage = 200;
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
  return null;
}

let user = await findUserByEmail(email);

if (!user) {
  if (!password) {
    console.error(
      `No account exists for ${email}. Re-run with --password '<password>' to create one.`
    );
    process.exit(1);
  }
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    console.error(`Could not create the account: ${error.message}`);
    process.exit(1);
  }
  user = data.user;
  console.log(`Created account ${email} (${user.id}), email pre-confirmed.`);
} else {
  const updates = {};
  if (!user.email_confirmed_at) updates.email_confirm = true;
  if (password) updates.password = password;
  if (Object.keys(updates).length) {
    const { error } = await db.auth.admin.updateUserById(user.id, updates);
    if (error) {
      console.error(`Could not update the account: ${error.message}`);
      process.exit(1);
    }
    console.log(
      `Updated ${email}: ${[
        updates.email_confirm ? "email confirmed" : null,
        updates.password ? "password set" : null,
      ]
        .filter(Boolean)
        .join(", ")}.`
    );
  } else {
    console.log(`${email} already exists and is confirmed.`);
  }
}

// profiles row — subscriptions.user_id references it, so this must land first.
const { data: profile } = await db.from("profiles").select("id").eq("id", user.id).maybeSingle();
if (!profile) {
  const { error } = await db.from("profiles").insert({
    id: user.id,
    email,
    full_name: user.user_metadata?.full_name ?? "",
  });
  if (error) {
    console.error(`Could not create the profile row: ${error.message}`);
    process.exit(1);
  }
  console.log("Created the missing profiles row.");
}

// Always-paid bypass subscription.
const { data: sub } = await db
  .from("subscriptions")
  .select("status, plan")
  .eq("user_id", user.id)
  .maybeSingle();

if (sub && ["active", "trialing", "bypass"].includes(sub.status)) {
  console.log(`Subscription already active (status=${sub.status}, plan=${sub.plan}).`);
} else {
  const { error } = await db
    .from("subscriptions")
    .upsert(
      { user_id: user.id, status: "bypass", plan: "phase2", current_period_end: null },
      { onConflict: "user_id" }
    );
  if (error) {
    console.error(
      `Could not grant the bypass subscription: ${error.message}\n` +
        "If this mentions a check constraint, run supabase/schema-stage46-auth-access-repair.sql first."
    );
    process.exit(1);
  }
  console.log("Granted bypass/phase2 subscription.");
}

console.log(`\n${email} is ready to sign in.`);

-- Instant Attorney — Stage 24 Schema Additions
-- Run this AFTER schema-stage23-financial-picture.sql in the Supabase SQL editor.
--
-- Milestone 5 of the Financial Picture spec: the encrypted identifier vault.
-- Raw identifiers (SSNs, full account/routing/policy numbers) are never stored
-- in financial_items and never sent to the model. When one is genuinely needed
-- (at filing time), it is AES-256-GCM encrypted in the app (lib/secure-vault.ts)
-- under FINANCIAL_VAULT_KEY and stored here, apart from everything else. Only the
-- `last4` is ever shown to the client; the ciphertext is decrypted only by
-- attorney/drafting server code.
--
-- Idempotent — safe to re-run.

create table if not exists financial_secure_ref (
  id                  uuid default gen_random_uuid() primary key,
  financial_item_id   uuid references financial_items(id) on delete cascade not null,
  user_id             uuid references profiles(id) on delete cascade not null,
  kind                text not null
    check (kind in ('ssn', 'account_number', 'routing_number', 'policy_number', 'other')),
  -- AES-256-GCM blob ("v1:iv:tag:ciphertext"). Never returned to clients.
  ciphertext          text not null,
  -- Redacted tail for display only (e.g. "4321"). Safe to surface.
  last4               text,
  key_version         text not null default 'v1',
  created_at          timestamptz default now() not null,
  updated_at          timestamptz default now() not null
);

create index if not exists financial_secure_ref_item_idx on financial_secure_ref (financial_item_id);

alter table financial_secure_ref enable row level security;

-- NO client policies, by design: this is the most sensitive table in the system.
-- All access is service-role only, through dedicated API routes that (a) verify
-- ownership and return only `last4`/`kind` to the client, and (b) decrypt the
-- ciphertext exclusively for attorney/drafting use at filing time. This mirrors
-- the service-role-only posture of stripe_webhook_events. The ciphertext is
-- never exposed to a user JWT and never enters a model prompt.

-- Instant Attorney — Stage 32 Schema Additions
-- Run this AFTER schema-stage31-case-messages.sql in the Supabase SQL editor
--
-- Fill-the-actual-PDF workflow: a client downloads a government form from its
-- official source, uploads the blank PDF here, and Instant Attorney fills it
-- from the answers already collected by the guided form-instrument interview
-- (schema-stage10.sql). Two flavors of PDF exist in the wild:
--   'acroform' — a real fillable PDF with named form fields; we can map those
--                fields to our GovFormField list and write values directly.
--   'flat'     — a print-and-fill PDF with no embedded fields; auto-fill is
--                not supported yet (needs a hand-built coordinate overlay per
--                form/revision — tracked as later work), so we stop at
--                'unsupported' and point the client back at the blank PDF.

-- ── Supabase Storage: gov-form-templates bucket ─────────────────────────────
insert into storage.buckets (id, name, public)
values ('gov-form-templates', 'gov-form-templates', false)
on conflict (id) do nothing;

-- Path layout: {userId}/{caseFileId}/{formInstrumentId}-{fileName}
drop policy if exists "users_upload_own_form_templates" on storage.objects;
create policy "users_upload_own_form_templates"
  on storage.objects for insert
  with check (
    bucket_id = 'gov-form-templates'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "users_read_own_form_templates" on storage.objects;
create policy "users_read_own_form_templates"
  on storage.objects for select
  using (
    bucket_id = 'gov-form-templates'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "attorneys_read_all_form_templates" on storage.objects;
create policy "attorneys_read_all_form_templates"
  on storage.objects for select
  using (
    bucket_id = 'gov-form-templates'
    and exists (
      select 1 from profiles where id = auth.uid() and is_attorney = true
    )
  );

-- ── form_instruments: PDF template state ────────────────────────────────────
alter table form_instruments
  add column if not exists pdf_status text
    check (pdf_status is null or pdf_status in
      ('needs_template', 'mapping', 'ready', 'unsupported')),
  add column if not exists pdf_mode text
    check (pdf_mode is null or pdf_mode in ('acroform', 'flat')),
  add column if not exists pdf_template_path text,
  -- GovFormField.name -> PDF AcroForm field name, auto-derived by label/tooltip
  -- similarity and client-confirmable before first fill. Null until a template
  -- is uploaded; null forever for 'flat' forms (no fields to map).
  add column if not exists pdf_field_map jsonb;

comment on column form_instruments.pdf_status is
  'Lifecycle of the uploaded PDF template: needs_template (none uploaded yet) -> mapping (acroform, field map awaiting confirmation) -> ready (fillable) -> unsupported (flat/scanned, no auto-fill yet).';
comment on column form_instruments.pdf_mode is
  'Detected shape of the uploaded template: acroform (has named form fields) or flat (no fields, would need coordinate overlay).';

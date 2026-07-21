-- Instant Attorney — Schema verification
-- Run AFTER all migration stages (schema.sql through schema-stage37-home-state.sql).
-- Every row should show status = OK.

select 'profiles' as object, case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profiles'
) then 'OK' else 'MISSING' end as status
union all select 'subscriptions', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'subscriptions'
) then 'OK' else 'MISSING' end
union all select 'subscriptions_user_id_unique', case when exists (
  select 1 from pg_indexes where indexname = 'subscriptions_user_id_unique'
) then 'OK' else 'MISSING' end
union all select 'case_files', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'case_files'
) then 'OK' else 'MISSING' end
union all select 'documents', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'documents'
) then 'OK' else 'MISSING' end
union all select 'attachments', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'attachments'
) then 'OK' else 'MISSING' end
union all select 'requested_attachments', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'requested_attachments'
) then 'OK' else 'MISSING' end
union all select 'consult_requests', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'consult_requests'
) then 'OK' else 'MISSING' end
union all select 'case_files.title', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'case_files' and column_name = 'title'
) then 'OK' else 'MISSING' end
union all select 'case_files.file_type', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'case_files' and column_name = 'file_type'
) then 'OK' else 'MISSING' end
union all select 'case_files.archived status', case when exists (
  select 1 from information_schema.check_constraints
  where constraint_name = 'case_files_status_check'
    and check_clause like '%archived%'
) then 'OK' else 'MISSING' end
union all select 'documents.submitted_at', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'documents' and column_name = 'submitted_at'
) then 'OK' else 'MISSING' end
union all select 'documents.review_status', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'documents' and column_name = 'review_status'
) then 'OK' else 'MISSING' end
union all select 'profiles.auto_document_review', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles' and column_name = 'auto_document_review'
) then 'OK' else 'MISSING' end
union all select 'documents.parent_document_id', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'documents' and column_name = 'parent_document_id'
) then 'OK' else 'MISSING' end
union all select 'documents.attorney_second_draft_prompt', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'documents' and column_name = 'attorney_second_draft_prompt'
) then 'OK' else 'MISSING' end
union all select 'case_files.pre_consult_memo', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'case_files' and column_name = 'pre_consult_memo'
) then 'OK' else 'MISSING' end
union all select 'usage_events', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'usage_events'
) then 'OK' else 'MISSING' end
union all select 'usage_period_totals', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'usage_period_totals'
) then 'OK' else 'MISSING' end
union all select 'financial_secure_ref', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'financial_secure_ref'
) then 'OK' else 'MISSING' end
union all select 'roadmap_snapshots', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'roadmap_snapshots'
) then 'OK' else 'MISSING' end
union all select 'consult_requests.wrap_up_draft', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'consult_requests' and column_name = 'wrap_up_draft'
) then 'OK' else 'MISSING' end
union all select 'consult_requests.fee_estimate_draft', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'consult_requests' and column_name = 'fee_estimate_draft'
) then 'OK' else 'MISSING' end
union all select 'what_if_sessions', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'what_if_sessions'
) then 'OK' else 'MISSING' end
union all select 'financial_items', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'financial_items'
) then 'OK' else 'MISSING' end
union all select 'top_up_ledger', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'top_up_ledger'
) then 'OK' else 'MISSING' end
union all select 'matter_archives', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'matter_archives'
) then 'OK' else 'MISSING' end
union all select 'document_deliveries', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'document_deliveries'
) then 'OK' else 'MISSING' end
union all select 'fact_items.kind', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'fact_items' and column_name = 'kind'
) then 'OK' else 'MISSING' end
union all select 'documents.facts_synced_at', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'documents' and column_name = 'facts_synced_at'
) then 'OK' else 'MISSING' end
union all select 'consult_notes', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'consult_notes'
) then 'OK' else 'MISSING' end
union all select 'consult_recordings', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'consult_recordings'
) then 'OK' else 'MISSING' end
union all select 'consult_requests.session_started_at', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'consult_requests' and column_name = 'session_started_at'
) then 'OK' else 'MISSING' end
union all select 'consult_requests.recording_consent_at', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'consult_requests' and column_name = 'recording_consent_at'
) then 'OK' else 'MISSING' end
union all select 'case_brainstorm_messages', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'case_brainstorm_messages'
) then 'OK' else 'MISSING' end
union all select 'document_comments', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'document_comments'
) then 'OK' else 'MISSING' end
union all select 'case_messages', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'case_messages'
) then 'OK' else 'MISSING' end
union all select 'attorney_subscriber_agreements', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'attorney_subscriber_agreements'
) then 'OK' else 'MISSING' end
union all select 'profiles.account_type', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles' and column_name = 'account_type'
) then 'OK' else 'MISSING' end
union all select 'profiles.home_state', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles' and column_name = 'home_state'
) then 'OK' else 'MISSING' end
union all select 'form_instruments.pdf_status', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'form_instruments' and column_name = 'pdf_status'
) then 'OK' else 'MISSING' end
union all select 'case_files.counsel_intake_at', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'case_files' and column_name = 'counsel_intake_at'
) then 'OK' else 'MISSING' end
union all select 'document_executions', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'document_executions'
) then 'OK' else 'MISSING' end
union all select 'form_verifications', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'form_verifications'
) then 'OK' else 'MISSING' end
union all select 'case_files.chat_mode', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'case_files' and column_name = 'chat_mode'
) then 'OK' else 'MISSING' end
union all select 'attorney_workspace_messages', case when exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name = 'attorney_workspace_messages'
) then 'OK' else 'MISSING' end
union all select 'case_files.last_file_synced_at', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'case_files' and column_name = 'last_file_synced_at'
) then 'OK' else 'MISSING' end
union all select 'ai_consents.signature_name', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'ai_consents' and column_name = 'signature_name'
) then 'OK' else 'MISSING' end
order by object;

-- Instant Attorney — Schema verification
-- Run AFTER all migration stages (schema.sql through schema-stage7.sql).
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
order by object;

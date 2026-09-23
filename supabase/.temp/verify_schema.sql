SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations) AS applied_migrations,
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE') AS public_tables,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS rls_policies,
  (SELECT count(*) FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'get_user_role','get_user_institution','is_global_user',
      'initiate_transfer','accept_transfer','close_case','reopen_case',
      'create_student','update_attention','create_attention',
      'can_manage_surveys','can_create_attention','get_license_status',
      'preview_promotion','get_document_url','list_student_documents'
    )) AS key_functions,
  (SELECT count(*) FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity) AS rls_enabled_tables;

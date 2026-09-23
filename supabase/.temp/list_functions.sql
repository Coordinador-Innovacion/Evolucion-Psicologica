SELECT n.nspname || '.' || p.proname AS fn,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_user_role','get_user_institution','is_global_user',
    'initiate_transfer','accept_transfer','close_case','reopen_case',
    'create_student','update_attention','create_attention',
    'can_manage_surveys','can_create_attention','get_license_status',
    'preview_promotion','get_document_url','list_student_documents',
    'can_manage_case','handle_new_user'
  )
ORDER BY 1;

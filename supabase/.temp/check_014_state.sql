SELECT 'perfiles' AS obj, to_regclass('public.perfiles') IS NOT NULL AS exists
UNION ALL SELECT 'get_user_role', to_regprocedure('public.get_user_role()') IS NOT NULL
UNION ALL SELECT 'pol_student_diag', EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='diagnosticos_anuales' AND policyname='Student can view own diagnostic'
)
UNION ALL SELECT 'pol_inst_global', EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='institutions' AND policyname='Global users can view all institutions'
)
UNION ALL SELECT 'table_institutions', to_regclass('public.institutions') IS NOT NULL
UNION ALL SELECT 'table_documentos', to_regclass('public.documentos') IS NOT NULL
UNION ALL SELECT 'table_casos', to_regclass('public.casos') IS NOT NULL;

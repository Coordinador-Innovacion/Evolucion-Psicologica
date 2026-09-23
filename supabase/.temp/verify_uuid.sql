SELECT n.nspname AS schema, p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'uuid_generate_v4'
ORDER BY 1;

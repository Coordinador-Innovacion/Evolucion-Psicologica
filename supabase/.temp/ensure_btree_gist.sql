CREATE EXTENSION IF NOT EXISTS "btree_gist";
SELECT e.extname, n.nspname
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE e.extname IN ('btree_gist', 'uuid-ossp', 'pgcrypto')
ORDER BY 1;

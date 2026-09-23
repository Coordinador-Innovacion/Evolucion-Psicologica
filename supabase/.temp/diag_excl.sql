CREATE TEMP TABLE _diag_excl AS
SELECT c.conname, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE t.relname = 'periodos_escolares'
  AND n.nspname = 'public'
  AND c.contype = 'x';

GRANT SELECT ON _diag_excl TO authenticated;
SELECT conname, def FROM _diag_excl;

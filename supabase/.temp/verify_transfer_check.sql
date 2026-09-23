SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'transferencias'::regclass
  AND conname = 'transferencias_status_check';

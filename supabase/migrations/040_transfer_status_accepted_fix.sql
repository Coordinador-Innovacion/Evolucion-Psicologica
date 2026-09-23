-- Migración 040: transferencias — CHECK de status acepta 'accepted'
-- Evolución Psicológica
--
-- Contradicción detectada en T62:
--   - 009_transfers.sql define CHECK status IN ('pending','approved','rejected','completed')
--   - 019_transfer_flow_fix.sql (regla confirmada: A inicia, B acepta) usa status = 'accepted'
--     y considera activas ('pending','accepted').
-- Sin este fix, accept_transfer() viola el CHECK y no puede completarse.
--
-- Se conservan los valores históricos approved/rejected/completed por compatibilidad.

ALTER TABLE transferencias
    DROP CONSTRAINT IF EXISTS transferencias_status_check;

ALTER TABLE transferencias
    ADD CONSTRAINT transferencias_status_check
    CHECK (status IN ('pending', 'accepted', 'approved', 'rejected', 'completed'));

COMMENT ON CONSTRAINT transferencias_status_check ON transferencias IS
'Estados de transferencia. Vigente (019): pending → accepted. Valores antiguos (009/016/017) se mantienen por histórico.';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'transferencias_status_check'
        AND conrelid = 'transferencias'::regclass
    ) THEN
        RAISE EXCEPTION 'Error: constraint transferencias_status_check no fue recreado';
    END IF;
END $$;

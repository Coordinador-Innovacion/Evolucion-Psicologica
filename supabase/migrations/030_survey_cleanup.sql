-- Migración 030: Limpieza de diagnóstico anual
-- Evolución Psicológica — Reemplazo por Motor de Encuestas

-- ============================================================
-- ELIMINAR OBJETOS DEL MÓDULO OBSOLETO
-- ============================================================

-- 1. Eliminar triggers de auditoría (si existen)
DROP TRIGGER IF EXISTS audit_diagnosticos_anuales ON diagnosticos_anuales;

-- 2. Eliminar vistas seguras de diagnóstico
DROP VIEW IF EXISTS v_diagnosticos_coordinador;
DROP VIEW IF EXISTS v_diagnosticos_clinico;

-- 3. Eliminar RLS policies de diagnosticos_anuales
DROP POLICY IF EXISTS "Global can view all diagnostics" ON diagnosticos_anuales;
DROP POLICY IF EXISTS "Psychologist can view all diagnostics" ON diagnosticos_anuales;
DROP POLICY IF EXISTS "Coordinator can view institutional diagnostics" ON diagnosticos_anuales;
DROP POLICY IF EXISTS "Student can view own diagnostic" ON diagnosticos_anuales;
DROP POLICY IF EXISTS "Student can create own diagnostic" ON diagnosticos_anuales;
DROP POLICY IF EXISTS "Student can update own diagnostic" ON diagnosticos_anuales;
DROP POLICY IF EXISTS "Global and Psychologist can manage all diagnostics" ON diagnosticos_anuales;

-- 4. Eliminar trigger de updated_at
DROP TRIGGER IF EXISTS update_diagnosticos_anuales_updated_at ON diagnosticos_anuales;

-- 5. Eliminar la tabla
DROP TABLE IF EXISTS diagnosticos_anuales CASCADE;

-- ============================================================
-- CONFIRMACIÓN
-- ============================================================

-- Verificar que la tabla fue eliminada
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'diagnosticos_anuales'
    ) THEN
        RAISE EXCEPTION 'Error: La tabla diagnosticos_anuales no fue eliminada';
    END IF;
END $$;

-- Verificar que las vistas fueron eliminadas
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.views
        WHERE table_name IN ('v_diagnosticos_coordinador', 'v_diagnosticos_clinico')
    ) THEN
        RAISE EXCEPTION 'Error: Las vistas de diagnóstico no fueron eliminadas';
    END IF;
END $$;

-- Log de limpieza
-- auth.uid() es NULL en el runner de migraciones; user_id es NOT NULL en auditoria.
-- Se usa un UUID de sistema para el evento de migración (no un usuario real).
INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'CLEANUP',
    'diagnosticos_anuales',
    NULL,
    json_build_object(
        'action', 'Módulo de diagnóstico anual eliminado',
        'reason', 'Reemplazado por Motor de Encuestas Institucionales',
        'migration', '030_survey_cleanup.sql'
    )
);

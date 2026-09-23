-- Migración 038: Caso — flujo de estados e historial (corrección T54)
-- Evolución Psicológica
--
-- Defectos detectados al cerrar la UX de Caso (T54), verificados contra
-- SPECIFY (Caso) y CONVERGE (sección Caso):
--
-- 1) trigger_case_first_attention solo transitaba Inicio → En proceso cuando
--    era la PRIMERA atención de la vida del caso (count = 1). Después de una
--    reapertura (Cerrado → Inicio) la primera atención NUEVA no transitaba a
--    En proceso, por lo que el caso quedaba en Inicio con atenciones:
--    SPECIFY: "Reapertura confirmada: Cerrado → Inicio; primera nueva Atención
--    → En proceso."
--
-- 2) close_case insertaba una fila NUEVA en caso_responsables_historial con
--    desde = opened_at sin cerrar la fila abierta que pudo crear reopen_case
--    (desde = NOW, hasta NULL). Resultado: dos filas del mismo responsable con
--    una quedando hasta NULL, y la UX mostraba "Activo" en un caso cerrado.
--    PLAN: "Historial de responsables con desde/hasta".
--
-- Ambas correcciones son la aplicación literal de reglas ya existentes; no
-- introducen reglas de negocio nuevas.

-- ============================================================
-- 1) TRIGGER — Inicio → En proceso con la primera atención
--    (ya sea la primera del caso o la primera tras reapertura)
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_case_first_attention()
RETURNS TRIGGER AS $$
DECLARE
    v_caso RECORD;
    v_attention_count BIGINT;
BEGIN
    SELECT * INTO v_caso FROM casos WHERE id = NEW.caso_id;

    IF v_caso IS NULL THEN
        RAISE EXCEPTION 'Caso no encontrado: %', NEW.caso_id;
    END IF;

    -- Cerrado: no admite atenciones (aborta el INSERT y lo audita el servidor)
    IF v_caso.estado = 'cerrado' THEN
        RAISE EXCEPTION 'No se puede crear una atención en un caso cerrado. Reabra el caso primero.';
    END IF;

    -- Inicio → En proceso con la primera atención disponible
    -- (count = 1: primera del caso; count > 1: primera tras reapertura)
    IF v_caso.estado = 'inicio' THEN
        SELECT COUNT(*) INTO v_attention_count
        FROM atenciones WHERE caso_id = NEW.caso_id;

        UPDATE casos
        SET estado = 'en_proceso',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.caso_id;

        INSERT INTO auditoria (
            user_id, action, table_name, record_id,
            old_values, new_values
        ) VALUES (
            NEW.created_by,
            'case_auto_transition',
            'casos',
            NEW.caso_id,
            json_build_object('estado', 'inicio'),
            json_build_object(
                'estado', 'en_proceso',
                'trigger', CASE WHEN v_attention_count = 1
                                THEN 'first_attention'
                                ELSE 'first_attention_after_reopen' END
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_case_first_attention ON atenciones;
CREATE TRIGGER trg_case_first_attention
    AFTER INSERT ON atenciones
    FOR EACH ROW
    EXECUTE FUNCTION trigger_case_first_attention();

COMMENT ON FUNCTION trigger_case_first_attention() IS
'Al insertar una atención en un caso Inicio, lo transiciona a En proceso (primera atención del caso o primera tras reapertura). Aborta si el caso está Cerrado. T29/T54.';

-- ============================================================
-- 2) close_case — cerrar la fila abierta del historial (desde/hasta)
-- ============================================================

CREATE OR REPLACE FUNCTION close_case(
    p_case_id UUID,
    p_close_reason TEXT
)
RETURNS JSON AS $$
DECLARE
    v_caso RECORD;
    v_user_role TEXT;
    v_user_institution UUID;
    v_old_estado TEXT;
    v_open_row_id UUID;
BEGIN
    -- 1. Obtener usuario
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no autenticado');
    END IF;

    -- 2. Solo Psicólogo y Global pueden cerrar casos
    IF v_user_role NOT IN ('global', 'psicologo') THEN
        RETURN json_build_object('success', false, 'error', 'Solo Psicólogo o Global pueden cerrar casos');
    END IF;

    -- 3. Obtener el caso
    SELECT * INTO v_caso FROM casos WHERE id = p_case_id;

    IF v_caso IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Caso no encontrado');
    END IF;

    -- 4. Verificar institución (si no es Global)
    IF v_user_role != 'global' THEN
        IF NOT EXISTS (
            SELECT 1 FROM periodos_escolares ps
            WHERE ps.student_id = v_caso.student_id
            AND ps.institution_id = v_user_institution
            AND ps.end_date IS NULL
        ) THEN
            RETURN json_build_object('success', false, 'error', 'El caso no pertenece a su institución');
        END IF;
    END IF;

    -- 5. Verificar que el caso no esté ya cerrado
    IF v_caso.estado = 'cerrado' THEN
        RETURN json_build_object('success', false, 'error', 'El caso ya está cerrado');
    END IF;

    -- 6. Validar motivo
    IF p_close_reason IS NULL OR TRIM(p_close_reason) = '' THEN
        RETURN json_build_object('success', false, 'error', 'El motivo de cierre es obligatorio');
    END IF;

    -- 7. Cerrar caso
    v_old_estado := v_caso.estado;

    UPDATE casos
    SET estado = 'cerrado',
        closed_at = CURRENT_TIMESTAMP,
        close_reason = p_close_reason,
        current_responsible_id = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_case_id;

    -- 8. Cerrar el historial de responsables (desde/hasta sin solapamientos)
    IF v_caso.current_responsible_id IS NOT NULL THEN
        -- Si existe una fila abierta del responsable actual (p. ej. creada por
        -- reopen_case o por transferencia), se cierra esa fila.
        SELECT id INTO v_open_row_id
        FROM caso_responsables_historial
        WHERE caso_id = p_case_id
        AND responsible_id = v_caso.current_responsible_id
        AND hasta IS NULL
        ORDER BY desde DESC
        LIMIT 1;

        IF v_open_row_id IS NOT NULL THEN
            UPDATE caso_responsables_historial
            SET hasta = NOW(),
                motivo_salida = 'cierre_de_caso'
            WHERE id = v_open_row_id;
        ELSE
            -- Responsable asignado sin fila abierta (p. ej. asignado en la
            -- creación manual del caso): se registra su tramo completo.
            INSERT INTO caso_responsables_historial (
                caso_id, responsible_id, desde, hasta, motivo_salida
            ) VALUES (
                p_case_id,
                v_caso.current_responsible_id,
                v_caso.opened_at,
                NOW(),
                'cierre_de_caso'
            );
        END IF;
    END IF;

    -- 9. Auditar
    INSERT INTO auditoria (
        user_id, action, table_name, record_id,
        old_values, new_values
    ) VALUES (
        auth.uid(),
        'case_closed',
        'casos',
        p_case_id,
        json_build_object('estado', v_old_estado, 'current_responsible_id', v_caso.current_responsible_id),
        json_build_object('estado', 'cerrado', 'close_reason', p_close_reason, 'closed_at', CURRENT_TIMESTAMP)
    );

    RETURN json_build_object('success', true, 'message', 'Caso cerrado correctamente');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION close_case(UUID, TEXT) IS
'Cierra un caso. Solo Psicólogo o Global. Requiere motivo. Cierra la fila abierta del historial de responsables (desde/hasta) sin duplicarla. T29/T54.';

-- ============================================================
-- VERIFICACIÓN DE INTEGRIDAD
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_case_first_attention'
        AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'Error: trigger trg_case_first_attention no fue recreado';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'trigger_case_first_attention'
    ) THEN
        RAISE EXCEPTION 'Error: Función trigger_case_first_attention no fue recreada';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'close_case'
    ) THEN
        RAISE EXCEPTION 'Error: Función close_case no fue recreada';
    END IF;
END $$;

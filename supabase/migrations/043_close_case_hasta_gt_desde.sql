-- Migración 043: fix close_case — CHECK hasta > desde en misma transacción
-- Evolución Psicológica
--
-- reopen_case inserta historial con desde = NOW(); close_case en la MISMA
-- transacción (o con el mismo timestamp de transacción) fija hasta = NOW(),
-- violando CHECK (hasta IS NULL OR hasta > desde) de 007.
-- Corrección: hasta = GREATEST(NOW(), desde + INTERVAL '1 microsecond')
-- y en el INSERT hasta = GREATEST(NOW(), opened_at + INTERVAL '1 microsecond').

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
    v_open_desde TIMESTAMPTZ;
    v_until TIMESTAMPTZ;
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

    -- 8. Cerrar el historial de responsables (hasta > desde siempre)
    IF v_caso.current_responsible_id IS NOT NULL THEN
        SELECT id, desde INTO v_open_row_id, v_open_desde
        FROM caso_responsables_historial
        WHERE caso_id = p_case_id
        AND responsible_id = v_caso.current_responsible_id
        AND hasta IS NULL
        ORDER BY desde DESC
        LIMIT 1;

        IF v_open_row_id IS NOT NULL THEN
            v_until := GREATEST(NOW(), v_open_desde + INTERVAL '1 microsecond');
            UPDATE caso_responsables_historial
            SET hasta = v_until,
                motivo_salida = 'cierre_de_caso'
            WHERE id = v_open_row_id;
        ELSE
            v_until := GREATEST(NOW(), v_caso.opened_at + INTERVAL '1 microsecond');
            INSERT INTO caso_responsables_historial (
                caso_id, responsible_id, desde, hasta, motivo_salida
            ) VALUES (
                p_case_id,
                v_caso.current_responsible_id,
                v_caso.opened_at,
                v_until,
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
'Cierra un caso. Solo Psicólogo o Global. Requiere motivo. hasta = GREATEST(NOW(), desde+1µs) para CHECK 007.';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'close_case') THEN
        RAISE EXCEPTION 'Error: close_case no fue recreada';
    END IF;
END $$;

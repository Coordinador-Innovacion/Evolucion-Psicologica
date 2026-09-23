-- Migración 032: Licencias — Estado, Alerta y Restricción (T37-T42)
-- Evolución Psicológica

-- ============================================================
-- T37: FUNCIÓN — Estado derivado de licencia
-- ============================================================

CREATE OR REPLACE FUNCTION get_license_status(
    p_institution_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_license RECORD;
    v_today DATE;
    v_days_remaining INTEGER;
    v_status TEXT;
    v_message TEXT;
BEGIN
    v_today := CURRENT_DATE;

    -- Buscar la licencia vigente o más reciente de la institución
    SELECT * INTO v_license
    FROM licencias
    WHERE institution_id = p_institution_id
    ORDER BY
        CASE WHEN end_date >= v_today THEN 0 ELSE 1 END,
        end_date DESC
    LIMIT 1;

    IF v_license IS NULL THEN
        RETURN json_build_object(
            'success', true,
            'has_license', false,
            'status', 'none',
            'message', 'La institución no tiene licencia registrada'
        );
    END IF;

    v_days_remaining := v_license.end_date - v_today;

    -- Determinar estado
    IF v_license.start_date <= v_today AND v_license.end_date >= v_today THEN
        -- Licencia vigente
        IF v_days_remaining <= 30 THEN
            v_status := 'expiring_soon';
            v_message := 'Faltan ' || v_days_remaining || ' día(s) para el vencimiento de la licencia.';
        ELSE
            v_status := 'active';
            v_message := 'Licencia vigente.';
        END IF;
    ELSIF v_license.end_date < v_today THEN
        -- Licencia vencida
        v_status := 'expired';
        v_message := 'Licencia vencida. Las nuevas atenciones psicológicas están bloqueadas.';
    ELSIF v_license.start_date > v_today THEN
        -- Licencia futura
        v_status := 'scheduled';
        v_message := 'La licencia inicia el ' || v_license.start_date || '.';
    ELSE
        v_status := 'unknown';
        v_message := 'Estado de licencia no determinado.';
    END IF;

    RETURN json_build_object(
        'success', true,
        'has_license', true,
        'license_id', v_license.id,
        'status', v_status,
        'start_date', v_license.start_date,
        'end_date', v_license.end_date,
        'days_remaining', v_days_remaining,
        'message', v_message
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION get_license_status(UUID) IS
'Retorna el estado derivado de la licencia de una institución. T37: vigente/próxima a vencer/vencida.';

-- ============================================================
-- T38: FUNCIÓN — Licencias próximas a vencer (alerta Global)
-- ============================================================

CREATE OR REPLACE FUNCTION get_expiring_licenses()
RETURNS JSON AS $$
DECLARE
    v_today DATE;
BEGIN
    v_today := CURRENT_DATE;

    RETURN (
        SELECT json_build_object(
            'success', true,
            'data', (
                SELECT json_agg(json_build_object(
                    'license_id', l.id,
                    'institution_id', l.institution_id,
                    'institution_name', i.name,
                    'end_date', l.end_date,
                    'days_remaining', l.end_date - v_today,
                    'message', CASE
                        WHEN l.end_date < v_today THEN
                            'Licencia vencida desde el ' || l.end_date || '.'
                        ELSE
                            'Faltan ' || (l.end_date - v_today) || ' día(s) para el vencimiento.'
                    END
                ))
                FROM licencias l
                JOIN institutions i ON i.id = l.institution_id
                WHERE l.end_date <= v_today + INTERVAL '30 days'
                ORDER BY l.end_date ASC
            )
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION get_expiring_licenses() IS
'Retorna licencias con ≤30 días para vencer o ya vencidas. Para alerta a Global. T38.';

-- ============================================================
-- T39: FUNCIÓN — Verificar si la licencia permite crear atención
-- ============================================================

CREATE OR REPLACE FUNCTION can_create_attention(
    p_institution_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_license RECORD;
    v_today DATE;
    v_days_remaining INTEGER;
BEGIN
    v_today := CURRENT_DATE;

    -- Buscar licencia vigente
    SELECT * INTO v_license
    FROM licencias
    WHERE institution_id = p_institution_id
    AND start_date <= v_today
    AND end_date >= v_today
    ORDER BY end_date DESC
    LIMIT 1;

    IF v_license IS NULL THEN
        -- Buscar si hay licencia vencida (para dar mensaje específico)
        SELECT * INTO v_license
        FROM licencias
        WHERE institution_id = p_institution_id
        AND end_date < v_today
        ORDER BY end_date DESC
        LIMIT 1;

        IF v_license IS NOT NULL THEN
            RETURN json_build_object(
                'success', false,
                'allowed', false,
                'reason', 'expired',
                'message', 'Licencia vencida. Las nuevas atenciones psicológicas están bloqueadas.',
                'license_end_date', v_license.end_date
            );
        ELSE
            RETURN json_build_object(
                'success', false,
                'allowed', false,
                'reason', 'no_license',
                'message', 'La institución no tiene licencia vigente.'
            );
        END IF;
    END IF;

    -- Licencia vigente
    v_days_remaining := v_license.end_date - v_today;

    IF v_days_remaining <= 30 THEN
        RETURN json_build_object(
            'success', true,
            'allowed', true,
            'reason', 'expiring_soon',
            'message', 'Faltan ' || v_days_remaining || ' día(s) para el vencimiento de la licencia.',
            'days_remaining', v_days_remaining
        );
    ELSE
        RETURN json_build_object(
            'success', true,
            'allowed', true,
            'reason', 'active',
            'message', 'Licencia vigente.'
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION can_create_attention(UUID) IS
'Verifica si la institución puede crear nuevas atenciones según vigencia de licencia. T39.';

-- ============================================================
-- T39: FUNCIÓN — Crear atención con validación de licencia
-- ============================================================

CREATE OR REPLACE FUNCTION create_attention(
    p_caso_id UUID,
    p_motivo TEXT,
    p_que_se_hizo TEXT,
    p_observaciones TEXT DEFAULT NULL,
    p_compromisos TEXT DEFAULT NULL,
    p_proxima_atencion TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_origen VARCHAR DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_institution UUID;
    v_caso RECORD;
    v_license_check JSON;
    v_new_attention_id UUID;
BEGIN
    -- 1. Obtener usuario
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no autenticado');
    END IF;

    -- 2. Solo Psicólogo y Global pueden crear atenciones
    IF v_user_role NOT IN ('global', 'psicologo') THEN
        RETURN json_build_object('success', false, 'error', 'Solo Psicólogo o Global pueden crear atenciones');
    END IF;

    -- 3. Obtener el caso
    SELECT * INTO v_caso FROM casos WHERE id = p_caso_id;

    IF v_caso IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Caso no encontrado');
    END IF;

    -- 4. Verificar institución (si no es Global)
    IF v_user_role != 'global' THEN
        IF v_user_institution IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'Usuario sin institución asignada');
        END IF;

        -- Verificar que el caso pertenece a la institución
        IF NOT EXISTS (
            SELECT 1 FROM periodos_escolares ps
            WHERE ps.student_id = v_caso.student_id
            AND ps.institution_id = v_user_institution
            AND ps.end_date IS NULL
        ) THEN
            RETURN json_build_object('success', false, 'error', 'El caso no pertenece a su institución');
        END IF;
    END IF;

    -- 5. Verificar que el caso no esté cerrado
    IF v_caso.estado = 'cerrado' THEN
        RETURN json_build_object('success', false, 'error', 'No se puede crear una atención en un caso cerrado. Reabra el caso primero.');
    END IF;

    -- 6. T39: Verificar licencia (solo si no es Global)
    -- Global bypass la restricción de licencia
    IF v_user_role != 'global' THEN
        v_license_check := can_create_attention(v_user_institution);

        IF NOT (v_license_check->>'allowed')::BOOLEAN THEN
            RETURN json_build_object(
                'success', false,
                'error', v_license_check->>'message',
                'license_status', v_license_check->>'reason'
            );
        END IF;

        -- Si la licencia está por vencer, incluir advertencia pero permitir
        IF (v_license_check->>'reason') = 'expiring_soon' THEN
            -- La atención se crea, pero se retorna la advertencia
            NULL; -- Continuar
        END IF;
    END IF;

    -- 7. Validar campos obligatorios
    IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
        RETURN json_build_object('success', false, 'error', 'El motivo es obligatorio');
    END IF;

    IF p_que_se_hizo IS NULL OR TRIM(p_que_se_hizo) = '' THEN
        RETURN json_build_object('success', false, 'error', 'El campo "qué se hizo" es obligatorio');
    END IF;

    -- 8. Crear la atención
    INSERT INTO atenciones (
        caso_id, motivo, que_se_hizo, observaciones,
        compromisos, proxima_atencion, origen, created_by
    ) VALUES (
        p_caso_id, TRIM(p_motivo), TRIM(p_que_se_hizo),
        p_observaciones, p_compromisos, p_proxima_atencion,
        p_origen, auth.uid()
    )
    RETURNING id INTO v_new_attention_id;

    -- 9. Auditar
    INSERT INTO auditoria (
        user_id, action, table_name, record_id, new_values
    ) VALUES (
        auth.uid(),
        'attention_created',
        'atenciones',
        v_new_attention_id,
        json_build_object(
            'caso_id', p_caso_id,
            'motivo', p_motivo,
            'que_se_hizo', p_que_se_hizo,
            'origin', COALESCE(p_origen, 'manual')
        )
    );

    -- 10. Retornar éxito con advertencia de licencia si aplica
    IF v_user_role != 'global' AND (v_license_check->>'reason') = 'expiring_soon' THEN
        RETURN json_build_object(
            'success', true,
            'attention_id', v_new_attention_id,
            'license_warning', v_license_check->>'message',
            'message', 'Atención creada correctamente'
        );
    END IF;

    RETURN json_build_object(
        'success', true,
        'attention_id', v_new_attention_id,
        'message', 'Atención creada correctamente'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION create_attention(UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, VARCHAR) IS
'Crea una atención con validación de licencia. T39: rechaza si licencia vencida. Global bypass.';

-- ============================================================
-- T42: FUNCIÓN — Verificar estado de licencia para sesión activa
-- ============================================================

-- La función get_license_status() ya existe y puede consultarse
-- desde el frontend en cualquier momento para mostrar el estado.
-- No se requiere invalidar la sesión.

-- ============================================================
-- AUDITORÍA
-- ============================================================

-- create_attention ya audita (ver paso 9 arriba)
-- can_create_attention es solo lectura (no requiere auditoría)
-- get_license_status es solo lectura (no requiere auditoría)
-- get_expiring_licenses es solo lectura (no requiere auditoría)

-- ============================================================
-- VERIFICACIÓN DE INTEGRIDAD
-- ============================================================

DO $$
BEGIN
    -- Verificar que las funciones existen
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_license_status') THEN
        RAISE EXCEPTION 'Error: Función get_license_status no fue creada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_expiring_licenses') THEN
        RAISE EXCEPTION 'Error: Función get_expiring_licenses no fue creada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'can_create_attention') THEN
        RAISE EXCEPTION 'Error: Función can_create_attention no fue creada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_attention') THEN
        RAISE EXCEPTION 'Error: Función create_attention no fue creada';
    END IF;
END $$;

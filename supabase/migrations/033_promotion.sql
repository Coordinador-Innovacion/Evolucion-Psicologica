-- Migración 033: Promoción — Server-side completo (T43-T52)
-- Evolución Psicológica

-- ============================================================
-- T45: FUNCIÓN — Mapeo automático de grado
-- ============================================================

CREATE OR REPLACE FUNCTION map_grade(
    p_origin_grado_id UUID,
    p_institution_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_origin_grado RECORD;
    v_next_grado RECORD;
    v_is_last_grade BOOLEAN;
    v_next_nivel RECORD;
BEGIN
    -- Obtener el grado origen
    SELECT g.*, n.name AS nivel_name, n.order_number AS nivel_order
    INTO v_origin_grado
    FROM grados g
    JOIN niveles_educativos n ON g.nivel_id = n.id
    WHERE g.id = p_origin_grado_id;

    IF v_origin_grado IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Grado origen no encontrado');
    END IF;

    -- Buscar el siguiente grado en el mismo nivel
    SELECT g.*, n.name AS nivel_name
    INTO v_next_grado
    FROM grados g
    JOIN niveles_educativos n ON g.nivel_id = n.id
    WHERE g.nivel_id = v_origin_grado.nivel_id
    AND g.order_number = v_origin_grado.order_number + 1;

    IF v_next_grado IS NOT NULL THEN
        -- Hay siguiente grado en el mismo nivel
        RETURN json_build_object(
            'success', true,
            'is_egreso', false,
            'next_grado_id', v_next_grado.id,
            'next_grado_name', v_next_grado.name,
            'next_nivel_id', v_next_grado.nivel_id,
            'next_nivel_name', v_next_grado.nivel_name
        );
    END IF;

    -- No hay siguiente grado — buscar en el siguiente nivel
    SELECT n.*
    INTO v_next_nivel
    FROM niveles_educativos n
    WHERE n.institution_id = p_institution_id
    AND n.order_number = v_origin_grado.nivel_order + 1;

    IF v_next_nivel IS NOT NULL THEN
        -- Buscar el primer grado del siguiente nivel
        SELECT g.*
        INTO v_next_grado
        FROM grados g
        WHERE g.nivel_id = v_next_nivel.id
        ORDER BY g.order_number ASC
        LIMIT 1;

        IF v_next_grado IS NOT NULL THEN
            RETURN json_build_object(
                'success', true,
                'is_egreso', false,
                'next_grado_id', v_next_grado.id,
                'next_grado_name', v_next_grado.name,
                'next_nivel_id', v_next_nivel.id,
                'next_nivel_name', v_next_nivel.name
            );
        END IF;
    END IF;

    -- Es el último grado del último nivel — Egreso
    RETURN json_build_object(
        'success', true,
        'is_egreso', true,
        'message', 'Egreso — último grado del último nivel'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION map_grade(UUID, UUID) IS
'Mapea automáticamente el siguiente grado. T45: último grado = Egreso.';

-- ============================================================
-- T47: FUNCIÓN — Preview de promoción
-- ============================================================

CREATE OR REPLACE FUNCTION preview_promotion(
    p_institution_id UUID,
    p_origin_year INTEGER,
    p_destination_year INTEGER
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_institution UUID;
    v_students JSON;
    v_total INTEGER;
    v_promoted INTEGER;
    v_retired INTEGER;
    v_egreso INTEGER;
    v_existing_batch UUID;
BEGIN
    -- 1. Verificar permisos
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador') THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para realizar promoción');
    END IF;

    IF v_user_role != 'global' AND v_user_institution != p_institution_id THEN
        RETURN json_build_object('success', false, 'error', 'Solo puede promover en su institución');
    END IF;

    -- 2. Verificar que no hay un lote activo (T52)
    SELECT id INTO v_existing_batch
    FROM lotes_promocion
    WHERE institution_id = p_institution_id
    AND origin_year = p_origin_year
    AND destination_year = p_destination_year
    AND status IN ('PREPARED', 'RUNNING');

    IF v_existing_batch IS NOT NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Ya existe un lote de promoción activo para este contexto',
            'existing_batch_id', v_existing_batch
        );
    END IF;

    -- 3. Obtener estudiantes del año origen con su período activo
    WITH student_grades AS (
        SELECT
            e.id AS student_id,
            e.first_names,
            e.last_names,
            e.document_number,
            pe.grado_id,
            pe.nivel_id,
            pe.section,
            pe.tipo,
            g.name AS grado_name,
            n.name AS nivel_name,
            map_grade(pe.grado_id, p_institution_id) AS mapping
        FROM estudiantes e
        JOIN periodos_escolares pe ON pe.student_id = e.id
        JOIN grados g ON pe.grado_id = g.id
        JOIN niveles_educativos n ON pe.nivel_id = n.id
        WHERE pe.institution_id = p_institution_id
        AND pe.school_year = p_origin_year
        AND pe.end_date IS NULL
        AND pe.tipo = 'regular'
    )
    SELECT json_agg(json_build_object(
        'student_id', sg.student_id,
        'first_names', sg.first_names,
        'last_names', sg.last_names,
        'document_number', sg.document_number,
        'current_grado', sg.grado_name,
        'current_nivel', sg.nivel_name,
        'section', sg.section,
        'is_egreso', (sg.mapping->>'is_egreso')::BOOLEAN,
        'next_grado_id', sg.mapping->>'next_grado_id',
        'next_grado_name', sg.mapping->>'next_grado_name',
        'next_nivel_id', sg.mapping->>'next_nivel_id',
        'next_nivel_name', sg.mapping->>'next_nivel_name'
    ))
    INTO v_students
    FROM student_grades sg;

    -- 4. Calcular estadísticas
    v_total := COALESCE(json_array_length(v_students), 0);

    SELECT
        COUNT(*) FILTER (WHERE (item->>'is_egreso')::BOOLEAN = false),
        COUNT(*) FILTER (WHERE (item->>'is_egreso')::BOOLEAN = true)
    INTO v_promoted, v_egreso
    FROM json_array_elements(v_students) AS item;

    -- Retirados del año origen (no están en período activo)
    SELECT COUNT(DISTINCT e.id)
    INTO v_retired
    FROM estudiantes e
    JOIN periodos_escolares pe ON pe.student_id = e.id
    WHERE pe.institution_id = p_institution_id
    AND pe.school_year = p_origin_year
    AND pe.tipo = 'retiro'
    AND pe.end_date IS NOT NULL;

    RETURN json_build_object(
        'success', true,
        'origin_year', p_origin_year,
        'destination_year', p_destination_year,
        'total_students', v_total,
        'promoted', v_promoted,
        'egreso', v_egreso,
        'retired', v_retired,
        'students', v_students
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION preview_promotion(UUID, INTEGER, INTEGER) IS
'Retorna preview de promoción: estudiantes, mapeo y estadísticas. T47.';

-- ============================================================
-- T48/T49/T50/T51/T52: FUNCIÓN — Ejecutar promoción
-- ============================================================

CREATE OR REPLACE FUNCTION execute_promotion(
    p_institution_id UUID,
    p_origin_year INTEGER,
    p_destination_year INTEGER,
    p_idempotency_key VARCHAR(255)
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_institution UUID;
    v_batch_id UUID;
    v_existing_batch RECORD;
    v_student RECORD;
    v_mapping JSON;
    v_new_period_id UUID;
    v_action_id UUID;
    v_destination_grado_id UUID;
    v_destination_nivel_id UUID;
    v_is_egreso BOOLEAN;
    v_total INTEGER := 0;
    v_processed INTEGER := 0;
    v_errors INTEGER := 0;
    v_egreso_count INTEGER := 0;
    v_already_processed INTEGER := 0;
BEGIN
    -- 1. Verificar permisos
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador') THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para realizar promoción');
    END IF;

    IF v_user_role != 'global' AND v_user_institution != p_institution_id THEN
        RETURN json_build_object('success', false, 'error', 'Solo puede promover en su institución');
    END IF;

    -- 2. T48: Verificar idempotencia
    SELECT id, status INTO v_existing_batch
    FROM lotes_promocion
    WHERE idempotency_key = p_idempotency_key;

    IF v_existing_batch IS NOT NULL THEN
        -- Si el lote ya fue procesado, retornarlo (idempotencia)
        IF v_existing_batch.status IN ('COMPLETED', 'COMPLETED_WITH_EXCEPTIONS') THEN
            RETURN json_build_object(
                'success', true,
                'batch_id', v_existing_batch.id,
                'status', v_existing_batch.status,
                'message', 'Lote ya procesado (idempotente)',
                'idempotent', true
            );
        END IF;

        -- Si está en PREPARED o RUNNING, reanudar (T49)
        IF v_existing_batch.status IN ('PREPARED', 'RUNNING') THEN
            v_batch_id := v_existing_batch.id;
            -- Actualizar a RUNNING
            UPDATE lotes_promocion
            SET status = 'RUNNING'
            WHERE id = v_batch_id;
        END IF;
    ELSE
        -- 3. T52: Verificar que no hay otro lote activo
        IF EXISTS (
            SELECT 1 FROM lotes_promocion
            WHERE institution_id = p_institution_id
            AND origin_year = p_origin_year
            AND destination_year = p_destination_year
            AND status IN ('PREPARED', 'RUNNING')
        ) THEN
            RETURN json_build_object(
                'success', false,
                'error', 'Ya existe un lote de promoción activo para este contexto'
            );
        END IF;

        -- Crear nuevo lote
        INSERT INTO lotes_promocion (
            institution_id, origin_year, destination_year,
            started_by, status, idempotency_key
        ) VALUES (
            p_institution_id, p_origin_year, p_destination_year,
            auth.uid(), 'RUNNING', p_idempotency_key
        )
        RETURNING id INTO v_batch_id;
    END IF;

    -- 4. Procesar estudiantes
    FOR v_student IN
        SELECT
            e.id AS student_id,
            e.first_names,
            e.last_names,
            pe.id AS period_id,
            pe.grado_id,
            pe.nivel_id,
            pe.section
        FROM estudiantes e
        JOIN periodos_escolares pe ON pe.student_id = e.id
        WHERE pe.institution_id = p_institution_id
        AND pe.school_year = p_origin_year
        AND pe.end_date IS NULL
        AND pe.tipo = 'regular'
    LOOP
        v_total := v_total + 1;

        -- T48: Verificar si ya fue procesado (idempotente)
        SELECT id INTO v_action_id
        FROM acciones_promocion
        WHERE batch_id = v_batch_id
        AND student_id = v_student.student_id;

        IF v_action_id IS NOT NULL THEN
            -- Ya procesado — saltar
            v_already_processed := v_already_processed + 1;
            CONTINUE;
        END IF;

        -- Mapear grado
        v_mapping := map_grade(v_student.grado_id, p_institution_id);
        v_is_egreso := (v_mapping->>'is_egreso')::BOOLEAN;

        IF v_is_egreso THEN
            v_destination_grado_id := NULL;
            v_destination_nivel_id := NULL;
        ELSE
            v_destination_grado_id := (v_mapping->>'next_grado_id')::UUID;
            v_destination_nivel_id := (v_mapping->>'next_nivel_id')::UUID;
        END IF;

        -- Crear acción
        INSERT INTO acciones_promocion (
            batch_id, student_id, source_period_id,
            automatic_result, final_result, status
        ) VALUES (
            v_batch_id, v_student.student_id, v_student.period_id,
            CASE WHEN v_is_egreso THEN 'egreso' ELSE 'promoted' END,
            CASE WHEN v_is_egreso THEN 'egreso' ELSE 'promoted' END,
            'pending'
        )
        RETURNING id INTO v_action_id;

        BEGIN
            IF v_is_egreso THEN
                -- T46: Egreso — cerrar período actual
                UPDATE periodos_escolares
                SET end_date = CURRENT_DATE,
                    motivo_retiro = 'egreso'
                WHERE id = v_student.period_id;

                -- Marcar acción como procesada
                UPDATE acciones_promocion
                SET status = 'processed',
                    processed_at = CURRENT_TIMESTAMP
                WHERE id = v_action_id;

                v_egreso_count := v_egreso_count + 1;
            ELSE
                -- Cerrar período actual
                UPDATE periodos_escolares
                SET end_date = CURRENT_DATE,
                    motivo_retiro = 'promocion'
                WHERE id = v_student.period_id;

                -- Crear nuevo período en el destino
                INSERT INTO periodos_escolares (
                    student_id, institution_id, school_year,
                    nivel_id, grado_id, section, start_date, tipo
                ) VALUES (
                    v_student.student_id, p_institution_id, p_destination_year,
                    v_destination_nivel_id, v_destination_grado_id,
                    v_student.section, CURRENT_DATE, 'regular'
                );

                -- Marcar acción como procesada
                UPDATE acciones_promocion
                SET status = 'processed',
                    processed_at = CURRENT_TIMESTAMP
                WHERE id = v_action_id;

                v_processed := v_processed + 1;
            END IF;

        EXCEPTION WHEN OTHERS THEN
            -- T50: Excepción — registrar error
            UPDATE acciones_promocion
            SET status = 'error',
                error = SQLERRM,
                processed_at = CURRENT_TIMESTAMP
            WHERE id = v_action_id;

            INSERT INTO excepciones_promocion (
                action_id, automatic_result, final_result,
                motivo, usuario_id
            ) VALUES (
                v_action_id,
                CASE WHEN v_is_egreso THEN 'egreso' ELSE 'promoted' END,
                CASE WHEN v_is_egreso THEN 'egreso' ELSE 'promoted' END,
                'Error procesando estudiante: ' || SQLERRM,
                auth.uid()
            );

            v_errors := v_errors + 1;
        END;
    END LOOP;

    -- 5. Actualizar lote
    UPDATE lotes_promocion
    SET status = CASE
            WHEN v_errors = 0 THEN 'COMPLETED'
            ELSE 'COMPLETED_WITH_EXCEPTIONS'
        END,
        completed_at = CURRENT_TIMESTAMP,
        counts = json_build_object(
            'total', v_total,
            'processed', v_processed,
            'egreso', v_egreso_count,
            'errors', v_errors,
            'already_processed', v_already_processed
        )
    WHERE id = v_batch_id;

    -- 6. T51: Auditar
    INSERT INTO auditoria (
        user_id, action, table_name, record_id, new_values
    ) VALUES (
        auth.uid(),
        'promotion_executed',
        'lotes_promocion',
        v_batch_id,
        json_build_object(
            'institution_id', p_institution_id,
            'origin_year', p_origin_year,
            'destination_year', p_destination_year,
            'total', v_total,
            'processed', v_processed,
            'egreso', v_egreso_count,
            'errors', v_errors
        )
    );

    RETURN json_build_object(
        'success', true,
        'batch_id', v_batch_id,
        'status', CASE WHEN v_errors = 0 THEN 'COMPLETED' ELSE 'COMPLETED_WITH_EXCEPTIONS' END,
        'total', v_total,
        'processed', v_processed,
        'egreso', v_egreso_count,
        'errors', v_errors,
        'already_processed', v_already_processed
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION execute_promotion(UUID, INTEGER, INTEGER, VARCHAR) IS
'Ejecuta promoción masiva. T48: idempotente. T49: reanudable. T50: excepciones. T51: auditoría. T52: previene doble ejecución.';

-- ============================================================
-- T50: FUNCIÓN — Aplicar excepción (repetidor)
-- ============================================================

CREATE OR REPLACE FUNCTION apply_promotion_exception(
    p_action_id UUID,
    p_final_result VARCHAR(50),
    p_motivo TEXT
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_institution UUID;
    v_action RECORD;
    v_batch RECORD;
BEGIN
    -- 1. Verificar permisos
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador') THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para aplicar excepciones');
    END IF;

    -- 2. Obtener la acción y su lote
    SELECT ap.*, lp.institution_id, lp.origin_year, lp.destination_year, lp.status AS batch_status
    INTO v_action
    FROM acciones_promocion ap
    JOIN lotes_promocion lp ON ap.batch_id = lp.id
    WHERE ap.id = p_action_id;

    IF v_action IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Acción de promoción no encontrada');
    END IF;

    -- 3. Verificar institución
    IF v_user_role != 'global' AND v_user_institution != v_action.institution_id THEN
        RETURN json_build_object('success', false, 'error', 'Solo puede aplicar excepciones en su institución');
    END IF;

    -- 4. Verificar que la acción está pendiente
    IF v_action.status != 'pending' THEN
        RETURN json_build_object('success', false, 'error', 'Solo se pueden excepcionar acciones pendientes');
    END IF;

    -- 5. Validar resultado
    IF p_final_result NOT IN ('promoted', 'retained', 'egreso') THEN
        RETURN json_build_object('success', false, 'error', 'Resultado inválido. Use promoted, retained o egreso');
    END IF;

    -- 6. Actualizar la acción
    UPDATE acciones_promocion
    SET final_result = p_final_result,
        status = 'processed',
        processed_at = CURRENT_TIMESTAMP
    WHERE id = p_action_id;

    -- 7. Registrar excepción
    INSERT INTO excepciones_promocion (
        action_id, automatic_result, final_result,
        motivo, usuario_id
    ) VALUES (
        p_action_id,
        v_action.automatic_result,
        p_final_result,
        p_motivo,
        auth.uid()
    );

    -- 8. Auditar
    INSERT INTO auditoria (
        user_id, action, table_name, record_id, new_values
    ) VALUES (
        auth.uid(),
        'promotion_exception_applied',
        'acciones_promocion',
        p_action_id,
        json_build_object(
            'automatic_result', v_action.automatic_result,
            'final_result', p_final_result,
            'motivo', p_motivo
        )
    );

    RETURN json_build_object(
        'success', true,
        'action_id', p_action_id,
        'automatic_result', v_action.automatic_result,
        'final_result', p_final_result,
        'message', 'Excepción aplicada correctamente'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION apply_promotion_exception(UUID, VARCHAR, TEXT) IS
'Aplica una excepción a una acción de promoción (ej: repetidor). T50.';

-- ============================================================
-- T49: FUNCIÓN — Reanudar lote interrumpido
-- ============================================================

CREATE OR REPLACE FUNCTION resume_promotion(
    p_batch_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_institution UUID;
    v_batch RECORD;
    v_pending_count INTEGER;
BEGIN
    -- 1. Verificar permisos
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador') THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para reanudar promoción');
    END IF;

    -- 2. Obtener el lote
    SELECT * INTO v_batch FROM lotes_promocion WHERE id = p_batch_id;

    IF v_batch IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Lote no encontrado');
    END IF;

    -- 3. Verificar institución
    IF v_user_role != 'global' AND v_user_institution != v_batch.institution_id THEN
        RETURN json_build_object('success', false, 'error', 'Solo puede reanudar lotes de su institución');
    END IF;

    -- 4. Verificar que el lote es reanudable
    IF v_batch.status NOT IN ('PREPARED', 'RUNNING', 'INTERRUPTED') THEN
        RETURN json_build_object('success', false, 'error', 'El lote no puede ser reanudado');
    END IF;

    -- 5. Contar pendientes
    SELECT COUNT(*) INTO v_pending_count
    FROM acciones_promocion
    WHERE batch_id = p_batch_id
    AND status = 'pending';

    IF v_pending_count = 0 THEN
        RETURN json_build_object('success', false, 'error', 'No hay acciones pendientes para reanudar');
    END IF;

    -- 6. Reanudar
    UPDATE lotes_promocion
    SET status = 'RUNNING'
    WHERE id = p_batch_id;

    -- 7. Auditar
    INSERT INTO auditoria (
        user_id, action, table_name, record_id, new_values
    ) VALUES (
        auth.uid(),
        'promotion_resumed',
        'lotes_promocion',
        p_batch_id,
        json_build_object('pending_count', v_pending_count)
    );

    RETURN json_build_object(
        'success', true,
        'batch_id', p_batch_id,
        'pending_count', v_pending_count,
        'message', 'Lote reanudado con ' || v_pending_count || ' acciones pendientes'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION resume_promotion(UUID) IS
'Reanuda un lote de promoción interrumpido. T49.';

-- ============================================================
-- T43/T44: FUNCIÓN — Wizard: obtener datos prefill
-- ============================================================

CREATE OR REPLACE FUNCTION get_promotion_wizard(
    p_institution_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_institution UUID;
    v_current_year INTEGER;
    v_origin_year INTEGER;
    v_niveles JSON;
    v_grados JSON;
    v_existing_batch RECORD;
BEGIN
    -- 1. Verificar permisos
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador') THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para acceder al wizard');
    END IF;

    IF v_user_role != 'global' AND v_user_institution != p_institution_id THEN
        RETURN json_build_object('success', false, 'error', 'Solo puede acceder al wizard de su institución');
    END IF;

    -- 2. Calcular años
    v_current_year := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
    v_origin_year := v_current_year - 1;

    -- 3. Obtener niveles de la institución
    SELECT json_agg(json_build_object(
        'id', n.id,
        'name', n.name,
        'order_number', n.order_number
    ))
    INTO v_niveles
    FROM niveles_educativos n
    WHERE n.institution_id = p_institution_id
    ORDER BY n.order_number;

    -- 4. Obtener grados de la institución
    SELECT json_agg(json_build_object(
        'id', g.id,
        'name', g.name,
        'order_number', g.order_number,
        'nivel_id', g.nivel_id,
        'nivel_name', n.name
    ))
    INTO v_grados
    FROM grados g
    JOIN niveles_educativos n ON g.nivel_id = n.id
    WHERE n.institution_id = p_institution_id
    ORDER BY n.order_number, g.order_number;

    -- 5. Verificar si hay lote existente reanudable
    SELECT id, status, counts
    INTO v_existing_batch
    FROM lotes_promocion
    WHERE institution_id = p_institution_id
    AND origin_year = v_origin_year
    AND destination_year = v_current_year
    AND status IN ('PREPARED', 'RUNNING', 'INTERRUPTED')
    ORDER BY created_at DESC
    LIMIT 1;

    RETURN json_build_object(
        'success', true,
        'origin_year', v_origin_year,
        'destination_year', v_current_year,
        'niveles', COALESCE(v_niveles, '[]'::json),
        'grados', COALESCE(v_grados, '[]'::json),
        'existing_batch_id', v_existing_batch.id,
        'existing_batch_status', v_existing_batch.status,
        'existing_batch_counts', v_existing_batch.counts
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION get_promotion_wizard(UUID) IS
'Retorna datos para el wizard de promoción: años prefill, niveles, grados. T43/T44.';

-- ============================================================
-- AUDITORÍA
-- ============================================================

-- Todas las funciones de promoción auditan operaciones de escritura.
-- Las funciones de solo lectura (preview, wizard) no requieren auditoría.

-- ============================================================
-- VERIFICACIÓN DE INTEGRIDAD
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'map_grade') THEN
        RAISE EXCEPTION 'Error: Función map_grade no fue creada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'preview_promotion') THEN
        RAISE EXCEPTION 'Error: Función preview_promotion no fue creada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'execute_promotion') THEN
        RAISE EXCEPTION 'Error: Función execute_promotion no fue creada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'apply_promotion_exception') THEN
        RAISE EXCEPTION 'Error: Función apply_promotion_exception no fue creada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'resume_promotion') THEN
        RAISE EXCEPTION 'Error: Función resume_promotion no fue creada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_promotion_wizard') THEN
        RAISE EXCEPTION 'Error: Función get_promotion_wizard no fue creada';
    END IF;
END $$;

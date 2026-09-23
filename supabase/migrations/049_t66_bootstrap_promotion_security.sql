-- Migración 049: T66 — A2 bootstrap Global + A4/A5 promoción + B1–B5 seguridad
-- Evolución Psicológica
--
-- Fuentes: DC-006 (bootstrap), DC-007 (transferencias — aplica en 048),
-- decisiones A2/A4/A5 confirmadas, riesgos T65 B1–B5.
-- B6 (pgcrypto/pg_trgm): sin cambio (evidencia en reporte T66).
-- B7 (016–018): NO se restauran/reactivan.

-- ============================================================
-- A2: claim_first_global — bootstrap un solo uso
-- ============================================================
CREATE OR REPLACE FUNCTION claim_first_global()
RETURNS JSON AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_role TEXT;
    v_existing INT;
    v_full_name TEXT;
    v_doc TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No autenticado');
    END IF;

    -- Solo mientras no exista ningún Global
    SELECT count(*) INTO v_existing FROM perfiles WHERE role = 'global';
    IF v_existing > 0 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'El mecanismo de inicialización ya no está disponible. Use la recuperación de contraseña normal.'
        );
    END IF;

    SELECT role INTO v_role FROM perfiles WHERE user_id = v_uid;
    IF v_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario sin perfil');
    END IF;
    IF v_role = 'global' THEN
        RETURN json_build_object('success', false, 'error', 'Ya es Global');
    END IF;

    -- Re-verificar de forma atómica y promover
    UPDATE perfiles
    SET role = 'global', updated_at = NOW()
    WHERE user_id = v_uid
      AND NOT EXISTS (SELECT 1 FROM perfiles WHERE role = 'global');

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Ya existe un usuario Global. El bootstrap no está disponible.'
        );
    END IF;

    INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
    VALUES (
        v_uid,
        'first_global_claimed',
        'perfiles',
        v_uid,
        json_build_object('mechanism', 'claim_first_global', 'one_shot', true)
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Usuario promovido a Global. El mecanismo queda inutilizado; configure su contraseña desde el perfil.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION claim_first_global() IS
'T66/A2 DC-006: promueve al primer Global solo si no existe ninguno. Un solo uso; sin contraseña fija.';

-- ============================================================
-- A5: apply_promotion_exception — exige lote PREPARED (no aplica cambios solo)
-- (preview_promotion NO crea lote; prepare_promotion crea PREPARED sin mutar)
-- ============================================================

-- ============================================================
-- A4: prepare_promotion — PREPARED sin modificar datos definitivos
-- ============================================================
CREATE OR REPLACE FUNCTION prepare_promotion(
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
    v_existing RECORD;
    v_preview JSON;
    v_total INT := 0;
    v_promoted INT := 0;
    v_egreso INT := 0;
    v_retired INT := 0;
BEGIN
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador') THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para realizar promoción');
    END IF;

    IF v_user_role != 'global' AND v_user_institution != p_institution_id THEN
        RETURN json_build_object('success', false, 'error', 'Solo puede promover en su institución');
    END IF;

    IF p_origin_year IS NULL OR p_destination_year IS NULL OR p_destination_year <= p_origin_year THEN
        RETURN json_build_object('success', false, 'error', 'Años de promoción inválidos');
    END IF;

    -- Idempotente por key
    SELECT id, status INTO v_existing
    FROM lotes_promocion
    WHERE idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF v_existing IS NOT NULL THEN
        IF v_existing.status IN ('COMPLETED', 'COMPLETED_WITH_EXCEPTIONS') THEN
            RETURN json_build_object(
                'success', true,
                'batch_id', v_existing.id,
                'status', v_existing.status,
                'idempotent', true,
                'message', 'Lote ya procesado (idempotente)'
            );
        END IF;
        IF v_existing.status = 'PREPARED' THEN
            RETURN json_build_object(
                'success', true,
                'batch_id', v_existing.id,
                'status', 'PREPARED',
                'idempotent', true,
                'message', 'Lote ya preparado'
            );
        END IF;
        IF v_existing.status IN ('RUNNING', 'FAILED', 'INTERRUPTED') THEN
            RETURN json_build_object(
                'success', true,
                'batch_id', v_existing.id,
                'status', v_existing.status,
                'message', 'Lote reanudable existente'
            );
        END IF;
    END IF;

    -- Un solo lote activo por contexto
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

    -- Preview (sin mutar datos)
    v_preview := preview_promotion(p_institution_id, p_origin_year, p_destination_year);
    IF (v_preview->>'success')::boolean IS NOT TRUE THEN
        RETURN v_preview;
    END IF;

    v_total := COALESCE((v_preview->>'total_students')::int, 0);
    v_promoted := COALESCE((v_preview->>'promoted')::int, 0);
    v_egreso := COALESCE((v_preview->>'egreso')::int, 0);
    v_retired := COALESCE((v_preview->>'retired')::int, 0);

    -- Crear lote PREPARED (sin tocar períodos ni estudiantes)
    INSERT INTO lotes_promocion (
        institution_id, origin_year, destination_year,
        started_by, status, idempotency_key, counts
    ) VALUES (
        p_institution_id, p_origin_year, p_destination_year,
        auth.uid(), 'PREPARED', p_idempotency_key,
        json_build_object(
            'total', v_total,
            'promoted', v_promoted,
            'egreso', v_egreso,
            'retired', v_retired,
            'preview', v_preview
        )
    )
    RETURNING id INTO v_batch_id;

    INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
    VALUES (
        auth.uid(),
        'promotion_prepared',
        'lotes_promocion',
        v_batch_id,
        json_build_object(
            'institution_id', p_institution_id,
            'origin_year', p_origin_year,
            'destination_year', p_destination_year,
            'total', v_total,
            'promoted', v_promoted,
            'egreso', v_egreso
        )
    );

    RETURN json_build_object(
        'success', true,
        'batch_id', v_batch_id,
        'status', 'PREPARED',
        'total_students', v_total,
        'promoted', v_promoted,
        'egreso', v_egreso,
        'retired', v_retired,
        'preview', v_preview,
        'message', 'Lote preparado. Los cambios se aplican solo al ejecutar.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION prepare_promotion(UUID, INTEGER, INTEGER, VARCHAR) IS
'T66/A4: PREPARAR crea lote PREPARED con preview; NO modifica datos. Ejecución explícita posterior.';

-- ============================================================
-- A4: execute_promotion — solo aplica si hay lote PREPARED/running reanudable
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
    v_action_id UUID;
    v_destination_grado_id UUID;
    v_destination_nivel_id UUID;
    v_is_egreso BOOLEAN;
    v_total INTEGER := 0;
    v_processed INTEGER := 0;
    v_errors INTEGER := 0;
    v_egreso_count INTEGER := 0;
    v_already_processed INTEGER := 0;
    v_prep JSON;
BEGIN
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador') THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para realizar promoción');
    END IF;

    IF v_user_role != 'global' AND v_user_institution != p_institution_id THEN
        RETURN json_build_object('success', false, 'error', 'Solo puede promover en su institución');
    END IF;

    SELECT id, status INTO v_existing_batch
    FROM lotes_promocion
    WHERE idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF v_existing_batch IS NOT NULL THEN
        IF v_existing_batch.status IN ('COMPLETED', 'COMPLETED_WITH_EXCEPTIONS') THEN
            RETURN json_build_object(
                'success', true,
                'batch_id', v_existing_batch.id,
                'status', v_existing_batch.status,
                'message', 'Lote ya procesado (idempotente)',
                'idempotent', true
            );
        END IF;

        -- Solo PREPARED / RUNNING / FAILED / INTERRUPTED se ejecutan/reanudan
        IF v_existing_batch.status IN ('PREPARED', 'RUNNING', 'FAILED', 'INTERRUPTED') THEN
            v_batch_id := v_existing_batch.id;
            UPDATE lotes_promocion
            SET status = 'RUNNING'
            WHERE id = v_batch_id;
        ELSE
            RETURN json_build_object(
                'success', false,
                'error', 'Estado de lote no ejecutable: ' || v_existing_batch.status
            );
        END IF;
    ELSE
        -- Sin lote: exigir PREPARE primero (A4) — no mutar sin preparar
        v_prep := prepare_promotion(
            p_institution_id, p_origin_year, p_destination_year, p_idempotency_key
        );
        IF (v_prep->>'success')::boolean IS NOT TRUE THEN
            RETURN v_prep;
        END IF;

        SELECT id, status INTO v_existing_batch
        FROM lotes_promocion
        WHERE idempotency_key = p_idempotency_key
        FOR UPDATE;

        IF v_existing_batch IS NULL OR v_existing_batch.status NOT IN ('PREPARED', 'RUNNING', 'FAILED', 'INTERRUPTED') THEN
            RETURN json_build_object('success', false, 'error', 'No se pudo preparar el lote de promoción');
        END IF;

        v_batch_id := v_existing_batch.id;
        UPDATE lotes_promocion SET status = 'RUNNING' WHERE id = v_batch_id;
    END IF;

    IF v_batch_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No se pudo resolver el lote de promoción');
    END IF;

    FOR v_student IN
        SELECT
            e.id AS student_id,
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

        SELECT id INTO v_action_id
        FROM acciones_promocion
        WHERE batch_id = v_batch_id AND student_id = v_student.student_id;

        IF v_action_id IS NOT NULL THEN
            SELECT status INTO v_already_processed
            FROM acciones_promocion WHERE id = v_action_id;
            CONTINUE;
        END IF;

        v_mapping := map_grade(v_student.grado_id, p_institution_id);
        v_is_egreso := (v_mapping->>'is_egreso')::BOOLEAN;

        IF v_is_egreso THEN
            v_destination_grado_id := NULL;
            v_destination_nivel_id := NULL;
        ELSE
            v_destination_grado_id := (v_mapping->>'next_grado_id')::UUID;
            v_destination_nivel_id := (v_mapping->>'next_nivel_id')::UUID;
        END IF;

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
                UPDATE periodos_escolares
                SET end_date = CURRENT_DATE, motivo_retiro = 'egreso'
                WHERE id = v_student.period_id;

                UPDATE acciones_promocion
                SET status = 'processed', processed_at = CURRENT_TIMESTAMP
                WHERE id = v_action_id;

                v_egreso_count := v_egreso_count + 1;
            ELSE
                UPDATE periodos_escolares
                SET end_date = CURRENT_DATE, motivo_retiro = 'promocion'
                WHERE id = v_student.period_id;

                INSERT INTO periodos_escolares (
                    student_id, institution_id, school_year,
                    nivel_id, grado_id, section, start_date, tipo
                ) VALUES (
                    v_student.student_id, p_institution_id, p_destination_year,
                    v_destination_nivel_id, v_destination_grado_id,
                    v_student.section, CURRENT_DATE, 'regular'
                );

                UPDATE acciones_promocion
                SET status = 'processed', processed_at = CURRENT_TIMESTAMP
                WHERE id = v_action_id;

                v_processed := v_processed + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            UPDATE acciones_promocion
            SET status = 'error', error = SQLERRM, processed_at = CURRENT_TIMESTAMP
            WHERE id = v_action_id;

            INSERT INTO excepciones_promocion (
                action_id, automatic_result, final_result, motivo, usuario_id
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

    UPDATE lotes_promocion
    SET status = CASE WHEN v_errors = 0 THEN 'COMPLETED' ELSE 'COMPLETED_WITH_EXCEPTIONS' END,
        completed_at = CURRENT_TIMESTAMP,
        counts = json_build_object(
            'total', v_total,
            'processed', v_processed,
            'egreso', v_egreso_count,
            'errors', v_errors
        )
    WHERE id = v_batch_id;

    INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
    VALUES (
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
        'errors', v_errors
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION execute_promotion(UUID, INTEGER, INTEGER, VARCHAR) IS
'T66/A4: ejecuta lote PREPARED (o lo prepara y ejecuta si no existe). Manual siempre. A5.';

-- ============================================================
-- B4: delete_institution — no elimina si hay histórico de períodos
-- ============================================================
CREATE OR REPLACE FUNCTION delete_institution(
    p_institution_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_inst_name VARCHAR(255);
    v_inst_code VARCHAR(50);
    v_active_students BIGINT;
    v_any_periods BIGINT;
BEGIN
    SELECT role INTO v_user_role FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role != 'global' THEN
        RETURN json_build_object('success', false, 'error', 'Solo Global puede eliminar instituciones');
    END IF;

    SELECT name, code INTO v_inst_name, v_inst_code
    FROM institutions WHERE id = p_institution_id;

    IF v_inst_name IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Institución no encontrada');
    END IF;

    SELECT COUNT(*) INTO v_active_students
    FROM periodos_escolares
    WHERE institution_id = p_institution_id AND end_date IS NULL;

    IF v_active_students > 0 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No se puede eliminar una institución con estudiantes activos'
        );
    END IF;

    -- B4: cualquier histórico de períodos bloquea (no solo activos)
    SELECT COUNT(*) INTO v_any_periods
    FROM periodos_escolares
    WHERE institution_id = p_institution_id;

    IF v_any_periods > 0 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No se puede eliminar una institución con histórico de períodos escolares'
        );
    END IF;

    IF EXISTS (SELECT 1 FROM perfiles WHERE institution_id = p_institution_id) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No se puede eliminar una institución con personal asignado'
        );
    END IF;

    DELETE FROM institutions WHERE id = p_institution_id;

    INSERT INTO auditoria (user_id, action, table_name, record_id, old_values)
    VALUES (
        auth.uid(), 'institution_delete', 'institutions', p_institution_id,
        json_build_object('name', v_inst_name, 'code', v_inst_code)
    );

    RETURN json_build_object('success', true, 'message', 'Institución eliminada exitosamente');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION delete_institution(UUID) IS
'T66/B4: bloquea si existe ANY histórico de períodos (no solo activos). Solo Global.';

-- ============================================================
-- B1: authz coherente por propósito en SECURITY DEFINER
-- ============================================================

-- get_student_periods: global | roles de la institución si el estudiante tiene período ahí
CREATE OR REPLACE FUNCTION get_student_periods(
    p_student_id UUID
)
RETURNS TABLE (
    id UUID,
    institution_id UUID,
    institution_name VARCHAR,
    school_year INTEGER,
    nivel_name VARCHAR,
    grado_name VARCHAR,
    section VARCHAR,
    start_date DATE,
    end_date DATE,
    tipo VARCHAR,
    motivo_retiro TEXT,
    is_active BOOLEAN,
    created_at TIMESTAMPTZ
) AS $$
DECLARE
    v_role TEXT;
    v_inst UUID;
BEGIN
    SELECT role, institution_id INTO v_role, v_inst
    FROM perfiles WHERE user_id = auth.uid();

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    IF v_role != 'global' THEN
        IF v_role NOT IN ('director', 'admin_ie', 'coordinador', 'psicologo', 'docente') THEN
            RAISE EXCEPTION 'No tiene permisos para ver períodos del estudiante';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM periodos_escolares pe
            WHERE pe.student_id = p_student_id
              AND pe.institution_id = v_inst
        ) THEN
            RAISE EXCEPTION 'El estudiante no tiene períodos en su institución';
        END IF;
    END IF;

    RETURN QUERY
    SELECT
        pe.id,
        pe.institution_id,
        i.name AS institution_name,
        pe.school_year,
        n.name AS nivel_name,
        g.name AS grado_name,
        pe.section,
        pe.start_date,
        pe.end_date,
        pe.tipo,
        pe.motivo_retiro,
        (pe.end_date IS NULL) AS is_active,
        pe.created_at
    FROM periodos_escolares pe
    JOIN institutions i ON pe.institution_id = i.id
    JOIN niveles_educativos n ON pe.nivel_id = n.id
    JOIN grados g ON pe.grado_id = g.id
    WHERE pe.student_id = p_student_id
    ORDER BY pe.school_year DESC, pe.start_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION get_student_periods(UUID) IS
'T66/B1: authz por institución/rol antes de exponer histórico.';

-- check_student_duplicates_by_dni: roles de registro
CREATE OR REPLACE FUNCTION check_student_duplicates_by_dni(
    p_document_type VARCHAR,
    p_document_number VARCHAR,
    p_exclude_id UUID DEFAULT NULL
)
RETURNS TABLE (
    student_id UUID,
    full_name VARCHAR,
    document_type VARCHAR,
    document_number VARCHAR,
    birth_date DATE,
    match_type TEXT
) AS $$
DECLARE
    v_role TEXT;
BEGIN
    SELECT role INTO v_role FROM perfiles WHERE user_id = auth.uid();
    IF v_role IS NULL OR v_role NOT IN ('global', 'director', 'admin_ie', 'coordinador', 'psicologo') THEN
        RAISE EXCEPTION 'No tiene permisos para buscar duplicados de estudiantes';
    END IF;

    RETURN QUERY
    SELECT
        e.id,
        (e.first_names || ' ' || e.last_names)::VARCHAR,
        e.document_type,
        e.document_number,
        e.birth_date,
        'dni_match'::TEXT
    FROM estudiantes e
    WHERE e.document_type = p_document_type
      AND e.document_number = p_document_number
      AND (p_exclude_id IS NULL OR e.id != p_exclude_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION check_student_duplicates_by_dni(VARCHAR, VARCHAR, UUID) IS
'T66/B1: solo roles de registro.';

-- check_student_duplicates_by_name (wrapper con authz + 042 GROUP BY)
CREATE OR REPLACE FUNCTION check_student_duplicates_by_name(
    p_first_names VARCHAR,
    p_last_names VARCHAR,
    p_birth_date DATE,
    p_exclude_id UUID DEFAULT NULL
)
RETURNS TABLE (
    student_id UUID,
    full_name VARCHAR,
    document_type VARCHAR,
    document_number VARCHAR,
    birth_date DATE,
    match_type TEXT,
    similarity NUMERIC
) AS $$
DECLARE
    v_role TEXT;
    v_norm_first VARCHAR;
    v_norm_last VARCHAR;
BEGIN
    SELECT role INTO v_role FROM perfiles WHERE user_id = auth.uid();
    IF v_role IS NULL OR v_role NOT IN ('global', 'director', 'admin_ie', 'coordinador', 'psicologo') THEN
        RAISE EXCEPTION 'No tiene permisos para buscar duplicados de estudiantes';
    END IF;

    v_norm_first := LOWER(TRIM(p_first_names));
    v_norm_last := LOWER(TRIM(p_last_names));

    RETURN QUERY
    SELECT
        sub.id,
        (sub.first_names || ' ' || sub.last_names)::VARCHAR,
        sub.document_type,
        sub.document_number,
        sub.birth_date,
        'name_similarity'::TEXT,
        sub.sim
    FROM (
        SELECT
            e.id,
            e.first_names,
            e.last_names,
            e.document_type,
            e.document_number,
            e.birth_date,
            CASE
                WHEN LOWER(TRIM(e.first_names)) = v_norm_first
                 AND LOWER(TRIM(e.last_names)) = v_norm_last THEN 1.0
                WHEN similarity(LOWER(TRIM(e.first_names) || ' ' || LOWER(TRIM(e.last_names))),
                                LOWER(v_norm_first || ' ' || v_norm_last)) >= 0.4
                THEN similarity(LOWER(TRIM(e.first_names) || ' ' || LOWER(TRIM(e.last_names))),
                                LOWER(v_norm_first || ' ' || v_norm_last))
                ELSE 0.0
            END::NUMERIC AS sim
        FROM estudiantes e
        WHERE (p_exclude_id IS NULL OR e.id != p_exclude_id)
    ) sub
    WHERE sub.sim >= 0.4
    ORDER BY sub.sim DESC
    LIMIT 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION check_student_duplicates_by_name(VARCHAR, VARCHAR, DATE, UUID) IS
'T66/B1: authz roles de registro + 042 GROUP/SIM fix.';

-- upsert_family_member: añadir acote de institución para no-global
CREATE OR REPLACE FUNCTION upsert_family_member(
    p_student_id UUID,
    p_type VARCHAR,
    p_full_name VARCHAR,
    p_document_type VARCHAR,
    p_document_number VARCHAR,
    p_phone VARCHAR DEFAULT NULL,
    p_email VARCHAR DEFAULT NULL,
    p_relationship VARCHAR DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_inst UUID;
    v_existing_id UUID;
    v_action TEXT;
BEGIN
    SELECT role, institution_id INTO v_user_role, v_user_inst
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador') THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para gestionar familiares');
    END IF;

    IF v_user_role != 'global' THEN
        IF NOT EXISTS (
            SELECT 1 FROM periodos_escolares
            WHERE student_id = p_student_id AND institution_id = v_user_inst
        ) THEN
            RETURN json_build_object('success', false, 'error', 'El estudiante no pertenece a su institución');
        END IF;
    END IF;

    IF p_full_name IS NULL OR TRIM(p_full_name) = '' THEN
        RETURN json_build_object('success', false, 'error', 'El nombre completo es obligatorio');
    END IF;
    IF p_document_type IS NULL OR TRIM(p_document_type) = '' THEN
        RETURN json_build_object('success', false, 'error', 'El tipo de documento es obligatorio');
    END IF;
    IF p_document_number IS NULL OR TRIM(p_document_number) = '' THEN
        RETURN json_build_object('success', false, 'error', 'El número de documento es obligatorio');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM estudiantes WHERE id = p_student_id) THEN
        RETURN json_build_object('success', false, 'error', 'Estudiante no encontrado');
    END IF;

    SELECT id INTO v_existing_id
    FROM familiares
    WHERE student_id = p_student_id AND type = p_type;

    IF v_existing_id IS NOT NULL THEN
        UPDATE familiares
        SET full_name = TRIM(p_full_name),
            document_type = TRIM(p_document_type),
            document_number = TRIM(p_document_number),
            phone = p_phone,
            email = p_email,
            relationship = p_relationship,
            updated_at = NOW()
        WHERE id = v_existing_id;
        v_action := 'update';

        INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
        VALUES (
            auth.uid(), 'family_member_update', 'familiares', v_existing_id,
            json_build_object('student_id', p_student_id, 'type', p_type, 'full_name', p_full_name)
        );
    ELSE
        INSERT INTO familiares (
            student_id, type, full_name, document_type, document_number,
            phone, email, relationship
        ) VALUES (
            p_student_id, p_type, TRIM(p_full_name),
            TRIM(p_document_type), TRIM(p_document_number),
            p_phone, p_email, p_relationship
        )
        RETURNING id INTO v_existing_id;
        v_action := 'create';

        INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
        VALUES (
            auth.uid(), 'family_member_create', 'familiares', v_existing_id,
            json_build_object(
                'student_id', p_student_id, 'type', p_type, 'full_name', p_full_name,
                'document_type', p_document_type, 'document_number', p_document_number
            )
        );
    END IF;

    RETURN json_build_object(
        'success', true,
        'family_member_id', v_existing_id,
        'action', v_action,
        'message', CASE
            WHEN v_action = 'create' THEN 'Familiar creado exitosamente'
            ELSE 'Familiar actualizado exitosamente'
        END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION upsert_family_member(UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR) IS
'T66/B1: roles + acote de institución del estudiante.';

-- copy_survey: acote de institución origen/destino
CREATE OR REPLACE FUNCTION copy_survey(
    p_source_survey_id UUID,
    p_new_title VARCHAR(255)
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_institution UUID;
    v_source_survey RECORD;
    v_new_survey_id UUID;
    v_new_version_id UUID;
    v_source_version RECORD;
    v_source_section RECORD;
    v_source_question RECORD;
    v_source_option RECORD;
    v_new_section_id UUID;
    v_new_question_id UUID;
BEGIN
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR NOT can_manage_surveys() THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para copiar encuestas');
    END IF;

    SELECT * INTO v_source_survey FROM encuestas WHERE id = p_source_survey_id;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Encuesta origen no encontrada');
    END IF;

    -- Destino siempre = institución propia (no-global)
    IF v_user_role != 'global' THEN
        IF v_user_institution IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'Usuario sin institución asignada');
        END IF;
        -- Origen: propia o (global no aplica aquí)
        IF v_source_survey.institution_id != v_user_institution THEN
            RETURN json_build_object(
                'success', false,
                'error', 'Solo puede copiar encuestas de su institución'
            );
        END IF;
    END IF;

    INSERT INTO encuestas (institution_id, title, description, created_by)
    VALUES (
        CASE WHEN v_user_role = 'global' THEN v_source_survey.institution_id ELSE v_user_institution END,
        p_new_title, v_source_survey.description, auth.uid()
    )
    RETURNING id INTO v_new_survey_id;

    SELECT * INTO v_source_version
    FROM encuesta_versiones
    WHERE survey_id = p_source_survey_id
    ORDER BY version_number DESC LIMIT 1;

    INSERT INTO encuesta_versiones (survey_id, version_number, status)
    VALUES (v_new_survey_id, 1, 'draft')
    RETURNING id INTO v_new_version_id;

    FOR v_source_section IN
        SELECT * FROM encuesta_secciones WHERE version_id = v_source_version.id ORDER BY sort_order
    LOOP
        INSERT INTO encuesta_secciones (version_id, title, description, sort_order)
        VALUES (v_new_version_id, v_source_section.title, v_source_section.description, v_source_section.sort_order)
        RETURNING id INTO v_new_section_id;

        FOR v_source_question IN
            SELECT * FROM encuesta_preguntas WHERE section_id = v_source_section.id ORDER BY sort_order
        LOOP
            INSERT INTO encuesta_preguntas (section_id, question_type, label, description, is_required, sort_order, config, presentation)
            VALUES (
                v_new_section_id, v_source_question.question_type, v_source_question.label,
                v_source_question.description, v_source_question.is_required,
                v_source_question.sort_order, v_source_question.config, v_source_question.presentation
            )
            RETURNING id INTO v_new_question_id;

            FOR v_source_option IN
                SELECT * FROM encuesta_opciones WHERE question_id = v_source_question.id ORDER BY sort_order
            LOOP
                INSERT INTO encuesta_opciones (question_id, label, sort_order)
                VALUES (v_new_question_id, v_source_option.label, v_source_option.sort_order);
            END LOOP;
        END LOOP;
    END LOOP;

    RETURN json_build_object('success', true, 'id', v_new_survey_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION copy_survey(UUID, VARCHAR) IS
'T66/B1: no-global solo copia desde su institución.';

-- publish_survey_version: propiedad de encuesta
CREATE OR REPLACE FUNCTION publish_survey_version(
    p_version_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_version RECORD;
    v_user_role TEXT;
    v_user_inst UUID;
    v_survey_inst UUID;
BEGIN
    IF NOT can_manage_surveys() THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos');
    END IF;

    SELECT v.*, e.institution_id AS survey_inst INTO v_version
    FROM encuesta_versiones v
    JOIN encuestas e ON e.id = v.survey_id
    WHERE v.id = p_version_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Versión no encontrada');
    END IF;

    SELECT role, institution_id INTO v_user_role, v_user_inst
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role != 'global' AND v_version.survey_inst != v_user_inst THEN
        RETURN json_build_object('success', false, 'error', 'La encuesta no pertenece a su institución');
    END IF;

    IF v_version.status != 'draft' THEN
        RETURN json_build_object('success', false, 'error', 'Solo se pueden publicar versiones en borrador');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM encuesta_preguntas p
        JOIN encuesta_secciones s ON s.id = p.section_id
        WHERE s.version_id = p_version_id
    ) THEN
        RETURN json_build_object('success', false, 'error', 'La versión debe tener al menos una pregunta');
    END IF;

    UPDATE encuesta_versiones
    SET status = 'published', published_at = CURRENT_TIMESTAMP, published_by = auth.uid()
    WHERE id = p_version_id;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION publish_survey_version(UUID) IS
'T66/B1: acote de institución de la encuesta antes de publicar.';

-- create_survey_application: institución de la encuesta
CREATE OR REPLACE FUNCTION create_survey_application(
    p_version_id UUID,
    p_year INTEGER,
    p_started_at TIMESTAMP WITH TIME ZONE,
    p_ends_at TIMESTAMP WITH TIME ZONE,
    p_respondent_student_id UUID DEFAULT NULL,
    p_respondent_user_id UUID DEFAULT NULL,
    p_section_name VARCHAR(10) DEFAULT NULL,
    p_grade_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_inst UUID;
    v_version RECORD;
    v_application_id UUID;
    v_token TEXT;
    v_survey_inst UUID;
BEGIN
    SELECT role, institution_id INTO v_user_role, v_user_inst
    FROM perfiles WHERE user_id = auth.uid();

    IF NOT can_manage_surveys() THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para crear aplicaciones');
    END IF;

    SELECT v.*, e.institution_id AS survey_inst, v.status AS version_status
    INTO v_version
    FROM encuesta_versiones v
    JOIN encuestas e ON e.id = v.survey_id
    WHERE v.id = p_version_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Versión no encontrada');
    END IF;

    v_survey_inst := v_version.survey_inst;

    IF v_user_role != 'global' AND v_survey_inst != v_user_inst THEN
        RETURN json_build_object('success', false, 'error', 'La encuesta no pertenece a su institución');
    END IF;

    IF v_version.version_status != 'published' THEN
        RETURN json_build_object('success', false, 'error', 'Solo se pueden crear aplicaciones de versiones publicadas');
    END IF;

    IF p_started_at >= p_ends_at THEN
        RETURN json_build_object('success', false, 'error', 'La fecha de inicio debe ser anterior a la fecha de fin');
    END IF;

    v_token := encode(gen_random_bytes(32), 'hex');

    INSERT INTO encuesta_aplicaciones (
        version_id, institution_id, respondent_student_id, respondent_user_id,
        year, section_name, grade_id, started_at, ends_at, status, access_token
    ) VALUES (
        p_version_id, v_survey_inst,
        p_respondent_student_id, p_respondent_user_id,
        p_year, p_section_name, p_grade_id, p_started_at, p_ends_at,
        CASE WHEN p_started_at <= CURRENT_TIMESTAMP THEN 'active' ELSE 'scheduled' END,
        v_token
    ) RETURNING id INTO v_application_id;

    RETURN json_build_object('success', true, 'id', v_application_id, 'token', v_token);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION create_survey_application(UUID, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, VARCHAR, UUID) IS
'T66/B1: acote de institución de la encuesta al crear aplicación.';

-- ============================================================
-- B2: triggers de máquina de estados (bloquean bypass por UPDATE directo)
-- ============================================================

-- transferencias: pending → approved|rejected | (histórico accepted/completed)
CREATE OR REPLACE FUNCTION enforce_transfer_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
        IF NOT (
            (OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected'))
            OR (OLD.status = 'accepted' AND NEW.status IN ('completed', 'approved'))
            OR (OLD.status = 'approved' AND NEW.status = 'completed')
        ) THEN
            RAISE EXCEPTION 'Transición de estado de transferencia no permitida: % → %',
                OLD.status, NEW.status;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_enforce_transfer_status ON transferencias;
CREATE TRIGGER trg_enforce_transfer_status
    BEFORE UPDATE OF status ON transferencias
    FOR EACH ROW
    EXECUTE FUNCTION enforce_transfer_status_transition();

COMMENT ON FUNCTION enforce_transfer_status_transition() IS
'T66/B2: máquina de estados de transferencias (bloquea bypass directo).';

-- casos: inicio → en_proceso | cerrado; en_proceso → cerrado; cerrado → inicio
CREATE OR REPLACE FUNCTION enforce_caso_estado_transition()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.estado IS DISTINCT FROM OLD.estado THEN
        IF NOT (
            (OLD.estado = 'inicio' AND NEW.estado IN ('en_proceso', 'cerrado'))
            OR (OLD.estado = 'en_proceso' AND NEW.estado = 'cerrado')
            OR (OLD.estado = 'cerrado' AND NEW.estado = 'inicio')
        ) THEN
            RAISE EXCEPTION 'Transición de estado de caso no permitida: % → %',
                OLD.estado, NEW.estado;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_enforce_caso_estado ON casos;
CREATE TRIGGER trg_enforce_caso_estado
    BEFORE UPDATE OF estado ON casos
    FOR EACH ROW
    EXECUTE FUNCTION enforce_caso_estado_transition();

COMMENT ON FUNCTION enforce_caso_estado_transition() IS
'T66/B2: máquina de estados de casos (inicio/en_proceso/cerrado).';

-- atenciones: bloquear UPDATE fuera de ventana de 30 min (hora servidor)
-- (mismo criterio que update_attention RPC — sin bypass por rol)
CREATE OR REPLACE FUNCTION enforce_attention_edit_window()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.motivo IS DISTINCT FROM OLD.motivo
           OR NEW.que_se_hizo IS DISTINCT FROM OLD.que_se_hizo
           OR NEW.observaciones IS DISTINCT FROM OLD.observaciones
           OR NEW.compromisos IS DISTINCT FROM OLD.compromisos
           OR NEW.proxima_atencion IS DISTINCT FROM OLD.proxima_atencion
        THEN
            IF (CURRENT_TIMESTAMP - OLD.created_at) > INTERVAL '30 minutes' THEN
                RAISE EXCEPTION 'La atención solo puede editarse dentro de los 30 minutos posteriores';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_enforce_attention_window ON atenciones;
CREATE TRIGGER trg_enforce_attention_window
    BEFORE UPDATE ON atenciones
    FOR EACH ROW
    EXECUTE FUNCTION enforce_attention_edit_window();

COMMENT ON FUNCTION enforce_attention_edit_window() IS
'T66/B2: ventana 30 min server-side en UPDATE directo (complementa RPC update_attention).';

-- ============================================================
-- B3: necesidades_especiales — SELECT solo Global/Psicólogo (dato clínico)
-- ============================================================
DROP POLICY IF EXISTS "necesidades_select_scoped" ON necesidades_especiales;
DROP POLICY IF EXISTS "necesidades_manage_scoped" ON necesidades_especiales;

CREATE POLICY "necesidades_select_clinical"
    ON necesidades_especiales FOR SELECT
    USING (
        is_global_user()
        OR (
            get_user_role() = 'psicologo'
            AND student_id IN (
                SELECT pe.student_id FROM periodos_escolares pe
                WHERE pe.institution_id = get_user_institution()
            )
        )
    );

CREATE POLICY "necesidades_manage_clinical"
    ON necesidades_especiales FOR ALL
    USING (
        is_global_user()
        OR (
            get_user_role() = 'psicologo'
            AND student_id IN (
                SELECT pe.student_id FROM periodos_escolares pe
                WHERE pe.institution_id = get_user_institution()
            )
        )
    )
    WITH CHECK (
        is_global_user()
        OR (
            get_user_role() = 'psicologo'
            AND student_id IN (
                SELECT pe.student_id FROM periodos_escolares pe
                WHERE pe.institution_id = get_user_institution()
            )
        )
    );

-- ============================================================
-- Verificación runtime
-- ============================================================
DO $$
DECLARE
    n INT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace ns ON ns.oid = p.pronamespace
        WHERE ns.nspname = 'public' AND p.proname = 'claim_first_global'
    ) THEN
        RAISE EXCEPTION 'Error: claim_first_global ausente';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace ns ON ns.oid = p.pronamespace
        WHERE ns.nspname = 'public' AND p.proname = 'prepare_promotion'
    ) THEN
        RAISE EXCEPTION 'Error: prepare_promotion ausente';
    END IF;

    SELECT count(*) INTO n FROM pg_trigger
    WHERE tgname IN ('trg_enforce_transfer_status', 'trg_enforce_caso_estado', 'trg_enforce_attention_window');
    IF n < 3 THEN
        RAISE EXCEPTION 'Error: triggers de máquina de estados no aplicados (n=%)', n;
    END IF;

    SELECT count(*) INTO n FROM pg_policies
    WHERE tablename = 'necesidades_especiales'
      AND policyname IN ('necesidades_select_clinical', 'necesidades_manage_clinical');
    IF n < 2 THEN
        RAISE EXCEPTION 'Error: policies necesidades clínicas no aplicadas';
    END IF;
END $$;

-- Migración 045: T65 fixes críticos/high (trazabilidad DC + seguridad + correcciones técnicas)
-- Evolución Psicológica
--
-- Fuentes: DC-003/DC-005/DC-006 (00_DECISIONES), CONSTITUTION 5/7/8,
-- SPECIFY multi-institución, 024/036/039 patrones de re-scope, 041/044 fixes.
-- NO altera reglas de negocio no confirmadas (ver reporte T65).

-- ============================================================
-- C1: handle_new_user — no confiar role del cliente (DC-006 intent)
-- Solo roles no privilegiados en signup; privileged = RPC autenticadas.
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_role TEXT;
BEGIN
    v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'docente');
    -- Whitelist: signup jamás otorga global/director/admin_ie/coordinador/psicologo
    IF v_role NOT IN ('docente') THEN
        v_role := 'docente';
    END IF;

    INSERT INTO perfiles (user_id, full_name, document_number, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'document_number', ''),
        v_role
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION handle_new_user() IS
'Perfil al signup. Role forzado a docente (whitelist); privilegiados solo vía RPC. T65/C1.';

-- ============================================================
-- L1: search_path en helpers tempranos
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
    SELECT role FROM perfiles WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION get_user_institution()
RETURNS UUID AS $$
    SELECT institution_id FROM perfiles WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION is_global_user()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM perfiles
        WHERE user_id = auth.uid() AND role = 'global'
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

-- ============================================================
-- C2: derivaciones — re-scope institucional (drop FOR ALL sin institución)
-- ============================================================
DROP POLICY IF EXISTS "Coordinator and Director can manage referrals" ON derivaciones;
DROP POLICY IF EXISTS "Psych can view referrals in institution" ON derivaciones;

CREATE POLICY "derivaciones_select_scoped"
    ON derivaciones FOR SELECT
    USING (
        is_global_user()
        OR (
            get_user_role() IN ('director', 'admin_ie', 'coordinador', 'psicologo', 'docente')
            AND student_id IN (
                SELECT pe.student_id FROM periodos_escolares pe
                WHERE pe.institution_id = get_user_institution()
            )
        )
    );

CREATE POLICY "derivaciones_insert_scoped"
    ON derivaciones FOR INSERT
    WITH CHECK (
        is_global_user()
        OR (
            get_user_role() IN ('director', 'admin_ie', 'coordinador', 'psicologo')
            AND student_id IN (
                SELECT pe.student_id FROM periodos_escolares pe
                WHERE pe.institution_id = get_user_institution()
            )
        )
    );

CREATE POLICY "derivaciones_update_scoped"
    ON derivaciones FOR UPDATE
    USING (
        is_global_user()
        OR (
            get_user_role() IN ('director', 'admin_ie', 'coordinador', 'psicologo')
            AND student_id IN (
                SELECT pe.student_id FROM periodos_escolares pe
                WHERE pe.institution_id = get_user_institution()
            )
        )
    );

-- DELETE clínico: solo global (CONSTITUTION 8 — no borrado físico por roles IE)
CREATE POLICY "derivaciones_delete_global"
    ON derivaciones FOR DELETE
    USING (is_global_user());

-- ============================================================
-- C3: necesidades_especiales — re-scope institucional
-- ============================================================
DROP POLICY IF EXISTS "Psychologist can view all special needs" ON necesidades_especiales;
DROP POLICY IF EXISTS "Global and Psychologist can manage special needs" ON necesidades_especiales;

CREATE POLICY "necesidades_select_scoped"
    ON necesidades_especiales FOR SELECT
    USING (
        is_global_user()
        OR (
            get_user_role() IN ('director', 'admin_ie', 'coordinador', 'psicologo')
            AND student_id IN (
                SELECT pe.student_id FROM periodos_escolares pe
                WHERE pe.institution_id = get_user_institution()
            )
        )
    );

CREATE POLICY "necesidades_manage_scoped"
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
-- C4: auditoría de encuestas con auth.uid() NULL (respondente anónimo)
-- ============================================================
CREATE OR REPLACE FUNCTION audit_survey_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
        VALUES (
            COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
            'insert', TG_TABLE_NAME, NEW.id,
            to_jsonb(NEW)
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO auditoria (user_id, action, table_name, record_id, old_values, new_values)
        VALUES (
            COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
            'update', TG_TABLE_NAME, NEW.id,
            to_jsonb(OLD), to_jsonb(NEW)
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO auditoria (user_id, action, table_name, record_id, old_values)
        VALUES (
            COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
            'delete', TG_TABLE_NAME, OLD.id,
            to_jsonb(OLD)
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION audit_survey_changes() IS
'Auditoría encuestas. COALESCE auth.uid() a UUID sistema para respondentes anónimos. T65/C4.';

-- ============================================================
-- H2: EXCLUDE periodos — períodos activos sí se chequean
-- ============================================================
ALTER TABLE periodos_escolares
    DROP CONSTRAINT IF EXISTS periodos_escolares_student_year_excl;

ALTER TABLE periodos_escolares
    ADD CONSTRAINT periodos_escolares_student_year_excl
    EXCLUDE USING gist (
        student_id WITH =,
        school_year WITH =,
        daterange(start_date, COALESCE(end_date, 'infinity'::date), '[]') WITH &&
    );

-- ============================================================
-- H5: auditoria — clients no insertan (solo DEFINER/triggers)
-- ============================================================
REVOKE INSERT ON auditoria FROM anon, authenticated, public;
-- SELECT/UPDATE/DELETE ya controlados por policies; INSERT forjado bloqueado

-- ============================================================
-- H3: transferencias — índice único parcial + FOR UPDATE en accept
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS ux_transferencias_active_caso
    ON transferencias (caso_id)
    WHERE status IN ('pending', 'accepted');

CREATE OR REPLACE FUNCTION accept_transfer(
    p_transfer_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_institution UUID;
    v_transfer RECORD;
    v_caso RECORD;
    v_new_period_id UUID;
    v_dest_nivel UUID;
    v_dest_grado UUID;
    v_director UUID;
    v_open_row_id UUID;
    v_until TIMESTAMPTZ;
BEGIN
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no autenticado');
    END IF;

    IF v_user_role NOT IN ('global', 'director', 'admin_ie') THEN
        RETURN json_build_object('success', false, 'error', 'Solo Director o Admin I.E. pueden aceptar transferencias');
    END IF;

    SELECT * INTO v_transfer
    FROM transferencias
    WHERE id = p_transfer_id
    FOR UPDATE;

    IF v_transfer IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Transferencia no encontrada');
    END IF;

    IF v_user_role != 'global' AND v_transfer.destination_institution_id != v_user_institution THEN
        RETURN json_build_object('success', false, 'error', 'Solo puede aceptar transferencias destinadas a su institución');
    END IF;

    IF v_transfer.status != 'pending' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo se pueden aceptar transferencias pendientes. Estado actual: ' || v_transfer.status
        );
    END IF;

    SELECT * INTO v_caso FROM casos WHERE id = v_transfer.caso_id;
    IF v_caso IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Caso no encontrado');
    END IF;

    -- Validar nivel/grado pertenecen al destino (o NULLs explícitos)
    v_dest_nivel := v_transfer.destination_nivel_id;
    v_dest_grado := v_transfer.destination_grado_id;

    IF v_dest_nivel IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM niveles_educativos
        WHERE id = v_dest_nivel AND institution_id = v_transfer.destination_institution_id
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Nivel destino no pertenece a la institución destino');
    END IF;

    IF v_dest_grado IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM grados g
        JOIN niveles_educativos n ON g.nivel_id = n.id
        WHERE g.id = v_dest_grado AND n.institution_id = v_transfer.destination_institution_id
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Grado destino no pertenece a la institución destino');
    END IF;

    -- Cerrar fila abierta del historial del responsable origen (si la hay)
    SELECT id INTO v_open_row_id
    FROM caso_responsables_historial
    WHERE caso_id = v_transfer.caso_id
    AND hasta IS NULL
    ORDER BY desde DESC
    LIMIT 1;

    IF v_open_row_id IS NOT NULL THEN
        SELECT desde INTO v_until FROM caso_responsables_historial WHERE id = v_open_row_id;
        v_until := GREATEST(NOW(), v_until + INTERVAL '1 microsecond');
        UPDATE caso_responsables_historial
        SET hasta = v_until, motivo_salida = 'transferencia'
        WHERE id = v_open_row_id;
    END IF;

    -- Crear período en destino
    BEGIN
        INSERT INTO periodos_escolares (
            student_id, institution_id, school_year,
            nivel_id, grado_id, section, start_date, tipo
        ) VALUES (
            v_caso.student_id,
            v_transfer.destination_institution_id,
            v_transfer.school_year,
            v_dest_nivel,
            v_dest_grado,
            v_transfer.section,
            CURRENT_DATE,
            'regular'
        )
        RETURNING id INTO v_new_period_id;
    EXCEPTION WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', 'Error al crear período destino: ' || SQLERRM);
    END;

    -- Actualizar transferencia
    UPDATE transferencias
    SET status = 'accepted',
        accepted_at = CURRENT_TIMESTAMP,
        accepted_by = auth.uid()
    WHERE id = p_transfer_id;

    -- Responsable en destino (si hay director/admin)
    SELECT user_id INTO v_director
    FROM perfiles
    WHERE institution_id = v_transfer.destination_institution_id
    AND role IN ('director', 'admin_ie')
    LIMIT 1;

    IF v_director IS NOT NULL THEN
        UPDATE casos
        SET current_responsible_id = v_director,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_transfer.caso_id;

        INSERT INTO caso_responsables_historial (caso_id, responsible_id, desde)
        VALUES (v_transfer.caso_id, v_director, NOW());
    END IF;

    INSERT INTO auditoria (user_id, action, table_name, record_id, old_values, new_values)
    VALUES (
        auth.uid(), 'transfer_accepted', 'transferencias', p_transfer_id,
        json_build_object('status', 'pending'),
        json_build_object('status', 'accepted', 'new_period_id', v_new_period_id)
    );

    RETURN json_build_object(
        'success', true,
        'status', 'accepted',
        'new_period_id', v_new_period_id,
        'message', 'Transferencia aceptada. Se creó el período escolar en la institución destino.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION accept_transfer(UUID) IS
'Acepta transferencia. FOR UPDATE, valida nivel/grado destino, cierra historial origen. T65/H3.';

-- ============================================================
-- H4: estudiantes — SELECT por institución; DELETE solo global
-- ============================================================
DROP POLICY IF EXISTS "Registration roles can view students" ON estudiantes;
DROP POLICY IF EXISTS "Admins can delete students" ON estudiantes;

CREATE POLICY "estudiantes_select_scoped"
    ON estudiantes FOR SELECT
    USING (
        is_global_user()
        OR (
            get_user_role() IN ('director', 'admin_ie', 'coordinador', 'psicologo', 'docente')
            AND EXISTS (
                SELECT 1 FROM periodos_escolares pe
                WHERE pe.student_id = estudiantes.id
                AND pe.institution_id = get_user_institution()
            )
        )
        OR (
            -- sin período aún: solo roles de registro ven para evitar duplicados DNI
            get_user_role() IN ('director', 'admin_ie', 'coordinador', 'psicologo')
            AND NOT EXISTS (
                SELECT 1 FROM periodos_escolares pe WHERE pe.student_id = estudiantes.id
            )
        )
    );

CREATE POLICY "estudiantes_delete_global"
    ON estudiantes FOR DELETE
    USING (is_global_user());

-- ============================================================
-- M1: json_agg + ORDER BY interno (misma clase que 041/044)
-- ============================================================
CREATE OR REPLACE FUNCTION get_promotion_wizard(
    p_institution_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_institution UUID;
    v_niveles JSON;
    v_grados JSON;
BEGIN
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador') THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para realizar promoción');
    END IF;

    IF v_user_role != 'global' AND v_user_institution != p_institution_id THEN
        RETURN json_build_object('success', false, 'error', 'Solo puede promover en su institución');
    END IF;

    SELECT COALESCE(json_agg(json_build_object(
        'order_number', n.order_number,
        'name', n.name,
        'id', n.id
    ) ORDER BY n.order_number), '[]'::json)
    INTO v_niveles
    FROM niveles_educativos n
    WHERE n.institution_id = p_institution_id;

    SELECT COALESCE(json_agg(json_build_object(
        'order_number', g.order_number,
        'name', g.name,
        'id', g.id,
        'nivel_id', g.nivel_id
    ) ORDER BY g.order_number), '[]'::json)
    INTO v_grados
    FROM grados g
    JOIN niveles_educativos n ON g.nivel_id = n.id
    WHERE n.institution_id = p_institution_id;

    RETURN json_build_object(
        'success', true,
        'niveles', v_niveles,
        'grados', v_grados
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION get_promotion_wizard(UUID) IS
'Wizard promoción. ORDER BY dentro de json_agg. T65/M1.';

-- get_survey_versions: auth + ORDER BY interno
CREATE OR REPLACE FUNCTION get_survey_versions(
    p_survey_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_ok BOOLEAN;
    v_rows JSON;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No autenticado');
    END IF;

    SELECT can_manage_surveys() INTO v_ok;
    IF NOT v_ok AND NOT is_global_user() THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos');
    END IF;

    -- al menos una versión de encuesta accesible en institución propia o global
    IF NOT is_global_user() AND NOT EXISTS (
        SELECT 1 FROM encuestas e
        WHERE e.id = p_survey_id
        AND e.institution_id = get_user_institution()
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Encuesta no encontrada');
    END IF;

    SELECT COALESCE(json_agg(json_build_object(
        'id', v.id,
        'version_number', v.version_number,
        'status', v.status,
        'published_at', v.published_at
    ) ORDER BY v.version_number DESC), '[]'::json)
    INTO v_rows
    FROM encuesta_versiones v
    WHERE v.survey_id = p_survey_id;

    RETURN json_build_object('success', true, 'versions', v_rows);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION get_survey_versions(UUID) IS
'Versiones de encuesta. Auth + institución + ORDER BY interno. T65/M1/H1.';

-- ============================================================
-- M2: triggers DELETE no referencian NEW antes de asignarse
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_published_section_change()
RETURNS TRIGGER AS $$
DECLARE
    v_version_id UUID;
    v_status TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_version_id := OLD.version_id;
    ELSE
        v_version_id := NEW.version_id;
    END IF;

    SELECT status INTO v_status FROM encuesta_versiones WHERE id = v_version_id;
    IF v_status = 'published' THEN
        RAISE EXCEPTION 'No se puede modificar una versión publicada';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION prevent_published_question_change()
RETURNS TRIGGER AS $$
DECLARE
    v_version_id UUID;
    v_status TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT version_id INTO v_version_id FROM encuesta_secciones WHERE id = OLD.section_id;
    ELSE
        SELECT version_id INTO v_version_id FROM encuesta_secciones WHERE id = NEW.section_id;
    END IF;

    SELECT status INTO v_status FROM encuesta_versiones WHERE id = v_version_id;
    IF v_status = 'published' THEN
        RAISE EXCEPTION 'No se puede modificar una versión publicada';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION prevent_published_option_change()
RETURNS TRIGGER AS $$
DECLARE
    v_version_id UUID;
    v_status TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT s.version_id INTO v_version_id
        FROM encuesta_preguntas p
        JOIN encuesta_secciones s ON p.section_id = s.id
        WHERE p.id = OLD.question_id;
    ELSE
        SELECT s.version_id INTO v_version_id
        FROM encuesta_preguntas p
        JOIN encuesta_secciones s ON p.section_id = s.id
        WHERE p.id = NEW.question_id;
    END IF;

    SELECT status INTO v_status FROM encuesta_versiones WHERE id = v_version_id;
    IF v_status = 'published' THEN
        RAISE EXCEPTION 'No se puede modificar una versión publicada';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION prevent_published_section_change() IS
'Bloquea cambios en versión publicada. DELETE usa OLD primero. T65/M2.';

-- ============================================================
-- H6: execute_promotion — FAILED/INTERRUPTED reanudables
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

        IF v_existing_batch.status IN ('PREPARED', 'RUNNING', 'FAILED', 'INTERRUPTED') THEN
            v_batch_id := v_existing_batch.id;
            UPDATE lotes_promocion
            SET status = 'RUNNING'
            WHERE id = v_batch_id;
        END IF;
    ELSE
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

        INSERT INTO lotes_promocion (
            institution_id, origin_year, destination_year,
            started_by, status, idempotency_key
        ) VALUES (
            p_institution_id, p_origin_year, p_destination_year,
            auth.uid(), 'RUNNING', p_idempotency_key
        )
        RETURNING id INTO v_batch_id;
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
        WHERE batch_id = v_batch_id
        AND student_id = v_student.student_id;

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
                SET end_date = CURRENT_DATE,
                    motivo_retiro = 'egreso'
                WHERE id = v_student.period_id;

                UPDATE acciones_promocion
                SET status = 'processed',
                    processed_at = CURRENT_TIMESTAMP
                WHERE id = v_action_id;

                v_egreso_count := v_egreso_count + 1;
            ELSE
                UPDATE periodos_escolares
                SET end_date = CURRENT_DATE,
                    motivo_retiro = 'promocion'
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
                SET status = 'processed',
                    processed_at = CURRENT_TIMESTAMP
                WHERE id = v_action_id;

                v_processed := v_processed + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
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
            'errors', v_errors
        )
    WHERE id = v_batch_id;

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
        'errors', v_errors
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION execute_promotion(UUID, INTEGER, INTEGER, VARCHAR) IS
'Ejecuta promoción. FOR UPDATE, FAILED/INTERRUPTED reanudables, batch_id null-safe. T65/H6.';

-- ============================================================
-- H1 parcial: licencia funciones — mínimo rol
-- ============================================================
CREATE OR REPLACE FUNCTION get_expiring_licenses()
RETURNS JSON AS $$
DECLARE
    v_role TEXT;
    v_today DATE;
BEGIN
    SELECT role INTO v_role FROM perfiles WHERE user_id = auth.uid();
    IF v_role IS DISTINCT FROM 'global' THEN
        RETURN json_build_object('success', false, 'error', 'Solo Global puede ver licencias por vencer');
    END IF;

    v_today := CURRENT_DATE;

    RETURN (
        SELECT json_build_object(
            'success', true,
            'data', (
                SELECT json_agg(
                    json_build_object(
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
                    )
                    ORDER BY l.end_date ASC
                )
                FROM licencias l
                JOIN institutions i ON i.id = l.institution_id
                WHERE l.end_date <= v_today + 30
            )
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION get_expiring_licenses() IS
'Licencias ≤30 días / vencidas. Solo Global. ORDER BY interno. T65/H1+M1.';

-- get_license_status: caller solo propia institución o global
CREATE OR REPLACE FUNCTION get_license_status(
    p_institution_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_role TEXT;
    v_inst UUID;
    v_license RECORD;
    v_today DATE;
    v_days_remaining INTEGER;
    v_status TEXT;
    v_message TEXT;
BEGIN
    SELECT role, institution_id INTO v_role, v_inst
    FROM perfiles WHERE user_id = auth.uid();

    IF v_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no autenticado');
    END IF;

    IF v_role != 'global' AND v_inst != p_institution_id THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para ver esta licencia');
    END IF;

    v_today := CURRENT_DATE;

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

    IF v_license.start_date <= v_today AND v_license.end_date >= v_today THEN
        IF v_days_remaining <= 30 THEN
            v_status := 'expiring_soon';
            v_message := 'Faltan ' || v_days_remaining || ' día(s) para el vencimiento de la licencia.';
        ELSE
            v_status := 'active';
            v_message := 'Licencia vigente.';
        END IF;
    ELSIF v_license.end_date < v_today THEN
        v_status := 'expired';
        v_message := 'Licencia vencida. Las nuevas atenciones psicológicas están bloqueadas.';
    ELSIF v_license.start_date > v_today THEN
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
'Estado licencia. Solo propia institución o Global. T65/H1.';

-- ============================================================
-- Verificación runtime
-- ============================================================
DO $$
DECLARE
    n INT;
BEGIN
    SELECT count(*) INTO n FROM pg_policies
    WHERE tablename = 'derivaciones'
    AND policyname LIKE 'derivaciones_%';
    IF n < 4 THEN
        RAISE EXCEPTION 'Error: policies derivaciones no aplicadas (n=%)', n;
    END IF;

    SELECT count(*) INTO n FROM pg_constraint
    WHERE conname = 'periodos_escolares_student_year_excl';
    IF n = 0 THEN
        RAISE EXCEPTION 'Error: EXCLUDE periodos no recriado';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace ns ON ns.oid = p.pronamespace
        WHERE p.proname = 'handle_new_user'
        AND ns.nspname = 'public'
    ) THEN
        RAISE EXCEPTION 'Error: handle_new_user ausente';
    END IF;
END $$;

-- ============================================================
-- 057 — FASE 6 (ENC/APL/RESP)
-- P1 (§10) resuelto por el dueño: respondiente ÚNICO por
-- aplicación → crear N aplicaciones en lote para APL-02.
-- Además:
--  * complete_respondent_profile (RESP-03, §E.12): el
--    respondiente anónimo completa sus datos faltantes vía
--    token (RLS no permite INSERT/UPDATE anónimo).
--  * get_application_answers (APL-06): visor de respuestas
--    para roles con permiso (la existente
--    get_application_responses exige access_token).
--  * Límite de intentos de DNI con enfriamiento (RESP-02):
--    tabla encuesta_intentos_acceso + reemplazo de
--    validate_survey_access (mensaje genérico del spec).
-- ============================================================

-- ------------------------------------------------------------
-- RESP-02: control de intentos de acceso por DNI
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS encuesta_intentos_acceso (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES encuesta_aplicaciones(id) ON DELETE CASCADE,
    document_number VARCHAR(50) NOT NULL,
    attempted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_encuesta_intentos_lookup
    ON encuesta_intentos_acceso (application_id, document_number, attempted_at);

ALTER TABLE encuesta_intentos_acceso ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION validate_survey_access(
    p_token TEXT,
    p_dni VARCHAR(20)
)
RETURNS JSON AS $$
DECLARE
    v_application RECORD;
    v_respondent RECORD;
    v_student RECORD;
    v_dni VARCHAR(20);
    v_fails_dni INT;
    v_fails_app INT;
BEGIN
    v_dni := UPPER(TRIM(COALESCE(p_dni, '')));

    IF v_dni = '' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No encontramos un registro con este DNI para esta encuesta. Consulta con tu I.E.'
        );
    END IF;

    SELECT * INTO v_application
    FROM encuesta_aplicaciones
    WHERE access_token = p_token;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Enlace no válido');
    END IF;

    IF CURRENT_TIMESTAMP < v_application.started_at THEN
        RETURN json_build_object(
            'success', false,
            'error', 'La aplicación aún no está disponible',
            'opens_at', v_application.started_at
        );
    END IF;

    IF CURRENT_TIMESTAMP > v_application.ends_at THEN
        RETURN json_build_object(
            'success', false,
            'error', 'La aplicación ha expirado',
            'closed_at', v_application.ends_at
        );
    END IF;

    IF v_application.status NOT IN ('active', 'extended', 'scheduled') THEN
        RETURN json_build_object('success', false, 'error', 'La aplicación no está disponible');
    END IF;

    SELECT COUNT(*) INTO v_fails_dni
    FROM encuesta_intentos_acceso
    WHERE application_id = v_application.id
      AND document_number = v_dni
      AND NOT success
      AND attempted_at > CURRENT_TIMESTAMP - INTERVAL '15 minutes';

    IF v_fails_dni >= 5 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.'
        );
    END IF;

    SELECT COUNT(*) INTO v_fails_app
    FROM encuesta_intentos_acceso
    WHERE application_id = v_application.id
      AND NOT success
      AND attempted_at > CURRENT_TIMESTAMP - INTERVAL '15 minutes';

    IF v_fails_app >= 50 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.'
        );
    END IF;

    IF v_application.respondent_student_id IS NOT NULL THEN
        SELECT * INTO v_student
        FROM estudiantes
        WHERE id = v_application.respondent_student_id AND document_number = v_dni;

        IF NOT FOUND THEN
            INSERT INTO encuesta_intentos_acceso (application_id, document_number, success)
            VALUES (v_application.id, v_dni, FALSE);
            RETURN json_build_object(
                'success', false,
                'error', 'No encontramos un registro con este DNI para esta encuesta. Consulta con tu I.E.'
            );
        END IF;

        DELETE FROM encuesta_intentos_acceso
        WHERE application_id = v_application.id
          AND document_number = v_dni
          AND NOT success;

        RETURN json_build_object(
            'success', true,
            'application_id', v_application.id,
            'respondent_type', 'student',
            'respondent_id', v_student.id,
            'name', v_student.first_names || ' ' || v_student.last_names
        );
    ELSE
        SELECT * INTO v_respondent
        FROM perfiles
        WHERE user_id = v_application.respondent_user_id AND document_number = v_dni;

        IF NOT FOUND THEN
            INSERT INTO encuesta_intentos_acceso (application_id, document_number, success)
            VALUES (v_application.id, v_dni, FALSE);
            RETURN json_build_object(
                'success', false,
                'error', 'No encontramos un registro con este DNI para esta encuesta. Consulta con tu I.E.'
            );
        END IF;

        DELETE FROM encuesta_intentos_acceso
        WHERE application_id = v_application.id
          AND document_number = v_dni
          AND NOT success;

        RETURN json_build_object(
            'success', true,
            'application_id', v_application.id,
            'respondent_type', 'user',
            'respondent_id', v_respondent.user_id,
            'name', v_respondent.full_name
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION validate_survey_access(TEXT, VARCHAR) IS
'RESP-02/F6: token + ventana + DNI con límite de intentos (5 por DNI / 50 por aplicación cada 15 min) y mensaje genérico del spec.';

-- ------------------------------------------------------------
-- APL-02 (§E.9): lote de aplicaciones — 1 por respondiente
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION bulk_create_survey_applications(
    p_version_id UUID,
    p_year INTEGER,
    p_started_at TIMESTAMP WITH TIME ZONE,
    p_ends_at TIMESTAMP WITH TIME ZONE,
    p_section_name VARCHAR(10) DEFAULT NULL,
    p_grade_id UUID DEFAULT NULL,
    p_student_ids UUID[] DEFAULT '{}',
    p_user_ids UUID[] DEFAULT '{}'
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_inst UUID;
    v_version RECORD;
    v_survey_inst UUID;
    v_students UUID[];
    v_users UUID[];
    v_student_id UUID;
    v_user_id UUID;
    v_application_id UUID;
    v_token TEXT;
    v_ids UUID[] := '{}';
    v_status VARCHAR(20);
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

    SELECT ARRAY(
        SELECT DISTINCT unnest(p_student_ids)
    ) INTO v_students;

    SELECT ARRAY(
        SELECT DISTINCT unnest(p_user_ids)
    ) INTO v_users;

    IF COALESCE(array_length(v_students, 1), 0) = 0
       AND COALESCE(array_length(v_users, 1), 0) = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Selecciona al menos un respondiente');
    END IF;

    FOR v_student_id IN SELECT unnest(v_students) LOOP
        IF NOT EXISTS (
            SELECT 1 FROM estudiantes WHERE id = v_student_id
        ) THEN
            RETURN json_build_object('success', false, 'error', 'Uno de los estudiantes seleccionados no existe');
        END IF;
    END LOOP;

    FOR v_user_id IN SELECT unnest(v_users) LOOP
        IF NOT EXISTS (
            SELECT 1 FROM perfiles WHERE user_id = v_user_id
        ) THEN
            RETURN json_build_object('success', false, 'error', 'Uno de los usuarios seleccionados no existe');
        END IF;
    END LOOP;

    v_status := CASE WHEN p_started_at <= CURRENT_TIMESTAMP THEN 'active' ELSE 'scheduled' END;

    FOR v_student_id IN SELECT unnest(v_students) LOOP
        v_token := encode(gen_random_bytes(32), 'hex');
        INSERT INTO encuesta_aplicaciones (
            version_id, institution_id, respondent_student_id, respondent_user_id,
            year, section_name, grade_id, started_at, ends_at, status, access_token
        ) VALUES (
            p_version_id, v_survey_inst, v_student_id, NULL,
            p_year, p_section_name, p_grade_id, p_started_at, p_ends_at,
            v_status, v_token
        ) RETURNING id INTO v_application_id;
        v_ids := array_append(v_ids, v_application_id);
    END LOOP;

    FOR v_user_id IN SELECT unnest(v_users) LOOP
        v_token := encode(gen_random_bytes(32), 'hex');
        INSERT INTO encuesta_aplicaciones (
            version_id, institution_id, respondent_student_id, respondent_user_id,
            year, section_name, grade_id, started_at, ends_at, status, access_token
        ) VALUES (
            p_version_id, v_survey_inst, NULL, v_user_id,
            p_year, p_section_name, p_grade_id, p_started_at, p_ends_at,
            v_status, v_token
        ) RETURNING id INTO v_application_id;
        v_ids := array_append(v_ids, v_application_id);
    END LOOP;

    RETURN json_build_object(
        'success', true,
        'created', COALESCE(array_length(v_ids, 1), 0),
        'application_ids', to_jsonb(v_ids)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION bulk_create_survey_applications(UUID, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, VARCHAR, UUID, UUID[], UUID[]) IS
'APL-02/F6 (§E.9, P1): crea N aplicaciones (1 por respondiente) en una sola transacción con token propio cada una.';

REVOKE ALL ON FUNCTION bulk_create_survey_applications(UUID, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, VARCHAR, UUID, UUID[], UUID[]) FROM anon;

-- ------------------------------------------------------------
-- RESP-03 (§E.12): completar datos del respondiente vía token
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION complete_respondent_profile(
    p_token TEXT,
    p_fields JSONB
)
RETURNS JSON AS $$
DECLARE
    v_application RECORD;
    v_student_id UUID;
    v_guardian JSONB;
    v_guardian_type VARCHAR(20);
    v_birth_date DATE;
BEGIN
    SELECT * INTO v_application
    FROM encuesta_aplicaciones
    WHERE access_token = p_token;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Enlace no válido');
    END IF;

    IF CURRENT_TIMESTAMP < v_application.started_at THEN
        RETURN json_build_object('success', false, 'error', 'La aplicación aún no está disponible');
    END IF;

    IF CURRENT_TIMESTAMP > v_application.ends_at THEN
        RETURN json_build_object(
            'success', false,
            'error', 'La aplicación ha expirado',
            'closed_at', v_application.ends_at
        );
    END IF;

    IF v_application.status NOT IN ('active', 'extended') THEN
        RETURN json_build_object('success', false, 'error', 'La aplicación no está disponible');
    END IF;

    v_student_id := v_application.respondent_student_id;

    IF v_student_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Este respondiente no tiene datos adicionales que completar');
    END IF;

    IF p_fields IS NULL OR jsonb_typeof(p_fields) != 'object' THEN
        RETURN json_build_object('success', false, 'error', 'Datos a completar no válidos');
    END IF;

    IF p_fields = '{}'::jsonb THEN
        RETURN (
            SELECT jsonb_build_object(
                'success', true,
                'data', jsonb_build_object(
                    'first_names', s.first_names,
                    'last_names', s.last_names,
                    'document_type', s.document_type,
                    'document_number', s.document_number,
                    'birth_date', s.birth_date,
                    'birth_place', s.birth_place,
                    'address', s.address,
                    'phone', s.phone,
                    'email', s.email,
                    'guardian', (
                        SELECT jsonb_build_object(
                            'type', f.type,
                            'full_name', f.full_name,
                            'document_type', f.document_type,
                            'document_number', f.document_number,
                            'phone', f.phone,
                            'email', f.email,
                            'relationship', f.relationship
                        )
                        FROM familiares f
                        WHERE f.student_id = s.id
                        ORDER BY CASE f.type WHEN 'padre' THEN 1 WHEN 'madre' THEN 2 ELSE 3 END
                        LIMIT 1
                    )
                )
            )
            FROM estudiantes s
            WHERE s.id = v_student_id
        );
    END IF;

    IF p_fields ? 'birth_date' AND p_fields->>'birth_date' IS NOT NULL
       AND TRIM(p_fields->>'birth_date') != '' THEN
        BEGIN
            v_birth_date := (p_fields->>'birth_date')::date;
        EXCEPTION WHEN others THEN
            RETURN json_build_object('success', false, 'error', 'Fecha de nacimiento no válida');
        END;
    END IF;

    UPDATE estudiantes SET
        birth_date = CASE
            WHEN p_fields ? 'birth_date'
                 AND COALESCE(TRIM(p_fields->>'birth_date'), '') != ''
            THEN v_birth_date
            ELSE birth_date
        END,
        birth_place = CASE
            WHEN p_fields ? 'birth_place'
            THEN NULLIF(TRIM(COALESCE(p_fields->>'birth_place', '')), '')
            ELSE birth_place
        END,
        address = CASE
            WHEN p_fields ? 'address'
            THEN NULLIF(TRIM(COALESCE(p_fields->>'address', '')), '')
            ELSE address
        END,
        phone = CASE
            WHEN p_fields ? 'phone'
            THEN NULLIF(TRIM(COALESCE(p_fields->>'phone', '')), '')
            ELSE phone
        END,
        email = CASE
            WHEN p_fields ? 'email'
            THEN NULLIF(TRIM(COALESCE(p_fields->>'email', '')), '')
            ELSE email
        END
    WHERE id = v_student_id;

    IF p_fields ? 'guardian'
       AND jsonb_typeof(p_fields->'guardian') = 'object'
       AND COALESCE(TRIM(p_fields->'guardian'->>'full_name'), '') != '' THEN
        v_guardian := p_fields->'guardian';
        v_guardian_type := COALESCE(NULLIF(TRIM(v_guardian->>'type'), ''), 'guardian');

        IF v_guardian_type NOT IN ('padre', 'madre', 'guardian') THEN
            RETURN json_build_object('success', false, 'error', 'Tipo de apoderado no válido');
        END IF;

        IF COALESCE(TRIM(v_guardian->>'document_number'), '') = '' THEN
            RETURN json_build_object('success', false, 'error', 'El documento del apoderado es obligatorio');
        END IF;

        INSERT INTO familiares (
            student_id, type, full_name, document_type, document_number, phone, email, relationship
        ) VALUES (
            v_student_id,
            v_guardian_type,
            TRIM(v_guardian->>'full_name'),
            COALESCE(NULLIF(TRIM(v_guardian->>'document_type'), ''), 'DNI'),
            TRIM(v_guardian->>'document_number'),
            NULLIF(TRIM(COALESCE(v_guardian->>'phone', '')), ''),
            NULLIF(TRIM(COALESCE(v_guardian->>'email', '')), ''),
            NULLIF(TRIM(COALESCE(v_guardian->>'relationship', '')), '')
        )
        ON CONFLICT (student_id, type) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            document_type = EXCLUDED.document_type,
            document_number = EXCLUDED.document_number,
            phone = EXCLUDED.phone,
            email = EXCLUDED.email,
            relationship = EXCLUDED.relationship,
            updated_at = CURRENT_TIMESTAMP;
    END IF;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION complete_respondent_profile(TEXT, JSONB) IS
'RESP-03/F6 (§E.12): p_fields={} devuelve los datos actuales (lectura); con campos, el respondiente anónimo completa datos faltantes del estudiante y su apoderado usando el token de la aplicación.';

-- ------------------------------------------------------------
-- APL-06: visor de respuestas para roles con permiso
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_application_answers(
    p_application_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_role TEXT;
    v_user_inst UUID;
    v_application RECORD;
    v_answers JSONB;
BEGIN
    SELECT role, institution_id INTO v_role, v_user_inst
    FROM perfiles WHERE user_id = auth.uid() AND activo;

    IF v_role IS NULL OR NOT can_manage_surveys() THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para ver respuestas');
    END IF;

    SELECT a.* INTO v_application
    FROM encuesta_aplicaciones a
    WHERE a.id = p_application_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Aplicación no encontrada');
    END IF;

    IF v_role NOT IN ('global', 'psicologo') AND v_application.institution_id != v_user_inst THEN
        RETURN json_build_object('success', false, 'error', 'La aplicación no pertenece a su institución');
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'question_id', r.question_id,
                'question_label', p.label,
                'question_type', p.question_type,
                'is_required', p.is_required,
                'answer', r.answer,
                'answered_at', r.answered_at
            ) ORDER BY p.sort_order
        ),
        '[]'::jsonb
    )
    INTO v_answers
    FROM encuesta_respuestas r
    JOIN encuesta_preguntas p ON p.id = r.question_id
    WHERE r.application_id = p_application_id;

    RETURN jsonb_build_object(
        'success', true,
        'answers', v_answers
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION get_application_answers(UUID) IS
'APL-06/F6: visor solo lectura de las respuestas de una aplicación para roles con can_manage_surveys(); Global y Psicólogo ven todas las I.E., el resto solo la propia.';

REVOKE ALL ON FUNCTION get_application_answers(UUID) FROM anon;

-- ------------------------------------------------------------
-- ENC-01/03/07: get_survey_versions con contadores e in_use
-- (045 devolvía solo id/número/estado y sin contadores que la
-- UI de F6 necesita para "🔒 en uso" y stats de la biblioteca)
-- ------------------------------------------------------------
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
        'published_at', v.published_at,
        'created_at', v.created_at,
        'application_count', (
            SELECT COUNT(*) FROM encuesta_aplicaciones a WHERE a.version_id = v.id
        ),
        'response_count', (
            SELECT COUNT(*) FROM encuesta_respuestas r
            JOIN encuesta_aplicaciones a2 ON a2.id = r.application_id
            WHERE a2.version_id = v.id
        ),
        'in_use', EXISTS (
            SELECT 1 FROM encuesta_aplicaciones a3 WHERE a3.version_id = v.id
        )
    ) ORDER BY v.version_number DESC), '[]'::json)
    INTO v_rows
    FROM encuesta_versiones v
    WHERE v.survey_id = p_survey_id;

    RETURN json_build_object('success', true, 'versions', v_rows);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION get_survey_versions(UUID) IS
'Versiones de encuesta con created_at, application_count, response_count e in_use (ENC-01/03/07 F6). Auth + institución + ORDER BY interno. T65/M1/H1.';

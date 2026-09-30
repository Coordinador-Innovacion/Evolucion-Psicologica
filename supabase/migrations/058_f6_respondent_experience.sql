-- Migración 058: F6 RESP — experiencia pública del respondiente
-- Evolución Psicológica
--
-- RESP-01: `get_survey_structure` expone `code` + `opens_at`/`closed_at`/
-- `institution_name` en los estados terminales del enlace para que la UI
-- muestre "aún no disponible / vencida" con sus fechas. Los mensajes de
-- error NO cambian (spec §5.15 / tests de regresión).
-- RESP-04/07: `submit_survey_response` recalcula el progreso en vivo de la
-- aplicación (avance en APL-03/APL-06), acepta aplicaciones programadas ya
-- abiertas y devuelve `code` para que la UI maneje cierre de ventana.
-- RESP-05: `complete_survey_application` conserva mensajes y agrega `code`.

-- ------------------------------------------------------------
-- 1) get_survey_structure — estados del enlace + datos de contexto
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_survey_structure(
    p_token TEXT
)
RETURNS JSON AS $$
DECLARE
    v_application RECORD;
    v_version RECORD;
    v_institution_name TEXT;
BEGIN
    -- 1. Buscar aplicación por token
    SELECT * INTO v_application
    FROM encuesta_aplicaciones
    WHERE access_token = p_token;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Enlace no válido',
            'code', 'invalid_token'
        );
    END IF;

    SELECT i.name INTO v_institution_name
    FROM encuestas e
    JOIN institutions i ON i.id = e.institution_id
    WHERE e.id = (SELECT survey_id FROM encuesta_versiones WHERE id = v_application.version_id);

    -- 2/3. Validar ventana y estado (RESP-06: una aplicación completada
    -- sigue consultable con el mismo enlace para mostrar su cierre)
    IF v_application.status <> 'completed' THEN
        IF CURRENT_TIMESTAMP < v_application.started_at THEN
            RETURN json_build_object(
                'success', false,
                'error', 'La aplicación aún no está disponible',
                'code', 'not_open',
                'opens_at', v_application.started_at,
                'institution_name', v_institution_name
            );
        END IF;

        IF CURRENT_TIMESTAMP > v_application.ends_at THEN
            RETURN json_build_object(
                'success', false,
                'error', 'La aplicación ha expirado',
                'code', 'window_closed',
                'closed_at', v_application.ends_at,
                'institution_name', v_institution_name
            );
        END IF;

        IF v_application.status NOT IN ('active', 'extended', 'scheduled') THEN
            RETURN json_build_object(
                'success', false,
                'error', 'La aplicación no está disponible',
                'code', 'unavailable',
                'closed_at', v_application.ends_at,
                'institution_name', v_institution_name
            );
        END IF;
    END IF;

    -- 4. Verificar que la versión esté publicada
    SELECT * INTO v_version
    FROM encuesta_versiones
    WHERE id = v_application.version_id AND status = 'published';

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'La encuesta no está disponible',
            'code', 'unpublished'
        );
    END IF;

    -- 5. Retornar estructura completa: secciones → preguntas → opciones
    RETURN (
        SELECT json_build_object(
            'success', true,
            'application_id', v_application.id,
            'survey_title', (SELECT title FROM encuestas WHERE id = v_version.survey_id),
            'institution_name', v_institution_name,
            'status', v_application.status,
            'progress', v_application.progress,
            'started_at', v_application.started_at,
            'ends_at', v_application.ends_at,
            'completed', v_application.status = 'completed',
            'sections', (
                SELECT json_agg(json_build_object(
                    'id', s.id,
                    'title', s.title,
                    'description', s.description,
                    'sort_order', s.sort_order,
                    'questions', (
                        SELECT json_agg(json_build_object(
                            'id', p.id,
                            'question_type', p.question_type,
                            'label', p.label,
                            'description', p.description,
                            'is_required', p.is_required,
                            'sort_order', p.sort_order,
                            'config', p.config,
                            'presentation', p.presentation,
                            'options', (
                                SELECT json_agg(json_build_object(
                                    'id', o.id,
                                    'label', o.label,
                                    'sort_order', o.sort_order
                                ) ORDER BY o.sort_order)
                                FROM encuesta_opciones o
                                WHERE o.question_id = p.id
                            )
                        ) ORDER BY p.sort_order)
                        FROM encuesta_preguntas p
                        WHERE p.section_id = s.id
                    )
                ) ORDER BY s.sort_order)
                FROM encuesta_secciones s
                WHERE s.version_id = v_application.version_id
            )
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION get_survey_structure(TEXT) IS
'RESP-01/F6 (§5.15): estructura de la encuesta por token con estados terminales del enlace (code/opens_at/closed_at/institution_name), progreso y contexto para la experiencia pública en /e/[token]. Mensajes sin cambios.';

-- ------------------------------------------------------------
-- 2) submit_survey_response — progreso en vivo + códigos
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_survey_response(
    p_token TEXT,
    p_application_id UUID,
    p_question_id UUID,
    p_answer JSONB
)
RETURNS JSON AS $$
DECLARE
    v_application RECORD;
    v_question RECORD;
    v_total INT;
    v_answered INT;
    v_progress INT;
BEGIN
    -- Verificar token y que la aplicación coincide
    SELECT * INTO v_application
    FROM encuesta_aplicaciones
    WHERE access_token = p_token AND id = p_application_id;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Aplicación no válida para este enlace',
            'code', 'invalid_application'
        );
    END IF;

    -- Verificar ventana temporal
    IF CURRENT_TIMESTAMP < v_application.started_at THEN
        RETURN json_build_object(
            'success', false,
            'error', 'La aplicación aún no está disponible',
            'code', 'not_open',
            'opens_at', v_application.started_at
        );
    END IF;

    IF CURRENT_TIMESTAMP > v_application.ends_at THEN
        RETURN json_build_object(
            'success', false,
            'error', 'La aplicación ha expirado',
            'code', 'window_closed',
            'closed_at', v_application.ends_at
        );
    END IF;

    IF v_application.status NOT IN ('active', 'extended', 'scheduled') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'La aplicación no está activa',
            'code', 'unavailable'
        );
    END IF;

    -- Programada que ya abrió: activar en la misma transacción
    IF v_application.status = 'scheduled' THEN
        UPDATE encuesta_aplicaciones
        SET status = 'active'
        WHERE id = p_application_id;
    END IF;

    -- Verificar que la pregunta existe y pertenece a la versión de la aplicación
    SELECT * INTO v_question
    FROM encuesta_preguntas p
    JOIN encuesta_secciones s ON s.id = p.section_id
    WHERE p.id = p_question_id AND s.version_id = v_application.version_id;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Pregunta no encontrada en esta encuesta',
            'code', 'question_not_found'
        );
    END IF;

    -- Upsert de la respuesta
    INSERT INTO encuesta_respuestas (application_id, question_id, answer, answered_at)
    VALUES (p_application_id, p_question_id, p_answer, CURRENT_TIMESTAMP)
    ON CONFLICT (application_id, question_id)
    DO UPDATE SET answer = p_answer, answered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP;

    -- Progreso en vivo (RESP-04 / APL-03): respondidas / totales
    SELECT COUNT(*) INTO v_total
    FROM encuesta_preguntas p
    JOIN encuesta_secciones s ON s.id = p.section_id
    WHERE s.version_id = v_application.version_id;

    SELECT COUNT(*) INTO v_answered
    FROM encuesta_respuestas r
    WHERE r.application_id = p_application_id
      AND r.answer IS NOT NULL;

    v_progress := CASE
        WHEN v_total = 0 THEN 0
        ELSE LEAST(100, ROUND(v_answered * 100.0 / v_total))
    END;

    UPDATE encuesta_aplicaciones
    SET progress = v_progress
    WHERE id = p_application_id
      AND status <> 'completed';

    RETURN json_build_object(
        'success', true,
        'progress', v_progress
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION submit_survey_response(TEXT, UUID, UUID, JSONB) IS
'RESP-04/F6: autosave con progreso en vivo (respondidas/totales), activación de aplicaciones programadas que ya abrieron y codes de ventana para la UI. Mensajes sin cambios.';

-- ------------------------------------------------------------
-- 3) complete_survey_application — códigos para la UI
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION complete_survey_application(
    p_token TEXT,
    p_application_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_application RECORD;
BEGIN
    -- Verificar token y que la aplicación coincide
    SELECT * INTO v_application
    FROM encuesta_aplicaciones
    WHERE access_token = p_token AND id = p_application_id;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Aplicación no válida para este enlace',
            'code', 'invalid_application'
        );
    END IF;

    -- Verificar ventana temporal
    IF CURRENT_TIMESTAMP < v_application.started_at THEN
        RETURN json_build_object(
            'success', false,
            'error', 'La aplicación aún no está disponible',
            'code', 'not_open',
            'opens_at', v_application.started_at
        );
    END IF;

    IF CURRENT_TIMESTAMP > v_application.ends_at THEN
        RETURN json_build_object(
            'success', false,
            'error', 'La aplicación ha expirado',
            'code', 'window_closed',
            'closed_at', v_application.ends_at
        );
    END IF;

    IF v_application.status NOT IN ('active', 'extended', 'scheduled') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'La aplicación no está activa',
            'code', 'unavailable'
        );
    END IF;

    UPDATE encuesta_aplicaciones
    SET status = 'completed', progress = 100
    WHERE id = p_application_id;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION complete_survey_application(TEXT, UUID) IS
'RESP-05/F6: finalizar aplicación con codes de ventana/estado para la UI. Mensajes sin cambios.';

-- ------------------------------------------------------------
-- 4) complete_respondent_profile — permite programada ya abierta
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

    IF v_application.status = 'scheduled' THEN
        UPDATE encuesta_aplicaciones
        SET status = 'active'
        WHERE id = v_application.id;
        v_application.status := 'active';
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

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION complete_respondent_profile(TEXT, JSONB) IS
'RESP-03/F6 (§E.12): p_fields={} devuelve los datos actuales (lectura); con campos, el respondiente anónimo completa datos faltantes del estudiante y su apoderado usando el token de la aplicación. Programadas ya abiertas se activan automáticamente.';

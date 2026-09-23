-- Migración 029: Funciones CRUD de encuestas
-- Evolución Psicológica — Motor de Encuestas Institucionales

-- ============================================================
-- FUNCIONES DE ENCUESTAS
-- ============================================================

-- CREAR ENCUESTA
CREATE OR REPLACE FUNCTION create_survey(
    p_institution_id UUID,
    p_title VARCHAR(255),
    p_description TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_institution UUID;
    v_survey_id UUID;
BEGIN
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no autenticado');
    END IF;

    IF NOT can_manage_surveys() THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para crear encuestas');
    END IF;

    IF v_user_role != 'global' AND v_user_institution != p_institution_id THEN
        RETURN json_build_object('success', false, 'error', 'Institución no autorizada');
    END IF;

    INSERT INTO encuestas (institution_id, title, description, created_by)
    VALUES (p_institution_id, p_title, p_description, auth.uid())
    RETURNING id INTO v_survey_id;

    INSERT INTO encuesta_versiones (survey_id, version_number, status)
    VALUES (v_survey_id, 1, 'draft');

    RETURN json_build_object('success', true, 'id', v_survey_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- COPIAR ENCUESTA (independiente)
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

    IF NOT can_manage_surveys() THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para copiar encuestas');
    END IF;

    SELECT * INTO v_source_survey FROM encuestas WHERE id = p_source_survey_id;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Encuesta origen no encontrada');
    END IF;

    -- Crear nueva encuesta
    INSERT INTO encuestas (institution_id, title, description, created_by)
    VALUES (v_user_institution, p_new_title, v_source_survey.description, auth.uid())
    RETURNING id INTO v_new_survey_id;

    -- Copiar la versión más reciente de la origen
    SELECT * INTO v_source_version
    FROM encuesta_versiones
    WHERE survey_id = p_source_survey_id
    ORDER BY version_number DESC LIMIT 1;

    INSERT INTO encuesta_versiones (survey_id, version_number, status)
    VALUES (v_new_survey_id, 1, 'draft')
    RETURNING id INTO v_new_version_id;

    -- Copiar secciones, preguntas y opciones
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
            VALUES (v_new_section_id, v_source_question.question_type, v_source_question.label, v_source_question.description, v_source_question.is_required, v_source_question.sort_order, v_source_question.config, v_source_question.presentation)
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

-- ============================================================
-- FUNCIONES DE VERSIONES
-- ============================================================

-- CREAR NUEVA VERSIÓN
CREATE OR REPLACE FUNCTION create_survey_version(
    p_survey_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_max_version INTEGER;
    v_new_version_id UUID;
BEGIN
    SELECT role INTO v_user_role FROM perfiles WHERE user_id = auth.uid();

    IF NOT can_manage_surveys() THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM encuestas WHERE id = p_survey_id AND institution_id = get_user_institution()
    ) AND v_user_role != 'global' THEN
        RETURN json_build_object('success', false, 'error', 'Encuesta no encontrada en su institución');
    END IF;

    SELECT COALESCE(MAX(version_number), 0) INTO v_max_version
    FROM encuesta_versiones WHERE survey_id = p_survey_id;

    INSERT INTO encuesta_versiones (survey_id, version_number, status)
    VALUES (p_survey_id, v_max_version + 1, 'draft')
    RETURNING id INTO v_new_version_id;

    RETURN json_build_object('success', true, 'id', v_new_version_id, 'version_number', v_max_version + 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- PUBLICAR VERSIÓN (volver inmutable)
CREATE OR REPLACE FUNCTION publish_survey_version(
    p_version_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_version RECORD;
BEGIN
    IF NOT can_manage_surveys() THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos');
    END IF;

    SELECT * INTO v_version FROM encuesta_versiones WHERE id = p_version_id;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Versión no encontrada');
    END IF;

    IF v_version.status != 'draft' THEN
        RETURN json_build_object('success', false, 'error', 'Solo se pueden publicar versiones en borrador');
    END IF;

    -- Verificar que tenga al menos una sección con preguntas
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

-- ============================================================
-- FUNCIONES DE APLICACIONES
-- ============================================================

-- CREAR APLICACIÓN
-- Parámetros con DEFAULT deben ir al final (regla PostgreSQL).
-- PostgREST/RPC invoca por nombre, por eso el orden no afecta al cliente.
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
    v_version RECORD;
    v_application_id UUID;
    v_token TEXT;
BEGIN
    SELECT role INTO v_user_role FROM perfiles WHERE user_id = auth.uid();

    IF NOT can_manage_surveys() THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para crear aplicaciones');
    END IF;

    SELECT * INTO v_version FROM encuesta_versiones WHERE id = p_version_id;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Versión no encontrada');
    END IF;

    IF v_version.status != 'published' THEN
        RETURN json_build_object('success', false, 'error', 'Solo se pueden crear aplicaciones de versiones publicadas');
    END IF;

    IF p_started_at >= p_ends_at THEN
        RETURN json_build_object('success', false, 'error', 'La fecha de inicio debe ser anterior a la fecha de fin');
    END IF;

    -- Generar token de acceso
    v_token := encode(gen_random_bytes(32), 'hex');

    INSERT INTO encuesta_aplicaciones (
        version_id, institution_id, respondent_student_id, respondent_user_id,
        year, section_name, grade_id, started_at, ends_at, status, access_token
    ) VALUES (
        p_version_id, (SELECT institution_id FROM encuestas WHERE id = (SELECT survey_id FROM encuesta_versiones WHERE id = p_version_id)),
        p_respondent_student_id, p_respondent_user_id,
        p_year, p_section_name, p_grade_id, p_started_at, p_ends_at,
        CASE WHEN p_started_at <= CURRENT_TIMESTAMP THEN 'active' ELSE 'scheduled' END,
        v_token
    ) RETURNING id INTO v_application_id;

    RETURN json_build_object('success', true, 'id', v_application_id, 'token', v_token);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- AMPLIAR PLAZO DE APLICACIÓN
CREATE OR REPLACE FUNCTION extend_survey_application(
    p_application_id UUID,
    p_new_ends_at TIMESTAMP WITH TIME ZONE
)
RETURNS JSON AS $$
DECLARE
    v_application RECORD;
    v_user_role TEXT;
BEGIN
    SELECT role INTO v_user_role FROM perfiles WHERE user_id = auth.uid();

    IF NOT can_manage_surveys() THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos');
    END IF;

    SELECT * INTO v_application FROM encuesta_aplicaciones WHERE id = p_application_id;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Aplicación no encontrada');
    END IF;

    IF v_user_role != 'global' AND v_application.institution_id != get_user_institution() THEN
        RETURN json_build_object('success', false, 'error', 'Aplicación no pertenece a su institución');
    END IF;

    IF v_application.status NOT IN ('active', 'extended', 'expired') THEN
        RETURN json_build_object('success', false, 'error', 'No se puede ampliar una aplicación completada o cerrada');
    END IF;

    IF p_new_ends_at <= v_application.ends_at THEN
        RETURN json_build_object('success', false, 'error', 'La nueva fecha debe ser posterior a la fecha actual de fin');
    END IF;

    UPDATE encuesta_aplicaciones
    SET ends_at = p_new_ends_at,
        extended_at = CURRENT_TIMESTAMP,
        extended_by = auth.uid(),
        status = 'extended'
    WHERE id = p_application_id;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- VALIDAR ACCESO POR ENLACE Y DNI
CREATE OR REPLACE FUNCTION validate_survey_access(
    p_token TEXT,
    p_dni VARCHAR(20)
)
RETURNS JSON AS $$
DECLARE
    v_application RECORD;
    v_respondent RECORD;
    v_student RECORD;
BEGIN
    -- Buscar aplicación por token
    SELECT * INTO v_application
    FROM encuesta_aplicaciones
    WHERE access_token = p_token;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Enlace no válido');
    END IF;

    -- Verificar ventana temporal
    IF CURRENT_TIMESTAMP < v_application.started_at THEN
        RETURN json_build_object('success', false, 'error', 'La aplicación aún no está disponible');
    END IF;

    IF CURRENT_TIMESTAMP > v_application.ends_at THEN
        RETURN json_build_object('success', false, 'error', 'La aplicación ha expirado');
    END IF;

    IF v_application.status NOT IN ('active', 'extended', 'scheduled') THEN
        RETURN json_build_object('success', false, 'error', 'La aplicación no está disponible');
    END IF;

    -- Buscar respondiente por DNI
    IF v_application.respondent_student_id IS NOT NULL THEN
        SELECT * INTO v_student
        FROM estudiantes
        WHERE id = v_application.respondent_student_id AND document_number = p_dni;

        IF NOT FOUND THEN
            RETURN json_build_object('success', false, 'error', 'DNI no corresponde al estudiante registrado');
        END IF;

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
        WHERE user_id = v_application.respondent_user_id AND document_number = p_dni;

        IF NOT FOUND THEN
            RETURN json_build_object('success', false, 'error', 'DNI no corresponde al usuario registrado');
        END IF;

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

-- ============================================================
-- FUNCIONES DE ESTRUCTURA PARA RESPONDIENTE
-- ============================================================

-- OBTENER ESTRUCTURA DE ENCUESTA PARA RESPONDIENTE
-- Retorna secciones → preguntas → opciones de la versión publicada asociada a la aplicación.
-- Solo funciona con token válido y aplicación activa.
CREATE OR REPLACE FUNCTION get_survey_structure(
    p_token TEXT
)
RETURNS JSON AS $$
DECLARE
    v_application RECORD;
    v_version RECORD;
BEGIN
    -- 1. Buscar aplicación por token
    SELECT * INTO v_application
    FROM encuesta_aplicaciones
    WHERE access_token = p_token;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Enlace no válido');
    END IF;

    -- 2. Validar ventana temporal
    IF CURRENT_TIMESTAMP < v_application.started_at THEN
        RETURN json_build_object('success', false, 'error', 'La aplicación aún no está disponible');
    END IF;

    IF CURRENT_TIMESTAMP > v_application.ends_at THEN
        RETURN json_build_object('success', false, 'error', 'La aplicación ha expirado');
    END IF;

    -- 3. Validar estado
    IF v_application.status NOT IN ('active', 'extended', 'scheduled') THEN
        RETURN json_build_object('success', false, 'error', 'La aplicación no está disponible');
    END IF;

    -- 4. Verificar que la versión esté publicada
    SELECT * INTO v_version
    FROM encuesta_versiones
    WHERE id = v_application.version_id AND status = 'published';

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'La encuesta no está disponible');
    END IF;

    -- 5. Retornar estructura completa: secciones → preguntas → opciones
    RETURN (
        SELECT json_build_object(
            'success', true,
            'application_id', v_application.id,
            'survey_title', (SELECT title FROM encuestas WHERE id = v_version.survey_id),
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

-- ============================================================
-- FUNCIONES DE RESPUESTAS
-- ============================================================

-- ENVIAR RESPUESTA (autosave)
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
BEGIN
    -- Verificar token y que la aplicación coincide
    SELECT * INTO v_application
    FROM encuesta_aplicaciones
    WHERE access_token = p_token AND id = p_application_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Aplicación no válida para este enlace');
    END IF;

    -- Verificar ventana temporal
    IF CURRENT_TIMESTAMP < v_application.started_at THEN
        RETURN json_build_object('success', false, 'error', 'La aplicación aún no está disponible');
    END IF;

    IF CURRENT_TIMESTAMP > v_application.ends_at THEN
        RETURN json_build_object('success', false, 'error', 'La aplicación ha expirado');
    END IF;

    IF v_application.status NOT IN ('active', 'extended') THEN
        RETURN json_build_object('success', false, 'error', 'La aplicación no está activa');
    END IF;

    -- Verificar que la pregunta existe y pertenece a la versión de la aplicación
    SELECT * INTO v_question
    FROM encuesta_preguntas p
    JOIN encuesta_secciones s ON s.id = p.section_id
    WHERE p.id = p_question_id AND s.version_id = v_application.version_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Pregunta no encontrada en esta encuesta');
    END IF;

    -- Upsert de la respuesta
    INSERT INTO encuesta_respuestas (application_id, question_id, answer, answered_at)
    VALUES (p_application_id, p_question_id, p_answer, CURRENT_TIMESTAMP)
    ON CONFLICT (application_id, question_id)
    DO UPDATE SET answer = p_answer, answered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- COMPLETAR APLICACIÓN
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
        RETURN json_build_object('success', false, 'error', 'Aplicación no válida para este enlace');
    END IF;

    -- Verificar ventana temporal
    IF CURRENT_TIMESTAMP < v_application.started_at THEN
        RETURN json_build_object('success', false, 'error', 'La aplicación aún no está disponible');
    END IF;

    IF CURRENT_TIMESTAMP > v_application.ends_at THEN
        RETURN json_build_object('success', false, 'error', 'La aplicación ha expirado');
    END IF;

    IF v_application.status NOT IN ('active', 'extended') THEN
        RETURN json_build_object('success', false, 'error', 'La aplicación no está activa');
    END IF;

    UPDATE encuesta_aplicaciones
    SET status = 'completed', progress = 100
    WHERE id = p_application_id;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================
-- FUNCIONES DE CONSULTA
-- ============================================================

-- OBTENER ENCUESTAS DE UNA INSTITUCIÓN
CREATE OR REPLACE FUNCTION get_institution_surveys(
    p_institution_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_institution_id UUID;
    v_user_role TEXT;
    v_user_institution UUID;
BEGIN
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF p_institution_id IS NULL THEN
        v_institution_id := v_user_institution;
    ELSE
        v_institution_id := p_institution_id;
    END IF;

    -- Validación de aislamiento institucional para usuarios no globales
    IF v_user_role != 'global' AND v_institution_id != v_user_institution THEN
        RETURN json_build_object('success', false, 'error', 'Institución no autorizada');
    END IF;

    RETURN (
        SELECT json_build_object(
            'success', true,
            'data', json_agg(json_build_object(
                'id', e.id,
                'title', e.title,
                'description', e.description,
                'created_at', e.created_at,
                'version_count', (SELECT COUNT(*) FROM encuesta_versiones WHERE survey_id = e.id),
                'published_versions', (SELECT COUNT(*) FROM encuesta_versiones WHERE survey_id = e.id AND status = 'published')
            ))
        )
        FROM encuestas e
        WHERE e.institution_id = v_institution_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- OBTENER VERSIONES DE UNA ENCUESTA
CREATE OR REPLACE FUNCTION get_survey_versions(
    p_survey_id UUID
)
RETURNS JSON AS $$
BEGIN
    RETURN (
        SELECT json_agg(json_build_object(
            'id', v.id,
            'version_number', v.version_number,
            'status', v.status,
            'published_at', v.published_at,
            'created_at', v.created_at,
            'application_count', (SELECT COUNT(*) FROM encuesta_aplicaciones WHERE version_id = v.id),
            'response_count', (
                SELECT COUNT(DISTINCT r.id)
                FROM encuesta_respuestas r
                JOIN encuesta_aplicaciones a ON a.id = r.application_id
                WHERE a.version_id = v.id
            )
        ))
        FROM encuesta_versiones v
        WHERE v.survey_id = p_survey_id
        ORDER BY v.version_number DESC
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- OBTENER RESPUESTAS DE UNA APLICACIÓN
CREATE OR REPLACE FUNCTION get_application_responses(
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
        RETURN json_build_object('success', false, 'error', 'Aplicación no válida para este enlace');
    END IF;

    RETURN (
        SELECT json_build_object(
            'success', true,
            'data', (
                SELECT json_agg(json_build_object(
                    'question_id', r.question_id,
                    'question_label', p.label,
                    'question_type', p.question_type,
                    'answer', r.answer,
                    'answered_at', r.answered_at
                ))
                FROM encuesta_respuestas r
                JOIN encuesta_preguntas p ON p.id = r.question_id
                WHERE r.application_id = p_application_id
                ORDER BY p.sort_order
            )
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

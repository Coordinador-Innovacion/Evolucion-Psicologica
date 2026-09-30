-- Migración 059: F6 — arreglos del constructor y ciclo de vida de encuestas
-- Evolución Psicológica
--
-- A3: create_survey crea la sección inicial (no aterrizar en pantalla vacía).
-- B1: create_survey_version CLONA el contenido (la UI prometía "parte de la
--     anterior" y la BD creaba una versión vacía).
-- B2: triggers BEFORE INSERT impiden agregar estructura a una versión publicada
--     (antes solo UPDATE/DELETE estaban bloqueados).
-- B3: título/descripción de la encuesta congelados cuando existe versión publicada
--     (es lo que ven los respondientes).
-- B4: create_survey / get_institution_surveys no admiten institución NULL
--     (el comparador `!=` con NULL dejaba pasar el chequeo).
-- + : publicación con validaciones server-side (enunciado, opciones, escalas).
-- + : REVOKE de las funciones de encuestas a anon/PUBLIC.

-- ============================================================
-- A3 + B4: CREAR ENCUESTA (sección inicial + aislamiento)
-- ============================================================
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
    v_version_id UUID;
BEGIN
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no autenticado');
    END IF;

    IF NOT can_manage_surveys() THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para crear encuestas');
    END IF;

    -- B4: NULL-safe. Sin esto, un usuario institucional con institution_id NULL
    -- comparaba NULL != p_institution_id -> NULL -> el IF no se cumplía.
    IF p_institution_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Debe indicar una institución');
    END IF;

    IF v_user_role != 'global' AND (v_user_institution IS NULL OR v_user_institution != p_institution_id) THEN
        RETURN json_build_object('success', false, 'error', 'Institución no autorizada');
    END IF;

    INSERT INTO encuestas (institution_id, title, description, created_by)
    VALUES (p_institution_id, p_title, p_description, auth.uid())
    RETURNING id INTO v_survey_id;

    INSERT INTO encuesta_versiones (survey_id, version_number, status)
    VALUES (v_survey_id, 1, 'draft')
    RETURNING id INTO v_version_id;

    -- A3: sección inicial para que el primer paso sea "agregar pregunta"
    INSERT INTO encuesta_secciones (version_id, title, description, sort_order)
    VALUES (v_version_id, 'Sección 1', NULL, 0);

    RETURN json_build_object('success', true, 'id', v_survey_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION create_survey(UUID, VARCHAR, TEXT) IS
'F6/A3: crea sección inicial. F6/B4: chequeo de institución NULL-safe.';

-- ============================================================
-- B4: LISTADO POR INSTITUCIÓN (mismo patrón NULL-safe)
-- ============================================================
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

    -- B4: usuarios no globales sin institución quedan fuera del listado,
    -- en lugar de saltarse el chequeo por comparación con NULL.
    IF v_user_role IS NULL OR v_user_role != 'global' THEN
        IF v_user_institution IS NULL OR v_institution_id IS NULL
           OR v_institution_id != v_user_institution THEN
            RETURN json_build_object('success', false, 'error', 'Institución no autorizada');
        END IF;
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

-- ============================================================
-- B1: NUEVA VERSIÓN CLONA EL CONTENIDO
-- ============================================================
CREATE OR REPLACE FUNCTION create_survey_version(
    p_survey_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_institution UUID;
    v_survey_inst UUID;
    v_max_version INTEGER;
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
        RETURN json_build_object('success', false, 'error', 'No tiene permisos');
    END IF;

    SELECT institution_id INTO v_survey_inst FROM encuestas WHERE id = p_survey_id;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Encuesta no encontrada');
    END IF;

    IF v_user_role != 'global' AND (v_user_institution IS NULL OR v_survey_inst != v_user_institution) THEN
        RETURN json_build_object('success', false, 'error', 'Encuesta no encontrada en su institución');
    END IF;

    -- Si ya hay un borrador, se edita ese: no se acumulan versiones borrador.
    IF EXISTS (
        SELECT 1 FROM encuesta_versiones
        WHERE survey_id = p_survey_id AND status = 'draft'
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Ya existe un borrador de esta encuesta. Edítalo antes de crear otra versión.'
        );
    END IF;

    -- Fuente = versión más reciente (la vigente publicada).
    SELECT * INTO v_source_version
    FROM encuesta_versiones
    WHERE survey_id = p_survey_id
    ORDER BY version_number DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'La encuesta no tiene versiones para copiar');
    END IF;

    SELECT COALESCE(MAX(version_number), 0) INTO v_max_version
    FROM encuesta_versiones WHERE survey_id = p_survey_id;

    INSERT INTO encuesta_versiones (survey_id, version_number, status)
    VALUES (p_survey_id, v_max_version + 1, 'draft')
    RETURNING id INTO v_new_version_id;

    -- B1: copiar secciones, preguntas y opciones de la versión origen
    FOR v_source_section IN
        SELECT * FROM encuesta_secciones
        WHERE version_id = v_source_version.id
        ORDER BY sort_order
    LOOP
        INSERT INTO encuesta_secciones (version_id, title, description, sort_order)
        VALUES (v_new_version_id, v_source_section.title, v_source_section.description, v_source_section.sort_order)
        RETURNING id INTO v_new_section_id;

        FOR v_source_question IN
            SELECT * FROM encuesta_preguntas
            WHERE section_id = v_source_section.id
            ORDER BY sort_order
        LOOP
            INSERT INTO encuesta_preguntas (section_id, question_type, label, description, is_required, sort_order, config, presentation)
            VALUES (
                v_new_section_id, v_source_question.question_type, v_source_question.label,
                v_source_question.description, v_source_question.is_required,
                v_source_question.sort_order, v_source_question.config, v_source_question.presentation
            )
            RETURNING id INTO v_new_question_id;

            FOR v_source_option IN
                SELECT * FROM encuesta_opciones
                WHERE question_id = v_source_question.id
                ORDER BY sort_order
            LOOP
                INSERT INTO encuesta_opciones (question_id, label, sort_order)
                VALUES (v_new_question_id, v_source_option.label, v_source_option.sort_order);
            END LOOP;
        END LOOP;
    END LOOP;

    RETURN json_build_object('success', true, 'id', v_new_version_id, 'version_number', v_max_version + 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION create_survey_version(UUID) IS
'F6/B1: la nueva versión clona el contenido de la versión vigente (antes quedaba vacía).';

-- ============================================================
-- + : PUBLICAR con validaciones server-side (antes solo >= 1 pregunta)
-- ============================================================
CREATE OR REPLACE FUNCTION publish_survey_version(
    p_version_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_version RECORD;
    v_user_role TEXT;
    v_user_inst UUID;
    v_survey_inst UUID;
    v_count INTEGER;
BEGIN
    -- Rol primero: can_manage_surveys() devuelve NULL sin perfil y
    -- `IF NOT NULL` no entra, dejando pasar a usuarios sin rol.
    SELECT role, institution_id INTO v_user_role, v_user_inst
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR NOT can_manage_surveys() THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos');
    END IF;

    SELECT v.*, e.institution_id AS survey_inst INTO v_version
    FROM encuesta_versiones v
    JOIN encuestas e ON e.id = v.survey_id
    WHERE v.id = p_version_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Versión no encontrada');
    END IF;

    IF v_user_role != 'global' AND (v_user_inst IS NULL OR v_version.survey_inst != v_user_inst) THEN
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

    -- Cada pregunta con enunciado
    SELECT COUNT(*) INTO v_count
    FROM encuesta_preguntas p
    JOIN encuesta_secciones s ON s.id = p.section_id
    WHERE s.version_id = p_version_id
      AND btrim(COALESCE(p.label, '')) = '';
    IF v_count > 0 THEN
        RETURN json_build_object('success', false, 'error', 'Hay preguntas sin enunciado');
    END IF;

    -- Tipos con opciones necesitan al menos 2 opciones con texto
    SELECT COUNT(*) INTO v_count
    FROM encuesta_preguntas p
    JOIN encuesta_secciones s ON s.id = p.section_id
    WHERE s.version_id = p_version_id
      AND p.question_type IN ('opcion_unica', 'seleccion_multiple', 'seleccion_opciones')
      AND (
        SELECT COUNT(*) FROM encuesta_opciones o
        WHERE o.question_id = p.id AND btrim(COALESCE(o.label, '')) != ''
      ) < 2;
    IF v_count > 0 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Hay preguntas de opción que necesitan al menos 2 opciones con texto'
        );
    END IF;

    -- Escalas coherentes (mínimo < máximo), con cast protegido
    SELECT COUNT(*) INTO v_count
    FROM encuesta_preguntas p
    JOIN encuesta_secciones s ON s.id = p.section_id
    WHERE s.version_id = p_version_id
      AND p.question_type = 'escala'
      AND p.config IS NOT NULL
      AND (p.config->>'min') ~ '^-?[0-9]+(\.[0-9]+)?$'
      AND (p.config->>'max') ~ '^-?[0-9]+(\.[0-9]+)?$'
      AND (p.config->>'min')::numeric >= (p.config->>'max')::numeric;
    IF v_count > 0 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Hay escalas con rango inválido (el mínimo debe ser menor que el máximo)'
        );
    END IF;

    UPDATE encuesta_versiones
    SET status = 'published', published_at = CURRENT_TIMESTAMP, published_by = auth.uid()
    WHERE id = p_version_id;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION publish_survey_version(UUID) IS
'F6: validaciones de calidad server-side (enunciado, opciones, escalas) + acote de institución NULL-safe.';

-- ============================================================
-- B2: bloquear INSERT de estructura en versión publicada
-- Las funciones prevent_published_*_change() (definidas en 045)
-- ya resuelven el estado con NEW cuando TG_OP != 'DELETE', pero
-- los triggers solo estaban declarados para UPDATE OR DELETE.
-- Aquí solo se redeclaran con INSERT incluido.
-- ============================================================
DROP TRIGGER IF EXISTS trg_prevent_section_change ON encuesta_secciones;
CREATE TRIGGER trg_prevent_section_change
    BEFORE INSERT OR UPDATE OR DELETE ON encuesta_secciones
    FOR EACH ROW
    EXECUTE FUNCTION prevent_published_section_change();

DROP TRIGGER IF EXISTS trg_prevent_question_change ON encuesta_preguntas;
CREATE TRIGGER trg_prevent_question_change
    BEFORE INSERT OR UPDATE OR DELETE ON encuesta_preguntas
    FOR EACH ROW
    EXECUTE FUNCTION prevent_published_question_change();

DROP TRIGGER IF EXISTS trg_prevent_option_change ON encuesta_opciones;
CREATE TRIGGER trg_prevent_option_change
    BEFORE INSERT OR UPDATE OR DELETE ON encuesta_opciones
    FOR EACH ROW
    EXECUTE FUNCTION prevent_published_option_change();

-- ============================================================
-- B3: congelar título/descripción con versión publicada
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_survey_meta_change_after_publish()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.title IS DISTINCT FROM OLD.title
        OR NEW.description IS DISTINCT FROM OLD.description)
       AND EXISTS (
        SELECT 1 FROM encuesta_versiones
        WHERE survey_id = OLD.id AND status = 'published'
    ) THEN
        RAISE EXCEPTION 'La encuesta ya tiene una versión publicada: el título y la descripción no se pueden modificar';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_prevent_survey_meta_change ON encuestas;
CREATE TRIGGER trg_prevent_survey_meta_change
    BEFORE UPDATE ON encuestas
    FOR EACH ROW
    EXECUTE FUNCTION prevent_survey_meta_change_after_publish();

COMMENT ON FUNCTION prevent_survey_meta_change_after_publish() IS
'F6/B3: lo que ven los respondientes (título/descripción) queda congelado al publicar.';

-- ============================================================
-- + : copy_survey — error claro si la origen no tiene versiones
-- ============================================================
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
        IF v_source_survey.institution_id != v_user_institution THEN
            RETURN json_build_object(
                'success', false,
                'error', 'Solo puede copiar encuestas de su institución'
            );
        END IF;
    END IF;

    -- Copiar la versión más reciente de la origen
    SELECT * INTO v_source_version
    FROM encuesta_versiones
    WHERE survey_id = p_source_survey_id
    ORDER BY version_number DESC LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'La encuesta origen no tiene versiones para copiar');
    END IF;

    INSERT INTO encuestas (institution_id, title, description, created_by)
    VALUES (
        CASE WHEN v_user_role = 'global' THEN v_source_survey.institution_id ELSE v_user_institution END,
        p_new_title, v_source_survey.description, auth.uid()
    )
    RETURNING id INTO v_new_survey_id;

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
'F6: error explícito si la origen no tiene versiones (antes creaba una encuesta vacía).';

-- ============================================================
-- + : REVOKE a anon/PUBLIC (solo authenticated y service_role)
-- ============================================================
REVOKE EXECUTE ON FUNCTION create_survey(UUID, VARCHAR, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION copy_survey(UUID, VARCHAR) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION create_survey_version(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION publish_survey_version(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_institution_surveys(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION create_survey(UUID, VARCHAR, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION copy_survey(UUID, VARCHAR) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION create_survey_version(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION publish_survey_version(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_institution_surveys(UUID) TO authenticated, service_role;

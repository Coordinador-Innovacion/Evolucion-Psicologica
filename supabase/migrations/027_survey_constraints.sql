-- Migración 027: Constraints de encuestas
-- Evolución Psicológica — Motor de Encuestas Institucionales

-- ============================================================
-- FUNCIONES AUXILIARES
-- ============================================================

-- Verificar si una versión tiene respuestas (inmutabilidad)
CREATE OR REPLACE FUNCTION check_version_has_responses(p_version_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM encuesta_aplicaciones a
        JOIN encuesta_respuestas r ON r.application_id = a.id
        WHERE a.version_id = p_version_id
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================
-- TRIGGER: Impedir UPDATE/DELETE de versión publicada
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_published_version_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'published' THEN
        RAISE EXCEPTION 'No se puede modificar una versión publicada. Cree una nueva versión.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER trg_prevent_published_version_update
    BEFORE UPDATE ON encuesta_versiones
    FOR EACH ROW
    WHEN (OLD.status = 'published')
    EXECUTE FUNCTION prevent_published_version_change();

CREATE OR REPLACE FUNCTION prevent_published_version_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'published' THEN
        RAISE EXCEPTION 'No se puede eliminar una versión publicada.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER trg_prevent_published_version_delete
    BEFORE DELETE ON encuesta_versiones
    FOR EACH ROW
    WHEN (OLD.status = 'published')
    EXECUTE FUNCTION prevent_published_version_delete();

-- ============================================================
-- TRIGGER: Impedir DELETE de versión con respuestas
-- ============================================================

CREATE TRIGGER trg_prevent_version_with_responses_delete
    BEFORE DELETE ON encuesta_versiones
    FOR EACH ROW
    WHEN (check_version_has_responses(OLD.id))
    EXECUTE FUNCTION prevent_published_version_delete();

-- ============================================================
-- TRIGGER: Impedir UPDATE/DELETE de estructura de versión publicada
-- ============================================================

-- Función para secciones: sección → versión
CREATE OR REPLACE FUNCTION prevent_published_section_change()
RETURNS TRIGGER AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT ev.status INTO v_status
    FROM encuesta_versiones ev
    WHERE ev.id = COALESCE(NEW.version_id, OLD.version_id);

    IF v_status = 'published' THEN
        RAISE EXCEPTION 'No se puede modificar la estructura de una versión publicada.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Función para preguntas: pregunta → sección → versión
CREATE OR REPLACE FUNCTION prevent_published_question_change()
RETURNS TRIGGER AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT ev.status INTO v_status
    FROM encuesta_preguntas p
    JOIN encuesta_secciones s ON s.id = p.section_id
    JOIN encuesta_versiones ev ON ev.id = s.version_id
    WHERE p.id = COALESCE(NEW.id, OLD.id);

    IF v_status = 'published' THEN
        RAISE EXCEPTION 'No se puede modificar la estructura de una versión publicada.';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Función para opciones: opción → pregunta → sección → versión
CREATE OR REPLACE FUNCTION prevent_published_option_change()
RETURNS TRIGGER AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT ev.status INTO v_status
    FROM encuesta_opciones o
    JOIN encuesta_preguntas p ON p.id = o.question_id
    JOIN encuesta_secciones s ON s.id = p.section_id
    JOIN encuesta_versiones ev ON ev.id = s.version_id
    WHERE o.id = COALESCE(NEW.id, OLD.id);

    IF v_status = 'published' THEN
        RAISE EXCEPTION 'No se puede modificar la estructura de una versión publicada.';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER trg_prevent_section_change
    BEFORE UPDATE OR DELETE ON encuesta_secciones
    FOR EACH ROW
    EXECUTE FUNCTION prevent_published_section_change();

CREATE TRIGGER trg_prevent_question_change
    BEFORE UPDATE OR DELETE ON encuesta_preguntas
    FOR EACH ROW
    EXECUTE FUNCTION prevent_published_question_change();

CREATE TRIGGER trg_prevent_option_change
    BEFORE UPDATE OR DELETE ON encuesta_opciones
    FOR EACH ROW
    EXECUTE FUNCTION prevent_published_option_change();

-- ============================================================
-- TRIGGER: La respuesta no puede modificar answer de aplicación completada
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_completed_response_change()
RETURNS TRIGGER AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT a.status INTO v_status
    FROM encuesta_aplicaciones a
    WHERE a.id = NEW.application_id;

    IF v_status = 'completed' THEN
        RAISE EXCEPTION 'No se puede modificar la respuesta de una aplicación completada.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER trg_prevent_completed_response
    BEFORE UPDATE ON encuesta_respuestas
    FOR EACH ROW
    EXECUTE FUNCTION prevent_completed_response_change();

-- ============================================================
-- TRIGGER: No crear aplicación si la versión no está publicada
-- ============================================================

CREATE OR REPLACE FUNCTION validate_application_version()
RETURNS TRIGGER AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT ev.status INTO v_status
    FROM encuesta_versiones ev
    WHERE ev.id = NEW.version_id;

    IF v_status != 'published' THEN
        RAISE EXCEPTION 'Solo se pueden crear aplicaciones de versiones publicadas.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER trg_validate_application_version
    BEFORE INSERT ON encuesta_aplicaciones
    FOR EACH ROW
    EXECUTE FUNCTION validate_application_version();

-- ============================================================
-- TRIGGER: No responder si la aplicación no está activa/extendida
-- ============================================================

CREATE OR REPLACE FUNCTION validate_response_application()
RETURNS TRIGGER AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT a.status INTO v_status
    FROM encuesta_aplicaciones a
    WHERE a.id = NEW.application_id;

    IF v_status NOT IN ('active', 'extended') THEN
        RAISE EXCEPTION 'Solo se pueden guardar respuestas en aplicaciones activas.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER trg_validate_response_application
    BEFORE INSERT OR UPDATE ON encuesta_respuestas
    FOR EACH ROW
    EXECUTE FUNCTION validate_response_application();

-- ============================================================
-- TRIGGER: La aplicación no puede cerrarse si tiene respuestas pendientes
-- (función informativa — permite cerrar pero actualiza progress)
-- ============================================================

CREATE OR REPLACE FUNCTION auto_update_progress()
RETURNS TRIGGER AS $$
DECLARE
    v_total_questions INTEGER;
    v_answered INTEGER;
BEGIN
    -- Contar total de preguntas de la versión
    SELECT COUNT(*) INTO v_total_questions
    FROM encuesta_preguntas p
    JOIN encuesta_secciones s ON s.id = p.section_id
    JOIN encuesta_versiones v ON v.id = s.version_id
    WHERE v.id = (
        SELECT version_id FROM encuesta_aplicaciones WHERE id = NEW.application_id
    );

    -- Contar respuestas de esta aplicación
    SELECT COUNT(*) INTO v_answered
    FROM encuesta_respuestas
    WHERE application_id = NEW.application_id;

    -- Actualizar progreso
    UPDATE encuesta_aplicaciones
    SET progress = CASE
        WHEN v_total_questions > 0 THEN
            LEAST(100, (v_answered * 100 / v_total_questions))
        ELSE 0
    END
    WHERE id = NEW.application_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER trg_auto_update_progress
    AFTER INSERT OR UPDATE ON encuesta_respuestas
    FOR EACH ROW
    EXECUTE FUNCTION auto_update_progress();

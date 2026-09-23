-- Migración 028: RLS de encuestas
-- Evolución Psicológica — Motor de Encuestas Institucionales

-- ============================================================
-- HABILITAR RLS
-- ============================================================

ALTER TABLE encuestas ENABLE ROW LEVEL SECURITY;
ALTER TABLE encuesta_versiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE encuesta_secciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE encuesta_preguntas ENABLE ROW LEVEL SECURITY;
ALTER TABLE encuesta_opciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE encuesta_aplicaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE encuesta_respuestas ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- FUNCIONES AUXILIARES
-- ============================================================

-- Verificar si el usuario puede gestionar encuestas (NO docente)
CREATE OR REPLACE FUNCTION can_manage_surveys()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        is_global_user() OR
        get_user_role() IN ('director', 'admin_ie', 'coordinador', 'psicologo')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Verificar si la encuesta pertenece a la institución del usuario
CREATE OR REPLACE FUNCTION is_survey_in_institution(p_survey_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM encuestas
        WHERE id = p_survey_id AND institution_id = get_user_institution()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Verificar si una aplicación pertenece a la institución del usuario
CREATE OR REPLACE FUNCTION is_application_in_institution(p_application_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM encuesta_aplicaciones
        WHERE id = p_application_id AND institution_id = get_user_institution()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================
-- ENCUESTAS
-- ============================================================

-- Global ve todas las encuestas
CREATE POLICY "Global can view all surveys"
    ON encuestas FOR SELECT
    USING (is_global_user());

-- Usuarios de la institución ven sus encuestas
CREATE POLICY "Institution can view own surveys"
    ON encuestas FOR SELECT
    USING (institution_id = get_user_institution());

-- Global puede gestionar todas las encuestas
CREATE POLICY "Global can manage all surveys"
    ON encuestas FOR ALL
    USING (is_global_user());

-- Roles autorizados pueden gestionar encuestas de su institución
CREATE POLICY "Authorized roles can manage institution surveys"
    ON encuestas FOR ALL
    USING (
        can_manage_surveys() AND
        institution_id = get_user_institution()
    );

-- ============================================================
-- VERSIONES DE ENCUESTA
-- ============================================================

-- Global ve todas las versiones
CREATE POLICY "Global can view all survey versions"
    ON encuesta_versiones FOR SELECT
    USING (is_global_user());

-- Usuarios de la institución ven versiones de sus encuestas
CREATE POLICY "Institution can view own survey versions"
    ON encuesta_versiones FOR SELECT
    USING (
        survey_id IN (
            SELECT id FROM encuestas
            WHERE institution_id = get_user_institution()
        )
    );

-- Global puede gestionar todas las versiones
CREATE POLICY "Global can manage all survey versions"
    ON encuesta_versiones FOR ALL
    USING (is_global_user());

-- Roles autorizados pueden gestionar versiones de su institución
CREATE POLICY "Authorized roles can manage institution survey versions"
    ON encuesta_versiones FOR ALL
    USING (
        can_manage_surveys() AND
        survey_id IN (
            SELECT id FROM encuestas
            WHERE institution_id = get_user_institution()
        )
    );

-- ============================================================
-- SECCIONES
-- ============================================================

CREATE POLICY "Global can view all survey sections"
    ON encuesta_secciones FOR SELECT
    USING (is_global_user());

CREATE POLICY "Institution can view own survey sections"
    ON encuesta_secciones FOR SELECT
    USING (
        version_id IN (
            SELECT v.id FROM encuesta_versiones v
            JOIN encuestas s ON s.id = v.survey_id
            WHERE s.institution_id = get_user_institution()
        )
    );

CREATE POLICY "Global can manage all survey sections"
    ON encuesta_secciones FOR ALL
    USING (is_global_user());

CREATE POLICY "Authorized roles can manage institution survey sections"
    ON encuesta_secciones FOR ALL
    USING (
        can_manage_surveys() AND
        version_id IN (
            SELECT v.id FROM encuesta_versiones v
            JOIN encuestas s ON s.id = v.survey_id
            WHERE s.institution_id = get_user_institution()
        )
    );

-- ============================================================
-- PREGUNTAS
-- ============================================================

CREATE POLICY "Global can view all survey questions"
    ON encuesta_preguntas FOR SELECT
    USING (is_global_user());

CREATE POLICY "Institution can view own survey questions"
    ON encuesta_preguntas FOR SELECT
    USING (
        section_id IN (
            SELECT sec.id FROM encuesta_secciones sec
            JOIN encuesta_versiones v ON v.id = sec.version_id
            JOIN encuestas s ON s.id = v.survey_id
            WHERE s.institution_id = get_user_institution()
        )
    );

CREATE POLICY "Global can manage all survey questions"
    ON encuesta_preguntas FOR ALL
    USING (is_global_user());

CREATE POLICY "Authorized roles can manage institution survey questions"
    ON encuesta_preguntas FOR ALL
    USING (
        can_manage_surveys() AND
        section_id IN (
            SELECT sec.id FROM encuesta_secciones sec
            JOIN encuesta_versiones v ON v.id = sec.version_id
            JOIN encuestas s ON s.id = v.survey_id
            WHERE s.institution_id = get_user_institution()
        )
    );

-- ============================================================
-- OPCIONES
-- ============================================================

CREATE POLICY "Global can view all survey options"
    ON encuesta_opciones FOR SELECT
    USING (is_global_user());

CREATE POLICY "Institution can view own survey options"
    ON encuesta_opciones FOR SELECT
    USING (
        question_id IN (
            SELECT p.id FROM encuesta_preguntas p
            JOIN encuesta_secciones sec ON sec.id = p.section_id
            JOIN encuesta_versiones v ON v.id = sec.version_id
            JOIN encuestas s ON s.id = v.survey_id
            WHERE s.institution_id = get_user_institution()
        )
    );

CREATE POLICY "Global can manage all survey options"
    ON encuesta_opciones FOR ALL
    USING (is_global_user());

CREATE POLICY "Authorized roles can manage institution survey options"
    ON encuesta_opciones FOR ALL
    USING (
        can_manage_surveys() AND
        question_id IN (
            SELECT p.id FROM encuesta_preguntas p
            JOIN encuesta_secciones sec ON sec.id = p.section_id
            JOIN encuesta_versiones v ON v.id = sec.version_id
            JOIN encuestas s ON s.id = v.survey_id
            WHERE s.institution_id = get_user_institution()
        )
    );

-- ============================================================
-- APLICACIONES
-- ============================================================

-- Global ve todas las aplicaciones
CREATE POLICY "Global can view all survey applications"
    ON encuesta_aplicaciones FOR SELECT
    USING (is_global_user());

-- Usuarios de la institución ven aplicaciones de su institución
CREATE POLICY "Institution can view own survey applications"
    ON encuesta_aplicaciones FOR SELECT
    USING (institution_id = get_user_institution());

-- Global puede gestionar todas las aplicaciones
CREATE POLICY "Global can manage all survey applications"
    ON encuesta_aplicaciones FOR ALL
    USING (is_global_user());

-- Roles autorizados pueden gestionar aplicaciones de su institución
CREATE POLICY "Authorized roles can manage institution survey applications"
    ON encuesta_aplicaciones FOR ALL
    USING (
        can_manage_surveys() AND
        institution_id = get_user_institution()
    );

-- ============================================================
-- RESPUESTAS
-- ============================================================

-- Global ve todas las respuestas
CREATE POLICY "Global can view all survey responses"
    ON encuesta_respuestas FOR SELECT
    USING (is_global_user());

-- Psicólogo ve todas las respuestas
CREATE POLICY "Psychologist can view all survey responses"
    ON encuesta_respuestas FOR SELECT
    USING (get_user_role() = 'psicologo');

-- Usuarios de la institución ven respuestas de su institución
CREATE POLICY "Institution can view own survey responses"
    ON encuesta_respuestas FOR SELECT
    USING (
        application_id IN (
            SELECT id FROM encuesta_aplicaciones
            WHERE institution_id = get_user_institution()
        )
    );

-- Respondiente estudiante ve sus propias respuestas (a través de la aplicación)
CREATE POLICY "Student respondent can view own responses"
    ON encuesta_respuestas FOR SELECT
    USING (
        application_id IN (
            SELECT id FROM encuesta_aplicaciones
            WHERE respondent_student_id IN (
                SELECT id FROM estudiantes
                WHERE document_number = (
                    SELECT document_number FROM perfiles WHERE user_id = auth.uid()
                )
            )
        )
    );

-- Global puede gestionar todas las respuestas
CREATE POLICY "Global can manage all survey responses"
    ON encuesta_respuestas FOR ALL
    USING (is_global_user());

-- Roles autorizados pueden gestionar respuestas de su institución
CREATE POLICY "Authorized roles can manage institution survey responses"
    ON encuesta_respuestas FOR ALL
    USING (
        can_manage_surveys() AND
        application_id IN (
            SELECT id FROM encuesta_aplicaciones
            WHERE institution_id = get_user_institution()
        )
    );

-- ============================================================
-- AUDITORÍA
-- ============================================================

-- Registrar en tabla auditoria cuando se crea/modifica/elimina una encuesta
CREATE OR REPLACE FUNCTION audit_survey_changes()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO auditoria (user_id, action, table_name, record_id, old_values, new_values)
    VALUES (
        auth.uid(),
        TG_OP,
        TG_TABLE_NAME,
        CASE
            WHEN TG_OP = 'DELETE' THEN OLD.id
            ELSE NEW.id
        END,
        CASE
            WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD)
            ELSE NULL
        END,
        CASE
            WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW)
            ELSE NULL
        END
    );
    RETURN CASE
        WHEN TG_OP = 'DELETE' THEN OLD
        ELSE NEW
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER audit_encuestas
    AFTER INSERT OR UPDATE OR DELETE ON encuestas
    FOR EACH ROW
    EXECUTE FUNCTION audit_survey_changes();

CREATE TRIGGER audit_encuesta_versiones
    AFTER INSERT OR UPDATE OR DELETE ON encuesta_versiones
    FOR EACH ROW
    EXECUTE FUNCTION audit_survey_changes();

CREATE TRIGGER audit_encuesta_aplicaciones
    AFTER INSERT OR UPDATE OR DELETE ON encuesta_aplicaciones
    FOR EACH ROW
    EXECUTE FUNCTION audit_survey_changes();

-- Migración 026: Modelo de encuestas — aplicaciones y respuestas
-- Evolución Psicológica — Motor de Encuestas Institucionales

-- ============================================================
-- 1. APLICACIONES
-- ============================================================
-- Cada aplicación es independiente: versión + respondiente + ventana temporal.
-- No imponer unique por persona/año — la repetición es nueva aplicación.
-- Ampliar el plazo actualiza la fecha/hora fin de la misma aplicación.

CREATE TABLE IF NOT EXISTS encuesta_aplicaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version_id UUID NOT NULL REFERENCES encuesta_versiones(id) ON DELETE RESTRICT,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    respondent_student_id UUID REFERENCES estudiantes(id) ON DELETE SET NULL,
    respondent_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    year INTEGER NOT NULL,
    section_name VARCHAR(10) CHECK (section_name IN ('A', 'B', 'U')),
    grade_id UUID REFERENCES grados(id) ON DELETE SET NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
    extended_at TIMESTAMP WITH TIME ZONE,
    extended_by UUID,
    status VARCHAR(20) DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'active', 'extended', 'completed', 'closed', 'expired')),
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    access_token TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_respondent CHECK (
        respondent_student_id IS NOT NULL OR respondent_user_id IS NOT NULL
    )
);

CREATE INDEX idx_encuesta_aplicaciones_version ON encuesta_aplicaciones(version_id);
CREATE INDEX idx_encuesta_aplicaciones_institution ON encuesta_aplicaciones(institution_id);
CREATE INDEX idx_encuesta_aplicaciones_student ON encuesta_aplicaciones(respondent_student_id);
CREATE INDEX idx_encuesta_aplicaciones_user ON encuesta_aplicaciones(respondent_user_id);
CREATE INDEX idx_encuesta_aplicaciones_status ON encuesta_aplicaciones(status);
CREATE INDEX idx_encuesta_aplicaciones_token ON encuesta_aplicaciones(access_token);
CREATE INDEX idx_encuesta_aplicaciones_year ON encuesta_aplicaciones(year);

-- ============================================================
-- 2. RESPUESTAS
-- ============================================================
-- Cada respuesta pertenece a una aplicación y una pregunta.
-- answers contiene la información estructurada según el tipo de pregunta.
-- No se crean columnas específicas por tipo de pregunta.

CREATE TABLE IF NOT EXISTS encuesta_respuestas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES encuesta_aplicaciones(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES encuesta_preguntas(id) ON DELETE CASCADE,
    answer JSONB,
    answered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(application_id, question_id)
);

CREATE INDEX idx_encuesta_respuestas_application ON encuesta_respuestas(application_id);
CREATE INDEX idx_encuesta_respuestas_question ON encuesta_respuestas(question_id);

-- ============================================================
-- 3. TRIGGERS updated_at
-- ============================================================

CREATE TRIGGER update_encuesta_aplicaciones_updated_at
    BEFORE UPDATE ON encuesta_aplicaciones
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_encuesta_respuestas_updated_at
    BEFORE UPDATE ON encuesta_respuestas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

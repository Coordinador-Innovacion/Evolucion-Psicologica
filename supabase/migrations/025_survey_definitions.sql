-- Migración 025: Modelo de encuestas — definiciones
-- Evolución Psicológica — Motor de Encuestas Institucionales

-- ============================================================
-- 1. ENCUESTAS
-- ============================================================
-- Cada encuesta pertenece a una institución educativa.
-- Una misma encuesta puede reutilizarse en distintos años y tener múltiples versiones.

CREATE TABLE IF NOT EXISTS encuestas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_encuestas_institution ON encuestas(institution_id);
CREATE INDEX idx_encuestas_created_by ON encuestas(created_by);

-- ============================================================
-- 2. VERSIONES DE ENCUESTA
-- ============================================================
-- Cada encuesta puede tener múltiples versiones.
-- Una versión utilizada (con respuestas) queda inmutable.
-- Crear una nueva aplicación NO crea una nueva versión.

CREATE TABLE IF NOT EXISTS encuesta_versiones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_id UUID NOT NULL REFERENCES encuestas(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
    published_at TIMESTAMP WITH TIME ZONE,
    published_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(survey_id, version_number)
);

CREATE INDEX idx_encuesta_versiones_survey ON encuesta_versiones(survey_id);
CREATE INDEX idx_encuesta_versiones_status ON encuesta_versiones(status);

-- ============================================================
-- 3. SECCIONES
-- ============================================================
-- Agrupan preguntas dentro de una versión. El frontend navega por secciones.

CREATE TABLE IF NOT EXISTS encuesta_secciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version_id UUID NOT NULL REFERENCES encuesta_versiones(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_encuesta_secciones_version ON encuesta_secciones(version_id);

-- ============================================================
-- 4. PREGUNTAS
-- ============================================================
-- Tipos V0: texto_corto, texto_largo, opcion_unica, seleccion_multiple,
--          si_no, numero, fecha, escala, seleccion_opciones.
-- tipo_presentacion: 'normal' | 'visual' (iconográfica) — según tipo.

CREATE TABLE IF NOT EXISTS encuesta_preguntas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    section_id UUID NOT NULL REFERENCES encuesta_secciones(id) ON DELETE CASCADE,
    question_type VARCHAR(30) NOT NULL
        CHECK (question_type IN (
            'texto_corto', 'texto_largo', 'opcion_unica', 'seleccion_multiple',
            'si_no', 'numero', 'fecha', 'escala', 'seleccion_opciones'
        )),
    label TEXT NOT NULL,
    description TEXT,
    is_required BOOLEAN DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    config JSONB DEFAULT '{}'::jsonb,
    presentation JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_encuesta_preguntas_section ON encuesta_preguntas(section_id);
CREATE INDEX idx_encuesta_preguntas_type ON encuesta_preguntas(question_type);

-- ============================================================
-- 5. OPCIONES
-- ============================================================
-- Opciones para preguntas tipo opcion_unica, seleccion_multiple, seleccion_opciones.
-- Solo aplica cuando el tipo requiere opciones predefinidas.

CREATE TABLE IF NOT EXISTS encuesta_opciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID NOT NULL REFERENCES encuesta_preguntas(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_encuesta_opciones_question ON encuesta_opciones(question_id);

-- ============================================================
-- 6. TRIGGERS updated_at
-- ============================================================

CREATE TRIGGER update_encuestas_updated_at
    BEFORE UPDATE ON encuestas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_encuesta_versiones_updated_at
    BEFORE UPDATE ON encuesta_versiones
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_encuesta_secciones_updated_at
    BEFORE UPDATE ON encuesta_secciones
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_encuesta_preguntas_updated_at
    BEFORE UPDATE ON encuesta_preguntas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

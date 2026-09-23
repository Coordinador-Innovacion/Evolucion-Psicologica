-- Migración 005: Diagnóstico anual
-- Evolución Psicológica

-- Tabla de diagnósticos anuales
CREATE TABLE IF NOT EXISTS diagnosticos_anuales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES estudiantes(id) ON DELETE CASCADE,
    school_year INTEGER NOT NULL,
    form_version VARCHAR(20) NOT NULL,
    responses JSONB DEFAULT '{}',
    technical_status VARCHAR(20) DEFAULT 'draft' CHECK (technical_status IN ('draft', 'submitted', 'reviewed')),
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Un estudiante solo puede tener un diagnóstico por año
    UNIQUE(student_id, school_year)
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_diagnosticos_anuales_student ON diagnosticos_anuales(student_id);
CREATE INDEX idx_diagnosticos_anuales_year ON diagnosticos_anuales(school_year);
CREATE INDEX idx_diagnosticos_anuales_status ON diagnosticos_anuales(technical_status);

-- Triggers para updated_at
CREATE TRIGGER update_diagnosticos_anuales_updated_at
    BEFORE UPDATE ON diagnosticos_anuales
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

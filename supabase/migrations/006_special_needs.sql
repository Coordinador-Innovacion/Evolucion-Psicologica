-- Migración 006: Necesidades especiales
-- Evolución Psicológica

-- Tabla de necesidades especiales
CREATE TABLE IF NOT EXISTS necesidades_especiales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES estudiantes(id) ON DELETE CASCADE,
    condition_type VARCHAR(100) NOT NULL,
    clinical_description TEXT,
    teacher_orientation TEXT,
    certifying_entity VARCHAR(255),
    certification_date DATE,
    document_id UUID, -- Referencia a documentos/opciones
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Una condición por estudiante (según documentación)
    UNIQUE(student_id, condition_type)
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_necesidades_especiales_student ON necesidades_especiales(student_id);

-- Triggers para updated_at
CREATE TRIGGER update_necesidades_especiales_updated_at
    BEFORE UPDATE ON necesidades_especiales
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

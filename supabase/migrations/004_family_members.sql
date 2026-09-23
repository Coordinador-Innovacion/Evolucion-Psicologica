-- Migración 004: Familiares
-- Evolución Psicológica

-- Tabla de familiares
CREATE TABLE IF NOT EXISTS familiares (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES estudiantes(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('padre', 'madre', 'guardian')),
    full_name VARCHAR(255) NOT NULL,
    document_type VARCHAR(20) NOT NULL,
    document_number VARCHAR(50) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    relationship VARCHAR(100), -- Para guardian/tutor
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Un estudiante puede tener un padre, una madre y un guardián/tutor
    UNIQUE(student_id, type)
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_familiares_student ON familiares(student_id);
CREATE INDEX idx_familiares_documento ON familiares(document_type, document_number);

-- Triggers para updated_at
CREATE TRIGGER update_familiares_updated_at
    BEFORE UPDATE ON familiares
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

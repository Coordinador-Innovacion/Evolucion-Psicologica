-- Migración 003: Estudiantes y períodos escolares
-- Evolución Psicológica

-- Tabla de estudiantes
CREATE TABLE IF NOT EXISTS estudiantes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_names VARCHAR(255) NOT NULL,
    last_names VARCHAR(255) NOT NULL,
    document_type VARCHAR(20) NOT NULL,
    document_number VARCHAR(50) NOT NULL,
    birth_date DATE,
    birth_place VARCHAR(255),
    address TEXT,
    phone VARCHAR(50),
    email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_type, document_number)
);

-- Tabla de períodos escolares
CREATE TABLE IF NOT EXISTS periodos_escolares (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES estudiantes(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    school_year INTEGER NOT NULL,
    nivel_id UUID NOT NULL REFERENCES niveles_educativos(id) ON DELETE RESTRICT,
    grado_id UUID NOT NULL REFERENCES grados(id) ON DELETE RESTRICT,
    section VARCHAR(10) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('regular', 'retiro', 'retorno')),
    motivo_retiro TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Sin solapamientos: un estudiante no puede tener dos períodos activos en el mismo año
    EXCLUDE USING GIST (
        student_id WITH =,
        school_year WITH =,
        daterange(start_date, end_date, '[]') WITH &&
    ) WHERE (end_date IS NOT NULL)
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_estudiantes_documento ON estudiantes(document_type, document_number);
CREATE INDEX idx_periodos_escolares_student ON periodos_escolares(student_id);
CREATE INDEX idx_periodos_escolares_institution ON periodos_escolares(institution_id);
CREATE INDEX idx_periodos_escolares_year ON periodos_escolares(school_year);
CREATE INDEX idx_periodos_escolares_nivel ON periodos_escolares(nivel_id);
CREATE INDEX idx_periodos_escolares_grado ON periodos_escolares(grado_id);

-- Triggers para updated_at
CREATE TRIGGER update_estudiantes_updated_at
    BEFORE UPDATE ON estudiantes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_periodos_escolares_updated_at
    BEFORE UPDATE ON periodos_escolares
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

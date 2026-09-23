-- Migración 010: Licencias
-- Evolución Psicológica

-- Tabla de licencias
CREATE TABLE IF NOT EXISTS licencias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- No permitir licencias superpuestas para la misma institución
    EXCLUDE USING GIST (
        institution_id WITH =,
        daterange(start_date, end_date, '[]') WITH &&
    )
);

-- Tabla de códigos de licencia
CREATE TABLE IF NOT EXISTS licencia_codigos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    license_id UUID NOT NULL REFERENCES licencias(id) ON DELETE CASCADE,
    code VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Un código no se reutiliza
    UNIQUE(license_id, code)
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_licencias_institution ON licencias(institution_id);
CREATE INDEX idx_licencias_fechas ON licencias(start_date, end_date);
CREATE INDEX idx_licencia_codigos_license ON licencia_codigos(license_id);
CREATE INDEX idx_licencia_codigos_code ON licencia_codigos(code);

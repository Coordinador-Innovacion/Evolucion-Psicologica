-- Migración 002: Tablas de catálogo
-- Evolución Psicológica

-- Tabla de instituciones educativas
CREATE TABLE IF NOT EXISTS institutions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de niveles educativos
CREATE TABLE IF NOT EXISTS niveles_educativos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    order_number INTEGER NOT NULL,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(institution_id, name)
);

-- Tabla de grados
CREATE TABLE IF NOT EXISTS grados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL,
    order_number INTEGER NOT NULL,
    nivel_id UUID NOT NULL REFERENCES niveles_educativos(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(nivel_id, name)
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_niveles_educativos_institution ON niveles_educativos(institution_id);
CREATE INDEX idx_grados_nivel ON grados(nivel_id);

-- Triggers para updated_at
CREATE TRIGGER update_institutions_updated_at
    BEFORE UPDATE ON institutions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_niveles_educativos_updated_at
    BEFORE UPDATE ON niveles_educativos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_grados_updated_at
    BEFORE UPDATE ON grados
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

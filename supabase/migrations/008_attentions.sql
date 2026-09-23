-- Migración 008: Atenciones
-- Evolución Psicológica

-- Tabla de atenciones
CREATE TABLE IF NOT EXISTS atenciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    caso_id UUID NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
    fecha TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    motivo TEXT NOT NULL,
    que_se_hizo TEXT NOT NULL,
    observaciones TEXT,
    compromisos TEXT,
    proxima_atencion TIMESTAMP WITH TIME ZONE,
    origen VARCHAR(100),
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_atenciones_caso ON atenciones(caso_id);
CREATE INDEX idx_atenciones_fecha ON atenciones(fecha);

-- Triggers para updated_at
CREATE TRIGGER update_atenciones_updated_at
    BEFORE UPDATE ON atenciones
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

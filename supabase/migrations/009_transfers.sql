-- Migración 009: Transferencias
-- Evolución Psicológica
-- V1: Institución B solicita, Institución A (origen) autoriza via Director

-- Tabla de transferencias
CREATE TABLE IF NOT EXISTS transferencias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    caso_id UUID NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
    origin_institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    destination_institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    requested_by UUID NOT NULL, -- Usuario que solicita (Institución B)
    authorized_by UUID, -- Director que autoriza (Institución A) - se llena al aprobar
    status VARCHAR(20) DEFAULT 'pending' CHECK (
        status IN ('pending', 'approved', 'rejected', 'completed')
    ),
    transferred_at TIMESTAMP WITH TIME ZONE, -- Se llena al completar
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- No se puede transferir a la misma institución
    CHECK (origin_institution_id != destination_institution_id)
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_transferencias_caso ON transferencias(caso_id);
CREATE INDEX idx_transferencias_origin ON transferencias(origin_institution_id);
CREATE INDEX idx_transferencias_destination ON transferencias(destination_institution_id);
CREATE INDEX idx_transferencias_status ON transferencias(status);

-- Triggers para updated_at
CREATE TRIGGER update_transferencias_updated_at
    BEFORE UPDATE ON transferencias
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

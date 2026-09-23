-- Migración 007: Derivaciones y casos
-- Evolución Psicológica

-- Tabla de derivaciones
CREATE TABLE IF NOT EXISTS derivaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES estudiantes(id) ON DELETE CASCADE,
    derivation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    school_period_id UUID NOT NULL REFERENCES periodos_escolares(id) ON DELETE RESTRICT,
    derivador_nombre VARCHAR(255) NOT NULL,
    derivador_cargo VARCHAR(100) NOT NULL,
    registrador_id UUID NOT NULL,
    motivo TEXT NOT NULL,
    resumen TEXT,
    acciones_previas TEXT,
    adjunto_url TEXT,
    caso_id UUID, -- Se referencia después de crear el caso
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de casos
CREATE TABLE IF NOT EXISTS casos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES estudiantes(id) ON DELETE CASCADE,
    situation TEXT NOT NULL,
    derivation_id UUID REFERENCES derivaciones(id) ON DELETE SET NULL,
    estado VARCHAR(20) DEFAULT 'inicio' CHECK (estado IN ('inicio', 'en_proceso', 'cerrado')),
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP WITH TIME ZONE,
    close_reason TEXT,
    current_responsible_id UUID,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Agregar foreign key a derivaciones después de crear casos
ALTER TABLE derivaciones
    ADD CONSTRAINT fk_derivaciones_caso
    FOREIGN KEY (caso_id) REFERENCES casos(id) ON DELETE SET NULL;

-- Tabla de historial de responsables del caso
CREATE TABLE IF NOT EXISTS caso_responsables_historial (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    caso_id UUID NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
    responsible_id UUID NOT NULL,
    desde TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    hasta TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Un responsable no puede tener solapamientos en el mismo caso
    CHECK (hasta IS NULL OR hasta > desde)
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_derivaciones_student ON derivaciones(student_id);
CREATE INDEX idx_derivaciones_period ON derivaciones(school_period_id);
CREATE INDEX idx_derivaciones_caso ON derivaciones(caso_id);
CREATE INDEX idx_casos_student ON casos(student_id);
CREATE INDEX idx_casos_estado ON casos(estado);
CREATE INDEX idx_casos_responsible ON casos(current_responsible_id);
CREATE INDEX idx_caso_responsables_caso ON caso_responsables_historial(caso_id);

-- Triggers para updated_at
CREATE TRIGGER update_derivaciones_updated_at
    BEFORE UPDATE ON derivaciones
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_casos_updated_at
    BEFORE UPDATE ON casos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

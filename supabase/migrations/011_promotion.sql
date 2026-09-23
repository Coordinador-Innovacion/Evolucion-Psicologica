-- Migración 011: Promoción
-- Evolución Psicológica

-- Tabla de lotes de promoción
CREATE TABLE IF NOT EXISTS lotes_promocion (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    origin_year INTEGER NOT NULL,
    destination_year INTEGER NOT NULL,
    started_by UUID NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(30) DEFAULT 'PREPARED' CHECK (
        status IN ('PREPARED', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_EXCEPTIONS', 'INTERRUPTED', 'FAILED')
    ),
    counts JSONB DEFAULT '{}',
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de acciones de promoción
CREATE TABLE IF NOT EXISTS acciones_promocion (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES lotes_promocion(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES estudiantes(id) ON DELETE CASCADE,
    source_period_id UUID NOT NULL REFERENCES periodos_escolares(id) ON DELETE RESTRICT,
    destination_period_id UUID REFERENCES periodos_escolares(id) ON DELETE SET NULL,
    automatic_result VARCHAR(50) NOT NULL,
    final_result VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (
        status IN ('pending', 'processed', 'error', 'excluded')
    ),
    processed_at TIMESTAMP WITH TIME ZONE,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- No duplicar acciones por estudiante en el mismo lote
    UNIQUE(batch_id, student_id)
);

-- Tabla de excepciones de promoción
CREATE TABLE IF NOT EXISTS excepciones_promocion (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_id UUID NOT NULL REFERENCES acciones_promocion(id) ON DELETE CASCADE,
    automatic_result VARCHAR(50) NOT NULL,
    final_result VARCHAR(50) NOT NULL,
    motivo TEXT NOT NULL,
    usuario_id UUID NOT NULL,
    fecha TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_lotes_promocion_institution ON lotes_promocion(institution_id);
CREATE INDEX idx_lotes_promocion_years ON lotes_promocion(origin_year, destination_year);
CREATE INDEX idx_lotes_promocion_status ON lotes_promocion(status);
CREATE INDEX idx_acciones_promocion_batch ON acciones_promocion(batch_id);
CREATE INDEX idx_acciones_promocion_student ON acciones_promocion(student_id);
CREATE INDEX idx_acciones_promocion_status ON acciones_promocion(status);
CREATE INDEX idx_excepciones_promocion_action ON excepciones_promocion(action_id);

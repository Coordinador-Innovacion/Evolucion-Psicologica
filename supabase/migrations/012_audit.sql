-- Migración 012: Auditoría
-- Evolución Psicológica

-- Tabla de auditoría
CREATE TABLE IF NOT EXISTS auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_auditoria_user ON auditoria(user_id);
CREATE INDEX idx_auditoria_table ON auditoria(table_name);
CREATE INDEX idx_auditoria_record ON auditoria(record_id);
CREATE INDEX idx_auditoria_action ON auditoria(action);
CREATE INDEX idx_auditoria_created ON auditoria(created_at);

-- Particionar por mes para mejor rendimiento (opcional, para tablas grandes)
-- CREATE INDEX idx_auditoria_created_month ON auditoria(created_at);

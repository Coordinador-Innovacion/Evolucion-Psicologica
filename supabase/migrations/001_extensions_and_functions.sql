-- Migración 001: Extensiones y esquema base
-- Evolución Psicológica

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- btree_gist: operator classes GIST para uuid/int en EXCLUDE de periodos_escolares (003)
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- En Supabase hosteado la extensión se instala en el schema "extensions".
-- El runner de migraciones usa search_path = public, por lo que DEFAULT
-- uuid_generate_v4() en CREATE TABLE falla si no hay resolución en public.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'uuid_generate_v4'
        AND n.nspname = 'public'
    ) THEN
        CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid AS
        $fn$ SELECT extensions.uuid_generate_v4() $fn$
        LANGUAGE sql VOLATILE;
    END IF;
END $$;

-- Crear esquema de aplicación (opcional, pero recomendado)
-- CREATE SCHEMA IF NOT EXISTS app;

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Función para generar UUIDs
CREATE OR REPLACE FUNCTION generate_uuid()
RETURNS TEXT AS $$
BEGIN
    RETURN uuid_generate_v4()::TEXT;
END;
$$ language 'plpgsql';

-- Migración 062: SEXO en estudiantes + catálogo de secciones agregable
-- Evolución Psicológica
--
-- 1) estudiantes.sexo (M/F): el campo no existía en el esquema.
-- 2) Tabla secciones: catálogo por I.E. para agregar/editar/desactivar
--    secciones sin tocar las migraciones 001–061 (los tests estáticos
--    leen esos archivos y exigen los literales A/B/U intactos).
-- 3) La validación pasa a section_is_valid() (catálogo ∪ legado A/B/U),
--    usada por las RPC (063/064) y por un trigger de respaldo.

-- ============================================================
-- 1) SEXO
-- ============================================================
ALTER TABLE estudiantes
    ADD COLUMN IF NOT EXISTS sexo VARCHAR(1)
    CHECK (sexo IS NULL OR sexo IN ('M', 'F'));

COMMENT ON COLUMN estudiantes.sexo IS
'Sexo del estudiante: M (masculino) o F (femenino). NULL si no se ha registrado.';

-- ============================================================
-- 2) CATÁLOGO DE SECCIONES POR INSTITUCIÓN
-- ============================================================
CREATE TABLE IF NOT EXISTS secciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    name VARCHAR(10) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT secciones_name_not_empty CHECK (LENGTH(TRIM(name)) > 0)
);

COMMENT ON TABLE secciones IS
'ACA-03 (catálogo): secciones configurables por I.E. Amplía el conjunto fijo A/B/U.';
COMMENT ON COLUMN secciones.active IS
'Activa=false oculta la sección en los selectores; las matrículas existentes siguen siendo válidas.';

CREATE UNIQUE INDEX IF NOT EXISTS secciones_inst_name_unique
    ON secciones (institution_id, UPPER(name));

CREATE TRIGGER update_secciones_updated_at
    BEFORE UPDATE ON secciones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE secciones ENABLE ROW LEVEL SECURITY;

-- Lectura: miembros de la I.E. (mismo patrón que niveles_educativos, 014)
DROP POLICY IF EXISTS "Users can view sections in their institution" ON secciones;
CREATE POLICY "Users can view sections in their institution"
    ON secciones FOR SELECT
    USING (institution_id = get_user_institution() OR is_global_user());

-- Gestión: mismos roles de academico.gestionar (Global, Director, Admin I.E.)
DROP POLICY IF EXISTS "Global and Director users can manage sections" ON secciones;
CREATE POLICY "Global and Director users can manage sections"
    ON secciones FOR ALL
    USING (
        is_global_user() OR
        (get_user_role() IN ('director', 'admin_ie') AND
         institution_id = get_user_institution())
    )
    WITH CHECK (
        is_global_user() OR
        (get_user_role() IN ('director', 'admin_ie') AND
         institution_id = get_user_institution())
    );

-- Semilla idempotente: A, B y U para las instituciones existentes
INSERT INTO secciones (institution_id, name)
SELECT i.id, s.name
FROM institutions i
CROSS JOIN (VALUES ('A'), ('B'), ('U')) AS s(name)
WHERE NOT EXISTS (
    SELECT 1 FROM secciones sc
    WHERE sc.institution_id = i.id AND sc.name = s.name
);

-- ============================================================
-- 3) VALIDACIÓN DE SECCIÓN (catálogo ∪ legado A/B/U)
-- ============================================================
CREATE OR REPLACE FUNCTION section_is_valid(p_institution_id UUID, p_section TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
    SELECT p_section IS NOT NULL
       AND LENGTH(TRIM(p_section)) > 0
       AND (
           UPPER(TRIM(p_section)) IN ('A', 'B', 'U')
           OR EXISTS (
               SELECT 1 FROM secciones s
               WHERE s.institution_id = p_institution_id
                 AND UPPER(s.name) = UPPER(TRIM(p_section))
           )
       );
$$;

COMMENT ON FUNCTION section_is_valid(UUID, TEXT) IS
'True si la sección es legada (A/B/U) o existe en el catálogo de la institución.';

-- ============================================================
-- 4) Retirar los CHECK rígidos A/B/U (solo viven en archivos 001–061)
-- ============================================================
ALTER TABLE periodos_escolares DROP CONSTRAINT IF EXISTS check_section_valid;
ALTER TABLE encuesta_aplicaciones DROP CONSTRAINT IF EXISTS encuesta_aplicaciones_section_name_check;
ALTER TABLE asignaciones_docentes DROP CONSTRAINT IF EXISTS asignaciones_section_valid;

-- ============================================================
-- 5) Trigger de respaldo en periodos_escolares
-- ============================================================
CREATE OR REPLACE FUNCTION validate_periodo_section()
RETURNS TRIGGER AS $$
BEGIN
    -- Cierre/edición sin cambiar la sección: no re-validar (para no bloquear
    -- períodos de secciones desactivadas o eliminadas del catálogo).
    IF TG_OP = 'UPDATE' AND NEW.section IS NOT DISTINCT FROM OLD.section THEN
        RETURN NEW;
    END IF;
    IF NOT section_is_valid(NEW.institution_id, NEW.section) THEN
        RAISE EXCEPTION 'Sección inválida para la institución: %', NEW.section;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS periodos_escolares_section_check ON periodos_escolares;
CREATE TRIGGER periodos_escolares_section_check
    BEFORE INSERT OR UPDATE ON periodos_escolares
    FOR EACH ROW EXECUTE FUNCTION validate_periodo_section();

-- Exponer la nueva tabla en el esquema de PostgREST
NOTIFY pgrst, 'reload schema';

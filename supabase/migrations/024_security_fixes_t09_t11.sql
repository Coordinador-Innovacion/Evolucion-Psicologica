-- Migración 024: Correcciones de seguridad T09-T11
-- Evolución Psicológica

-- ============================================================
-- PROBLEMAS ENCONTRADOS EN REVISIÓN TRANSVERSAL:
--
-- 1. RLS estudiantes: ALL policy no verifica institution_id
-- 2. RLS familiares: ALL policy no verifica institution_id
-- 3. get_student_family_members(): SECURITY DEFINER sin verificar institución
-- 4. check_student_duplicates_by_name(): requiere extensión pg_trgm
-- 5. delete_family_member(): contradice "Datos permanentes en Familiar"
-- ============================================================

-- ============================================================
-- 1. CORRECCIÓN: Habilitar extensión pg_trgm para similaridad
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- 2. CORRECCIÓN: RLS estudiantes - ALL policy con institution_id
-- ============================================================
-- Eliminar política antigua
DROP POLICY IF EXISTS "Coordinator and Director can manage students" ON estudiantes;

-- Crear política corregida
CREATE POLICY "Coordinator and Director can manage students in their institution"
    ON estudiantes FOR ALL
    USING (
        is_global_user() OR
        (
            get_user_role() IN ('director', 'admin_ie', 'coordinador') AND
            id IN (
                SELECT student_id FROM periodos_escolares
                WHERE institution_id = get_user_institution()
            )
        )
    );

-- ============================================================
-- 3. CORRECCIÓN: RLS familiares - ALL policy con institution_id
-- ============================================================
-- Eliminar política antigua
DROP POLICY IF EXISTS "Coordinator and Director can manage family members" ON familiares;

-- Crear política corregida
CREATE POLICY "Coordinator and Director can manage family members in their institution"
    ON familiares FOR ALL
    USING (
        is_global_user() OR
        (
            get_user_role() IN ('director', 'admin_ie', 'coordinador') AND
            student_id IN (
                SELECT student_id FROM periodos_escolares
                WHERE institution_id = get_user_institution()
            )
        )
    );

-- ============================================================
-- 4. CORRECCIÓN: get_student_family_members() con verificación
-- ============================================================
CREATE OR REPLACE FUNCTION get_student_family_members(
    p_student_id UUID
)
RETURNS TABLE (
    id UUID,
    type VARCHAR,
    full_name VARCHAR,
    document_type VARCHAR,
    document_number VARCHAR,
    phone VARCHAR,
    email VARCHAR,
    relationship VARCHAR,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
DECLARE
    v_user_role TEXT;
    v_user_institution UUID;
    v_has_access BOOLEAN;
BEGIN
    -- Obtener rol e institución del usuario
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles
    WHERE user_id = auth.uid();

    -- Verificar acceso
    IF v_user_role = 'global' THEN
        v_has_access := TRUE;
    ELSIF v_user_role = 'psicologo' THEN
        -- Psicólogo ve familiares de estudiantes con casos en su institución
        v_has_access := EXISTS (
            SELECT 1 FROM periodos_escolares
            WHERE student_id = p_student_id
            AND institution_id = v_user_institution
        );
    ELSE
        -- Otros roles: solo si el estudiante tiene período en su institución
        v_has_access := EXISTS (
            SELECT 1 FROM periodos_escolares
            WHERE student_id = p_student_id
            AND institution_id = v_user_institution
        );
    END IF;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'No tiene acceso a los familiares de este estudiante';
    END IF;

    RETURN QUERY
    SELECT
        f.id,
        f.type,
        f.full_name,
        f.document_type,
        f.document_number,
        f.phone,
        f.email,
        f.relationship,
        f.created_at,
        f.updated_at
    FROM familiares f
    WHERE f.student_id = p_student_id
    ORDER BY f.type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION get_student_family_members(UUID) IS
'Obtiene familiares de un estudiante con verificación de acceso por institución.';

-- ============================================================
-- 5. CORRECCIÓN: Eliminar delete_family_member()
-- "Datos permanentes en Familiar" según SPECIFY
-- ============================================================
DROP FUNCTION IF EXISTS delete_family_member(UUID);

-- ============================================================
-- 6. CORRECCIÓN: update_student() con verificación de institución
-- ============================================================
CREATE OR REPLACE FUNCTION update_student(
    p_student_id UUID,
    p_first_names VARCHAR DEFAULT NULL,
    p_last_names VARCHAR DEFAULT NULL,
    p_birth_date DATE DEFAULT NULL,
    p_birth_place VARCHAR DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_district VARCHAR DEFAULT NULL,
    p_phone VARCHAR DEFAULT NULL,
    p_email VARCHAR DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_institution UUID;
    v_old_record RECORD;
    v_has_access BOOLEAN;
BEGIN
    -- 1. Verificar permisos
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles
    WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No tiene permisos para actualizar estudiantes'
        );
    END IF;

    -- 2. Verificar que el estudiante existe
    SELECT * INTO v_old_record
    FROM estudiantes
    WHERE id = p_student_id;

    IF v_old_record IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Estudiante no encontrado'
        );
    END IF;

    -- 3. Verificar acceso por institución (si no es Global)
    IF v_user_role != 'global' THEN
        v_has_access := EXISTS (
            SELECT 1 FROM periodos_escolares
            WHERE student_id = p_student_id
            AND institution_id = v_user_institution
        );

        IF NOT v_has_access THEN
            RETURN json_build_object(
                'success', false,
                'error', 'No tiene acceso a este estudiante'
            );
        END IF;
    END IF;

    -- 4. Actualizar solo campos proporcionados
    UPDATE estudiantes
    SET
        first_names = COALESCE(TRIM(p_first_names), first_names),
        last_names = COALESCE(TRIM(p_last_names), last_names),
        birth_date = COALESCE(p_birth_date, birth_date),
        birth_place = COALESCE(p_birth_place, birth_place),
        address = COALESCE(p_address, address),
        district = COALESCE(p_district, district),
        phone = COALESCE(p_phone, phone),
        email = COALESCE(p_email, email),
        updated_at = NOW()
    WHERE id = p_student_id;

    -- 5. Auditar
    INSERT INTO auditoria (user_id, action, table_name, record_id, old_values, new_values)
    VALUES (
        auth.uid(),
        'student_update',
        'estudiantes',
        p_student_id,
        json_build_object(
            'first_names', v_old_record.first_names,
            'last_names', v_old_record.last_names,
            'birth_date', v_old_record.birth_date
        ),
        json_build_object(
            'first_names', COALESCE(p_first_names, v_old_record.first_names),
            'last_names', COALESCE(p_last_names, v_old_record.last_names),
            'birth_date', COALESCE(p_birth_date, v_old_record.birth_date)
        )
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Estudiante actualizado exitosamente'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION update_student(UUID, VARCHAR, VARCHAR, DATE, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR) IS
'Actualiza datos de un estudiante con verificación de acceso por institución.';

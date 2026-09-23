-- Migración 022: Familiares (T10)
-- Evolución Psicológica

-- ============================================================
-- T10: GESTIÓN DE FAMILIARES
-- 
-- Reglas:
-- - Un estudiante puede tener: padre, madre, guardian/tutor
-- - UNIQUE(student_id, type) - un solo registro por tipo
-- - No generar código familiar artificial
-- - Aislamiento institucional via RLS
-- ============================================================

-- 1. Función para obtener familiares de un estudiante
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
BEGIN
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
'Obtiene todos los familiares de un estudiante.';

-- 2. Función para crear/actualizar familiar (upsert por student_id + type)
CREATE OR REPLACE FUNCTION upsert_family_member(
    p_student_id UUID,
    p_type VARCHAR,
    p_full_name VARCHAR,
    p_document_type VARCHAR,
    p_document_number VARCHAR,
    p_phone VARCHAR DEFAULT NULL,
    p_email VARCHAR DEFAULT NULL,
    p_relationship VARCHAR DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_existing_id UUID;
    v_action TEXT;
BEGIN
    -- 1. Verificar permisos
    SELECT role INTO v_user_role
    FROM perfiles
    WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No tiene permisos para gestionar familiares'
        );
    END IF;

    -- 2. Validar campos obligatorios
    IF p_full_name IS NULL OR TRIM(p_full_name) = '' THEN
        RETURN json_build_object('success', false, 'error', 'El nombre completo es obligatorio');
    END IF;

    IF p_document_type IS NULL OR TRIM(p_document_type) = '' THEN
        RETURN json_build_object('success', false, 'error', 'El tipo de documento es obligatorio');
    END IF;

    IF p_document_number IS NULL OR TRIM(p_document_number) = '' THEN
        RETURN json_build_object('success', false, 'error', 'El número de documento es obligatorio');
    END IF;

    -- 3. Verificar que el estudiante existe
    IF NOT EXISTS (SELECT 1 FROM estudiantes WHERE id = p_student_id) THEN
        RETURN json_build_object('success', false, 'error', 'Estudiante no encontrado');
    END IF;

    -- 4. Verificar si ya existe un familiar de este tipo para el estudiante
    SELECT id INTO v_existing_id
    FROM familiares
    WHERE student_id = p_student_id
    AND type = p_type;

    -- 5. Insertar o actualizar
    IF v_existing_id IS NOT NULL THEN
        -- Actualizar existente
        UPDATE familiares
        SET full_name = TRIM(p_full_name),
            document_type = TRIM(p_document_type),
            document_number = TRIM(p_document_number),
            phone = p_phone,
            email = p_email,
            relationship = p_relationship,
            updated_at = NOW()
        WHERE id = v_existing_id;

        v_action := 'update';

        -- Auditar
        INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
        VALUES (
            auth.uid(),
            'family_member_update',
            'familiares',
            v_existing_id,
            json_build_object(
                'student_id', p_student_id,
                'type', p_type,
                'full_name', p_full_name
            )
        );
    ELSE
        -- Insertar nuevo
        INSERT INTO familiares (
            student_id, type, full_name, document_type, document_number,
            phone, email, relationship
        ) VALUES (
            p_student_id, p_type, TRIM(p_full_name),
            TRIM(p_document_type), TRIM(p_document_number),
            p_phone, p_email, p_relationship
        )
        RETURNING id INTO v_existing_id;

        v_action := 'create';

        -- Auditar
        INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
        VALUES (
            auth.uid(),
            'family_member_create',
            'familiares',
            v_existing_id,
            json_build_object(
                'student_id', p_student_id,
                'type', p_type,
                'full_name', p_full_name,
                'document_type', p_document_type,
                'document_number', p_document_number
            )
        );
    END IF;

    RETURN json_build_object(
        'success', true,
        'family_member_id', v_existing_id,
        'action', v_action,
        'message', CASE WHEN v_action = 'create' THEN 'Familiar creado exitosamente' ELSE 'Familiar actualizado exitosamente' END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION upsert_family_member(UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR) IS
'Crea o actualiza un familiar. Usa upsert por student_id + type.';

-- 3. Función para eliminar familiar
CREATE OR REPLACE FUNCTION delete_family_member(
    p_family_member_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_family_member RECORD;
BEGIN
    -- 1. Verificar permisos
    SELECT role INTO v_user_role
    FROM perfiles
    WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No tiene permisos para eliminar familiares'
        );
    END IF;

    -- 2. Obtener el familiar
    SELECT * INTO v_family_member
    FROM familiares
    WHERE id = p_family_member_id;

    IF v_family_member IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Familiar no encontrado'
        );
    END IF;

    -- 3. Eliminar
    DELETE FROM familiares
    WHERE id = p_family_member_id;

    -- 4. Auditar
    INSERT INTO auditoria (user_id, action, table_name, record_id, old_values)
    VALUES (
        auth.uid(),
        'family_member_delete',
        'familiares',
        p_family_member_id,
        json_build_object(
            'student_id', v_family_member.student_id,
            'type', v_family_member.type,
            'full_name', v_family_member.full_name,
            'document_type', v_family_member.document_type,
            'document_number', v_family_member.document_number
        )
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Familiar eliminado exitosamente'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION delete_family_member(UUID) IS
'Elimina un familiar del estudiante.';

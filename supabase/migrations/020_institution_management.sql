-- Migración 020: Administración de instituciones (T08)
-- Evolución Psicológica

-- ============================================================
-- T08: GESTIÓN DE INSTITUCIONES EDUCATIVAS
-- 
-- Reglas:
-- - Global administra instituciones
-- - Director/Admin I.E. no pueden modificar instituciones
-- - Toda operación administrativa queda auditada
-- ============================================================

-- ============================================================
-- FUNCIÓN: create_institution()
-- Solo Global puede crear instituciones
-- ============================================================
CREATE OR REPLACE FUNCTION create_institution(
    p_name VARCHAR(255),
    p_code VARCHAR(50)
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_new_institution_id UUID;
BEGIN
    -- 1. Verificar que el usuario es Global
    SELECT role INTO v_user_role
    FROM perfiles
    WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role != 'global' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo Global puede crear instituciones'
        );
    END IF;

    -- 2. Verificar que el código no esté en uso
    IF EXISTS (SELECT 1 FROM institutions WHERE code = p_code) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'El código de institución ya existe'
        );
    END IF;

    -- 3. Crear la institución
    INSERT INTO institutions (name, code)
    VALUES (p_name, p_code)
    RETURNING id INTO v_new_institution_id;

    -- 4. Auditar
    INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
    VALUES (
        auth.uid(),
        'institution_create',
        'institutions',
        v_new_institution_id,
        json_build_object('name', p_name, 'code', p_code)
    );

    RETURN json_build_object(
        'success', true,
        'institution_id', v_new_institution_id,
        'message', 'Institución creada exitosamente'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION create_institution(VARCHAR, VARCHAR) IS
'Crea una institución educativa. Solo Global puede ejecutar esta acción.';

-- ============================================================
-- FUNCIÓN: update_institution()
-- Solo Global puede actualizar instituciones
-- ============================================================
CREATE OR REPLACE FUNCTION update_institution(
    p_institution_id UUID,
    p_name VARCHAR(255),
    p_code VARCHAR(50)
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_old_name VARCHAR(255);
    v_old_code VARCHAR(50);
BEGIN
    -- 1. Verificar que el usuario es Global
    SELECT role INTO v_user_role
    FROM perfiles
    WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role != 'global' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo Global puede actualizar instituciones'
        );
    END IF;

    -- 2. Obtener valores anteriores para auditoría
    SELECT name, code INTO v_old_name, v_old_code
    FROM institutions
    WHERE id = p_institution_id;

    IF v_old_name IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Institución no encontrada'
        );
    END IF;

    -- 3. Verificar que el código no esté en uso por otra institución
    IF EXISTS (SELECT 1 FROM institutions WHERE code = p_code AND id != p_institution_id) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'El código de institución ya está en uso'
        );
    END IF;

    -- 4. Actualizar la institución
    UPDATE institutions
    SET name = p_name,
        code = p_code,
        updated_at = NOW()
    WHERE id = p_institution_id;

    -- 5. Auditar
    INSERT INTO auditoria (user_id, action, table_name, record_id, old_values, new_values)
    VALUES (
        auth.uid(),
        'institution_update',
        'institutions',
        p_institution_id,
        json_build_object('name', v_old_name, 'code', v_old_code),
        json_build_object('name', p_name, 'code', p_code)
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Institución actualizada exitosamente'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION update_institution(UUID, VARCHAR, VARCHAR) IS
'Actualiza una institución educativa. Solo Global puede ejecutar esta acción.';

-- ============================================================
-- FUNCIÓN: delete_institution()
-- Solo Global puede eliminar instituciones
-- Verifica que no tenga estudiantes activos
-- ============================================================
CREATE OR REPLACE FUNCTION delete_institution(
    p_institution_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_inst_name VARCHAR(255);
    v_inst_code VARCHAR(50);
    v_active_students BIGINT;
BEGIN
    -- 1. Verificar que el usuario es Global
    SELECT role INTO v_user_role
    FROM perfiles
    WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role != 'global' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo Global puede eliminar instituciones'
        );
    END IF;

    -- 2. Obtener datos de la institución
    SELECT name, code INTO v_inst_name, v_inst_code
    FROM institutions
    WHERE id = p_institution_id;

    IF v_inst_name IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Institución no encontrada'
        );
    END IF;

    -- 3. Verificar que no tenga estudiantes activos
    SELECT COUNT(*) INTO v_active_students
    FROM periodos_escolares
    WHERE institution_id = p_institution_id
    AND end_date IS NULL;

    IF v_active_students > 0 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No se puede eliminar una institución con estudiantes activos'
        );
    END IF;

    -- 4. Verificar que no tenga personal asignado
    IF EXISTS (
        SELECT 1 FROM perfiles
        WHERE institution_id = p_institution_id
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No se puede eliminar una institución con personal asignado'
        );
    END IF;

    -- 5. Eliminar la institución
    DELETE FROM institutions
    WHERE id = p_institution_id;

    -- 6. Auditar
    INSERT INTO auditoria (user_id, action, table_name, record_id, old_values)
    VALUES (
        auth.uid(),
        'institution_delete',
        'institutions',
        p_institution_id,
        json_build_object('name', v_inst_name, 'code', v_inst_code)
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Institución eliminada exitosamente'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION delete_institution(UUID) IS
'Elimina una institución educativa. Solo Global. Verifica que no tenga estudiantes o personal.';

-- ============================================================
-- FUNCIÓN: assign_director_to_institution()
-- Solo Global puede asignar un Director a una institución
-- ============================================================
CREATE OR REPLACE FUNCTION assign_director_to_institution(
    p_user_id UUID,
    p_institution_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_target_role TEXT;
    v_old_institution UUID;
BEGIN
    -- 1. Verificar que el usuario es Global
    SELECT role INTO v_user_role
    FROM perfiles
    WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role != 'global' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo Global puede asignar Directores'
        );
    END IF;

    -- 2. Verificar que el usuario objetivo existe y es Director
    SELECT role, institution_id INTO v_target_role, v_old_institution
    FROM perfiles
    WHERE user_id = p_user_id;

    IF v_target_role IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Usuario no encontrado'
        );
    END IF;

    IF v_target_role != 'director' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'El usuario debe tener rol de Director'
        );
    END IF;

    -- 3. Verificar que la institución existe
    IF NOT EXISTS (SELECT 1 FROM institutions WHERE id = p_institution_id) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Institución no encontrada'
        );
    END IF;

    -- 4. Verificar que no haya otro Director en la institución
    IF EXISTS (
        SELECT 1 FROM perfiles
        WHERE role = 'director'
        AND institution_id = p_institution_id
        AND user_id != p_user_id
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Ya existe un Director asignado a esta institución'
        );
    END IF;

    -- 5. Asignar Director a la institución
    UPDATE perfiles
    SET institution_id = p_institution_id,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- 6. Auditar
    INSERT INTO auditoria (user_id, action, table_name, record_id, old_values, new_values)
    VALUES (
        auth.uid(),
        'director_assign',
        'perfiles',
        p_user_id,
        json_build_object('institution_id', v_old_institution),
        json_build_object('institution_id', p_institution_id)
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Director asignado a la institución exitosamente'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION assign_director_to_institution(UUID, UUID) IS
'Asigna un Director a una institución. Solo Global. Verifica que no haya otro Director.';

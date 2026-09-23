-- Migración 023: Períodos escolares y restricciones (T11)
-- Evolución Psicológica

-- ============================================================
-- T11: PERÍODOS ESCOLARES
-- 
-- Reglas:
-- - Vincula estudiante con institución en un año escolar
-- - Sección: A, B o U (Única)
-- - Sin solapamientos de períodos activos
-- - Estados: regular, retiro, retorno
-- ============================================================

-- 1. Agregar CHECK constraint para secciones válidas
ALTER TABLE periodos_escolares
ADD CONSTRAINT check_section_valid
CHECK (section IN ('A', 'B', 'U'));

COMMENT ON CONSTRAINT check_section_valid ON periodos_escolares IS
'Secciones permitidas: A, B o U (Única)';

-- 2. Función para crear período escolar
CREATE OR REPLACE FUNCTION create_school_period(
    p_student_id UUID,
    p_institution_id UUID,
    p_school_year INTEGER,
    p_nivel_id UUID,
    p_grado_id UUID,
    p_section VARCHAR,
    p_start_date DATE,
    p_tipo VARCHAR DEFAULT 'regular',
    p_motivo_retiro TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_institution UUID;
    v_new_period_id UUID;
    v_existing_active UUID;
BEGIN
    -- 1. Verificar permisos
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles
    WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No tiene permisos para crear períodos escolares'
        );
    END IF;

    -- 2. Verificar que la institución coincide (si no es Global)
    IF v_user_role != 'global' AND v_user_institution != p_institution_id THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo puede crear períodos en su institución'
        );
    END IF;

    -- 3. Validar sección
    IF p_section NOT IN ('A', 'B', 'U') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Sección inválida. Use A, B o U'
        );
    END IF;

    -- 4. Validar tipo
    IF p_tipo NOT IN ('regular', 'retiro', 'retorno') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Tipo inválido. Use regular, retiro o retorno'
        );
    END IF;

    -- 5. Verificar que el estudiante existe
    IF NOT EXISTS (SELECT 1 FROM estudiantes WHERE id = p_student_id) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Estudiante no encontrado'
        );
    END IF;

    -- 6. Verificar que nivel y grado pertenecen a la institución
    IF NOT EXISTS (
        SELECT 1 FROM niveles_educativos
        WHERE id = p_nivel_id AND institution_id = p_institution_id
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'El nivel no pertenece a la institución'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM grados g
        JOIN niveles_educativos n ON g.nivel_id = n.id
        WHERE g.id = p_grado_id AND n.institution_id = p_institution_id
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'El grado no pertenece a la institución'
        );
    END IF;

    -- 7. Verificar que no haya período activo para el mismo año
    SELECT id INTO v_existing_active
    FROM periodos_escolares
    WHERE student_id = p_student_id
    AND school_year = p_school_year
    AND end_date IS NULL;

    IF v_existing_active IS NOT NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Ya existe un período activo para este estudiante en el año escolar'
        );
    END IF;

    -- 8. Crear el período
    INSERT INTO periodos_escolares (
        student_id, institution_id, school_year,
        nivel_id, grado_id, section,
        start_date, tipo, motivo_retiro
    ) VALUES (
        p_student_id, p_institution_id, p_school_year,
        p_nivel_id, p_grado_id, p_section,
        p_start_date, p_tipo, p_motivo_retiro
    )
    RETURNING id INTO v_new_period_id;

    -- 9. Auditar
    INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
    VALUES (
        auth.uid(),
        'school_period_create',
        'periodos_escolares',
        v_new_period_id,
        json_build_object(
            'student_id', p_student_id,
            'institution_id', p_institution_id,
            'school_year', p_school_year,
            'nivel_id', p_nivel_id,
            'grado_id', p_grado_id,
            'section', p_section,
            'tipo', p_tipo
        )
    );

    RETURN json_build_object(
        'success', true,
        'period_id', v_new_period_id,
        'message', 'Período escolar creado exitosamente'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION create_school_period(UUID, UUID, INTEGER, UUID, UUID, VARCHAR, DATE, VARCHAR, TEXT) IS
'Crea un período escolar para un estudiante.';

-- 3. Función para cerrar período (retiro)
CREATE OR REPLACE FUNCTION close_school_period(
    p_period_id UUID,
    p_end_date DATE,
    p_motivo_retiro TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_institution UUID;
    v_period RECORD;
BEGIN
    -- 1. Verificar permisos
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles
    WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No tiene permisos para cerrar períodos'
        );
    END IF;

    -- 2. Obtener el período
    SELECT * INTO v_period
    FROM periodos_escolares
    WHERE id = p_period_id;

    IF v_period IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Período no encontrado'
        );
    END IF;

    -- 3. Verificar que la institución coincide (si no es Global)
    IF v_user_role != 'global' AND v_user_institution != v_period.institution_id THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo puede cerrar períodos de su institución'
        );
    END IF;

    -- 4. Verificar que el período esté abierto
    IF v_period.end_date IS NOT NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'El período ya está cerrado'
        );
    END IF;

    -- 5. Verificar que la fecha de fin no sea anterior a la de inicio
    IF p_end_date < v_period.start_date THEN
        RETURN json_build_object(
            'success', false,
            'error', 'La fecha de fin no puede ser anterior a la de inicio'
        );
    END IF;

    -- 6. Cerrar el período
    UPDATE periodos_escolares
    SET end_date = p_end_date,
        tipo = 'retiro',
        motivo_retiro = COALESCE(p_motivo_retiro, motivo_retiro),
        updated_at = NOW()
    WHERE id = p_period_id;

    -- 7. Auditar
    INSERT INTO auditoria (user_id, action, table_name, record_id, old_values, new_values)
    VALUES (
        auth.uid(),
        'school_period_close',
        'periodos_escolares',
        p_period_id,
        json_build_object('end_date', NULL, 'tipo', v_period.tipo),
        json_build_object('end_date', p_end_date, 'tipo', 'retiro')
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Período cerrado exitosamente'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION close_school_period(UUID, DATE, TEXT) IS
'Cierra un período escolar (retiro).';

-- 4. Función para obtener períodos de un estudiante
CREATE OR REPLACE FUNCTION get_student_periods(
    p_student_id UUID
)
RETURNS TABLE (
    id UUID,
    institution_id UUID,
    institution_name VARCHAR,
    school_year INTEGER,
    nivel_name VARCHAR,
    grado_name VARCHAR,
    section VARCHAR,
    start_date DATE,
    end_date DATE,
    tipo VARCHAR,
    motivo_retiro TEXT,
    is_active BOOLEAN,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pe.id,
        pe.institution_id,
        i.name AS institution_name,
        pe.school_year,
        n.name AS nivel_name,
        g.name AS grado_name,
        pe.section,
        pe.start_date,
        pe.end_date,
        pe.tipo,
        pe.motivo_retiro,
        (pe.end_date IS NULL) AS is_active,
        pe.created_at
    FROM periodos_escolares pe
    JOIN institutions i ON pe.institution_id = i.id
    JOIN niveles_educativos n ON pe.nivel_id = n.id
    JOIN grados g ON pe.grado_id = g.id
    WHERE pe.student_id = p_student_id
    ORDER BY pe.school_year DESC, pe.start_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION get_student_periods(UUID) IS
'Obtiene todos los períodos escolares de un estudiante.';

-- 5. Función para obtener período activo de un estudiante en una institución
CREATE OR REPLACE FUNCTION get_active_period(
    p_student_id UUID,
    p_institution_id UUID
)
RETURNS TABLE (
    id UUID,
    school_year INTEGER,
    nivel_id UUID,
    nivel_name VARCHAR,
    grado_id UUID,
    grado_name VARCHAR,
    section VARCHAR,
    start_date DATE,
    tipo VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pe.id,
        pe.school_year,
        pe.nivel_id,
        n.name AS nivel_name,
        pe.grado_id,
        g.name AS grado_name,
        pe.section,
        pe.start_date,
        pe.tipo
    FROM periodos_escolares pe
    JOIN niveles_educativos n ON pe.nivel_id = n.id
    JOIN grados g ON pe.grado_id = g.id
    WHERE pe.student_id = p_student_id
    AND pe.institution_id = p_institution_id
    AND pe.end_date IS NULL
    ORDER BY pe.school_year DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION get_active_period(UUID, UUID) IS
'Obtiene el período activo de un estudiante en una institución.';

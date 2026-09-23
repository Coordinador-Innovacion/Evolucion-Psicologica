-- Migración 021: Estudiantes (T09)
-- Evolución Psicológica

-- ============================================================
-- T09: GESTIÓN DE ESTUDIANTES
-- 
-- Reglas:
-- - Estudiante es identidad global (sin institution_id directo)
-- - Pertenencia institucional mediante PeriodoEscolar
-- - Detección de duplicados por DNI o similitud de nombre
-- - Estado activo/inactivo derivado del período vigente
-- - Sin eliminación física
-- ============================================================

-- 1. Actualizar esquema: birth_date NOT NULL, agregar distrito
ALTER TABLE estudiantes
ALTER COLUMN birth_date SET NOT NULL;

ALTER TABLE estudiantes
ADD COLUMN IF NOT EXISTS district VARCHAR(100);

COMMENT ON COLUMN estudiantes.district IS 'Distrito o zona del estudiante (opcional)';

-- 2. Función para detectar duplicados por DNI
CREATE OR REPLACE FUNCTION check_student_duplicates_by_dni(
    p_document_type VARCHAR,
    p_document_number VARCHAR,
    p_exclude_id UUID DEFAULT NULL
)
RETURNS TABLE (
    student_id UUID,
    full_name VARCHAR,
    document_type VARCHAR,
    document_number VARCHAR,
    birth_date DATE,
    match_type TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        (e.first_names || ' ' || e.last_names)::VARCHAR,
        e.document_type,
        e.document_number,
        e.birth_date,
        'dni_match'::TEXT
    FROM estudiantes e
    WHERE e.document_type = p_document_type
    AND e.document_number = p_document_number
    AND (p_exclude_id IS NULL OR e.id != p_exclude_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION check_student_duplicates_by_dni(VARCHAR, VARCHAR, UUID) IS
'Busca duplicados por tipo y número de documento.';

-- 3. Función para detectar duplicados por similitud de nombre
CREATE OR REPLACE FUNCTION check_student_duplicates_by_name(
    p_first_names VARCHAR,
    p_last_names VARCHAR,
    p_birth_date DATE,
    p_exclude_id UUID DEFAULT NULL
)
RETURNS TABLE (
    student_id UUID,
    full_name VARCHAR,
    document_type VARCHAR,
    document_number VARCHAR,
    birth_date DATE,
    match_type TEXT,
    similarity NUMERIC
) AS $$
DECLARE
    v_normalized_first VARCHAR;
    v_normalized_last VARCHAR;
BEGIN
    -- Normalizar nombres (minúsculas, sin espacios extra)
    v_normalized_first := LOWER(TRIM(p_first_names));
    v_normalized_last := LOWER(TRIM(p_last_names));

    RETURN QUERY
    SELECT
        sub.id,
        (sub.first_names || ' ' || sub.last_names)::VARCHAR,
        sub.document_type,
        sub.document_number,
        sub.birth_date,
        'name_similarity'::TEXT,
        sub.sim
    FROM (
        SELECT
            e.id,
            e.first_names,
            e.last_names,
            e.document_type,
            e.document_number,
            e.birth_date,
            CASE
                WHEN LOWER(TRIM(e.first_names)) = v_normalized_first
                 AND LOWER(TRIM(e.last_names)) = v_normalized_last
                 AND e.birth_date = p_birth_date
                THEN 1.0::NUMERIC
                WHEN LOWER(TRIM(e.first_names)) = v_normalized_first
                 AND LOWER(TRIM(e.last_names)) = v_normalized_last
                THEN 0.8::NUMERIC
                WHEN similarity(LOWER(TRIM(e.first_names)), v_normalized_first) > 0.6
                 AND similarity(LOWER(TRIM(e.last_names)), v_normalized_last) > 0.6
                THEN 0.6::NUMERIC
                ELSE 0.0::NUMERIC
            END AS sim
        FROM estudiantes e
        WHERE (p_exclude_id IS NULL OR e.id != p_exclude_id)
        AND (
            -- Nombre exacto + misma fecha
            (LOWER(TRIM(e.first_names)) = v_normalized_first
             AND LOWER(TRIM(e.last_names)) = v_normalized_last
             AND e.birth_date = p_birth_date)
            OR
            -- Nombre similar
            (similarity(LOWER(TRIM(e.first_names)), v_normalized_first) > 0.6
             AND similarity(LOWER(TRIM(e.last_names)), v_normalized_last) > 0.6)
        )
    ) sub
    WHERE sub.sim > 0.5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION check_student_duplicates_by_name(VARCHAR, VARCHAR, DATE, UUID) IS
'Busca duplicados por similitud de nombre completo y fecha de nacimiento.';

-- 4. Función para crear estudiante con validación
CREATE OR REPLACE FUNCTION create_student(
    p_first_names VARCHAR,
    p_last_names VARCHAR,
    p_document_type VARCHAR,
    p_document_number VARCHAR,
    p_birth_date DATE,
    p_birth_place VARCHAR DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_district VARCHAR DEFAULT NULL,
    p_phone VARCHAR DEFAULT NULL,
    p_email VARCHAR DEFAULT NULL,
    p_force_create BOOLEAN DEFAULT FALSE
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_new_student_id UUID;
    v_duplicates RECORD;
    v_has_duplicates BOOLEAN := FALSE;
    v_duplicate_details JSON := '[]'::JSON;
BEGIN
    -- 1. Verificar permisos
    SELECT role INTO v_user_role
    FROM perfiles
    WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No tiene permisos para crear estudiantes'
        );
    END IF;

    -- 2. Validar campos obligatorios
    IF p_first_names IS NULL OR TRIM(p_first_names) = '' THEN
        RETURN json_build_object('success', false, 'error', 'Los nombres son obligatorios');
    END IF;

    IF p_last_names IS NULL OR TRIM(p_last_names) = '' THEN
        RETURN json_build_object('success', false, 'error', 'Los apellidos son obligatorios');
    END IF;

    IF p_document_type IS NULL OR TRIM(p_document_type) = '' THEN
        RETURN json_build_object('success', false, 'error', 'El tipo de documento es obligatorio');
    END IF;

    IF p_document_number IS NULL OR TRIM(p_document_number) = '' THEN
        RETURN json_build_object('success', false, 'error', 'El número de documento es obligatorio');
    END IF;

    IF p_birth_date IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'La fecha de nacimiento es obligatoria');
    END IF;

    -- 3. Verificar duplicados por DNI
    FOR v_duplicates IN
        SELECT * FROM check_student_duplicates_by_dni(p_document_type, p_document_number)
    LOOP
        v_has_duplicates := TRUE;
        v_duplicate_details := v_duplicate_details || json_build_object(
            'student_id', v_duplicates.student_id,
            'full_name', v_duplicates.full_name,
            'document_type', v_duplicates.document_type,
            'document_number', v_duplicates.document_number,
            'birth_date', v_duplicates.birth_date,
            'match_type', 'dni_exact'
        );
    END LOOP;

    -- 4. Verificar duplicados por nombre (si no hay duplicado por DNI)
    IF NOT v_has_duplicates THEN
        FOR v_duplicates IN
            SELECT * FROM check_student_duplicates_by_name(
                p_first_names, p_last_names, p_birth_date
            )
        LOOP
            v_has_duplicates := TRUE;
            v_duplicate_details := v_duplicate_details || json_build_object(
                'student_id', v_duplicates.student_id,
                'full_name', v_duplicates.full_name,
                'document_type', v_duplicates.document_type,
                'document_number', v_duplicates.document_number,
                'birth_date', v_duplicates.birth_date,
                'match_type', v_duplicates.match_type,
                'similarity', v_duplicates.similarity
            );
        END LOOP;
    END IF;

    -- 5. Si hay duplicados y no se fuerza creación, retornar advertencia
    IF v_has_duplicates AND NOT p_force_create THEN
        RETURN json_build_object(
            'success', false,
            'warning', 'duplicate_detected',
            'message', 'Se detectaron posibles duplicados. Use force_create=true para crear de todos modos.',
            'duplicates', v_duplicate_details
        );
    END IF;

    -- 6. Crear el estudiante
    INSERT INTO estudiantes (
        first_names, last_names, document_type, document_number,
        birth_date, birth_place, address, district, phone, email
    ) VALUES (
        TRIM(p_first_names), TRIM(p_last_names),
        TRIM(p_document_type), TRIM(p_document_number),
        p_birth_date, p_birth_place, p_address, p_district, p_phone, p_email
    )
    RETURNING id INTO v_new_student_id;

    -- 7. Auditar
    INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
    VALUES (
        auth.uid(),
        'student_create',
        'estudiantes',
        v_new_student_id,
        json_build_object(
            'first_names', p_first_names,
            'last_names', p_last_names,
            'document_type', p_document_type,
            'document_number', p_document_number,
            'birth_date', p_birth_date,
            'force_create', p_force_create,
            'duplicates_found', v_has_duplicates
        )
    );

    RETURN json_build_object(
        'success', true,
        'student_id', v_new_student_id,
        'message', 'Estudiante creado exitosamente'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION create_student(VARCHAR, VARCHAR, VARCHAR, VARCHAR, DATE, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, BOOLEAN) IS
'Crea un estudiante con detección de duplicados.';

-- 5. Función para actualizar estudiante
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
    v_old_record RECORD;
BEGIN
    -- 1. Verificar permisos
    SELECT role INTO v_user_role
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

    -- 3. Actualizar solo campos proporcionados
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

    -- 4. Auditar
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
'Actualiza datos de un estudiante.';

-- 6. Función para obtener estado del estudiante (activo/inactivo)
CREATE OR REPLACE FUNCTION get_student_status(
    p_student_id UUID,
    p_institution_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_current_period RECORD;
BEGIN
    -- Buscar período activo (sin fecha de fin)
    SELECT
        pe.id,
        pe.school_year,
        pe.nivel_id,
        pe.grado_id,
        pe.section,
        pe.start_date,
        n.name AS nivel_name,
        g.name AS grado_name
    INTO v_current_period
    FROM periodos_escolares pe
    JOIN niveles_educativos n ON pe.nivel_id = n.id
    JOIN grados g ON pe.grado_id = g.id
    WHERE pe.student_id = p_student_id
    AND pe.institution_id = p_institution_id
    AND pe.end_date IS NULL
    ORDER BY pe.school_year DESC
    LIMIT 1;

    IF v_current_period IS NULL THEN
        RETURN json_build_object(
            'active', false,
            'message', 'Estudiante no tiene período activo en esta institución'
        );
    END IF;

    RETURN json_build_object(
        'active', true,
        'period_id', v_current_period.id,
        'school_year', v_current_period.school_year,
        'nivel', v_current_period.nivel_name,
        'grado', v_current_period.grado_name,
        'section', v_current_period.section,
        'start_date', v_current_period.start_date
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION get_student_status(UUID, UUID) IS
'Obtiene el estado activo/inactivo de un estudiante en una institución.';

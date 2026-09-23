-- Migración 039: Estudiantes — RLS de registro y create_student (corrección T55)
-- Evolución Psicológica
--
-- Problemas determinados con reglas existentes (no se inventan permisos nuevos):
-- 1) La política FOR ALL de 024 exige id IN (periodos_escolares…) también en
--    WITH CHECK, por lo que el INSERT de un estudiante nuevo falla para todo
--    rol no global (el id aún no tiene período).
-- 2) Esa misma política excluye al Psicólogo, pero SPECIFY S14 obliga al
--    Psicólogo a registrar estudiantes y la UI /estudiantes/registro permite
--    psicologo|global.
-- 3) create_student() (021) tampoco incluye a psicologo, contradiciendo S14.
-- 4) Tras un INSERT correcto, PostgREST usa SELECT policy en RETURNING: sin
--    SELECT del rol que inserta, la fila recién creada (sin período aún) no es
--    visible y la operación falla en el cliente.
--
-- UPDATE/DELETE siguen acotados a la institución vía periodos_escolares.
-- La identidad del estudiante es global (SPECIFY/003); la pertenencia se
-- resuelve con PeriodoEscolar.

-- ============================================================
-- 1) RLS estudiantes — separar INSERT / UPDATE / DELETE / SELECT
-- ============================================================

DROP POLICY IF EXISTS "Coordinator and Director can manage students in their institution" ON estudiantes;
DROP POLICY IF EXISTS "Coordinator and Director can manage students" ON estudiantes;

-- INSERT: roles que registran estudiantes (S14 + create_student + UI de registro)
CREATE POLICY "Authorized roles can insert students"
    ON estudiantes FOR INSERT
    WITH CHECK (
        is_global_user()
        OR get_user_role() IN ('director', 'admin_ie', 'coordinador', 'psicologo')
    );

-- UPDATE: solo roles administrativos, y solo estudiantes de su institución
CREATE POLICY "Coordinator and Director can update students in their institution"
    ON estudiantes FOR UPDATE
    USING (
        is_global_user()
        OR (
            get_user_role() IN ('director', 'admin_ie', 'coordinador')
            AND id IN (
                SELECT student_id FROM periodos_escolares
                WHERE institution_id = get_user_institution()
            )
        )
    )
    WITH CHECK (
        is_global_user()
        OR get_user_role() IN ('director', 'admin_ie', 'coordinador')
    );

-- DELETE: mismos límites que UPDATE (sin eliminación física por UI; se conserva
-- la capacidad ya existente para roles administrativos / global)
CREATE POLICY "Coordinator and Director can delete students in their institution"
    ON estudiantes FOR DELETE
    USING (
        is_global_user()
        OR (
            get_user_role() IN ('director', 'admin_ie', 'coordinador')
            AND id IN (
                SELECT student_id FROM periodos_escolares
                WHERE institution_id = get_user_institution()
            )
        )
    );

-- SELECT para roles de registro (búsqueda por DNI y RETURNING tras INSERT
-- de un estudiante que aún no tiene período escolar).
-- No se elimina la SELECT existente "Users can view students in their
-- institution" (aplica a cualquier rol autenticado con institución, p.ej.
-- Docente en flujos de encuesta): las políticas RLS se combinan con OR.
CREATE POLICY "Registration roles can view students"
    ON estudiantes FOR SELECT
    USING (
        get_user_role() IN ('director', 'admin_ie', 'coordinador', 'psicologo')
    );

-- ============================================================
-- 2) create_student() — habilitar Psicólogo según SPECIFY S14
-- ============================================================

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
    -- 1. Verificar permisos (S14: Psicólogo registra; roles administrativos ya incluidos)
    SELECT role INTO v_user_role
    FROM perfiles
    WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador', 'psicologo') THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para crear estudiantes');
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
'Crea un estudiante con detección de duplicados. Roles: global, director, admin_ie, coordinador, psicologo (SPECIFY S14).';

-- ============================================================
-- VERIFICACIÓN DE INTEGRIDAD
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'estudiantes'
        AND policyname = 'Authorized roles can insert students'
    ) THEN
        RAISE EXCEPTION 'Error: política INSERT de estudiantes no fue creada';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'estudiantes'
        AND policyname = 'Registration roles can view students'
    ) THEN
        RAISE EXCEPTION 'Error: política SELECT de registro no fue creada';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'create_student'
        AND pg_get_function_identity_arguments(oid) LIKE '%p_force_create%'
    ) THEN
        RAISE EXCEPTION 'Error: función create_student no existe';
    END IF;
END $$;

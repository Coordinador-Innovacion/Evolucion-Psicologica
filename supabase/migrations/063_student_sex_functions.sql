-- Migración 063: SEXO en las RPCs de estudiantes
-- Evolución Psicológica
--
-- Extiende create_student (039), update_student (024) y
-- register_student_full (053) con p_sexo (M/F). Se redefine la firma
-- (se elimina la anterior para evitar sobreloads ambiguos en PostgREST)
-- y se re-aplica el REVOKE a anon. La validación de sección de
-- register_student_full pasa a section_is_valid() (catálogo ∪ legado).

DROP FUNCTION IF EXISTS create_student(VARCHAR, VARCHAR, VARCHAR, VARCHAR, DATE, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, BOOLEAN);
DROP FUNCTION IF EXISTS update_student(UUID, VARCHAR, VARCHAR, DATE, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS register_student_full(VARCHAR, VARCHAR, VARCHAR, VARCHAR, DATE, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, UUID, UUID, INTEGER, UUID, UUID, VARCHAR, DATE, JSONB, JSONB, JSONB, JSONB);

-- ============================================================
-- 1) create_student (039) + p_sexo
-- ============================================================
CREATE FUNCTION create_student(
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
    p_force_create BOOLEAN DEFAULT FALSE,
    p_sexo VARCHAR DEFAULT NULL
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

    IF p_sexo IS NOT NULL AND UPPER(TRIM(p_sexo)) NOT IN ('M', 'F') THEN
        RETURN json_build_object('success', false, 'error', 'Sexo inválido. Use M o F');
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
        birth_date, birth_place, address, district, phone, email, sexo
    ) VALUES (
        TRIM(p_first_names), TRIM(p_last_names),
        TRIM(p_document_type), TRIM(p_document_number),
        p_birth_date, p_birth_place, p_address, p_district, p_phone, p_email,
        CASE WHEN p_sexo IS NULL THEN NULL ELSE UPPER(TRIM(p_sexo)) END
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
            'sexo', p_sexo,
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

COMMENT ON FUNCTION create_student(VARCHAR, VARCHAR, VARCHAR, VARCHAR, DATE, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, BOOLEAN, VARCHAR) IS
'Crea un estudiante con detección de duplicados y sexo opcional. Roles: global, director, admin_ie, coordinador, psicologo (SPECIFY S14).';

REVOKE ALL ON FUNCTION create_student(VARCHAR, VARCHAR, VARCHAR, VARCHAR, DATE, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, BOOLEAN, VARCHAR) FROM anon;

-- ============================================================
-- 2) update_student (024) + p_sexo
-- ============================================================
CREATE FUNCTION update_student(
    p_student_id UUID,
    p_first_names VARCHAR DEFAULT NULL,
    p_last_names VARCHAR DEFAULT NULL,
    p_birth_date DATE DEFAULT NULL,
    p_birth_place VARCHAR DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_district VARCHAR DEFAULT NULL,
    p_phone VARCHAR DEFAULT NULL,
    p_email VARCHAR DEFAULT NULL,
    p_sexo VARCHAR DEFAULT NULL
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

    IF p_sexo IS NOT NULL AND UPPER(TRIM(p_sexo)) NOT IN ('M', 'F') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Sexo inválido. Use M o F'
        );
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
        sexo = CASE WHEN p_sexo IS NULL THEN sexo ELSE UPPER(TRIM(p_sexo)) END,
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
            'birth_date', v_old_record.birth_date,
            'sexo', v_old_record.sexo
        ),
        json_build_object(
            'first_names', COALESCE(p_first_names, v_old_record.first_names),
            'last_names', COALESCE(p_last_names, v_old_record.last_names),
            'birth_date', COALESCE(p_birth_date, v_old_record.birth_date),
            'sexo', COALESCE(p_sexo, v_old_record.sexo)
        )
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Estudiante actualizado exitosamente'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION update_student(UUID, VARCHAR, VARCHAR, DATE, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, VARCHAR) IS
'Actualiza datos personales y opcionales (incluye sexo) con permisos por institución.';

REVOKE ALL ON FUNCTION update_student(UUID, VARCHAR, VARCHAR, DATE, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, VARCHAR) FROM anon;

-- ============================================================
-- 3) register_student_full (053) + p_sexo y validación por catálogo
-- ============================================================
CREATE FUNCTION register_student_full(
    p_document_type VARCHAR,
    p_document_number VARCHAR,
    p_first_names VARCHAR,
    p_last_names VARCHAR,
    p_birth_date DATE,
    p_birth_place VARCHAR DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_district VARCHAR DEFAULT NULL,
    p_phone VARCHAR DEFAULT NULL,
    p_email VARCHAR DEFAULT NULL,
    p_student_id UUID DEFAULT NULL,
    p_institution_id UUID DEFAULT NULL,
    p_school_year INTEGER DEFAULT NULL,
    p_nivel_id UUID DEFAULT NULL,
    p_grado_id UUID DEFAULT NULL,
    p_section VARCHAR DEFAULT NULL,
    p_start_date DATE DEFAULT NULL,
    p_father JSONB DEFAULT NULL,
    p_mother JSONB DEFAULT NULL,
    p_guardian JSONB DEFAULT NULL,
    p_special_need JSONB DEFAULT NULL,
    p_sexo VARCHAR DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_inst UUID;
    v_inst_target UUID;
    v_student_id UUID := p_student_id;
    v_period_id UUID;
    v_start DATE;
    v_family_allowed BOOLEAN;
    v_need_allowed BOOLEAN;
BEGIN
    BEGIN
        -- 1) Permisos (S14: el Psicólogo registra estudiantes; coincidente con EST-02)
        SELECT role, institution_id INTO v_user_role, v_user_inst
        FROM perfiles WHERE user_id = auth.uid();

        IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador', 'psicologo') THEN
            RETURN json_build_object('success', false, 'error', 'No tiene permisos para registrar estudiantes');
        END IF;

        -- 2) Institución destino (fija salvo Global)
        IF v_user_role = 'global' THEN
            IF p_institution_id IS NULL THEN
                RETURN json_build_object('success', false, 'error', 'La institución educativa es obligatoria');
            END IF;
            v_inst_target := p_institution_id;
        ELSE
            v_inst_target := v_user_inst;
            IF v_inst_target IS NULL THEN
                RETURN json_build_object('success', false, 'error', 'Su perfil no tiene institución asignada');
            END IF;
            IF p_institution_id IS NOT NULL AND p_institution_id <> v_inst_target THEN
                RETURN json_build_object('success', false, 'error', 'Solo puede registrar estudiantes en su institución');
            END IF;
        END IF;

        -- 3) Validación de matrícula/periodo
        IF p_school_year IS NULL OR p_school_year < 2000 OR p_school_year > 2100 THEN
            RETURN json_build_object('success', false, 'error', 'El año escolar es obligatorio');
        END IF;
        IF p_nivel_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM niveles_educativos
            WHERE id = p_nivel_id AND institution_id = v_inst_target
        ) THEN
            RETURN json_build_object('success', false, 'error', 'El nivel no pertenece a la institución');
        END IF;
        IF p_grado_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM grados g
            JOIN niveles_educativos n ON g.nivel_id = n.id
            WHERE g.id = p_grado_id AND g.nivel_id = p_nivel_id
              AND n.institution_id = v_inst_target
        ) THEN
            RETURN json_build_object('success', false, 'error', 'El grado no pertenece al nivel seleccionado');
        END IF;
        IF p_section IS NULL OR NOT section_is_valid(v_inst_target, p_section) THEN
            RETURN json_build_object('success', false, 'error', 'Sección inválida. Use A, B, U o una sección del catálogo');
        END IF;
        IF p_sexo IS NOT NULL AND UPPER(TRIM(p_sexo)) NOT IN ('M', 'F') THEN
            RETURN json_build_object('success', false, 'error', 'Sexo inválido. Use M o F');
        END IF;
        v_start := COALESCE(p_start_date, CURRENT_DATE);

        -- 4) Permisos de sub-entidades (la RLS manda: 022/024/049)
        v_family_allowed := v_user_role IN ('global', 'director', 'admin_ie', 'coordinador');
        v_need_allowed := v_user_role IN ('global', 'psicologo');

        IF NOT v_family_allowed AND (
            p_father IS NOT NULL OR p_mother IS NOT NULL OR p_guardian IS NOT NULL
        ) THEN
            RETURN json_build_object('success', false, 'error', 'Su rol no puede registrar familiares en este flujo');
        END IF;
        IF NOT v_need_allowed AND p_special_need IS NOT NULL THEN
            RETURN json_build_object('success', false, 'error', 'Solo el Psicólogo o Global registran necesidad especial');
        END IF;

        -- 5) Estudiante: existente (retorno/completar) o nuevo
        IF v_student_id IS NOT NULL THEN
            IF NOT EXISTS (SELECT 1 FROM estudiantes WHERE id = v_student_id) THEN
                RETURN json_build_object('success', false, 'error', 'Estudiante no encontrado');
            END IF;
            -- Completar opcionales solo con roles que pueden UPDATE (024/039)
            IF v_user_role IN ('global', 'director', 'admin_ie', 'coordinador')
               AND (p_birth_place IS NOT NULL OR p_address IS NOT NULL
                    OR p_district IS NOT NULL OR p_phone IS NOT NULL OR p_email IS NOT NULL
                    OR p_sexo IS NOT NULL) THEN
                UPDATE estudiantes
                SET birth_place = COALESCE(p_birth_place, birth_place),
                    address = COALESCE(p_address, address),
                    district = COALESCE(p_district, district),
                    phone = COALESCE(p_phone, phone),
                    email = COALESCE(p_email, email),
                    sexo = CASE WHEN p_sexo IS NULL THEN sexo ELSE UPPER(TRIM(p_sexo)) END,
                    updated_at = NOW()
                WHERE id = v_student_id;
            END IF;
        ELSE
            -- Obligatorios de identidad (SPECIFY EST-02 paso 1)
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

            INSERT INTO estudiantes (
                first_names, last_names, document_type, document_number,
                birth_date, birth_place, address, district, phone, email, sexo
            ) VALUES (
                TRIM(p_first_names), TRIM(p_last_names),
                TRIM(p_document_type), TRIM(p_document_number),
                p_birth_date, p_birth_place, p_address, p_district, p_phone, p_email,
                CASE WHEN p_sexo IS NULL THEN NULL ELSE UPPER(TRIM(p_sexo)) END
            )
            RETURNING id INTO v_student_id;

            INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
            VALUES (
                auth.uid(), 'student_create', 'estudiantes', v_student_id,
                json_build_object(
                    'first_names', p_first_names, 'last_names', p_last_names,
                    'document_type', p_document_type, 'document_number', p_document_number,
                    'birth_date', p_birth_date, 'sexo', p_sexo,
                    'source', 'register_student_full'
                )
            );
        END IF;

        -- 6) Período escolar (matrícula)
        BEGIN
            INSERT INTO periodos_escolares (
                student_id, institution_id, school_year,
                nivel_id, grado_id, section, start_date, tipo
            ) VALUES (
                v_student_id, v_inst_target, p_school_year,
                p_nivel_id, p_grado_id, TRIM(p_section), v_start, 'regular'
            )
            RETURNING id INTO v_period_id;
        EXCEPTION
            WHEN exclusion_violation OR unique_violation THEN
                RETURN json_build_object(
                    'success', false,
                    'error', 'El estudiante ya tiene un período escolar que se solapa con estas fechas'
                );
        END;

        INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
        VALUES (
            auth.uid(), 'school_period_create', 'periodos_escolares', v_period_id,
            json_build_object(
                'student_id', v_student_id, 'institution_id', v_inst_target,
                'school_year', p_school_year, 'nivel_id', p_nivel_id,
                'grado_id', p_grado_id, 'section', TRIM(p_section),
                'tipo', 'regular', 'source', 'register_student_full'
            )
        );

        -- 7) Familia (roles con UPDATE en familiares — 022/024)
        IF v_family_allowed THEN
            IF p_father IS NOT NULL THEN
                PERFORM upsert_family_member(
                    v_student_id, 'padre',
                    p_father->>'full_name', p_father->>'document_type',
                    p_father->>'document_number', p_father->>'phone',
                    p_father->>'email', NULL
                );
            END IF;
            IF p_mother IS NOT NULL THEN
                PERFORM upsert_family_member(
                    v_student_id, 'madre',
                    p_mother->>'full_name', p_mother->>'document_type',
                    p_mother->>'document_number', p_mother->>'phone',
                    p_mother->>'email', NULL
                );
            END IF;
            IF p_guardian IS NOT NULL THEN
                PERFORM upsert_family_member(
                    v_student_id, 'guardian',
                    p_guardian->>'full_name', p_guardian->>'document_type',
                    p_guardian->>'document_number', p_guardian->>'phone',
                    p_guardian->>'email', p_guardian->>'relationship'
                );
            END IF;
        END IF;

        -- 8) Necesidad especial (049: solo Global/Psicólogo) — NO crea Caso
        IF v_need_allowed AND p_special_need IS NOT NULL THEN
            INSERT INTO necesidades_especiales (
                student_id, condition_type, clinical_description,
                teacher_orientation, certifying_entity, certification_date
            ) VALUES (
                v_student_id,
                NULLIF(TRIM(p_special_need->>'condition_type'), ''),
                p_special_need->>'clinical_description',
                p_special_need->>'teacher_orientation',
                p_special_need->>'certifying_entity',
                CASE WHEN p_special_need->>'certification_date' <> ''
                     THEN (p_special_need->>'certification_date')::DATE
                END
            );
            INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
            VALUES (
                auth.uid(), 'special_need_create', 'necesidades_especiales', v_student_id,
                json_build_object('student_id', v_student_id, 'source', 'register_student_full')
            );
        END IF;

        RETURN json_build_object(
            'success', true,
            'student_id', v_student_id,
            'period_id', v_period_id,
            'message', 'Estudiante registrado exitosamente'
        );

    EXCEPTION
        -- Todo o nada (SPECIFY EST-02 paso 7): el handler revierte el bloque completo
        WHEN unique_violation THEN
            RETURN json_build_object(
                'success', false,
                'error', 'Ya existe un estudiante con ese tipo y número de documento'
            );
        WHEN OTHERS THEN
            RETURN json_build_object(
                'success', false,
                'error', 'No se pudo completar el registro: ' || SQLERRM
            );
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION register_student_full(VARCHAR, VARCHAR, VARCHAR, VARCHAR, DATE, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, UUID, UUID, INTEGER, UUID, UUID, VARCHAR, DATE, JSONB, JSONB, JSONB, JSONB, VARCHAR) IS
'EST-02 (Falla #1): estudiantes + periodo + familiares + necesidad especial en una sola transacción.';

REVOKE ALL ON FUNCTION register_student_full(VARCHAR, VARCHAR, VARCHAR, VARCHAR, DATE, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, UUID, UUID, INTEGER, UUID, UUID, VARCHAR, DATE, JSONB, JSONB, JSONB, JSONB, VARCHAR) FROM anon;

-- Recargar el esquema de PostgREST (firmas nuevas)
NOTIFY pgrst, 'reload schema';

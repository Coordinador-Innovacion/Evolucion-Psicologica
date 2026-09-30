-- Migración 053: Fase 2 (F2) — Registro transaccional de estudiantes y estructura académica
-- Evolución Psicológica
--
-- Cierra la Falla #1 (UI_GAP_AUDIT §E.1/§E.2/§E.3/§E.10):
-- 1) register_student_full: crea estudiantes + periodo + familiares + necesidad especial
--    en UNA sola transacción (SPECIFY EST-02). create_student (039) solo inserta estudiantes.
-- 2) verify_student_document: Paso 0 de EST-02 — clasifica DNI en
--    new / active_own / active_other / inactive (retorno).
-- 3) change_school_section / withdraw_student / register_return: EST-07 —
--    operaciones de periodo en una sola transacción con traducción de errores.
-- 4) Tabla asignaciones_docentes + CRUD (ACA-02, DASH-DO, filtro docente de EST-01).
-- 5) create_academic_structure (ACA-01) y list_institution_docentes (selector de ACA-02).
--
-- Regla de seguridad: la UI no es autoridad; cada RPC valida rol + institución
-- (patrón SECURITY DEFINER de 021/023/039). La RLS sigue mandando para operaciones
-- sueltas; estas funciones NO amplían permisos fuera del contexto declarado.

-- ============================================================
-- 1) verify_student_document — Paso 0 de EST-02
-- ============================================================
CREATE OR REPLACE FUNCTION verify_student_document(
    p_document_type VARCHAR,
    p_document_number VARCHAR
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_inst UUID;
    v_student_id UUID;
    v_period_id UUID;
BEGIN
    -- Solo roles de registro (el Docente queda excluido — E2E-01)
    SELECT role, institution_id INTO v_user_role, v_user_inst
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador', 'psicologo') THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para verificar documentos');
    END IF;

    IF p_document_number IS NULL OR TRIM(p_document_number) = '' THEN
        RETURN json_build_object('success', false, 'error', 'El número de documento es obligatorio');
    END IF;

    -- 1) ¿Existe el estudiante?
    SELECT id INTO v_student_id
    FROM estudiantes
    WHERE document_type = TRIM(p_document_type)
      AND document_number = TRIM(p_document_number);

    IF v_student_id IS NULL THEN
        RETURN json_build_object('success', true, 'status', 'new');
    END IF;

    -- 2) ¿Activo en mi I.E.? (Global: activo en cualquier I.E.)
    SELECT id INTO v_period_id
    FROM periodos_escolares
    WHERE student_id = v_student_id
      AND end_date IS NULL
      AND (v_user_role = 'global' OR institution_id = v_user_inst)
    LIMIT 1;

    IF v_period_id IS NOT NULL THEN
        RETURN json_build_object(
            'success', true,
            'status', 'active_own',
            'student_id', v_student_id,
            'period_id', v_period_id
        );
    END IF;

    -- 3) ¿Activo en OTRA I.E.? (sin exponer datos personales)
    IF EXISTS (
        SELECT 1 FROM periodos_escolares
        WHERE student_id = v_student_id AND end_date IS NULL
    ) THEN
        RETURN json_build_object('success', true, 'status', 'active_other');
    END IF;

    -- 4) Existe sin período activo → Retorno (no duplicar estudiante)
    RETURN json_build_object('success', true, 'status', 'inactive', 'student_id', v_student_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION verify_student_document(VARCHAR, VARCHAR) IS
'EST-02 Paso 0: clasifica un documento (new / active_own / active_other / inactive). Roles de registro.';

REVOKE ALL ON FUNCTION verify_student_document(VARCHAR, VARCHAR) FROM anon;

-- ============================================================
-- 2) register_student_full — EST-02 (Falla #1)
-- ============================================================
-- Estudiante existente (p_student_id): solo se abre un período (Retorno/Completar);
-- los datos personales NO se reescriben (identidad). Los opcionales se completan
-- solo con roles que ya pueden UPDATE (024/039: global, director, admin_ie, coordinador).
CREATE OR REPLACE FUNCTION register_student_full(
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
    p_special_need JSONB DEFAULT NULL
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
        IF p_section IS NULL OR TRIM(p_section) NOT IN ('A', 'B', 'U') THEN
            RETURN json_build_object('success', false, 'error', 'Sección inválida. Use A, B o U');
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
                    OR p_district IS NOT NULL OR p_phone IS NOT NULL OR p_email IS NOT NULL) THEN
                UPDATE estudiantes
                SET birth_place = COALESCE(p_birth_place, birth_place),
                    address = COALESCE(p_address, address),
                    district = COALESCE(p_district, district),
                    phone = COALESCE(p_phone, phone),
                    email = COALESCE(p_email, email),
                    updated_at = NOW()
                WHERE id = v_student_id;
            END IF;
        ELSE
            -- Oblatorios de identidad (SPECIFY EST-02 paso 1)
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
                birth_date, birth_place, address, district, phone, email
            ) VALUES (
                TRIM(p_first_names), TRIM(p_last_names),
                TRIM(p_document_type), TRIM(p_document_number),
                p_birth_date, p_birth_place, p_address, p_district, p_phone, p_email
            )
            RETURNING id INTO v_student_id;

            INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
            VALUES (
                auth.uid(), 'student_create', 'estudiantes', v_student_id,
                json_build_object(
                    'first_names', p_first_names, 'last_names', p_last_names,
                    'document_type', p_document_type, 'document_number', p_document_number,
                    'birth_date', p_birth_date, 'source', 'register_student_full'
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

COMMENT ON FUNCTION register_student_full(VARCHAR, VARCHAR, VARCHAR, VARCHAR, DATE, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, UUID, UUID, INTEGER, UUID, UUID, VARCHAR, DATE, JSONB, JSONB, JSONB, JSONB) IS
'EST-02 (Falla #1): estudiantes + periodo + familiares + necesidad especial en una sola transacción.';

REVOKE ALL ON FUNCTION register_student_full(VARCHAR, VARCHAR, VARCHAR, VARCHAR, DATE, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, UUID, UUID, INTEGER, UUID, UUID, VARCHAR, DATE, JSONB, JSONB, JSONB, JSONB) FROM anon;

-- ============================================================
-- 3) change_school_section — EST-07 (cierra y abre período)
-- ============================================================
CREATE OR REPLACE FUNCTION change_school_section(
    p_student_id UUID,
    p_new_grado_id UUID DEFAULT NULL,
    p_new_section VARCHAR DEFAULT NULL,
    p_new_start_date DATE DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_inst UUID;
    v_period RECORD;
    v_new_grado RECORD;
    v_grado_id UUID;
    v_section VARCHAR;
    v_new_start DATE;
    v_new_period_id UUID;
BEGIN
    BEGIN
        -- Permisos: mismos que gestión de períodos (014/023: sin Psicólogo)
        SELECT role, institution_id INTO v_user_role, v_user_inst
        FROM perfiles WHERE user_id = auth.uid();

        IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador') THEN
            RETURN json_build_object('success', false, 'error', 'No tiene permisos para cambiar de sección');
        END IF;

        SELECT * INTO v_period
        FROM periodos_escolares
        WHERE student_id = p_student_id AND end_date IS NULL
        ORDER BY school_year DESC, start_date DESC
        LIMIT 1;

        IF v_period IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'El estudiante no tiene un período activo');
        END IF;

        IF v_user_role != 'global' AND v_period.institution_id != v_user_inst THEN
            RETURN json_build_object('success', false, 'error', 'Solo puede modificar períodos de su institución');
        END IF;

        v_grado_id := COALESCE(p_new_grado_id, v_period.grado_id);
        v_section := COALESCE(TRIM(p_new_section), v_period.section);

        IF v_section NOT IN ('A', 'B', 'U') THEN
            RETURN json_build_object('success', false, 'error', 'Sección inválida. Use A, B o U');
        END IF;

        -- El grado debe pertenecer al mismo nivel y a la misma institución
        SELECT * INTO v_new_grado
        FROM grados g
        JOIN niveles_educativos n ON g.nivel_id = n.id
        WHERE g.id = v_grado_id
          AND g.nivel_id = v_period.nivel_id
          AND n.institution_id = v_period.institution_id;

        IF v_new_grado IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'El grado seleccionado no corresponde al nivel del período activo');
        END IF;

        v_new_start := COALESCE(p_new_start_date, v_period.start_date);
        IF v_new_start < v_period.start_date THEN
            RETURN json_build_object('success', false, 'error', 'La nueva fecha de inicio no puede ser anterior al inicio del período actual');
        END IF;

        -- Cerrar el período vigente (semicontinuo: '[)' — 046) conservando su tipo
        UPDATE periodos_escolares
        SET end_date = v_new_start, updated_at = NOW()
        WHERE id = v_period.id;

        -- Abrir el nuevo período en el mismo año escolar
        BEGIN
            INSERT INTO periodos_escolares (
                student_id, institution_id, school_year,
                nivel_id, grado_id, section, start_date, tipo
            ) VALUES (
                p_student_id, v_period.institution_id, v_period.school_year,
                v_period.nivel_id, v_grado_id, v_section, v_new_start, 'regular'
            )
            RETURNING id INTO v_new_period_id;
        EXCEPTION
            WHEN exclusion_violation OR unique_violation THEN
                RETURN json_build_object(
                    'success', false,
                    'error', 'No se pudo abrir el nuevo período: se solapa con otro período del estudiante en ese año'
                );
        END;

        INSERT INTO auditoria (user_id, action, table_name, record_id, old_values, new_values)
        VALUES (
            auth.uid(), 'school_period_section_change', 'periodos_escolares', v_new_period_id,
            json_build_object(
                'period_id', v_period.id, 'grado_id', v_period.grado_id,
                'section', v_period.section, 'start_date', v_period.start_date
            ),
            json_build_object(
                'period_id', v_new_period_id, 'grado_id', v_grado_id,
                'section', v_section, 'start_date', v_new_start
            )
        );

        RETURN json_build_object(
            'success', true,
            'closed_period_id', v_period.id,
            'period_id', v_new_period_id,
            'message', 'Sección actualizada: período anterior cerrado y nuevo abierto'
        );
    EXCEPTION
        WHEN OTHERS THEN
            RETURN json_build_object('success', false, 'error', 'No se pudo cambiar de sección: ' || SQLERRM);
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION change_school_section(UUID, UUID, VARCHAR, DATE) IS
'EST-07: cambia sección/grado en una sola transacción (cierra y abre período).';

REVOKE ALL ON FUNCTION change_school_section(UUID, UUID, VARCHAR, DATE) FROM anon;

-- ============================================================
-- 4) withdraw_student — EST-07 (retiro con motivo obligatorio)
-- ============================================================
CREATE OR REPLACE FUNCTION withdraw_student(
    p_student_id UUID,
    p_motivo TEXT,
    p_end_date DATE DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_inst UUID;
    v_period RECORD;
    v_close_result JSON;
    v_end DATE := COALESCE(p_end_date, CURRENT_DATE);
BEGIN
    SELECT role, institution_id INTO v_user_role, v_user_inst
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador') THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para retirar estudiantes');
    END IF;

    IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
        RETURN json_build_object('success', false, 'error', 'El motivo de retiro es obligatorio');
    END IF;

    SELECT * INTO v_period
    FROM periodos_escolares
    WHERE student_id = p_student_id AND end_date IS NULL
    ORDER BY school_year DESC, start_date DESC
    LIMIT 1;

    IF v_period IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'El estudiante no tiene un período activo');
    END IF;

    IF v_user_role != 'global' AND v_period.institution_id != v_user_inst THEN
        RETURN json_build_object('success', false, 'error', 'Solo puede retirar estudiantes de su institución');
    END IF;

    -- Reutiliza close_school_period (023): valida fechas, pone tipo='retiro' y audita
    v_close_result := close_school_period(v_period.id, v_end, TRIM(p_motivo));

    IF (v_close_result->>'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_close_result;
    END IF;

    RETURN json_build_object(
        'success', true,
        'period_id', v_period.id,
        'message', 'Estudiante retirado: período cerrado con motivo'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION withdraw_student(UUID, TEXT, DATE) IS
'EST-07: retiro con motivo obligatorio reutilizando close_school_period (023).';

REVOKE ALL ON FUNCTION withdraw_student(UUID, TEXT, DATE) FROM anon;

-- ============================================================
-- 5) register_return — EST-07 (retorno sin duplicar estudiante)
-- ============================================================
CREATE OR REPLACE FUNCTION register_return(
    p_student_id UUID,
    p_school_year INTEGER,
    p_nivel_id UUID,
    p_grado_id UUID,
    p_section VARCHAR,
    p_start_date DATE DEFAULT NULL,
    p_institution_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_inst UUID;
    v_inst_target UUID;
    v_period_id UUID;
BEGIN
    BEGIN
        SELECT role, institution_id INTO v_user_role, v_user_inst
        FROM perfiles WHERE user_id = auth.uid();

        IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador') THEN
            RETURN json_build_object('success', false, 'error', 'No tiene permisos para registrar retornos');
        END IF;

        IF v_user_role = 'global' THEN
            IF p_institution_id IS NULL THEN
                RETURN json_build_object('success', false, 'error', 'La institución educativa es obligatoria');
            END IF;
            v_inst_target := p_institution_id;
        ELSE
            v_inst_target := v_user_inst;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM estudiantes WHERE id = p_student_id) THEN
            RETURN json_build_object('success', false, 'error', 'Estudiante no encontrado');
        END IF;

        -- Sin duplicar: si hay período activo en cualquier I.E., no se crea retorno
        IF EXISTS (
            SELECT 1 FROM periodos_escolares
            WHERE student_id = p_student_id AND end_date IS NULL
        ) THEN
            RETURN json_build_object('success', false, 'error', 'El estudiante ya tiene un período activo');
        END IF;

        IF p_school_year IS NULL OR p_school_year < 2000 OR p_school_year > 2100 THEN
            RETURN json_build_object('success', false, 'error', 'El año escolar es obligatorio');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM niveles_educativos
            WHERE id = p_nivel_id AND institution_id = v_inst_target
        ) THEN
            RETURN json_build_object('success', false, 'error', 'El nivel no pertenece a la institución');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM grados g
            JOIN niveles_educativos n ON g.nivel_id = n.id
            WHERE g.id = p_grado_id AND g.nivel_id = p_nivel_id
              AND n.institution_id = v_inst_target
        ) THEN
            RETURN json_build_object('success', false, 'error', 'El grado no pertenece al nivel seleccionado');
        END IF;

        IF p_section IS NULL OR TRIM(p_section) NOT IN ('A', 'B', 'U') THEN
            RETURN json_build_object('success', false, 'error', 'Sección inválida. Use A, B o U');
        END IF;

        BEGIN
            INSERT INTO periodos_escolares (
                student_id, institution_id, school_year,
                nivel_id, grado_id, section, start_date, tipo
            ) VALUES (
                p_student_id, v_inst_target, p_school_year,
                p_nivel_id, p_grado_id, TRIM(p_section),
                COALESCE(p_start_date, CURRENT_DATE), 'retorno'
            )
            RETURNING id INTO v_period_id;
        EXCEPTION
            WHEN exclusion_violation OR unique_violation THEN
                RETURN json_build_object(
                    'success', false,
                    'error', 'El retorno se solapa con otro período del estudiante en ese año escolar'
                );
        END;

        INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
        VALUES (
            auth.uid(), 'school_period_return', 'periodos_escolares', v_period_id,
            json_build_object(
                'student_id', p_student_id, 'institution_id', v_inst_target,
                'school_year', p_school_year, 'tipo', 'retorno'
            )
        );

        RETURN json_build_object(
            'success', true,
            'period_id', v_period_id,
            'message', 'Retorno registrado: nuevo período abierto'
        );
    EXCEPTION
        WHEN OTHERS THEN
            RETURN json_build_object('success', false, 'error', 'No se pudo registrar el retorno: ' || SQLERRM);
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION register_return(UUID, INTEGER, UUID, UUID, VARCHAR, DATE, UUID) IS
'EST-07: retorno (abre período sin duplicar estudiante) — transacción única.';

REVOKE ALL ON FUNCTION register_return(UUID, INTEGER, UUID, UUID, VARCHAR, DATE, UUID) FROM anon;

-- ============================================================
-- 6) create_academic_structure — ACA-01
-- ============================================================
-- Grados fijos del spec (solo lectura): Primaria 1º–6º, Secundaria 1º–5º.
-- Idempotente: solo crea los niveles base que falten (por nombre).
CREATE OR REPLACE FUNCTION create_academic_structure(
    p_institution_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_inst UUID;
    v_inst_target UUID;
    v_primaria_id UUID;
    v_secundaria_id UUID;
    v_created TEXT[] := ARRAY[]::TEXT[];
    v_order INTEGER;
    v_grades TEXT[] := ARRAY['Primero', 'Segundo', 'Tercero', 'Cuarto', 'Quinto', 'Sexto'];
BEGIN
    SELECT role, institution_id INTO v_user_role, v_user_inst
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie') THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para configurar la estructura académica');
    END IF;

    IF v_user_role = 'global' THEN
        IF p_institution_id IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'La institución educativa es obligatoria');
        END IF;
        v_inst_target := p_institution_id;
    ELSE
        v_inst_target := v_user_inst;
        IF p_institution_id IS NOT NULL AND p_institution_id <> v_inst_target THEN
            RETURN json_build_object('success', false, 'error', 'Solo puede configurar su institución');
        END IF;
    END IF;

    -- Nivel: Primaria (6 grados)
    SELECT id INTO v_primaria_id
    FROM niveles_educativos
    WHERE institution_id = v_inst_target AND LOWER(name) = 'primaria';

    IF v_primaria_id IS NULL THEN
        INSERT INTO niveles_educativos (name, order_number, institution_id)
        VALUES ('Primaria', 1, v_inst_target)
        RETURNING id INTO v_primaria_id;

        FOR v_order IN 1..6 LOOP
            INSERT INTO grados (name, order_number, nivel_id)
            VALUES (v_grades[v_order], v_order, v_primaria_id);
        END LOOP;
        v_created := array_append(v_created, 'Primaria (1.º–6.º)');
    END IF;

    -- Nivel: Secundaria (5 grados)
    SELECT id INTO v_secundaria_id
    FROM niveles_educativos
    WHERE institution_id = v_inst_target AND LOWER(name) = 'secundaria';

    IF v_secundaria_id IS NULL THEN
        SELECT COALESCE(MAX(order_number), 0) + 1 INTO v_order
        FROM niveles_educativos
        WHERE institution_id = v_inst_target;

        INSERT INTO niveles_educativos (name, order_number, institution_id)
        VALUES ('Secundaria', v_order, v_inst_target)
        RETURNING id INTO v_secundaria_id;

        FOR v_order IN 1..5 LOOP
            INSERT INTO grados (name, order_number, nivel_id)
            VALUES (v_grades[v_order], v_order, v_secundaria_id);
        END LOOP;
        v_created := array_append(v_created, 'Secundaria (1.º–5.º)');
    END IF;

    INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
    VALUES (
        auth.uid(), 'academic_structure_create', 'niveles_educativos', v_inst_target,
        json_build_object('institution_id', v_inst_target, 'created', to_jsonb(v_created))
    );

    IF cardinality(v_created) = 0 THEN
        RETURN json_build_object('success', true, 'created', '[]'::JSONB, 'message', 'La estructura base ya existe');
    END IF;

    RETURN json_build_object(
        'success', true,
        'created', to_jsonb(v_created),
        'message', 'Estructura académica creada'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION create_academic_structure(UUID) IS
'ACA-01: crea la estructura base (Primaria 1–6, Secundaria 1–5) si falta.';

REVOKE ALL ON FUNCTION create_academic_structure(UUID) FROM anon;

-- ============================================================
-- 7) list_institution_docentes — selector de ACA-02
-- ============================================================
-- perfiles SELECT solo llega a Global/Director/Coordinador (015); el Admin I.E.
-- no puede listar perfiles ajenos → RPC propia con guarda (ACA-02 = G, D, A).
CREATE OR REPLACE FUNCTION list_institution_docentes(
    p_institution_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_inst UUID;
    v_inst_target UUID;
    v_docentes JSONB;
BEGIN
    SELECT role, institution_id INTO v_user_role, v_user_inst
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie') THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para listar docentes');
    END IF;

    IF v_user_role = 'global' THEN
        v_inst_target := p_institution_id;
    ELSE
        v_inst_target := v_user_inst;
    END IF;

    IF v_inst_target IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'La institución educativa es obligatoria');
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'user_id', p.user_id,
        'full_name', p.full_name,
        'document_number', p.document_number
    ) ORDER BY p.full_name), '[]'::JSONB)
    INTO v_docentes
    FROM perfiles p
    WHERE p.institution_id = v_inst_target AND p.role = 'docente';

    RETURN json_build_object('success', true, 'docentes', v_docentes);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION list_institution_docentes(UUID) IS
'ACA-02: lista docentes de una I.E. (resuelve el hueco de SELECT en perfiles para Admin I.E.).';

REVOKE ALL ON FUNCTION list_institution_docentes(UUID) FROM anon;

-- ============================================================
-- 8) asignaciones_docentes (ACA-02, DASH-DO, filtro docente de EST-01)
-- ============================================================
CREATE TABLE IF NOT EXISTS asignaciones_docentes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    school_year INTEGER NOT NULL,
    nivel_id UUID NOT NULL REFERENCES niveles_educativos(id) ON DELETE CASCADE,
    grado_id UUID NOT NULL REFERENCES grados(id) ON DELETE CASCADE,
    section VARCHAR(10) NOT NULL DEFAULT 'U',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT asignaciones_section_valid CHECK (section IN ('A', 'B', 'U')),
    CONSTRAINT asignaciones_year_valid CHECK (school_year >= 2000 AND school_year <= 2100)
);

COMMENT ON TABLE asignaciones_docentes IS
'ACA-02: asignación de docente a año/nivel/grado/sección (tabla inexistente hasta 053).';

CREATE UNIQUE INDEX IF NOT EXISTS asignaciones_docentes_active_key
    ON asignaciones_docentes (user_id, school_year, nivel_id, grado_id, section)
    WHERE end_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_asignaciones_docentes_inst_year
    ON asignaciones_docentes (institution_id, school_year);

CREATE INDEX IF NOT EXISTS idx_asignaciones_docentes_user
    ON asignaciones_docentes (user_id);

CREATE TRIGGER update_asignaciones_docentes_updated_at
    BEFORE UPDATE ON asignaciones_docentes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS: lectura a miembros de la I.E.; gestión a Global/Director/Admin
ALTER TABLE asignaciones_docentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Institution members can view teaching assignments" ON asignaciones_docentes;
CREATE POLICY "Institution members can view teaching assignments"
    ON asignaciones_docentes FOR SELECT
    USING (
        is_global_user() OR institution_id = get_user_institution()
    );

DROP POLICY IF EXISTS "Global and Directors can manage teaching assignments" ON asignaciones_docentes;
CREATE POLICY "Global and Directors can manage teaching assignments"
    ON asignaciones_docentes FOR ALL
    USING (
        is_global_user() OR
        (get_user_role() IN ('director', 'admin_ie') AND institution_id = get_user_institution())
    )
    WITH CHECK (
        is_global_user() OR
        (get_user_role() IN ('director', 'admin_ie') AND institution_id = get_user_institution())
    );

-- ============================================================
-- 9) CRUD de asignaciones (con auditoría)
-- ============================================================
CREATE OR REPLACE FUNCTION create_teaching_assignment(
    p_institution_id UUID,
    p_user_id UUID,
    p_school_year INTEGER,
    p_nivel_id UUID,
    p_grado_id UUID,
    p_section VARCHAR,
    p_start_date DATE DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_inst UUID;
    v_inst_target UUID;
    v_assignment_id UUID;
BEGIN
    BEGIN
        SELECT role, institution_id INTO v_user_role, v_user_inst
        FROM perfiles WHERE user_id = auth.uid();

        IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie') THEN
            RETURN json_build_object('success', false, 'error', 'No tiene permisos para crear asignaciones');
        END IF;

        IF v_user_role = 'global' THEN
            IF p_institution_id IS NULL THEN
                RETURN json_build_object('success', false, 'error', 'La institución educativa es obligatoria');
            END IF;
            v_inst_target := p_institution_id;
        ELSE
            v_inst_target := v_user_inst;
            IF p_institution_id IS NOT NULL AND p_institution_id <> v_inst_target THEN
                RETURN json_build_object('success', false, 'error', 'Solo puede asignar en su institución');
            END IF;
        END IF;

        IF p_school_year IS NULL OR p_school_year < 2000 OR p_school_year > 2100 THEN
            RETURN json_build_object('success', false, 'error', 'El año escolar es obligatorio');
        END IF;

        IF TRIM(COALESCE(p_section, '')) NOT IN ('A', 'B', 'U') THEN
            RETURN json_build_object('success', false, 'error', 'Sección inválida. Use A, B o U');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM perfiles
            WHERE user_id = p_user_id AND role = 'docente' AND institution_id = v_inst_target
        ) THEN
            RETURN json_build_object('success', false, 'error', 'El usuario no es docente de esta institución');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM niveles_educativos
            WHERE id = p_nivel_id AND institution_id = v_inst_target
        ) THEN
            RETURN json_build_object('success', false, 'error', 'El nivel no pertenece a la institución');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM grados g
            JOIN niveles_educativos n ON g.nivel_id = n.id
            WHERE g.id = p_grado_id AND g.nivel_id = p_nivel_id
              AND n.institution_id = v_inst_target
        ) THEN
            RETURN json_build_object('success', false, 'error', 'El grado no pertenece al nivel seleccionado');
        END IF;

        BEGIN
            INSERT INTO asignaciones_docentes (
                institution_id, user_id, school_year,
                nivel_id, grado_id, section, start_date, created_by
            ) VALUES (
                v_inst_target, p_user_id, p_school_year,
                p_nivel_id, p_grado_id, TRIM(p_section),
                COALESCE(p_start_date, CURRENT_DATE), auth.uid()
            )
            RETURNING id INTO v_assignment_id;
        EXCEPTION
            WHEN unique_violation THEN
                RETURN json_build_object(
                    'success', false,
                    'error', 'El docente ya tiene una asignación activa para ese año, grado y sección'
                );
        END;

        INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
        VALUES (
            auth.uid(), 'teaching_assignment_create', 'asignaciones_docentes', v_assignment_id,
            json_build_object(
                'institution_id', v_inst_target, 'user_id', p_user_id,
                'school_year', p_school_year, 'nivel_id', p_nivel_id,
                'grado_id', p_grado_id, 'section', TRIM(p_section)
            )
        );

        RETURN json_build_object(
            'success', true,
            'assignment_id', v_assignment_id,
            'message', 'Asignación creada'
        );
    EXCEPTION
        WHEN OTHERS THEN
            RETURN json_build_object('success', false, 'error', 'No se pudo crear la asignación: ' || SQLERRM);
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION create_teaching_assignment(UUID, UUID, INTEGER, UUID, UUID, VARCHAR, DATE) IS
'ACA-02: crea una asignación docente con validación y auditoría.';

REVOKE ALL ON FUNCTION create_teaching_assignment(UUID, UUID, INTEGER, UUID, UUID, VARCHAR, DATE) FROM anon;

CREATE OR REPLACE FUNCTION close_teaching_assignment(
    p_assignment_id UUID,
    p_end_date DATE DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_inst UUID;
    v_assignment RECORD;
    v_end DATE := COALESCE(p_end_date, CURRENT_DATE);
BEGIN
    SELECT role, institution_id INTO v_user_role, v_user_inst
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL OR v_user_role NOT IN ('global', 'director', 'admin_ie') THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para cerrar asignaciones');
    END IF;

    SELECT * INTO v_assignment
    FROM asignaciones_docentes WHERE id = p_assignment_id;

    IF v_assignment IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Asignación no encontrada');
    END IF;

    IF v_user_role != 'global' AND v_assignment.institution_id != v_user_inst THEN
        RETURN json_build_object('success', false, 'error', 'Solo puede cerrar asignaciones de su institución');
    END IF;

    IF v_assignment.end_date IS NOT NULL THEN
        RETURN json_build_object('success', false, 'error', 'La asignación ya está cerrada');
    END IF;

    IF v_end < v_assignment.start_date THEN
        RETURN json_build_object('success', false, 'error', 'La fecha de cierre no puede ser anterior al inicio');
    END IF;

    UPDATE asignaciones_docentes
    SET end_date = v_end, updated_at = NOW()
    WHERE id = p_assignment_id;

    INSERT INTO auditoria (user_id, action, table_name, record_id, old_values, new_values)
    VALUES (
        auth.uid(), 'teaching_assignment_close', 'asignaciones_docentes', p_assignment_id,
        json_build_object('end_date', NULL),
        json_build_object('end_date', v_end)
    );

    RETURN json_build_object('success', true, 'message', 'Asignación cerrada');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION close_teaching_assignment(UUID, DATE) IS
'ACA-02: cierra una asignación docente (end_date) con auditoría.';

REVOKE ALL ON FUNCTION close_teaching_assignment(UUID, DATE) FROM anon;

-- ============================================================
-- 10) VERIFICACIÓN DE INTEGRIDAD
-- ============================================================
DO $$
DECLARE v_count INT;
BEGIN
    SELECT count(*) INTO v_count
    FROM pg_proc
    WHERE proname IN (
        'verify_student_document', 'register_student_full',
        'change_school_section', 'withdraw_student', 'register_return',
        'create_academic_structure', 'list_institution_docentes',
        'create_teaching_assignment', 'close_teaching_assignment'
    );
    IF v_count < 9 THEN
        RAISE EXCEPTION 'Error: RPCs de F2 incompletas (%/9 creadas)', v_count;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = 'asignaciones_docentes'
    ) THEN
        RAISE EXCEPTION 'Error: tabla asignaciones_docentes no fue creada';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'asignaciones_docentes'
        AND policyname = 'Global and Directors can manage teaching assignments'
    ) THEN
        RAISE EXCEPTION 'Error: RLS de asignaciones_docentes no fue creada';
    END IF;
END $$;

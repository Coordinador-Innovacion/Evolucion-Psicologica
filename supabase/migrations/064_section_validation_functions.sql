-- Migración 064: validación de sección por catálogo en las RPCs de período
-- Evolución Psicológica
--
-- create_school_period (023), change_school_section (053),
-- register_return (053) y create_teaching_assignment (053) pasan de la
-- lista fija A/B/U a section_is_valid() (catálogo ∪ legado). Firmas sin
-- cambios: CREATE OR REPLACE. Los archivos 001–061 quedan intactos.

-- ============================================================
-- 1) create_school_period (023)
-- ============================================================
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

    -- 3. Validar sección (catálogo de la I.E. o legado A/B/U)
    IF NOT section_is_valid(p_institution_id, p_section) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Sección inválida. Use A, B, U o una sección del catálogo'
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

REVOKE ALL ON FUNCTION create_school_period(UUID, UUID, INTEGER, UUID, UUID, VARCHAR, DATE, VARCHAR, TEXT) FROM anon;

-- ============================================================
-- 2) change_school_section (053) — EST-07
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

        IF NOT section_is_valid(v_period.institution_id, v_section) THEN
            RETURN json_build_object('success', false, 'error', 'Sección inválida. Use A, B, U o una sección del catálogo');
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
-- 3) register_return (053) — EST-07
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

        IF p_section IS NULL OR NOT section_is_valid(v_inst_target, p_section) THEN
            RETURN json_build_object('success', false, 'error', 'Sección inválida. Use A, B, U o una sección del catálogo');
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
-- 4) create_teaching_assignment (053) — ACA-02
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

        IF NOT section_is_valid(v_inst_target, TRIM(COALESCE(p_section, ''))) THEN
            RETURN json_build_object('success', false, 'error', 'Sección inválida. Use A, B, U o una sección del catálogo');
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

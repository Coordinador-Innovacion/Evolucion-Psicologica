-- Migración 055: Instituciones, Licencias y Usuarios (F4)
-- Evolución Psicológica
-- Cierra la Falla #3 del UI_GAP_AUDIT: create_institution solo recibía
-- name+code (no niveles ni licencia) y no existía NINGUNA RPC que
-- insertara en licencias/licencia_codigos (solo RLS directa).
-- Cubre: IE-01..06, LIC-01..04, USR-01..02 (spec §5.11/5.12).

-- ============================================================
-- 1) perfiles.activo — USR-01/02 (activar/desactivar)
-- ============================================================
ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN perfiles.activo IS
'USR-02: cuenta activa. get_user_role()/is_global_user() lo verifican (ver sección 2).';

-- ============================================================
-- 2) Helpers con guarda de activo (reemplaza a 045:40)
-- Solo se endurecen los helpers centrales; las políticas/RLS que
-- leen perfiles.role con subqueries inline NO quedan cubiertas
-- (reportar: bloqueo total de sesión requiere revocar sesión o
-- pasar esas políticas por el helper).
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
    SELECT role FROM perfiles
    WHERE user_id = auth.uid() AND activo;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION is_global_user()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM perfiles
        WHERE user_id = auth.uid() AND role = 'global' AND activo
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

-- ============================================================
-- 3) create_license_with_codes — LIC-02/LIC-03
-- Validaciones: fin > inicio, sin solapamiento (mismo EXCLUDE que
-- 010:13 con rango '[]'), códigos únicos. Todo en una transacción.
-- ============================================================
CREATE OR REPLACE FUNCTION create_license_with_codes(
    p_institution_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_codes TEXT[]
)
RETURNS JSON AS $$
DECLARE
    v_caller_role TEXT;
    v_inst_name VARCHAR(255);
    v_license_id UUID;
    v_clean TEXT[];
    v_overlap BIGINT;
    v_used BIGINT;
BEGIN
    SELECT role INTO v_caller_role
    FROM perfiles WHERE user_id = auth.uid() AND activo;

    IF v_caller_role IS NULL OR v_caller_role != 'global' THEN
        RETURN json_build_object('success', false, 'error', 'Solo Global puede gestionar licencias');
    END IF;

    SELECT name INTO v_inst_name
    FROM institutions WHERE id = p_institution_id;

    IF v_inst_name IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Institución no encontrada');
    END IF;

    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Las fechas de inicio y fin son obligatorias');
    END IF;

    IF p_end_date <= p_start_date THEN
        RETURN json_build_object('success', false, 'error', 'La fecha de fin debe ser posterior a la fecha de inicio');
    END IF;

    SELECT array_agg(DISTINCT trim(c)) INTO v_clean
    FROM unnest(p_codes) AS t(c)
    WHERE length(trim(c)) > 0;

    IF v_clean IS NULL OR cardinality(v_clean) = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Debes indicar al menos un código de licencia');
    END IF;

    -- Solapamiento: mismo criterio que el EXCLUDE de 010:13 ('[]' cerrado)
    SELECT COUNT(*) INTO v_overlap
    FROM licencias
    WHERE institution_id = p_institution_id
      AND daterange(start_date, end_date, '[]') && daterange(p_start_date, p_end_date, '[]');

    IF v_overlap > 0 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Ya existe una licencia que solapa con ese rango de fechas'
        );
    END IF;

    -- licencia_codigos.code es UNIQUE global (010:23)
    SELECT COUNT(*) INTO v_used
    FROM licencia_codigos
    WHERE code = ANY(v_clean);

    IF v_used > 0 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Uno o más códigos ya están registrados en otra licencia'
        );
    END IF;

    BEGIN
        INSERT INTO licencias (institution_id, start_date, end_date, created_by)
        VALUES (p_institution_id, p_start_date, p_end_date, auth.uid())
        RETURNING id INTO v_license_id;

        INSERT INTO licencia_codigos (license_id, code)
        SELECT v_license_id, c FROM unnest(v_clean) AS c;
    EXCEPTION
        WHEN exclusion_violation THEN
            RETURN json_build_object(
                'success', false,
                'error', 'Ya existe una licencia que solapa con ese rango de fechas'
            );
        WHEN unique_violation THEN
            RETURN json_build_object(
                'success', false,
                'error', 'Uno o más códigos ya están registrados en otra licencia'
            );
    END;

    INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
    VALUES (
        auth.uid(), 'license_created', 'licencias', v_license_id,
        json_build_object(
            'institution_id', p_institution_id,
            'start_date', p_start_date,
            'end_date', p_end_date,
            'codes', to_jsonb(v_clean)
        )
    );

    RETURN json_build_object(
        'success', true,
        'license_id', v_license_id,
        'message', 'Licencia registrada exitosamente'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION create_license_with_codes(UUID, DATE, DATE, TEXT[]) IS
'LIC-02/LIC-03: registra licencia + códigos en una transacción, valida fin>inicio y solapamiento. Solo Global.';

REVOKE ALL ON FUNCTION create_license_with_codes(UUID, DATE, DATE, TEXT[]) FROM anon;

-- ============================================================
-- 4) create_institution_with_license — IE-02 (Falla #3)
-- I.E. + niveles habilitados (filas de niveles_educativos con sus
-- grados) + licencia opcional, TODO en una transacción. Sin
-- licencia (p_start_date NULL): solo I.E. + niveles.
-- ============================================================
CREATE OR REPLACE FUNCTION create_institution_with_license(
    p_name VARCHAR(255),
    p_code VARCHAR(50),
    p_niveles TEXT[],
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL,
    p_codes TEXT[] DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_caller_role TEXT;
    v_inst_id UUID;
    v_license_id UUID;
    v_result JSON;
    v_name TEXT;
    v_order INTEGER := 0;
    v_grades TEXT[] := ARRAY['Primero', 'Segundo', 'Tercero', 'Cuarto', 'Quinto', 'Sexto'];
    v_num_grades INTEGER;
    v_nivel_id UUID;
    v_i INTEGER;
    v_selected TEXT[];
BEGIN
    SELECT role INTO v_caller_role
    FROM perfiles WHERE user_id = auth.uid() AND activo;

    IF v_caller_role IS NULL OR v_caller_role != 'global' THEN
        RETURN json_build_object('success', false, 'error', 'Solo Global puede crear instituciones');
    END IF;

    IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
        RETURN json_build_object('success', false, 'error', 'El nombre de la institución es obligatorio');
    END IF;

    IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
        RETURN json_build_object('success', false, 'error', 'El código modular es obligatorio');
    END IF;

    IF EXISTS (SELECT 1 FROM institutions WHERE code = trim(p_code)) THEN
        RETURN json_build_object('success', false, 'error', 'Ya existe una institución con ese código modular');
    END IF;

    SELECT array_agg(DISTINCT trim(n)) INTO v_selected
    FROM unnest(p_niveles) AS t(n)
    WHERE length(trim(n)) > 0;

    IF v_selected IS NULL OR cardinality(v_selected) = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Selecciona al menos un nivel educativo');
    END IF;

    IF EXISTS (
        SELECT 1 FROM unnest(v_selected) AS t(n)
        WHERE initcap(lower(n)) NOT IN ('Primaria', 'Secundaria')
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Nivel educativo no válido');
    END IF;

    -- Coherencia de licencia: o todo (fechas + códigos) o nada
    IF p_start_date IS NOT NULL OR p_end_date IS NOT NULL OR p_codes IS NOT NULL THEN
        IF p_start_date IS NULL OR p_end_date IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'Las fechas de licencia son obligatorias');
        END IF;
        IF p_end_date <= p_start_date THEN
            RETURN json_build_object('success', false, 'error', 'La fecha de fin debe ser posterior a la fecha de inicio');
        END IF;
        IF p_codes IS NULL OR cardinality(p_codes) = 0 THEN
            RETURN json_build_object('success', false, 'error', 'Debes indicar al menos un código de licencia');
        END IF;
    END IF;

    -- Todo o nada: cualquier fallo posterior revoca la transacción completa
    INSERT INTO institutions (name, code)
    VALUES (trim(p_name), trim(p_code))
    RETURNING id INTO v_inst_id;

    -- Niveles habilitados + grados (Primaria 1.–6., Secundaria 1.–5.)
    FOR v_i IN 1..2 LOOP
        v_name := CASE WHEN v_i = 1 THEN 'Primaria' ELSE 'Secundaria' END;

        IF EXISTS (
            SELECT 1 FROM unnest(v_selected) AS t(n)
            WHERE initcap(lower(n)) = v_name
        ) THEN
            SELECT COALESCE(MAX(order_number), 0) + 1 INTO v_order
            FROM niveles_educativos WHERE institution_id = v_inst_id;

            INSERT INTO niveles_educativos (name, order_number, institution_id)
            VALUES (v_name, v_order, v_inst_id)
            RETURNING id INTO v_nivel_id;

            v_num_grades := CASE WHEN v_i = 1 THEN 6 ELSE 5 END;
            FOR v_order IN 1..v_num_grades LOOP
                INSERT INTO grados (name, order_number, nivel_id)
                VALUES (v_grades[v_order], v_order, v_nivel_id);
            END LOOP;
        END IF;
    END LOOP;

    -- Licencia (opcional): mismas validaciones que create_license_with_codes
    IF p_start_date IS NOT NULL THEN
        v_result := create_license_with_codes(v_inst_id, p_start_date, p_end_date, p_codes);
        IF (v_result->>'success')::boolean IS NOT TRUE THEN
            RAISE EXCEPTION '%', v_result->>'error';
        END IF;
        v_license_id := (v_result->>'license_id')::uuid;
    END IF;

    INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
    VALUES (
        auth.uid(), 'institution_create', 'institutions', v_inst_id,
        json_build_object(
            'name', trim(p_name),
            'code', trim(p_code),
            'niveles', to_jsonb(v_selected),
            'license_id', v_license_id
        )
    );

    RETURN json_build_object(
        'success', true,
        'institution_id', v_inst_id,
        'license_id', v_license_id,
        'message', CASE
            WHEN v_license_id IS NOT NULL THEN 'Institución y licencia creadas exitosamente'
            ELSE 'Institución creada sin licencia: hasta registrar una licencia, las nuevas atenciones estarán bloqueadas'
        END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION create_institution_with_license(VARCHAR, VARCHAR, TEXT[], DATE, DATE, TEXT[]) IS
'IE-02 (Falla #3): crea I.E. + niveles (+ licencia opcional) en una transacción. Solo Global.';

REVOKE ALL ON FUNCTION create_institution_with_license(VARCHAR, VARCHAR, TEXT[], DATE, DATE, TEXT[]) FROM anon;

-- ============================================================
-- 5) list_users — USR-01
-- Global ve todos; Director solo los de su I.E. (el Admin I.E. no
-- tiene SELECT de perfiles ajenos en 015 y usuarios.listar no lo
-- incluye: discrepancia ya reportada).
-- ============================================================
CREATE OR REPLACE FUNCTION list_users()
RETURNS JSON AS $$
DECLARE
    v_caller_role TEXT;
    v_caller_inst UUID;
BEGIN
    SELECT role, institution_id INTO v_caller_role, v_caller_inst
    FROM perfiles WHERE user_id = auth.uid() AND activo;

    IF v_caller_role IS NULL OR v_caller_role NOT IN ('global', 'director') THEN
        RETURN json_build_object('success', false, 'error', 'No tienes permiso para ver esto.');
    END IF;

    RETURN (
        SELECT json_build_object(
            'success', true,
            'data', COALESCE(json_agg(json_build_object(
                'user_id', p.user_id,
                'full_name', p.full_name,
                'document_number', p.document_number,
                'role', p.role,
                'institution_id', p.institution_id,
                'institution_name', i.name,
                'email', u.email,
                'activo', p.activo,
                'created_at', p.created_at
            ) ORDER BY p.full_name), '[]'::json)
        )
        FROM perfiles p
        LEFT JOIN auth.users u ON u.id = p.user_id
        LEFT JOIN institutions i ON i.id = p.institution_id
        WHERE v_caller_role = 'global'
           OR p.institution_id = v_caller_inst
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION list_users() IS
'USR-01: listado de usuarios con email y estado (activo). Global todos; Director su I.E.';

REVOKE ALL ON FUNCTION list_users() FROM anon;

-- ============================================================
-- 6) admin_update_staff — USR-02 (I.E. y activar/desactivar)
-- El cambio de rol sigue en admin_update_staff_role (052:151,
-- solo Global). Aquí: I.E. (solo Global) + activo (Global o
-- Director de la misma I.E.).
-- ============================================================
CREATE OR REPLACE FUNCTION admin_update_staff(
    p_user_id UUID,
    p_institution_id UUID DEFAULT NULL,
    p_activo BOOLEAN DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_caller_role TEXT;
    v_caller_inst UUID;
    v_target RECORD;
    v_changes JSONB := '{}'::jsonb;
BEGIN
    SELECT role, institution_id INTO v_caller_role, v_caller_inst
    FROM perfiles WHERE user_id = auth.uid() AND activo;

    IF v_caller_role IS NULL OR v_caller_role NOT IN ('global', 'director') THEN
        RETURN json_build_object('success', false, 'error', 'No tienes permiso para gestionar usuarios.');
    END IF;

    IF p_institution_id IS NULL AND p_activo IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No hay cambios para aplicar');
    END IF;

    SELECT user_id, role, institution_id, activo INTO v_target
    FROM perfiles WHERE user_id = p_user_id;

    IF v_target.user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no encontrado');
    END IF;

    IF v_target.role = 'global' THEN
        RETURN json_build_object('success', false, 'error', 'No se puede modificar el perfil Global');
    END IF;

    -- Cambiar I.E.: solo Global (spec USR-02)
    IF p_institution_id IS NOT NULL THEN
        IF v_caller_role != 'global' THEN
            RETURN json_build_object('success', false, 'error', 'Solo Global puede cambiar la institución de un usuario');
        END IF;

        IF NOT EXISTS (SELECT 1 FROM institutions WHERE id = p_institution_id) THEN
            RETURN json_build_object('success', false, 'error', 'Institución no encontrada');
        END IF;

        UPDATE perfiles
        SET institution_id = p_institution_id, updated_at = NOW()
        WHERE user_id = p_user_id;

        v_changes := v_changes || jsonb_build_object('institution_id', p_institution_id);
    END IF;

    -- Activar/desactivar: Global o Director de la misma I.E.
    IF p_activo IS NOT NULL THEN
        IF v_caller_role != 'global' THEN
            IF v_target.institution_id IS DISTINCT FROM v_caller_inst THEN
                RETURN json_build_object('success', false, 'error', 'No tienes permiso para gestionar usuarios de otra institución.');
            END IF;
        END IF;

        IF p_user_id = auth.uid() AND p_activo = false THEN
            RETURN json_build_object('success', false, 'error', 'No puedes desactivar tu propia cuenta');
        END IF;

        IF v_target.activo IS DISTINCT FROM p_activo THEN
            UPDATE perfiles
            SET activo = p_activo, updated_at = NOW()
            WHERE user_id = p_user_id;

            v_changes := v_changes || jsonb_build_object('activo', p_activo);
        END IF;
    END IF;

    IF v_changes = '{}'::jsonb THEN
        RETURN json_build_object('success', true, 'message', 'Sin cambios que aplicar');
    END IF;

    INSERT INTO auditoria (user_id, action, table_name, record_id, old_values, new_values)
    VALUES (
        auth.uid(), 'staff_update', 'perfiles', p_user_id,
        jsonb_build_object('institution_id', v_target.institution_id, 'activo', v_target.activo),
        v_changes
    );

    RETURN json_build_object('success', true, 'message', 'Usuario actualizado exitosamente');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION admin_update_staff(UUID, UUID, BOOLEAN) IS
'USR-02: cambia la I.E. (solo Global) y activa/desactiva (Global o Director de la I.E.).';

REVOKE ALL ON FUNCTION admin_update_staff(UUID, UUID, BOOLEAN) FROM anon;

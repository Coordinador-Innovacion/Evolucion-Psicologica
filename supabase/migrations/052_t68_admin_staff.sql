-- Migración 052: T68 — alta y administración de personal por Global
-- Evolución Psicológica
--
-- Alcance (T68):
-- 1) admin_create_staff: crea identidad de usuario (auth.users) y su perfil asociado
--    a una I.E. existente con un rol institucional validado server-side. Solo Global.
-- 2) admin_update_staff_role: cambia/promueve el rol del personal existente.
--    NO acepta parámetro de institución (la I.E. no se modifica desde esta pantalla).
-- 3) get_staff_list: listado de personal con email (solo Global).
--
-- Restricciones:
-- - El registro público por código modular (handle_new_user) NO se modifica.
-- - Roles institucionales existentes: director, admin_ie, coordinador, psicologo, docente.
--   No se crean roles nuevos y no se puede asignar rol 'global' desde esta vía.
-- - El navegador nunca se autoconcede privilegios: los RPC validan el rol del llamador
--   y se revoca EXECUTE a PUBLIC/anon (solo authenticated puede invocarlos).

-- ============================================================
-- FUNCIÓN: admin_create_staff()
-- Solo Global. Crea auth.users + auth.identities + perfil (trigger) y ajusta el rol.
-- ============================================================
CREATE OR REPLACE FUNCTION admin_create_staff(
    p_institution_id UUID,
    p_role TEXT,
    p_full_name TEXT,
    p_document_number TEXT,
    p_email TEXT,
    p_password TEXT
)
RETURNS JSON AS $$
DECLARE
    v_caller_role TEXT;
    v_inst_code VARCHAR(50);
    v_uid UUID;
    v_email TEXT;
    v_name TEXT;
    v_doc TEXT;
BEGIN
    SELECT role INTO v_caller_role
    FROM perfiles WHERE user_id = auth.uid();

    IF v_caller_role IS NULL OR v_caller_role != 'global' THEN
        RETURN json_build_object('success', false, 'error', 'Solo Global puede registrar personal');
    END IF;

    IF p_role IS NULL OR p_role NOT IN ('director', 'admin_ie', 'coordinador', 'psicologo', 'docente') THEN
        RETURN json_build_object('success', false, 'error', 'Rol institucional no válido');
    END IF;

    SELECT code INTO v_inst_code
    FROM institutions WHERE id = p_institution_id;

    IF v_inst_code IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Institución no encontrada');
    END IF;

    v_name := btrim(COALESCE(p_full_name, ''));
    IF v_name = '' OR length(v_name) > 255 THEN
        RETURN json_build_object('success', false, 'error', 'El nombre es obligatorio (máximo 255 caracteres)');
    END IF;

    v_doc := btrim(COALESCE(p_document_number, ''));
    IF v_doc = '' OR length(v_doc) > 50 THEN
        RETURN json_build_object('success', false, 'error', 'El número de documento es obligatorio (máximo 50 caracteres)');
    END IF;

    v_email := lower(btrim(COALESCE(p_email, '')));
    IF v_email = '' OR position('@' IN v_email) = 0 OR length(v_email) > 255 THEN
        RETURN json_build_object('success', false, 'error', 'Correo electrónico no válido');
    END IF;

    IF COALESCE(p_password, '') = '' OR length(p_password) < 8 THEN
        RETURN json_build_object('success', false, 'error', 'La contraseña debe tener al menos 8 caracteres');
    END IF;

    IF EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = v_email) THEN
        RETURN json_build_object('success', false, 'error', 'El correo ya está registrado');
    END IF;

    BEGIN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            gen_random_uuid(),
            'authenticated',
            'authenticated',
            v_email,
            extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
            now(),
            '{"provider":"email","providers":["email"]}',
            json_build_object(
                'full_name', v_name,
                'document_number', v_doc,
                'institution_code', v_inst_code
            ),
            now(),
            now()
        )
        RETURNING id INTO v_uid;

        INSERT INTO auth.identities (
            id, user_id, provider_id, identity_data, provider,
            last_sign_in_at, created_at, updated_at
        ) VALUES (
            gen_random_uuid(),
            v_uid,
            v_uid::text,
            jsonb_build_object('sub', v_uid, 'email', v_email, 'email_verified', true),
            'email',
            now(),
            now(),
            now()
        );
    EXCEPTION WHEN unique_violation THEN
        RETURN json_build_object('success', false, 'error', 'El correo ya está registrado');
    END;

    UPDATE perfiles SET role = p_role WHERE user_id = v_uid;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No se pudo crear el perfil del usuario';
    END IF;

    INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
    VALUES (
        auth.uid(),
        'staff_create',
        'perfiles',
        v_uid,
        json_build_object('institution_id', p_institution_id, 'role', p_role, 'email', v_email)
    );

    RETURN json_build_object(
        'success', true,
        'user_id', v_uid,
        'message', 'Personal registrado exitosamente'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION admin_create_staff(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) IS
'T68: crea identidad (auth.users) y perfil con I.E. + rol institucional. Solo Global. No permite rol global.';

-- ============================================================
-- FUNCIÓN: admin_update_staff_role()
-- Solo Global. Cambia el rol; no acepta institución (I.E. intacta, T68/6).
-- ============================================================
CREATE OR REPLACE FUNCTION admin_update_staff_role(
    p_user_id UUID,
    p_new_role TEXT
)
RETURNS JSON AS $$
DECLARE
    v_caller_role TEXT;
    v_target_role TEXT;
BEGIN
    SELECT role INTO v_caller_role
    FROM perfiles WHERE user_id = auth.uid();

    IF v_caller_role IS NULL OR v_caller_role != 'global' THEN
        RETURN json_build_object('success', false, 'error', 'Solo Global puede modificar roles');
    END IF;

    IF p_new_role IS NULL OR p_new_role NOT IN ('director', 'admin_ie', 'coordinador', 'psicologo', 'docente') THEN
        RETURN json_build_object('success', false, 'error', 'Rol institucional no válido');
    END IF;

    SELECT role INTO v_target_role
    FROM perfiles WHERE user_id = p_user_id;

    IF v_target_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no encontrado');
    END IF;

    IF v_target_role = 'global' THEN
        RETURN json_build_object('success', false, 'error', 'No se puede modificar el perfil Global');
    END IF;

    UPDATE perfiles
    SET role = p_new_role, updated_at = NOW()
    WHERE user_id = p_user_id;

    INSERT INTO auditoria (user_id, action, table_name, record_id, old_values, new_values)
    VALUES (
        auth.uid(),
        'staff_role_update',
        'perfiles',
        p_user_id,
        json_build_object('role', v_target_role),
        json_build_object('role', p_new_role)
    );

    RETURN json_build_object('success', true, 'message', 'Rol actualizado exitosamente');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION admin_update_staff_role(UUID, TEXT) IS
'T68: promueve/cambia rol del personal existente. Solo Global. Sin parámetro de institución (I.E. no cambia).';

-- ============================================================
-- FUNCIÓN: get_staff_list()
-- Solo Global. Listado con email (auth.users) y nombre de I.E.
-- ============================================================
CREATE OR REPLACE FUNCTION get_staff_list()
RETURNS JSON AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    SELECT role INTO v_caller_role
    FROM perfiles WHERE user_id = auth.uid();

    IF v_caller_role IS NULL OR v_caller_role != 'global' THEN
        RETURN json_build_object('success', false, 'error', 'Solo Global puede ver el personal');
    END IF;

    RETURN (
        SELECT json_build_object(
            'success', true,
            'data', coalesce(json_agg(json_build_object(
                'user_id', p.user_id,
                'full_name', p.full_name,
                'document_number', p.document_number,
                'role', p.role,
                'institution_id', p.institution_id,
                'institution_name', i.name,
                'email', u.email,
                'created_at', p.created_at
            ) ORDER BY p.full_name), '[]'::json)
        )
        FROM perfiles p
        LEFT JOIN auth.users u ON u.id = p.user_id
        LEFT JOIN institutions i ON i.id = p.institution_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION get_staff_list() IS
'T68: listado de personal (perfiles + email) para Global.';

-- ============================================================
-- Privilegios: el navegador solo vía authenticated; el guard es server-side
-- ============================================================
REVOKE EXECUTE ON FUNCTION admin_create_staff(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION admin_update_staff_role(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_staff_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_create_staff(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_staff_role(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_staff_list() TO authenticated;

-- ============================================================
-- Verificaciones de la migración
-- ============================================================
DO $$
DECLARE
    v_create TEXT;
    v_update TEXT;
    v_list TEXT;
    v_trigger TEXT;
BEGIN
    SELECT prosrc INTO v_create
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname = 'admin_create_staff';

    SELECT prosrc INTO v_update
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname = 'admin_update_staff_role';

    SELECT prosrc INTO v_list
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname = 'get_staff_list';

    SELECT prosrc INTO v_trigger
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname = 'handle_new_user';

    IF v_create IS NULL OR v_update IS NULL OR v_list IS NULL THEN
        RAISE EXCEPTION 'Error: funciones T68 ausentes';
    END IF;

    IF v_create NOT LIKE '%Solo Global puede registrar personal%' THEN
        RAISE EXCEPTION 'Error: guard de Global en admin_create_staff ausente';
    END IF;

    IF v_create NOT LIKE '%p_role NOT IN (''director'', ''admin_ie'', ''coordinador'', ''psicologo'', ''docente'')%' THEN
        RAISE EXCEPTION 'Error: whitelist de roles institucionales ausente';
    END IF;

    IF v_create LIKE '%p_role NOT IN (%''global''%' THEN
        RAISE EXCEPTION 'Error: rol global no debe ser creable desde admin_create_staff';
    END IF;

    IF v_update NOT LIKE '%p_new_role NOT IN (''director'', ''admin_ie'', ''coordinador'', ''psicologo'', ''docente'')%' THEN
        RAISE EXCEPTION 'Error: whitelist de roles en admin_update_staff_role ausente';
    END IF;

    IF v_update LIKE '%institution_id%' THEN
        RAISE EXCEPTION 'Error: admin_update_staff_role no debe modificar la I.E.';
    END IF;

    IF v_update NOT LIKE '%No se puede modificar el perfil Global%' THEN
        RAISE EXCEPTION 'Error: protección del perfil Global ausente';
    END IF;

    IF v_list NOT LIKE '%Solo Global puede ver el personal%' THEN
        RAISE EXCEPTION 'Error: guard de Global en get_staff_list ausente';
    END IF;

    IF v_trigger IS NULL
       OR v_trigger NOT LIKE '%Código modular de I.E. obligatorio%'
       OR v_trigger NOT LIKE '%v_role NOT IN (''docente'')%' THEN
        RAISE EXCEPTION 'Error: handle_new_user (registro público) fue modificado';
    END IF;
END;
$$;

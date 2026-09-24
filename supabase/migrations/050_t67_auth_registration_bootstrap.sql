-- Migración 050: T67 — Registro docente con código de I.E. + cierre de bootstrap Global
-- Evolución Psicológica
--
-- T67:
-- 1) lookup_institution_by_code: consulta pública del código modular (preview)
-- 2) handle_new_user: exige institution_code válido; rol forzado docente; set institution_id server-side
-- 3) claim_first_global: se mantiene en DB; se REVOKE desde la aplicación (anon/authenticated)
--    El primer Global se crea/gestiona administrativamente en Supabase Dashboard.

-- ============================================================
-- 1) Lookup público de institución por código modular
-- ============================================================
CREATE OR REPLACE FUNCTION lookup_institution_by_code(p_code VARCHAR(50))
RETURNS JSON AS $$
DECLARE
    v_inst_id UUID;
    v_name VARCHAR(255);
    v_niveles JSON;
BEGIN
    IF p_code IS NULL OR btrim(p_code) = '' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Ingrese el código modular de la I.E.'
        );
    END IF;

    SELECT i.id, i.name INTO v_inst_id, v_name
    FROM institutions i
    WHERE i.code = btrim(p_code)
    LIMIT 1;

    IF v_inst_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Código modular no encontrado'
        );
    END IF;

    SELECT COALESCE(
        json_agg(n.name ORDER BY n.order_number),
        '[]'::json
    ) INTO v_niveles
    FROM niveles_educativos n
    WHERE n.institution_id = v_inst_id;

    RETURN json_build_object(
        'success', true,
        'institution_id', v_inst_id,
        'name', v_name,
        'code', btrim(p_code),
        'niveles', v_niveles
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION lookup_institution_by_code(VARCHAR) IS
'T67: preview de I.E. por código modular durante registro de docente. No confía en institution_id del cliente.';

GRANT EXECUTE ON FUNCTION lookup_institution_by_code(VARCHAR) TO anon, authenticated;

-- ============================================================
-- 2) handle_new_user — T67: institution_code en metadata; rol solo docente
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_role TEXT;
    v_inst_code TEXT;
    v_inst_id UUID;
BEGIN
    -- Whitelist: signup solo docente (T67 / 045)
    v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'docente');
    IF v_role NOT IN ('docente') THEN
        v_role := 'docente';
    END IF;

    -- Código modular de I.E. obligatorio en registro público
    v_inst_code := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'institution_code', '')), '');
    IF v_inst_code IS NULL THEN
        RAISE EXCEPTION 'Código modular de I.E. obligatorio';
    END IF;

    -- Validación server-side: no confiar en institution_id del frontend
    SELECT id INTO v_inst_id
    FROM institutions
    WHERE code = v_inst_code
    LIMIT 1;

    IF v_inst_id IS NULL THEN
        RAISE EXCEPTION 'Código modular de I.E. no válido';
    END IF;

    INSERT INTO perfiles (user_id, full_name, document_number, role, institution_id)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'document_number', ''),
        v_role,
        v_inst_id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION handle_new_user() IS
'Perfil al signup T67: rol forzado docente; institution_id resuelto server-side desde institution_code.';

-- ============================================================
-- 3) claim_first_global — se mantiene; fuera del alcance de la aplicación
--    Dashboard (postgres/service_role) puede invocarlo si se necesita;
--    usuarios anónimos/authenticated de la app NO.
-- ============================================================
REVOKE EXECUTE ON FUNCTION claim_first_global() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_first_global() FROM anon;
REVOKE EXECUTE ON FUNCTION claim_first_global() FROM authenticated;

GRANT EXECUTE ON FUNCTION claim_first_global() TO service_role;

-- ============================================================
-- 4) Verificaciones
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace ns ON ns.oid = p.pronamespace
        WHERE ns.nspname = 'public' AND p.proname = 'lookup_institution_by_code'
    ) THEN
        RAISE EXCEPTION 'Error: lookup_institution_by_code ausente';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace ns ON ns.oid = p.pronamespace
        WHERE ns.nspname = 'public' AND p.proname = 'claim_first_global'
          AND has_function_privilege('anon', p.oid, 'EXECUTE')
    ) THEN
        RAISE EXCEPTION 'Error: claim_first_global aún es ejecutable desde anon';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace ns ON ns.oid = p.pronamespace
        WHERE ns.nspname = 'public' AND p.proname = 'claim_first_global'
          AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ) THEN
        RAISE EXCEPTION 'Error: claim_first_global aún es ejecutable desde authenticated';
    END IF;
END;
$$;

-- Migración 051: T67/ajuste — bootstrap primer Global cuando institution_code viene vacío
-- Evolución Psicológica
--
-- Regla (decisión explícita):
-- 1) institution_code vacío Y no existe ningún perfiles.role = 'global'
--    → crea el perfil con role = 'global', institution_id = NULL, RETURN NEW.
-- 2) institution_code vacío YA existe un Global
--    → igual que ahora: RAISE 'Código modular de I.E. obligatorio'.
-- 3) institution_code presente → flujo docente intacto (whitelist + validación server-side).

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_role TEXT;
    v_inst_code TEXT;
    v_inst_id UUID;
    v_globals INT;
BEGIN
    -- Código modular (trim; vacío -> NULL)
    v_inst_code := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'institution_code', '')), '');

    -- Excepción de bootstrap: sin código Y sin Global existente
    IF v_inst_code IS NULL THEN
        SELECT count(*) INTO v_globals FROM perfiles WHERE role = 'global';
        IF v_globals = 0 THEN
            INSERT INTO perfiles (user_id, full_name, document_number, role, institution_id)
            VALUES (
                NEW.id,
                COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
                COALESCE(NEW.raw_user_meta_data->>'document_number', ''),
                'global',
                NULL
            );
            RETURN NEW;
        END IF;
        -- Ya existe Global: sin excepción
        RAISE EXCEPTION 'Código modular de I.E. obligatorio';
    END IF;

    -- Whitelist: signup solo docente (T67 / 045) — flujo con código, intacto
    v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'docente');
    IF v_role NOT IN ('docente') THEN
        v_role := 'docente';
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
'T67+051: sin institution_code y sin Global existente → primer perfil global (institution_id NULL); con código → docente server-side como 050.';

-- Verificaciones
DO $$
DECLARE
    v_src TEXT;
BEGIN
    SELECT prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname = 'handle_new_user';

    IF v_src IS NULL THEN
        RAISE EXCEPTION 'Error: handle_new_user ausente';
    END IF;

    IF v_src NOT LIKE '%v_globals = 0%' THEN
        RAISE EXCEPTION 'Error: excepción de bootstrap (primer Global) ausente';
    END IF;

    IF v_src NOT LIKE '%Código modular de I.E. obligatorio%' THEN
        RAISE EXCEPTION 'Error: validación de código modular ausente';
    END IF;

    IF v_src NOT LIKE '%Código modular de I.E. no válido%' THEN
        RAISE EXCEPTION 'Error: validación de código inexistente ausente';
    END IF;
END;
$$;

-- T60: Pruebas allow/deny RLS — aislamiento institucional, roles y permisos
-- Ejecutar contra BD remota con migraciones 001-040 aplicadas:
--   npx supabase db query --linked -f supabase/tests/rls_allow_deny.sql
--
-- Todo el script corre en BEGIN/ROLLBACK: no deja datos residuales.
-- Un fallo de aserción aborta la transacción con RAISE EXCEPTION (FAIL visible).
-- Un éxito emite RAISE NOTICE 'PASS: ...'.

BEGIN;

-- Claims de sistema para el seed (triggers de auditoría exigen auth.uid() NOT NULL)
SELECT set_config(
    'request.jwt.claims',
    '{"sub":"a9000000-0000-4000-8000-0000000000a0","role":"authenticated","email":"t60.global@test.local"}',
    true
);
SELECT set_config('request.jwt.role', 'authenticated', true);

-- ============================================================
-- Registro de resultados (SECURITY DEFINER para que authenticated escriba)
-- ============================================================
CREATE TABLE public.t60_results (
    test_name TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('PASS', 'FAIL')),
    detail TEXT
);

CREATE OR REPLACE FUNCTION public.t60_rec(p_name TEXT, p_ok BOOLEAN, p_detail TEXT DEFAULT '')
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.t60_results (test_name, status, detail)
    VALUES (p_name, CASE WHEN p_ok THEN 'PASS' ELSE 'FAIL' END, NULLIF(p_detail, ''))
    ON CONFLICT (test_name) DO UPDATE SET status = EXCLUDED.status, detail = EXCLUDED.detail;

    IF p_ok THEN
        RAISE NOTICE 'PASS: %', p_name;
    ELSE
        RAISE NOTICE 'FAIL: % | %', p_name, p_detail;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================
-- SETUP (como postgres/owner: seed de prueba)
-- Instituciones A y B, usuarios de los 6 roles, estudiantes, períodos,
-- casos, documentos, encuesta, licencias.
-- IDs fijos para reejecución idempotente dentro de la misma transacción.
-- ============================================================

INSERT INTO institutions (id, name, code) VALUES
    ('a0000000-0000-4000-8000-00000000000a', 'IE T60 Alfa', 'T60-A'),
    ('b0000000-0000-4000-8000-00000000000b', 'IE T60 Beta', 'T60-B');

INSERT INTO niveles_educativos (id, name, order_number, institution_id) VALUES
    ('a1000000-0000-4000-8000-000000000001', 'Primaria', 1, 'a0000000-0000-4000-8000-00000000000a'),
    ('a1000000-0000-4000-8000-000000000002', 'Secundaria', 2, 'a0000000-0000-4000-8000-00000000000a'),
    ('b1000000-0000-4000-8000-000000000001', 'Primaria', 1, 'b0000000-0000-4000-8000-00000000000b'),
    ('b1000000-0000-4000-8000-000000000002', 'Secundaria', 2, 'b0000000-0000-4000-8000-00000000000b');

INSERT INTO grados (id, name, order_number, nivel_id) VALUES
    ('a2000000-0000-4000-8000-000000000001', 'Primero', 1, 'a1000000-0000-4000-8000-000000000001'),
    ('a2000000-0000-4000-8000-000000000002', 'Segundo', 2, 'a1000000-0000-4000-8000-000000000001'),
    ('b2000000-0000-4000-8000-000000000001', 'Primero', 1, 'b1000000-0000-4000-8000-000000000001'),
    ('b2000000-0000-4000-8000-000000000002', 'Segundo', 2, 'b1000000-0000-4000-8000-000000000001');

-- Auth users (trigger handle_new_user crea perfiles con role del metadata)
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
) VALUES
    ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-0000000000a0'::uuid, 'authenticated', 'authenticated', 't60.global@test.local', crypt('x', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"T60 Global","document_number":"90000000","role":"global"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-0000000000d1'::uuid, 'authenticated', 'authenticated', 't60.director.a@test.local', crypt('x', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"T60 Director A","document_number":"90000001","role":"director"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-0000000000d2'::uuid, 'authenticated', 'authenticated', 't60.admin.a@test.local', crypt('x', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"T60 Admin A","document_number":"90000002","role":"admin_ie"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-0000000000c1'::uuid, 'authenticated', 'authenticated', 't60.coordinador.a@test.local', crypt('x', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"T60 Coordinador A","document_number":"90000003","role":"coordinador"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-0000000000e1'::uuid, 'authenticated', 'authenticated', 't60.psicologo.a@test.local', crypt('x', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"T60 Psicologo A","document_number":"90000004","role":"psicologo"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-0000000000f1'::uuid, 'authenticated', 'authenticated', 't60.docente.a@test.local', crypt('x', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"T60 Docente A","document_number":"90000005","role":"docente"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-0000000000e2'::uuid, 'authenticated', 'authenticated', 't60.psicologo.b@test.local', crypt('x', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"T60 Psicologo B","document_number":"90000006","role":"psicologo"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-0000000000d3'::uuid, 'authenticated', 'authenticated', 't60.director.b@test.local', crypt('x', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"T60 Director B","document_number":"90000007","role":"director"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-0000000000c2'::uuid, 'authenticated', 'authenticated', 't60.coordinador.b@test.local', crypt('x', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"T60 Coordinador B","document_number":"90000008","role":"coordinador"}', now(), now());

-- Asignar instituciones (trigger creó perfiles con institution_id NULL)
UPDATE perfiles SET institution_id = 'a0000000-0000-4000-8000-00000000000a' WHERE user_id = 'a9000000-0000-4000-8000-0000000000d1';
UPDATE perfiles SET institution_id = 'a0000000-0000-4000-8000-00000000000a' WHERE user_id = 'a9000000-0000-4000-8000-0000000000d2';
UPDATE perfiles SET institution_id = 'a0000000-0000-4000-8000-00000000000a' WHERE user_id = 'a9000000-0000-4000-8000-0000000000c1';
UPDATE perfiles SET institution_id = 'a0000000-0000-4000-8000-00000000000a' WHERE user_id = 'a9000000-0000-4000-8000-0000000000e1';
UPDATE perfiles SET institution_id = 'a0000000-0000-4000-8000-00000000000a' WHERE user_id = 'a9000000-0000-4000-8000-0000000000f1';
UPDATE perfiles SET institution_id = 'b0000000-0000-4000-8000-00000000000b' WHERE user_id = 'a9000000-0000-4000-8000-0000000000e2';
UPDATE perfiles SET institution_id = 'b0000000-0000-4000-8000-00000000000b' WHERE user_id = 'a9000000-0000-4000-8000-0000000000d3';
UPDATE perfiles SET institution_id = 'b0000000-0000-4000-8000-00000000000b' WHERE user_id = 'a9000000-0000-4000-8000-0000000000c2';

-- Roles reales (045 handle_new_user fuerza docente en signup; tests asignan vía postgres)
UPDATE perfiles SET role = 'global' WHERE user_id = 'a9000000-0000-4000-8000-0000000000a0';
UPDATE perfiles SET role = 'director' WHERE user_id IN (
    'a9000000-0000-4000-8000-0000000000d1',
    'a9000000-0000-4000-8000-0000000000d3'
);
UPDATE perfiles SET role = 'admin_ie' WHERE user_id = 'a9000000-0000-4000-8000-0000000000d2';
UPDATE perfiles SET role = 'coordinador' WHERE user_id IN (
    'a9000000-0000-4000-8000-0000000000c1',
    'a9000000-0000-4000-8000-0000000000c2'
);
UPDATE perfiles SET role = 'psicologo' WHERE user_id IN (
    'a9000000-0000-4000-8000-0000000000e1',
    'a9000000-0000-4000-8000-0000000000e2'
);
UPDATE perfiles SET role = 'docente' WHERE user_id = 'a9000000-0000-4000-8000-0000000000f1';

-- Estudiantes + períodos activos
INSERT INTO estudiantes (id, first_names, last_names, document_type, document_number, birth_date) VALUES
    ('aa000000-0000-4000-8000-000000000001', 'Ana', 'Alfa', 'DNI', '70000001', '2015-03-01'),
    ('bb000000-0000-4000-8000-000000000002', 'Bruno', 'Beta', 'DNI', '70000002', '2015-04-01');

INSERT INTO periodos_escolares (
    id, student_id, institution_id, school_year, nivel_id, grado_id,
    section, start_date, end_date, tipo
) VALUES
    ('aa000000-0000-4000-8000-000000000011', 'aa000000-0000-4000-8000-000000000001',
     'a0000000-0000-4000-8000-00000000000a', 2026,
     'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
     'A', '2026-03-01', NULL, 'regular'),
    ('bb000000-0000-4000-8000-000000000021', 'bb000000-0000-4000-8000-000000000002',
     'b0000000-0000-4000-8000-00000000000b', 2026,
     'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
     'A', '2026-03-01', NULL, 'regular');

-- Casos (opened_at en el pasado: CHECK historial exige hasta > desde)
INSERT INTO casos (id, student_id, situation, estado, opened_at, created_by, current_responsible_id) VALUES
    ('aa000000-0000-4000-8000-000000000031', 'aa000000-0000-4000-8000-000000000001',
     'Caso A - ansiedad', 'en_proceso',
     NOW() - INTERVAL '7 days',
     'a9000000-0000-4000-8000-0000000000e1', 'a9000000-0000-4000-8000-0000000000e1'),
    ('bb000000-0000-4000-8000-000000000032', 'bb000000-0000-4000-8000-000000000002',
     'Caso B - aula', 'en_proceso',
     NOW() - INTERVAL '7 days',
     'a9000000-0000-4000-8000-0000000000e2', 'a9000000-0000-4000-8000-0000000000e2');

-- Documento en A (path: institucion/estudiante/archivo)
INSERT INTO documentos (id, student_id, filename, mime_type, size_bytes, storage_path, uploaded_by) VALUES
    ('aa000000-0000-4000-8000-000000000041', 'aa000000-0000-4000-8000-000000000001',
     'consent.pdf', 'application/pdf', 1024,
     'a0000000-0000-4000-8000-00000000000a/aa000000-0000-4000-8000-000000000001/consent.pdf',
     'a9000000-0000-4000-8000-0000000000c1'),
    ('bb000000-0000-4000-8000-000000000042', 'bb000000-0000-4000-8000-000000000002',
     'info.pdf', 'application/pdf', 512,
     'b0000000-0000-4000-8000-00000000000b/bb000000-0000-4000-8000-000000000002/info.pdf',
     'a9000000-0000-4000-8000-0000000000c2');

-- Encuesta en A y en B
INSERT INTO encuestas (id, institution_id, title, created_by) VALUES
    ('aa000000-0000-4000-8000-000000000051', 'a0000000-0000-4000-8000-00000000000a', 'Encuesta Clima A', 'a9000000-0000-4000-8000-0000000000c1'),
    ('bb000000-0000-4000-8000-000000000052', 'b0000000-0000-4000-8000-00000000000b', 'Encuesta Clima B', 'a9000000-0000-4000-8000-0000000000c2');

-- Licencias: A vencida, B vigente
INSERT INTO licencias (id, institution_id, start_date, end_date, created_by) VALUES
    ('aa000000-0000-4000-8000-000000000061', 'a0000000-0000-4000-8000-00000000000a',
     '2025-01-01', '2025-12-31', 'a9000000-0000-4000-8000-0000000000a0'),
    ('bb000000-0000-4000-8000-000000000062', 'b0000000-0000-4000-8000-00000000000b',
     '2025-01-01', '2030-12-31', 'a9000000-0000-4000-8000-0000000000a0');

-- Helper para impersonar usuario (claims JWT + rol authenticated)
CREATE OR REPLACE FUNCTION public.t60_login(p_uid UUID)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config(
        'request.jwt.claims',
        json_build_object('sub', p_uid, 'role', 'authenticated', 'email', 't60@test.local')::TEXT,
        true
    );
    PERFORM set_config('request.jwt.role', 'authenticated', true);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TESTS: RLS (SET ROLE authenticated + claims)
-- ============================================================

-- ---------- 1. Casos: psicologo B NO ve caso de A (aislamiento) ----------
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000e2');

DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM casos WHERE id = 'aa000000-0000-4000-8000-000000000031';
    PERFORM public.t60_rec('RLS1 psicologo B no ve caso A', n = 0, 'rows=' || n);

    SELECT count(*) INTO n FROM casos WHERE id = 'bb000000-0000-4000-8000-000000000032';
    PERFORM public.t60_rec('RLS1b psicologo B ve caso B', n = 1, 'rows=' || n);

    UPDATE casos SET situation = 'hack'
     WHERE id = 'aa000000-0000-4000-8000-000000000031';
    SELECT count(*) INTO n FROM casos WHERE id = 'aa000000-0000-4000-8000-000000000031' AND situation = 'hack';
    PERFORM public.t60_rec('RLS1c psicologo B no update caso A', n = 0, 'hacked=' || n);
END $$;

-- ---------- 2. Atenciones: acote por caso → institución ----------
-- Seed: atención en caso A
RESET ROLE;
INSERT INTO atenciones (id, caso_id, motivo, que_se_hizo, created_by) VALUES
    ('aa000000-0000-4000-8000-000000000071', 'aa000000-0000-4000-8000-000000000031',
     'motivo A', 'escucha', 'a9000000-0000-4000-8000-0000000000e1');

SET LOCAL ROLE authenticated;
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000e2');
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM atenciones WHERE id = 'aa000000-0000-4000-8000-000000000071';
    PERFORM public.t60_rec('RLS2 psicologo B no ve atencion A', n = 0, 'rows=' || n);
END $$;

-- Psicologo A sí ve su atención
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000e1');
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM atenciones WHERE id = 'aa000000-0000-4000-8000-000000000071';
    PERFORM public.t60_rec('RLS2b psicologo A ve atencion A', n = 1, 'rows=' || n);
END $$;

-- ---------- 3. Documentos: docente DENY lectura ----------
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000f1');
DO $$
DECLARE n INT; r JSON;
BEGIN
    SELECT count(*) INTO n FROM documentos WHERE student_id = 'aa000000-0000-4000-8000-000000000001';
    PERFORM public.t60_rec('RLS3 docente no ve documentos (SELECT)', n = 0, 'rows=' || n);

    SELECT count(*) INTO n FROM documentos;
    PERFORM public.t60_rec('RLS3b docente no ve ningun documento', n = 0, 'rows=' || n);

    r := public.list_student_documents('aa000000-0000-4000-8000-000000000001');
    PERFORM public.t60_rec(
        'RLS3c list_student_documents docente DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%permiso%',
        r::text
    );

    r := public.get_document_url('aa000000-0000-4000-8000-000000000041');
    PERFORM public.t60_rec(
        'RLS3d get_document_url docente DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%permiso%',
        r::text
    );
END $$;

-- ---------- 4. Documentos: coordinador B DENY documento de A ----------
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000c2');
DO $$
DECLARE n INT; r JSON;
BEGIN
    SELECT count(*) INTO n FROM documentos WHERE id = 'aa000000-0000-4000-8000-000000000041';
    PERFORM public.t60_rec('RLS4 coordinador B no ve documento A (RLS)', n = 0, 'rows=' || n);

    r := public.list_student_documents('aa000000-0000-4000-8000-000000000001');
    PERFORM public.t60_rec(
        'RLS4b list_student_documents coordinador B DENY A',
        (r->>'success')::boolean IS FALSE,
        r::text
    );

    r := public.get_document_url('aa000000-0000-4000-8000-000000000041');
    PERFORM public.t60_rec(
        'RLS4c get_document_url coordinador B DENY A',
        (r->>'success')::boolean IS FALSE,
        r::text
    );
END $$;

-- Coordinador A ALLOW
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000c1');
DO $$
DECLARE n INT; r JSON;
BEGIN
    SELECT count(*) INTO n FROM documentos WHERE id = 'aa000000-0000-4000-8000-000000000041';
    PERFORM public.t60_rec('RLS4d coordinador A ve documento A', n = 1, 'rows=' || n);

    r := public.list_student_documents('aa000000-0000-4000-8000-000000000001');
    PERFORM public.t60_rec(
        'RLS4e list_student_documents coordinador A ALLOW',
        (r->>'success')::boolean IS TRUE,
        r::text
    );
END $$;

-- ---------- 5. Estudiantes: psicologo ALLOW INSERT; docente DENY ----------
-- Psicologo A INSERT
DO $$
DECLARE n INT;
BEGIN
    INSERT INTO estudiantes (first_names, last_names, document_type, document_number, birth_date)
    VALUES ('Nuevo', 'Psico', 'DNI', '70000099', '2016-01-01');
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM public.t60_rec('RLS5 psicologo A INSERT estudiante ALLOW', n = 1, 'rowcount=' || n);
EXCEPTION WHEN insufficient_privilege OR check_violation OR not_null_violation OR unique_violation OR foreign_key_violation THEN
    PERFORM public.t60_rec('RLS5 psicologo A INSERT estudiante ALLOW', false, SQLERRM);
END $$;

-- Docente INSERT → DENY
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000f1');
DO $$
DECLARE n INT;
BEGIN
    INSERT INTO estudiantes (first_names, last_names, document_type, document_number, birth_date)
    VALUES ('No', 'Debe', 'DNI', '70000098', '2016-02-02');
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM public.t60_rec('RLS5b docente INSERT estudiante DENY', n = 0, 'unexpected insert rowcount=' || n);
EXCEPTION WHEN insufficient_privilege OR check_violation OR not_null_violation OR unique_violation OR foreign_key_violation THEN
    PERFORM public.t60_rec('RLS5b docente INSERT estudiante DENY', true, SQLERRM);
END $$;

-- Docente ve estudiantes de su institución (SELECT policy)
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM estudiantes WHERE id = 'aa000000-0000-4000-8000-000000000001';
    PERFORM public.t60_rec('RLS5c docente A ve estudiante A', n >= 1, 'rows=' || n);

    SELECT count(*) INTO n FROM estudiantes WHERE id = 'bb000000-0000-4000-8000-000000000002';
    PERFORM public.t60_rec('RLS5d docente A no ve estudiante B', n = 0, 'rows=' || n);
END $$;

-- ---------- 6. create_student: docente DENY; psicologo ALLOW ----------
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000f1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.create_student('Rpc', 'Docente', 'DNI', '70000097', '2016-03-03', NULL, NULL, NULL, NULL, NULL, true);
    PERFORM public.t60_rec(
        'RLS6 create_student docente DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%permiso%',
        r::text
    );
END $$;

SELECT public.t60_login('a9000000-0000-4000-8000-0000000000e1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.create_student('Rpc', 'Psico', 'DNI', '70000096', '2016-04-04', NULL, NULL, NULL, NULL, NULL, true);
    PERFORM public.t60_rec(
        'RLS6b create_student psicologo ALLOW',
        (r->>'success')::boolean IS TRUE,
        r::text
    );
END $$;

-- ---------- 7. Encuestas: docente DENY gestión; aislamiento B vs A ----------
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000f1');
DO $$
DECLARE n INT; ok BOOLEAN;
BEGIN
    ok := public.can_manage_surveys();
    PERFORM public.t60_rec('RLS7 can_manage_surveys docente DENY', ok IS FALSE, 'ok=' || ok);

    BEGIN
        INSERT INTO encuestas (institution_id, title, created_by)
        VALUES ('a0000000-0000-4000-8000-00000000000a', 'No debe', 'a9000000-0000-4000-8000-0000000000f1');
        GET DIAGNOSTICS n = ROW_COUNT;
        PERFORM public.t60_rec('RLS7b docente INSERT encuesta DENY', n = 0, 'unexpected insert');
    EXCEPTION WHEN insufficient_privilege OR check_violation OR not_null_violation OR foreign_key_violation OR unique_violation THEN
        PERFORM public.t60_rec('RLS7b docente INSERT encuesta DENY', true, SQLERRM);
    END;
END $$;

-- Director B: no ve encuesta de A
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000d3');
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM encuestas WHERE id = 'aa000000-0000-4000-8000-000000000051';
    PERFORM public.t60_rec('RLS7c director B no ve encuesta A', n = 0, 'rows=' || n);

    SELECT count(*) INTO n FROM encuestas WHERE id = 'bb000000-0000-4000-8000-000000000052';
    PERFORM public.t60_rec('RLS7d director B ve encuesta B', n = 1, 'rows=' || n);
END $$;

-- Coordinador A ALLOW INSERT encuesta
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000c1');
DO $$
DECLARE n INT;
BEGIN
    BEGIN
        INSERT INTO encuestas (institution_id, title, created_by)
        VALUES ('a0000000-0000-4000-8000-00000000000a', 'Clima OK', 'a9000000-0000-4000-8000-0000000000c1');
        GET DIAGNOSTICS n = ROW_COUNT;
        PERFORM public.t60_rec('RLS7e coordinador A INSERT encuesta ALLOW', n = 1, 'rowcount=' || n);
    EXCEPTION WHEN insufficient_privilege OR check_violation OR not_null_violation OR foreign_key_violation OR unique_violation THEN
        PERFORM public.t60_rec('RLS7e coordinador A INSERT encuesta ALLOW', false, SQLERRM);
    END;
END $$;

-- Coordinador B: no inserta en A
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000c2');
DO $$
DECLARE n INT;
BEGIN
    BEGIN
        INSERT INTO encuestas (institution_id, title, created_by)
        VALUES ('a0000000-0000-4000-8000-00000000000a', 'Cross', 'a9000000-0000-4000-8000-0000000000c2');
        GET DIAGNOSTICS n = ROW_COUNT;
        PERFORM public.t60_rec('RLS7f coordinador B no INSERT encuesta A', n = 0, 'unexpected insert');
    EXCEPTION WHEN insufficient_privilege OR check_violation OR not_null_violation OR foreign_key_violation OR unique_violation THEN
        PERFORM public.t60_rec('RLS7f coordinador B no INSERT encuesta A', true, SQLERRM);
    END;
END $$;

-- ---------- 8. Transferencias: docente DENY iniciar ----------
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000f1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.initiate_transfer(
        'aa000000-0000-4000-8000-000000000031',
        'b0000000-0000-4000-8000-00000000000b'
    );
    PERFORM public.t60_rec(
        'RLS8 initiate_transfer docente DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%Director%',
        r::text
    );
END $$;

-- Director A ALLOW iniciar (caso A → B)
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000d1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.initiate_transfer(
        'aa000000-0000-4000-8000-000000000031',
        'b0000000-0000-4000-8000-00000000000b'
    );
    PERFORM public.t60_rec(
        'RLS8b initiate_transfer director A ALLOW',
        (r->>'success')::boolean IS TRUE,
        r::text
    );
END $$;

-- Director B (otra IE) no acepta transferencia originada en A hacia B...
-- (destino es B, así que director B podría aceptar; probar docente en aceptar)
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000f1');
DO $$
DECLARE r JSON; tid UUID;
BEGIN
    SELECT id INTO tid FROM transferencias
     WHERE caso_id = 'aa000000-0000-4000-8000-000000000031'
     LIMIT 1;
    IF tid IS NULL THEN
        PERFORM public.t60_rec('RLS8c accept_transfer docente DENY', false, 'no transfer seed');
        RETURN;
    END IF;
    r := public.accept_transfer(tid, 'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'A');
    PERFORM public.t60_rec(
        'RLS8c accept_transfer docente DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%Director%',
        r::text
    );
END $$;

-- Status accepted es válido (constraint 040)
RESET ROLE;
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n
      FROM pg_constraint
     WHERE conname = 'transferencias_status_check'
       AND pg_get_constraintdef(oid) LIKE '%accepted%';
    PERFORM public.t60_rec('RLS8d constraint status incluye accepted', n = 1, 'matches=' || n);
END $$;

-- Reabrir período A: initiate_transfer lo cierra (end_date); RLS9/11
-- exigen período activo (end_date IS NULL) para el acote de institución.
UPDATE periodos_escolares
SET end_date = NULL, motivo_retiro = NULL, updated_at = NOW()
WHERE id = 'aa000000-0000-4000-8000-000000000011';

-- ---------- 9. Licencias: can_create_attention vencida / get_license_status ----------
RESET ROLE;
SET LOCAL ROLE authenticated;
-- Sin JWT necesario: funciones SECURITY DEFINER con p_institution_id explícito
DO $$
DECLARE r JSON;
BEGIN
    r := public.can_create_attention('a0000000-0000-4000-8000-00000000000a');
    PERFORM public.t60_rec(
        'RLS9 can_create_attention licencia vencida A',
        (r->>'success')::boolean IS FALSE
        AND (r->>'allowed')::boolean IS FALSE
        AND coalesce(r->>'reason', '') = 'expired',
        r::text
    );

    r := public.get_license_status('a0000000-0000-4000-8000-00000000000a');
    PERFORM public.t60_rec(
        'RLS9b get_license_status vencida A',
        (r->>'success')::boolean IS TRUE
        AND coalesce(r->>'status', '') = 'expired',
        r::text
    );

    r := public.can_create_attention('b0000000-0000-4000-8000-00000000000b');
    PERFORM public.t60_rec(
        'RLS9c can_create_attention vigente B',
        (r->>'success')::boolean IS TRUE
        AND (r->>'allowed')::boolean IS TRUE,
        r::text
    );
END $$;

-- create_attention psicologo A con licencia vencida → bloqueado server-side
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000e1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.create_attention(
        'aa000000-0000-4000-8000-000000000031',
        'Motivo bloqueo', 'Que se hizo', NULL, NULL, NULL, 'test'
    );
    PERFORM public.t60_rec(
        'RLS9d create_attention psicologo bloqueado por licencia vencida',
        (r->>'success')::boolean IS FALSE
        AND (
            coalesce(r->>'license_status', '') = 'expired'
            OR coalesce(r->>'error', '') ILIKE '%vencida%'
        ),
        r::text
    );
END $$;

-- Global bypass licencia
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000a0');
DO $$
DECLARE r JSON;
BEGIN
    r := public.create_attention(
        'aa000000-0000-4000-8000-000000000031',
        'Motivo global', 'Que se hizo global', NULL, NULL, NULL, 'global'
    );
    PERFORM public.t60_rec(
        'RLS9e create_attention global bypass licencia',
        (r->>'success')::boolean IS TRUE,
        r::text
    );
END $$;

-- ---------- 10. Promoción: docente y psicologo DENY preview ----------
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000f1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.preview_promotion('a0000000-0000-4000-8000-00000000000a', 2026, 2027);
    PERFORM public.t60_rec(
        'RLS10 preview_promotion docente DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%permiso%',
        r::text
    );
END $$;

SELECT public.t60_login('a9000000-0000-4000-8000-0000000000e1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.preview_promotion('a0000000-0000-4000-8000-00000000000a', 2026, 2027);
    PERFORM public.t60_rec(
        'RLS10b preview_promotion psicologo DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%permiso%',
        r::text
    );
END $$;

-- Director B con p_institution_id = A → deny institución
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000d3');
DO $$
DECLARE r JSON;
BEGIN
    r := public.preview_promotion('a0000000-0000-4000-8000-00000000000a', 2026, 2027);
    PERFORM public.t60_rec(
        'RLS10c preview_promotion director B en A DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%instituci%',
        r::text
    );
END $$;

-- Director A ALLOW
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000d1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.preview_promotion('a0000000-0000-4000-8000-00000000000a', 2026, 2027);
    PERFORM public.t60_rec(
        'RLS10d preview_promotion director A ALLOW',
        (r->>'success')::boolean IS TRUE,
        r::text
    );
END $$;

-- ---------- 11. Casos: close_case docente DENY; sin motivo DENY; psicologo ALLOW ----------
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000f1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.close_case('aa000000-0000-4000-8000-000000000031', 'motivo');
    PERFORM public.t60_rec(
        'RLS11 close_case docente DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%Psic%',
        r::text
    );
END $$;

SELECT public.t60_login('a9000000-0000-4000-8000-0000000000e1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.close_case('aa000000-0000-4000-8000-000000000031', '');
    PERFORM public.t60_rec(
        'RLS11b close_case sin motivo DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%motivo%',
        r::text
    );
END $$;

-- Psicologo B cierra caso de A → institución DENY
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000e2');
DO $$
DECLARE r JSON;
BEGIN
    r := public.close_case('aa000000-0000-4000-8000-000000000031', 'motivo B');
    PERFORM public.t60_rec(
        'RLS11c close_case psicologo B caso A DENY',
        (r->>'success')::boolean IS FALSE,
        r::text
    );
END $$;

-- Psicologo A cierra caso A ALLOW
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000e1');
DO $$
DECLARE r JSON; est TEXT;
BEGIN
    r := public.close_case('aa000000-0000-4000-8000-000000000031', 'motivo A cierre');
    PERFORM public.t60_rec(
        'RLS11d close_case psicologo A ALLOW',
        (r->>'success')::boolean IS TRUE,
        r::text
    );
    SELECT estado INTO est FROM casos WHERE id = 'aa000000-0000-4000-8000-000000000031';
    PERFORM public.t60_rec('RLS11e caso A estado cerrado', est = 'cerrado', 'estado=' || est);
END $$;

-- ---------- 12. Períodos: solapamiento EXCLUDE (mismo estudiante/año) ----------
RESET ROLE;
DO $$
DECLARE ok BOOLEAN := false;
BEGIN
    BEGIN
        -- Período cerrado solapado con otro cerrado para el mismo estudiante
        INSERT INTO periodos_escolares (
            student_id, institution_id, school_year, nivel_id, grado_id,
            section, start_date, end_date, tipo, motivo_retiro
        ) VALUES (
            'aa000000-0000-4000-8000-000000000001',
            'a0000000-0000-4000-8000-00000000000a',
            2025,
            'a1000000-0000-4000-8000-000000000001',
            'a2000000-0000-4000-8000-000000000001',
            'A', '2025-03-01', '2025-12-01', 'retiro', 'cierre'
        );
        INSERT INTO periodos_escolares (
            student_id, institution_id, school_year, nivel_id, grado_id,
            section, start_date, end_date, tipo, motivo_retiro
        ) VALUES (
            'aa000000-0000-4000-8000-000000000001',
            'a0000000-0000-4000-8000-00000000000a',
            2025,
            'a1000000-0000-4000-8000-000000000001',
            'a2000000-0000-4000-8000-000000000001',
            'A', '2025-06-01', '2025-11-01', 'retorno', 'solape'
        );
        PERFORM public.t60_rec('RLS12 exclusion solapamiento periodos', false, 'no raised');
    EXCEPTION WHEN exclusion_violation OR check_violation OR not_null_violation OR foreign_key_violation OR unique_violation THEN
        PERFORM public.t60_rec('RLS12 exclusion solapamiento periodos', true, SQLERRM);
    END;
END $$;

-- ---------- 13. Matriz Global / Director / Admin / Coordinador / Psicologo / Docente ----------
-- RLS12 dejó RESET ROLE (postgres); reactivar authenticated para que aplique RLS.
SET LOCAL ROLE authenticated;

-- Global ve todas las instituciones
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000a0');
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM institutions;
    PERFORM public.t60_rec('RLS13 Global ve todas las instituciones', n >= 2, 'rows=' || n);

    SELECT count(*) INTO n FROM casos;
    PERFORM public.t60_rec('RLS13b Global ve todos los casos', n >= 2, 'rows=' || n);
END $$;

-- Director A ve institución propia + no gestiona nivel de B
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000d1');
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM institutions WHERE id = 'a0000000-0000-4000-8000-00000000000a';
    PERFORM public.t60_rec('RLS13c Director A ve institucion A', n = 1, 'rows=' || n);

    SELECT count(*) INTO n FROM institutions WHERE id = 'b0000000-0000-4000-8000-00000000000b';
    PERFORM public.t60_rec('RLS13d Director A no ve institucion B', n = 0, 'rows=' || n);
END $$;

-- Admin IE A: igual acote
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000d2');
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM institutions WHERE id = 'b0000000-0000-4000-8000-00000000000b';
    PERFORM public.t60_rec('RLS13e Admin A no ve institucion B', n = 0, 'rows=' || n);
END $$;

-- Coordinador A ve periodos de A, no de B
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000c1');
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM periodos_escolares WHERE id = 'aa000000-0000-4000-8000-000000000011';
    PERFORM public.t60_rec('RLS13f Coordinador A ve periodo A', n = 1, 'rows=' || n);

    SELECT count(*) INTO n FROM periodos_escolares WHERE id = 'bb000000-0000-4000-8000-000000000021';
    PERFORM public.t60_rec('RLS13g Coordinador A no ve periodo B', n = 0, 'rows=' || n);
END $$;

-- Psicologo A no gestiona estudiantes de B (UPDATE)
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000e1');
DO $$
DECLARE n INT;
BEGIN
    UPDATE estudiantes SET updated_at = now() WHERE id = 'bb000000-0000-4000-8000-000000000002';
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM public.t60_rec('RLS13h psicologo A no UPDATE estudiante B', n = 0, 'updated=' || n);
END $$;

-- Docente no cierra casos (ya cubierto) y no ve documentos (ya cubierto)
-- Docente ve casos de su institución (SELECT)
SELECT public.t60_login('a9000000-0000-4000-8000-0000000000f1');
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM casos WHERE id = 'aa000000-0000-4000-8000-000000000031';
    -- caso A puede estar cerrado por test 11d; sigue existiendo
    PERFORM public.t60_rec('RLS13i docente A ve caso A (SELECT)', n = 1, 'rows=' || n);

    SELECT count(*) INTO n FROM casos WHERE id = 'bb000000-0000-4000-8000-000000000032';
    PERFORM public.t60_rec('RLS13j docente A no ve caso B', n = 0, 'rows=' || n);
END $$;

-- ---------- Resumen ----------
RESET ROLE;
DO $$
DECLARE
    v_pass INT;
    v_fail INT;
    v_total INT;
    v_detail TEXT;
BEGIN
    SELECT count(*) FILTER (WHERE status = 'PASS'),
           count(*) FILTER (WHERE status = 'FAIL'),
           count(*)
    INTO v_pass, v_fail, v_total
    FROM public.t60_results;

    IF v_fail > 0 THEN
        SELECT string_agg(test_name || ': ' || coalesce(detail, ''), E'\n')
        INTO v_detail
        FROM public.t60_results
        WHERE status = 'FAIL';
        RAISE EXCEPTION 'T60 RLS: % FAIL / % total%n%',
            v_fail, v_total, E'\n', v_detail;
    END IF;

    RAISE NOTICE 'T60 RLS RESULT: ALL PASS — % tests', v_total;
END $$;

-- Mostrar tabla de resultados
SELECT test_name, status, detail
FROM public.t60_results
ORDER BY status DESC, test_name;

ROLLBACK;

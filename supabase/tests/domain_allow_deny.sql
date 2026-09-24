-- T61–T64: Pruebas allow/deny de dominio (Casos, Transferencias, Licencias, Promoción)
-- Ejecutar contra BD remota con migraciones 001-042:
--   npx supabase db query --linked --file supabase/tests/domain_allow_deny.sql
--
-- Todo el script corre en BEGIN/ROLLBACK: no deja datos residuales.
-- Un fallo de aserción aborta con RAISE EXCEPTION (FAIL visible).
-- Un éxito emite RAISE NOTICE 'PASS: ...'.
-- NO marcar PASS sin ejecutar estas sentencias contra una BD real.

BEGIN;

-- Claims de sistema para el seed (triggers de auditoría exigen auth.uid() NOT NULL)
SELECT set_config(
    'request.jwt.claims',
    '{"sub":"a9000000-0000-4000-8000-0000000000a0","role":"authenticated","email":"t64.global@test.local"}',
    true
);
SELECT set_config('request.jwt.role', 'authenticated', true);

-- ============================================================
-- Registro de resultados
-- ============================================================
CREATE TABLE public.t64_results (
    test_name TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('PASS', 'FAIL')),
    detail TEXT
);

CREATE OR REPLACE FUNCTION public.t64_rec(p_name TEXT, p_ok BOOLEAN, p_detail TEXT DEFAULT '')
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.t64_results (test_name, status, detail)
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
-- SETUP
-- ============================================================
INSERT INTO institutions (id, name, code) VALUES
    ('a0000000-0000-4000-8000-00000000000a', 'IE T64 Alfa', 'T64-A'),
    ('b0000000-0000-4000-8000-00000000000b', 'IE T64 Beta', 'T64-B'),
    ('c0000000-0000-4000-8000-00000000000c', 'IE T64 SinLic', 'T64-C'),
    ('e0000000-0000-4000-8000-00000000000e', 'IE T64 Expiring', 'T64-E');

INSERT INTO niveles_educativos (id, name, order_number, institution_id) VALUES
    ('a1000000-0000-4000-8000-000000000001', 'Primaria', 1, 'a0000000-0000-4000-8000-00000000000a'),
    ('a1000000-0000-4000-8000-000000000002', 'Secundaria', 2, 'a0000000-0000-4000-8000-00000000000a'),
    ('b1000000-0000-4000-8000-000000000001', 'Primaria', 1, 'b0000000-0000-4000-8000-00000000000b'),
    ('b1000000-0000-4000-8000-000000000002', 'Secundaria', 2, 'b0000000-0000-4000-8000-00000000000b');

INSERT INTO grados (id, name, order_number, nivel_id) VALUES
    ('a2000000-0000-4000-8000-000000000001', 'Primero', 1, 'a1000000-0000-4000-8000-000000000001'),
    ('a2000000-0000-4000-8000-000000000002', 'Segundo', 2, 'a1000000-0000-4000-8000-000000000001'),
    ('a2000000-0000-4000-8000-000000000005', 'Quinto', 5, 'a1000000-0000-4000-8000-000000000001'),
    ('a2000000-0000-4000-8000-000000000011', 'Primero Sec', 1, 'a1000000-0000-4000-8000-000000000002'),
    -- Último grado del último nivel (Secundaria) → egreso en map_grade
    ('a2000000-0000-4000-8000-000000000015', 'Quinto Sec', 5, 'a1000000-0000-4000-8000-000000000002'),
    ('b2000000-0000-4000-8000-000000000001', 'Primero', 1, 'b1000000-0000-4000-8000-000000000001'),
    ('b2000000-0000-4000-8000-000000000002', 'Segundo', 2, 'b1000000-0000-4000-8000-000000000001');

INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
) VALUES
    ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-0000000000a0'::uuid, 'authenticated', 'authenticated', 't64.global@test.local', crypt('x', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"T64 Global","document_number":"94000000","role":"global","institution_code":"T64-A"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-0000000000d1'::uuid, 'authenticated', 'authenticated', 't64.director.a@test.local', crypt('x', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"T64 Director A","document_number":"94000001","role":"director","institution_code":"T64-A"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-0000000000d3'::uuid, 'authenticated', 'authenticated', 't64.director.b@test.local', crypt('x', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"T64 Director B","document_number":"94000003","role":"director","institution_code":"T64-B"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-0000000000c1'::uuid, 'authenticated', 'authenticated', 't64.coordinador.a@test.local', crypt('x', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"T64 Coordinador A","document_number":"94000004","role":"coordinador","institution_code":"T64-A"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-0000000000e1'::uuid, 'authenticated', 'authenticated', 't64.psicologo.a@test.local', crypt('x', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"T64 Psicologo A","document_number":"94000005","role":"psicologo","institution_code":"T64-A"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-0000000000e2'::uuid, 'authenticated', 'authenticated', 't64.psicologo.b@test.local', crypt('x', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"T64 Psicologo B","document_number":"94000006","role":"psicologo","institution_code":"T64-B"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-0000000000f1'::uuid, 'authenticated', 'authenticated', 't64.docente.a@test.local', crypt('x', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"T64 Docente A","document_number":"94000007","role":"docente","institution_code":"T64-A"}', now(), now());

UPDATE perfiles SET institution_id = 'a0000000-0000-4000-8000-00000000000a' WHERE user_id = 'a9000000-0000-4000-8000-0000000000d1';
UPDATE perfiles SET institution_id = 'a0000000-0000-4000-8000-00000000000a' WHERE user_id = 'a9000000-0000-4000-8000-0000000000c1';
UPDATE perfiles SET institution_id = 'a0000000-0000-4000-8000-00000000000a' WHERE user_id = 'a9000000-0000-4000-8000-0000000000e1';
UPDATE perfiles SET institution_id = 'a0000000-0000-4000-8000-00000000000a' WHERE user_id = 'a9000000-0000-4000-8000-0000000000f1';
UPDATE perfiles SET institution_id = 'b0000000-0000-4000-8000-00000000000b' WHERE user_id = 'a9000000-0000-4000-8000-0000000000d3';
UPDATE perfiles SET institution_id = 'b0000000-0000-4000-8000-00000000000b' WHERE user_id = 'a9000000-0000-4000-8000-0000000000e2';

-- Roles reales (045 handle_new_user fuerza docente en signup; tests asignan vía postgres)
UPDATE perfiles SET role = 'global' WHERE user_id = 'a9000000-0000-4000-8000-0000000000a0';
UPDATE perfiles SET role = 'director' WHERE user_id IN (
    'a9000000-0000-4000-8000-0000000000d1',
    'a9000000-0000-4000-8000-0000000000d3'
);
UPDATE perfiles SET role = 'coordinador' WHERE user_id = 'a9000000-0000-4000-8000-0000000000c1';
UPDATE perfiles SET role = 'psicologo' WHERE user_id IN (
    'a9000000-0000-4000-8000-0000000000e1',
    'a9000000-0000-4000-8000-0000000000e2'
);
UPDATE perfiles SET role = 'docente' WHERE user_id = 'a9000000-0000-4000-8000-0000000000f1';

INSERT INTO estudiantes (id, first_names, last_names, document_type, document_number, birth_date) VALUES
    ('aa000000-0000-4000-8000-000000000001', 'Ana', 'Alfa', 'DNI', '74000001', '2015-03-01'),
    ('bb000000-0000-4000-8000-000000000002', 'Bruno', 'Beta', 'DNI', '74000002', '2015-04-01'),
    ('cc000000-0000-4000-8000-000000000003', 'Carla', 'Cierre', 'DNI', '74000003', '2014-01-01');

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
     'A', '2026-03-01', NULL, 'regular'),
    -- estudiante para promoción (quinto secundaria = último nivel → egreso)
    ('cc000000-0000-4000-8000-000000000013', 'cc000000-0000-4000-8000-000000000003',
     'a0000000-0000-4000-8000-00000000000a', 2025,
     'a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000015',
     'B', '2025-03-01', NULL, 'regular'),
    ('ad000000-0000-4000-8000-000000000014', 'aa000000-0000-4000-8000-000000000001',
     'a0000000-0000-4000-8000-00000000000a', 2025,
     'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
     'A', '2025-03-01', NULL, 'regular');

INSERT INTO casos (id, student_id, situation, estado, opened_at, created_by, current_responsible_id) VALUES
    ('aa000000-0000-4000-8000-000000000031', 'aa000000-0000-4000-8000-000000000001',
     'Caso A T64', 'inicio', NOW() - INTERVAL '30 days',
     'a9000000-0000-4000-8000-0000000000e1', 'a9000000-0000-4000-8000-0000000000e1'),
    ('bb000000-0000-4000-8000-000000000032', 'bb000000-0000-4000-8000-000000000002',
     'Caso B T64', 'inicio', NOW() - INTERVAL '30 days',
     'a9000000-0000-4000-8000-0000000000e2', 'a9000000-0000-4000-8000-0000000000e2');

-- Licencias: A vencida, B vigente (>30d), C: scheduled, D: expiring_soon
INSERT INTO licencias (id, institution_id, start_date, end_date, created_by) VALUES
    ('aa000000-0000-4000-8000-000000000061', 'a0000000-0000-4000-8000-00000000000a',
     '2025-01-01', '2025-12-31', 'a9000000-0000-4000-8000-0000000000a0'),
    ('bb000000-0000-4000-8000-000000000062', 'b0000000-0000-4000-8000-00000000000b',
     '2025-01-01', '2030-12-31', 'a9000000-0000-4000-8000-0000000000a0'),
    -- scheduled en C
    ('dd000000-0000-4000-8000-000000000064', 'c0000000-0000-4000-8000-00000000000c',
     CURRENT_DATE + 60, CURRENT_DATE + 365, 'a9000000-0000-4000-8000-0000000000a0'),
    -- expiring_soon en E (vence en 20 días) — E sin otra licencia
    ('ee000000-0000-4000-8000-000000000065', 'e0000000-0000-4000-8000-00000000000e',
     CURRENT_DATE - 10, CURRENT_DATE + 20, 'a9000000-0000-4000-8000-0000000000a0')
ON CONFLICT DO NOTHING;

-- Helper login
CREATE OR REPLACE FUNCTION public.t64_login(p_uid UUID)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config(
        'request.jwt.claims',
        json_build_object('sub', p_uid, 'role', 'authenticated', 'email', 't64@test.local')::TEXT,
        true
    );
    PERFORM set_config('request.jwt.role', 'authenticated', true);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- T61 — CASOS / ATENCIONES
-- ============================================================

-- T61.1 close_case como docente → deny
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000f1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.close_case('aa000000-0000-4000-8000-000000000031', 'motivo');
    PERFORM public.t64_rec(
        'T61.1 close_case docente DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%Psic%',
        r::text
    );
END $$;

-- T61.1b close_case como director → deny
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000d1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.close_case('aa000000-0000-4000-8000-000000000031', 'motivo');
    PERFORM public.t64_rec(
        'T61.1b close_case director DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%Psic%',
        r::text
    );
END $$;

-- T61.2 close_case sin motivo → error (como psicologo A)
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000e1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.close_case('aa000000-0000-4000-8000-000000000031', '');
    PERFORM public.t64_rec(
        'T61.2 close_case sin motivo DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%motivo%',
        r::text
    );
END $$;

-- T61.3 reopen solo desde cerrado (caso está en inicio)
DO $$
DECLARE r JSON;
BEGIN
    r := public.reopen_case('aa000000-0000-4000-8000-000000000031', 'motivo');
    PERFORM public.t64_rec(
        'T61.3 reopen no cerrado DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%cerrado%',
        r::text
    );
END $$;

-- T61.3b reopen sin motivo → DENY (primero cerrar)
DO $$
DECLARE r JSON;
BEGIN
    r := public.close_case('aa000000-0000-4000-8000-000000000031', 'cierre T64');
    PERFORM public.t64_rec(
        'T61.3b close_case psicologo ALLOW (prep reopen)',
        (r->>'success')::boolean IS TRUE,
        r::text
    );
    r := public.reopen_case('aa000000-0000-4000-8000-000000000031', '');
    PERFORM public.t64_rec(
        'T61.3c reopen sin motivo DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%motivo%',
        r::text
    );
    r := public.reopen_case('aa000000-0000-4000-8000-000000000031', 'reabrir T64');
    PERFORM public.t64_rec(
        'T61.3d reopen con motivo ALLOW (Cerrado→Inicio)',
        (r->>'success')::boolean IS TRUE,
        r::text
    );
END $$;

-- T61.3e estado tras reopen = inicio
DO $$
DECLARE est TEXT;
BEGIN
    SELECT estado INTO est FROM casos WHERE id = 'aa000000-0000-4000-8000-000000000031';
    PERFORM public.t64_rec('T61.3e estado Inicio tras reopen', est = 'inicio', 'estado=' || est);
END $$;

-- T61.4 primera atención tras reapertura → en_proceso
-- (licencia A vencida: psicologo bloqueado → usar global para crear atención de prueba)
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000a0');
DO $$
DECLARE r JSON; est TEXT;
BEGIN
    r := public.create_attention(
        'aa000000-0000-4000-8000-000000000031',
        'motivo post-reopen', 'escucha', NULL, NULL, NULL, 'test'
    );
    PERFORM public.t64_rec(
        'T61.4 create_attention global ALLOW tras reopen',
        (r->>'success')::boolean IS TRUE,
        r::text
    );
    SELECT estado INTO est FROM casos WHERE id = 'aa000000-0000-4000-8000-000000000031';
    PERFORM public.t64_rec('T61.4b estado En proceso tras 1ª atención', est = 'en_proceso', 'estado=' || est);
END $$;

-- T61.5 atención en caso cerrado → bloqueado
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000e1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.close_case('aa000000-0000-4000-8000-000000000031', 'cierre para bloqueo');
    PERFORM public.t64_rec('T61.5 prep close ALLOW', (r->>'success')::boolean IS TRUE, r::text);
END $$;
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000a0');
DO $$
DECLARE r JSON;
BEGIN
    r := public.create_attention(
        'aa000000-0000-4000-8000-000000000031',
        'no debe', 'no debe', NULL, NULL, NULL, 'test'
    );
    PERFORM public.t64_rec(
        'T61.5 atención en caso cerrado DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%cerrado%',
        r::text
    );
END $$;

-- Reabrir para tests de ventana de edición
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000e1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.reopen_case('aa000000-0000-4000-8000-000000000031', 'para edición');
    PERFORM public.t64_rec('T61.5b reopen prep edición', (r->>'success')::boolean IS TRUE, r::text);
END $$;

-- T61.6 update_attention fuera de 30 min → bloqueado (hora servidor)
-- Crear atención con created_at antiguo (como postgres)
RESET ROLE;
INSERT INTO atenciones (id, caso_id, motivo, que_se_hizo, created_by, created_at)
VALUES ('aa000000-0000-4000-8000-000000000071',
        'aa000000-0000-4000-8000-000000000031',
        'vieja', 'acción', 'a9000000-0000-4000-8000-0000000000e1',
        NOW() - INTERVAL '31 minutes');
SET LOCAL ROLE authenticated;
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000e1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.update_attention('aa000000-0000-4000-8000-000000000071', 'editado');
    PERFORM public.t64_rec(
        'T61.6 update_attention >30min DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%30 minutos%',
        r::text
    );
END $$;

-- T61.6b update_attention dentro de 30 min → ALLOW (atención recién creada por trigger path)
-- Ya hay atención creada arriba con created_at antiguo; crear una fresca
RESET ROLE;
INSERT INTO atenciones (id, caso_id, motivo, que_se_hizo, created_by)
VALUES ('aa000000-0000-4000-8000-000000000072',
        'aa000000-0000-4000-8000-000000000031',
        'fresca', 'acción', 'a9000000-0000-4000-8000-0000000000e1');
SET LOCAL ROLE authenticated;
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000e1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.update_attention('aa000000-0000-4000-8000-000000000072', 'editado a tiempo');
    PERFORM public.t64_rec(
        'T61.6b update_attention <30min ALLOW',
        (r->>'success')::boolean IS TRUE,
        r::text
    );
END $$;

-- T61.7 update_attention como director → deny
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000d1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.update_attention('aa000000-0000-4000-8000-000000000072', 'hack');
    PERFORM public.t64_rec(
        'T61.7 update_attention director DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%editar atenciones%',
        r::text
    );
END $$;

-- T61.8 RLS: psicologo B no gestiona casos de A
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000e2');
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM casos WHERE id = 'aa000000-0000-4000-8000-000000000031';
    PERFORM public.t64_rec('T61.8 psicologo B no ve caso A', n = 0, 'rows=' || n);

    UPDATE casos SET situation = 'hack' WHERE id = 'aa000000-0000-4000-8000-000000000031';
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM public.t64_rec('T61.8b psicologo B no UPDATE caso A', n = 0, 'updated=' || n);
END $$;

-- T61.9 auditoría de cierre/reapertura
RESET ROLE;
DO $$
DECLARE n_close INT; n_reopen INT;
BEGIN
    SELECT count(*) INTO n_close FROM auditoria
     WHERE action = 'case_closed' AND record_id = 'aa000000-0000-4000-8000-000000000031';
    SELECT count(*) INTO n_reopen FROM auditoria
     WHERE action = 'case_reopened' AND record_id = 'aa000000-0000-4000-8000-000000000031';
    PERFORM public.t64_rec('T61.9 auditoría case_closed', n_close >= 1, 'n=' || n_close);
    PERFORM public.t64_rec('T61.9b auditoría case_reopened', n_reopen >= 1, 'n=' || n_reopen);
END $$;

-- T61.10 histórico de responsables presente
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM caso_responsables_historial
     WHERE caso_id = 'aa000000-0000-4000-8000-000000000031';
    PERFORM public.t64_rec('T61.10 histórico responsables', n >= 1, 'rows=' || n);
END $$;

-- ============================================================
-- T62 — TRANSFERENCIAS (A1: B solicita → A autoriza / A rechaza)
-- ============================================================

RESET ROLE;
UPDATE periodos_escolares
SET end_date = NULL, motivo_retiro = NULL
WHERE id = 'aa000000-0000-4000-8000-000000000011';
DELETE FROM transferencias
 WHERE caso_id IN ('aa000000-0000-4000-8000-000000000031', 'bb000000-0000-4000-8000-000000000032');

SET LOCAL ROLE authenticated;

-- T62.1 solicitar como psicologo → deny
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000e1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.initiate_transfer(
        'aa000000-0000-4000-8000-000000000031',
        'a0000000-0000-4000-8000-00000000000a',
        'b1000000-0000-4000-8000-000000000001',
        'b2000000-0000-4000-8000-000000000001'
    );
    PERFORM public.t64_rec(
        'T62.1 initiate_transfer psicologo DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%solicitar transferencias%',
        r::text
    );
END $$;

-- T62.1b solicitar como docente → deny
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000f1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.initiate_transfer(
        'aa000000-0000-4000-8000-000000000031',
        'a0000000-0000-4000-8000-00000000000a',
        'b1000000-0000-4000-8000-000000000001',
        'b2000000-0000-4000-8000-000000000001'
    );
    PERFORM public.t64_rec(
        'T62.1b initiate_transfer docente DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%solicitar transferencias%',
        r::text
    );
END $$;

-- T62.2 director A solicita hacia su propia IE (origen=destino) → error
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000d1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.initiate_transfer(
        'aa000000-0000-4000-8000-000000000031',
        'a0000000-0000-4000-8000-00000000000a',
        'a1000000-0000-4000-8000-000000000001',
        'a2000000-0000-4000-8000-000000000002'
    );
    PERFORM public.t64_rec(
        'T62.2 initiate misma institución DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%diferentes%',
        r::text
    );
END $$;

-- T62.2b B (destino) solicita hacia A (origen) → ALLOW pending, SIN efecto en A
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000d3');
DO $$
DECLARE r JSON; tid UUID; n INT;
BEGIN
    r := public.initiate_transfer(
        'aa000000-0000-4000-8000-000000000031',
        'a0000000-0000-4000-8000-00000000000a',
        'b1000000-0000-4000-8000-000000000001',
        'b2000000-0000-4000-8000-000000000001',
        'A'
    );
    PERFORM public.t64_rec(
        'T62.2b director B solicita ALLOW (pending)',
        (r->>'success')::boolean IS TRUE
        AND coalesce(r->>'status', '') = 'pending',
        r::text
    );
    tid := (r->>'transfer_id')::uuid;
END $$;

-- Verificaciones de efecto (sin RLS: postgres)
RESET ROLE;
DO $$
DECLARE n INT; tid UUID;
BEGIN
    SELECT id INTO tid FROM transferencias
     WHERE caso_id = 'aa000000-0000-4000-8000-000000000031' AND status = 'pending' LIMIT 1;
    PERFORM public.t64_rec(
        'T62.2c status pending tras solicitar',
        tid IS NOT NULL,
        'tid=' || coalesce(tid::text, 'NULL')
    );
    SELECT count(*) INTO n FROM periodos_escolares
     WHERE id = 'aa000000-0000-4000-8000-000000000011' AND end_date IS NULL;
    PERFORM public.t64_rec('T62.2d período A intacto al solicitar', n = 1, 'open=' || n);
    SELECT count(*) INTO n FROM transferencias
     WHERE caso_id = 'aa000000-0000-4000-8000-000000000031' AND status = 'pending';
    PERFORM public.t64_rec('T62.2e exactamente una pending', n = 1, 'pending=' || n);
END $$;

SET LOCAL ROLE authenticated;

-- T62.3 doble solicitud → bloqueada (índice único pending)
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000d3');
DO $$
DECLARE r JSON;
BEGIN
    r := public.initiate_transfer(
        'aa000000-0000-4000-8000-000000000031',
        'a0000000-0000-4000-8000-00000000000a',
        'b1000000-0000-4000-8000-000000000001',
        'b2000000-0000-4000-8000-000000000001'
    );
    PERFORM public.t64_rec(
        'T62.3 doble initiate DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%transferencia activa%',
        r::text
    );
END $$;

-- T62.4 autorizar como docente → deny
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000f1');
DO $$
DECLARE r JSON; tid UUID;
BEGIN
    SELECT id INTO tid FROM transferencias
     WHERE caso_id = 'aa000000-0000-4000-8000-000000000031' AND status = 'pending' LIMIT 1;
    IF tid IS NULL THEN
        PERFORM public.t64_rec('T62.4 authorize docente DENY', false, 'no pending');
        RETURN;
    END IF;
    r := public.authorize_transfer(tid);
    PERFORM public.t64_rec(
        'T62.4 authorize docente DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%autorizar transferencias%',
        r::text
    );
END $$;

-- T62.4b autorizar como director B (destino, no origen) → deny
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000d3');
DO $$
DECLARE r JSON; tid UUID;
BEGIN
    SELECT id INTO tid FROM transferencias
     WHERE caso_id = 'aa000000-0000-4000-8000-000000000031' AND status = 'pending' LIMIT 1;
    IF tid IS NULL THEN
        PERFORM public.t64_rec('T62.4b authorize director B DENY', false, 'no pending');
        RETURN;
    END IF;
    r := public.authorize_transfer(tid);
    PERFORM public.t64_rec(
        'T62.4b authorize director B (no origen) DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%origen%',
        r::text
    );
END $$;

-- T62.5 A rechaza → rejected, sin efectos en A
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000d1');
DO $$
DECLARE r JSON; tid UUID; st TEXT; n_open INT;
BEGIN
    SELECT id INTO tid FROM transferencias
     WHERE caso_id = 'aa000000-0000-4000-8000-000000000031' AND status = 'pending' LIMIT 1;
    IF tid IS NULL THEN
        PERFORM public.t64_rec('T62.5 reject director A ALLOW', false, 'no pending');
        RETURN;
    END IF;
    r := public.reject_transfer(tid, 'No aplica traslado');
    PERFORM public.t64_rec(
        'T62.5 reject director A ALLOW',
        (r->>'success')::boolean IS TRUE
        AND coalesce(r->>'status', '') = 'rejected',
        r::text
    );
    SELECT status INTO st FROM transferencias WHERE id = tid;
    PERFORM public.t64_rec('T62.5b status=rejected', st = 'rejected', 'status=' || st);
    SELECT count(*) INTO n_open FROM periodos_escolares
     WHERE id = 'aa000000-0000-4000-8000-000000000011' AND end_date IS NULL;
    PERFORM public.t64_rec('T62.5c rechazo no cierra período A', n_open = 1, 'open=' || n_open);
END $$;

-- T62.6 re-solicitar tras rejected → ALLOW (solo pending cuenta como activa)
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000d3');
DO $$
DECLARE r JSON;
BEGIN
    r := public.initiate_transfer(
        'aa000000-0000-4000-8000-000000000031',
        'a0000000-0000-4000-8000-00000000000a',
        'b1000000-0000-4000-8000-000000000001',
        'b2000000-0000-4000-8000-000000000001',
        'A'
    );
    PERFORM public.t64_rec(
        'T62.6 re-initiate tras rejected ALLOW',
        (r->>'success')::boolean IS TRUE,
        r::text
    );
END $$;

-- T62.7 A autoriza → efectos completos (cierra A, crea B, transfiere responsable)
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000d1');
DO $$
DECLARE r JSON; tid UUID;
BEGIN
    SELECT id INTO tid FROM transferencias
     WHERE caso_id = 'aa000000-0000-4000-8000-000000000031' AND status = 'pending' LIMIT 1;
    IF tid IS NULL THEN
        PERFORM public.t64_rec('T62.7 authorize director A ALLOW', false, 'no pending');
        RETURN;
    END IF;
    r := public.authorize_transfer(tid);
    PERFORM public.t64_rec(
        'T62.7 authorize director A ALLOW',
        (r->>'success')::boolean IS TRUE
        AND coalesce(r->>'status', '') = 'approved',
        r::text
    );
END $$;

-- Efectos verificados sin RLS (postgres)
RESET ROLE;
DO $$
DECLARE tid UUID; st TEXT; n_closed INT; n_b INT; resp UUID;
BEGIN
    SELECT id INTO tid FROM transferencias
     WHERE caso_id = 'aa000000-0000-4000-8000-000000000031'
       AND status = 'approved'
     LIMIT 1;
    IF tid IS NULL THEN
        SELECT id INTO tid FROM transferencias
         WHERE caso_id = 'aa000000-0000-4000-8000-000000000031'
           AND authorized_at IS NOT NULL
         ORDER BY authorized_at DESC NULLS LAST
         LIMIT 1;
    END IF;
    SELECT status INTO st FROM transferencias WHERE id = tid;
    PERFORM public.t64_rec('T62.7b status=approved', st = 'approved', 'status=' || coalesce(st, 'NULL'));
    SELECT count(*) INTO n_closed FROM periodos_escolares
     WHERE id = 'aa000000-0000-4000-8000-000000000011' AND end_date IS NOT NULL;
    PERFORM public.t64_rec('T62.7c período A cerrado', n_closed = 1, 'closed=' || n_closed);
    SELECT count(*) INTO n_b FROM periodos_escolares
     WHERE student_id = 'aa000000-0000-4000-8000-000000000001'
       AND institution_id = 'b0000000-0000-4000-8000-00000000000b'
       AND end_date IS NULL
       AND school_year = 2026;
    PERFORM public.t64_rec('T62.7d período B creado', n_b = 1, 'rows=' || n_b);
    SELECT current_responsible_id INTO resp FROM casos
     WHERE id = 'aa000000-0000-4000-8000-000000000031';
    PERFORM public.t64_rec(
        'T62.7e responsable en B',
        resp = 'a9000000-0000-4000-8000-0000000000d3',
        'resp=' || coalesce(resp::text, 'NULL')
    );
END $$;

SET LOCAL ROLE authenticated;

-- T62.8 autorizar dos veces → deny (ya no pending)
DO $$
DECLARE r JSON; tid UUID;
BEGIN
    SELECT id INTO tid FROM transferencias
     WHERE caso_id = 'aa000000-0000-4000-8000-000000000031'
       AND status = 'approved'
     LIMIT 1;
    IF tid IS NULL THEN
        PERFORM public.t64_rec('T62.8 authorize twice DENY', false, 'no approved transfer');
        RETURN;
    END IF;
    r := public.authorize_transfer(tid);
    PERFORM public.t64_rec(
        'T62.8 authorize twice DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%pendientes%',
        r::text
    );
    r := public.reject_transfer(tid, 'post');
    PERFORM public.t64_rec(
        'T62.8b reject tras approved DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%pendientes%',
        r::text
    );
END $$;

-- T62.9 aislamiento: director A no ve transferencias pure de otras IEs
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000d1');
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM transferencias
     WHERE origin_institution_id = 'b0000000-0000-4000-8000-00000000000b'
       AND destination_institution_id = 'c0000000-0000-4000-8000-00000000000c';
    PERFORM public.t64_rec('T62.9 director A no ve transferencias B→C', n = 0, 'rows=' || n);
END $$;

-- T62.10 auditoría A1
RESET ROLE;
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM auditoria WHERE action = 'transfer_requested';
    PERFORM public.t64_rec('T62.10 auditoría transfer_requested', n >= 1, 'n=' || n);
    SELECT count(*) INTO n FROM auditoria WHERE action = 'transfer_rejected';
    PERFORM public.t64_rec('T62.10b auditoría transfer_rejected', n >= 1, 'n=' || n);
    SELECT count(*) INTO n FROM auditoria WHERE action = 'transfer_authorized';
    PERFORM public.t64_rec('T62.10c auditoría transfer_authorized', n >= 1, 'n=' || n);
END $$;

-- T62.11 restaurar seed A para T63/T64 (período A activo, sin período B)
RESET ROLE;
DELETE FROM periodos_escolares
 WHERE student_id = 'aa000000-0000-4000-8000-000000000001'
   AND institution_id = 'b0000000-0000-4000-8000-00000000000b';
UPDATE periodos_escolares
SET end_date = NULL, motivo_retiro = NULL, updated_at = NOW()
WHERE id = 'aa000000-0000-4000-8000-000000000011';
-- trigger estados: en_proceso → cerrado → inicio (si authorize pasó a en_proceso)
UPDATE casos
SET estado = 'cerrado', updated_at = NOW()
WHERE id = 'aa000000-0000-4000-8000-000000000031' AND estado = 'en_proceso';
UPDATE casos
SET current_responsible_id = 'a9000000-0000-4000-8000-0000000000e1',
    estado = 'inicio',
    updated_at = NOW()
WHERE id = 'aa000000-0000-4000-8000-000000000031';
DELETE FROM caso_responsables_historial
 WHERE caso_id = 'aa000000-0000-4000-8000-000000000031'
   AND motivo_salida = 'transferencia';
-- B5: cerrar período 2026 de seed antes de T64 (promoción 2025→2026 crea otro 2026)
UPDATE periodos_escolares
SET end_date = CURRENT_DATE, motivo_retiro = 'seed_pre_promocion', updated_at = NOW()
WHERE id = 'aa000000-0000-4000-8000-000000000011';
SELECT 1;

-- ============================================================
-- T63 — LICENCIAS
-- ============================================================
SET LOCAL ROLE authenticated;

-- T63.1 can_create_attention vencida → allowed=false, reason=expired (A)
DO $$
DECLARE r JSON;
BEGIN
    r := public.can_create_attention('a0000000-0000-4000-8000-00000000000a');
    PERFORM public.t64_rec(
        'T63.1 can_create_attention expired A',
        (r->>'success')::boolean IS FALSE
        AND (r->>'allowed')::boolean IS FALSE
        AND coalesce(r->>'reason', '') = 'expired',
        r::text
    );
END $$;

-- T63.2 can_create_attention vigente → allowed=true (B)
DO $$
DECLARE r JSON;
BEGIN
    r := public.can_create_attention('b0000000-0000-4000-8000-00000000000b');
    PERFORM public.t64_rec(
        'T63.2 can_create_attention active B',
        (r->>'success')::boolean IS TRUE
        AND (r->>'allowed')::boolean IS TRUE,
        r::text
    );
END $$;

-- T63.2b get_license_status expiring_soon (E vence en 20 días) — como Global (045 authz)
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000a0');
DO $$
DECLARE r JSON;
BEGIN
    r := public.get_license_status('e0000000-0000-4000-8000-00000000000e');
    PERFORM public.t64_rec(
        'T63.2b get_license_status expiring E',
        (r->>'success')::boolean IS TRUE
        AND coalesce(r->>'status', '') = 'expiring_soon'
        AND (r->>'days_remaining')::int <= 30,
        r::text
    );
END $$;

-- T63.2c get_license_status scheduled (C) — como Global
DO $$
DECLARE r JSON;
BEGIN
    r := public.get_license_status('c0000000-0000-4000-8000-00000000000c');
    PERFORM public.t64_rec(
        'T63.2c get_license_status scheduled C',
        (r->>'success')::boolean IS TRUE
        AND coalesce(r->>'status', '') = 'scheduled',
        r::text
    );
END $$;

-- T63.3 create_attention psicologo con vencida → bloqueado server-side
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000e1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.create_attention(
        'aa000000-0000-4000-8000-000000000031',
        'motivo', 'qué', NULL, NULL, NULL, 'test'
    );
    PERFORM public.t64_rec(
        'T63.3 create_attention psicologo vencida DENY',
        (r->>'success')::boolean IS FALSE
        AND (
            coalesce(r->>'license_status', '') = 'expired'
            OR coalesce(r->>'error', '') ILIKE '%vencida%'
        ),
        r::text
    );
END $$;

-- T63.4 create_attention global con vencida → bypass
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000a0');
DO $$
DECLARE r JSON;
BEGIN
    r := public.create_attention(
        'aa000000-0000-4000-8000-000000000031',
        'global bypass', 'acción', NULL, NULL, NULL, 'test'
    );
    PERFORM public.t64_rec(
        'T63.4 create_attention global bypass',
        (r->>'success')::boolean IS TRUE,
        r::text
    );
END $$;

-- T63.5 get_license_status sin licencia → status=none
-- Institución F sin licencia
RESET ROLE;
INSERT INTO institutions (id, name, code)
VALUES ('f0000000-0000-4000-8000-00000000000f', 'IE T64 NoLic', 'T64-F')
ON CONFLICT DO NOTHING;
SET LOCAL ROLE authenticated;
DO $$
DECLARE r JSON;
BEGIN
    r := public.get_license_status('f0000000-0000-4000-8000-00000000000f');
    PERFORM public.t64_rec(
        'T63.5 get_license_status none',
        (r->>'success')::boolean IS TRUE
        AND coalesce(r->>'status', '') = 'none',
        r::text
    );
    r := public.can_create_attention('f0000000-0000-4000-8000-00000000000f');
    PERFORM public.t64_rec(
        'T63.5b can_create_attention no_license',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'reason', '') = 'no_license',
        r::text
    );
END $$;

-- T63.6 get_expiring_licenses incluye ≤30 días y vencidas (solo Global — 045)
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000a0');
DO $$
DECLARE j JSON; txt TEXT;
BEGIN
    j := public.get_expiring_licenses();
    txt := j::text;
    PERFORM public.t64_rec(
        'T63.6 get_expiring incluye vencida/expiring',
        (j->>'success')::boolean IS TRUE
        AND (txt ILIKE '%vencida%' OR txt ILIKE '%Faltan%'),
        left(txt, 500)
    );
END $$;

-- T63.7 sesión no invalidada: RPC no relacionada sigue OK con JWT en inst. vencida
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000e1');
DO $$
DECLARE r JSON; role_t TEXT;
BEGIN
    role_t := public.get_user_role();
    PERFORM public.t64_rec(
        'T63.7 sesión activa — rol sigue disponible (DC-005)',
        role_t = 'psicologo',
        'role=' || coalesce(role_t, 'NULL')
    );
    -- otra RPC no-licencia: preview_promotion (denied por rol, no por sesión)
    r := public.preview_promotion('a0000000-0000-4000-8000-00000000000a', 2025, 2026);
    PERFORM public.t64_rec(
        'T63.7b RPC no-licencia responde (no logout)',
        r IS NOT NULL,
        coalesce(r->>'error', r::text)
    );
END $$;

-- T63.8 roles NO cambian por vencimiento (DC-003)
RESET ROLE;
DO $$
DECLARE r TEXT;
BEGIN
    SELECT role INTO r FROM perfiles
     WHERE user_id = 'a9000000-0000-4000-8000-0000000000e1';
    PERFORM public.t64_rec(
        'T63.8 rol psicologo sin cambio por vencida (DC-003)',
        r = 'psicologo',
        'role=' || coalesce(r, 'NULL')
    );
END $$;

-- ============================================================
-- T64 — PROMOCIÓN
-- ============================================================
SET LOCAL ROLE authenticated;

-- T64.1 preview como docente → deny
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000f1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.preview_promotion('a0000000-0000-4000-8000-00000000000a', 2025, 2026);
    PERFORM public.t64_rec(
        'T64.1 preview docente DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%permiso%',
        r::text
    );
END $$;

-- T64.2 preview como psicologo → deny
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000e1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.preview_promotion('a0000000-0000-4000-8000-00000000000a', 2025, 2026);
    PERFORM public.t64_rec(
        'T64.2 preview psicologo DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%permiso%',
        r::text
    );
END $$;

-- T64.3 director institución B con p_institution_id=A → deny
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000d3');
DO $$
DECLARE r JSON;
BEGIN
    r := public.preview_promotion('a0000000-0000-4000-8000-00000000000a', 2025, 2026);
    PERFORM public.t64_rec(
        'T64.3 director B en A DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%instituci%',
        r::text
    );
END $$;

-- T64.3b preview director A ALLOW
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000d1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.preview_promotion('a0000000-0000-4000-8000-00000000000a', 2025, 2026);
    PERFORM public.t64_rec(
        'T64.3b preview director A ALLOW',
        (r->>'success')::boolean IS TRUE,
        r::text
    );
END $$;

-- T64.4 execute idempotente con misma key COMPLETED
DO $$
DECLARE r JSON; r2 JSON; bid UUID; n INT;
BEGIN
    r := public.execute_promotion(
        'a0000000-0000-4000-8000-00000000000a', 2025, 2026, 't64-idem-key-001'
    );
    PERFORM public.t64_rec(
        'T64.4 execute_promotion ALLOW',
        (r->>'success')::boolean IS TRUE,
        r::text
    );
    bid := (r->>'batch_id')::uuid;
    IF bid IS NULL THEN
        -- si falló por permisos u otro, registrar
        PERFORM public.t64_rec('T64.4 execute batch_id', false, r::text);
        RETURN;
    END IF;

    r2 := public.execute_promotion(
        'a0000000-0000-4000-8000-00000000000a', 2025, 2026, 't64-idem-key-001'
    );
    PERFORM public.t64_rec(
        'T64.4b segunda execute idempotente',
        (r2->>'success')::boolean IS TRUE
        AND (r2->>'idempotent')::boolean IS TRUE,
        r2::text
    );

    SELECT count(*) INTO n FROM lotes_promocion
     WHERE idempotency_key = 't64-idem-key-001';
    PERFORM public.t64_rec('T64.4c un solo lote con la key', n = 1, 'n=' || n);
END $$;

-- T64.5 segundo lote activo mismo contexto → bloqueado
-- (insertar lote PREPARED manualmente con otra key)
RESET ROLE;
INSERT INTO lotes_promocion (
    institution_id, origin_year, destination_year, started_by, status, idempotency_key
) VALUES (
    'a0000000-0000-4000-8000-00000000000a', 2024, 2025,
    'a9000000-0000-4000-8000-0000000000d1', 'RUNNING', 't64-active-other'
);
SET LOCAL ROLE authenticated;
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000d1');
DO $$
DECLARE r JSON;
BEGIN
    r := public.execute_promotion(
        'a0000000-0000-4000-8000-00000000000a', 2024, 2025, 't64-new-key-002'
    );
    PERFORM public.t64_rec(
        'T64.5 segundo lote activo DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%lote de promoción activo%',
        r::text
    );
END $$;

-- T64.6 resume sobre COMPLETED → error no reanudable
DO $$
DECLARE r JSON; bid UUID;
BEGIN
    SELECT id INTO bid FROM lotes_promocion
     WHERE idempotency_key = 't64-idem-key-001' LIMIT 1;
    IF bid IS NULL THEN
        PERFORM public.t64_rec('T64.6 resume COMPLETED DENY', false, 'no batch');
        RETURN;
    END IF;
    r := public.resume_promotion(bid);
    PERFORM public.t64_rec(
        'T64.6 resume COMPLETED DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%reanudado%',
        r::text
    );
END $$;

-- T64.6b resume como docente → deny
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000f1');
DO $$
DECLARE r JSON; bid UUID;
BEGIN
    SELECT id INTO bid FROM lotes_promocion LIMIT 1;
    IF bid IS NULL THEN
        PERFORM public.t64_rec('T64.6b resume docente DENY', false, 'no batch');
        RETURN;
    END IF;
    r := public.resume_promotion(bid);
    PERFORM public.t64_rec(
        'T64.6b resume docente DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%permiso%',
        r::text
    );
END $$;

-- T64.7 apply_promotion_exception sobre processed → error
RESET ROLE;
DO $$
DECLARE aid UUID; r JSON;
BEGIN
    SELECT id INTO aid FROM acciones_promocion
     WHERE status = 'processed' LIMIT 1;
    IF aid IS NULL THEN
        -- forzar una acción processed si el lote no generó estudiantes procesados
        SELECT id INTO aid FROM acciones_promocion LIMIT 1;
        IF aid IS NULL THEN
            PERFORM public.t64_rec('T64.7 exception sobre processed DENY', false, 'no actions');
            RETURN;
        END IF;
        UPDATE acciones_promocion SET status = 'processed' WHERE id = aid;
    END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000d1');
DO $$
DECLARE aid UUID; r JSON;
BEGIN
    SELECT id INTO aid FROM acciones_promocion
     WHERE status = 'processed' LIMIT 1;
    IF aid IS NULL THEN
        PERFORM public.t64_rec('T64.7 exception sobre processed DENY', false, 'no processed action');
        RETURN;
    END IF;
    r := public.apply_promotion_exception(aid, 'retained', 'motivo test');
    PERFORM public.t64_rec(
        'T64.7 exception sobre processed DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%pendientes%',
        r::text
    );
END $$;

-- T64.7b apply_promotion_exception como docente → deny
SELECT public.t64_login('a9000000-0000-4000-8000-0000000000f1');
DO $$
DECLARE aid UUID; r JSON;
BEGIN
    SELECT id INTO aid FROM acciones_promocion LIMIT 1;
    IF aid IS NULL THEN
        PERFORM public.t64_rec('T64.7b exception docente DENY', false, 'no actions');
        RETURN;
    END IF;
    r := public.apply_promotion_exception(aid, 'retained', 'x');
    PERFORM public.t64_rec(
        'T64.7b exception docente DENY',
        (r->>'success')::boolean IS FALSE
        AND coalesce(r->>'error', '') ILIKE '%permiso%',
        r::text
    );
END $$;

-- T64.8 último nivel → egreso cierra período sin periodo destino
-- Estudiante cc en Quinto Secundaria (último grado del último nivel) con período 2025 activo.
-- Tras execute 2025→2026 debería egresar (no crear período 2026).
-- Verificar: período 2025 de cc cerrado con motivo egreso; sin período 2026 para cc.
RESET ROLE;
DO $$
DECLARE n_closed INT; n_new INT; motivo TEXT;
BEGIN
    SELECT CASE WHEN end_date IS NOT NULL THEN 1 ELSE 0 END, motivo_retiro
    INTO n_closed, motivo
    FROM periodos_escolares
     WHERE student_id = 'cc000000-0000-4000-8000-000000000003'
       AND school_year = 2025
     LIMIT 1;
    PERFORM public.t64_rec(
        'T64.8 egreso cierra período 2025',
        n_closed = 1,
        'closed=' || n_closed || ' motivo=' || coalesce(motivo, 'NULL')
    );
    SELECT count(*) INTO n_new FROM periodos_escolares
     WHERE student_id = 'cc000000-0000-4000-8000-000000000003'
       AND school_year = 2026;
    PERFORM public.t64_rec(
        'T64.8b egreso sin período destino 2026',
        n_new = 0,
        'rows=' || n_new
    );
END $$;

-- T64.9 auditoría promotion_executed
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM auditoria WHERE action = 'promotion_executed';
    PERFORM public.t64_rec('T64.9 auditoría promotion_executed', n >= 1, 'n=' || n);
END $$;

-- T64.10 no duplicación: UNIQUE(batch_id, student_id) + conteo acciones
DO $$
DECLARE n INT; n_dup INT;
BEGIN
    SELECT count(*) INTO n FROM acciones_promocion;
    SELECT count(*) INTO n_dup FROM (
        SELECT batch_id, student_id FROM acciones_promocion
        GROUP BY batch_id, student_id HAVING count(*) > 1
    ) d;
    PERFORM public.t64_rec('T64.10 sin duplicados acciones', n_dup = 0, 'dups=' || n_dup || ' total=' || n);
END $$;

-- ============================================================
-- Resumen
-- ============================================================
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
    FROM public.t64_results;

    IF v_fail > 0 THEN
        SELECT string_agg(test_name || ': ' || coalesce(detail, ''), E'\n')
        INTO v_detail
        FROM public.t64_results
        WHERE status = 'FAIL';
        RAISE EXCEPTION 'T61-T64: % FAIL / % total%n%',
            v_fail, v_total, E'\n', v_detail;
    END IF;

    RAISE NOTICE 'T61-T64 RESULT: ALL PASS — % tests', v_total;
END $$;

SELECT test_name, status, detail
FROM public.t64_results
ORDER BY status DESC, test_name;

ROLLBACK;

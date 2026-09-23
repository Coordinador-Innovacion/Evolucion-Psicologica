BEGIN;

SELECT set_config(
    'request.jwt.claims',
    '{"sub":"a9000000-0000-4000-8000-0000000000a0","role":"authenticated"}',
    true
);

INSERT INTO institutions (id, name, code) VALUES
    ('a0000000-0000-4000-8000-00000000000a', 'IE T60 Alfa', 'T60-A'),
    ('b0000000-0000-4000-8000-00000000000b', 'IE T60 Beta', 'T60-B')
ON CONFLICT DO NOTHING;

INSERT INTO niveles_educativos (id, name, order_number, institution_id) VALUES
    ('a1000000-0000-4000-8000-000000000001', 'Primaria', 1, 'a0000000-0000-4000-8000-00000000000a'),
    ('b1000000-0000-4000-8000-000000000001', 'Primaria', 1, 'b0000000-0000-4000-8000-00000000000b')
ON CONFLICT DO NOTHING;

INSERT INTO grados (id, name, order_number, nivel_id) VALUES
    ('a2000000-0000-4000-8000-000000000001', 'Primero', 1, 'a1000000-0000-4000-8000-000000000001'),
    ('b2000000-0000-4000-8000-000000000001', 'Primero', 1, 'b1000000-0000-4000-8000-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
) VALUES
    ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-0000000000a0'::uuid, 'authenticated', 'authenticated', 't60.global@test.local', crypt('x', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"T60 Global","document_number":"90000000","role":"global"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-0000000000d1'::uuid, 'authenticated', 'authenticated', 't60.director.a@test.local', crypt('x', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"T60 Director A","document_number":"90000001","role":"director"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-0000000000e1'::uuid, 'authenticated', 'authenticated', 't60.psicologo.a@test.local', crypt('x', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"T60 Psicologo A","document_number":"90000004","role":"psicologo"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-0000000000f1'::uuid, 'authenticated', 'authenticated', 't60.docente.a@test.local', crypt('x', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"T60 Docente A","document_number":"90000005","role":"docente"}', now(), now())
ON CONFLICT DO NOTHING;

UPDATE perfiles SET institution_id = 'a0000000-0000-4000-8000-00000000000a' WHERE user_id = 'a9000000-0000-4000-8000-0000000000d1';
UPDATE perfiles SET institution_id = 'a0000000-0000-4000-8000-00000000000a' WHERE user_id = 'a9000000-0000-4000-8000-0000000000e1';
UPDATE perfiles SET institution_id = 'a0000000-0000-4000-8000-00000000000a' WHERE user_id = 'a9000000-0000-4000-8000-0000000000f1';

INSERT INTO estudiantes (id, first_names, last_names, document_type, document_number, birth_date) VALUES
    ('aa000000-0000-4000-8000-000000000001', 'Ana', 'Alfa', 'DNI', '70000001', '2015-03-01'),
    ('bb000000-0000-4000-8000-000000000002', 'Bruno', 'Beta', 'DNI', '70000002', '2015-04-01')
ON CONFLICT DO NOTHING;

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
     'A', '2026-03-01', NULL, 'regular')
ON CONFLICT DO NOTHING;

INSERT INTO casos (id, student_id, situation, estado, opened_at, created_by, current_responsible_id) VALUES
    ('aa000000-0000-4000-8000-000000000031', 'aa000000-0000-4000-8000-000000000001',
     'Caso A', 'en_proceso', NOW() - INTERVAL '7 days',
     'a9000000-0000-4000-8000-0000000000e1', 'a9000000-0000-4000-8000-0000000000e1')
ON CONFLICT DO NOTHING;

INSERT INTO licencias (id, institution_id, start_date, end_date, created_by) VALUES
    ('aa000000-0000-4000-8000-000000000061', 'a0000000-0000-4000-8000-00000000000a',
     '2025-01-01', '2025-12-31', 'a9000000-0000-4000-8000-0000000000a0')
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE diag_out(step text, info text);
GRANT INSERT, SELECT ON diag_out TO authenticated;

RESET ROLE;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
    v_uid uuid;
    v_role text;
    v_inst uuid;
    v_n int;
    v_r json;
BEGIN
    PERFORM set_config('request.jwt.claims',
        '{"sub":"a9000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);

    v_uid := auth.uid();
    v_role := public.get_user_role();
    v_inst := public.get_user_institution();
    INSERT INTO diag_out VALUES ('psicologo_identity',
        format('uid=%s role=%s inst=%s', v_uid, v_role, v_inst));

    SELECT institution_id::text INTO v_role FROM perfiles WHERE user_id = auth.uid();
    INSERT INTO diag_out VALUES ('perfiles_inst', coalesce(v_role, 'NULL'));

    SELECT count(*) INTO v_n FROM periodos_escolares
     WHERE student_id = 'aa000000-0000-4000-8000-000000000001';
    INSERT INTO diag_out VALUES ('periodos_any_studentA', v_n::text);

    SELECT count(*) INTO v_n FROM periodos_escolares
     WHERE student_id = 'aa000000-0000-4000-8000-000000000001'
       AND institution_id = v_inst
       AND end_date IS NULL;
    INSERT INTO diag_out VALUES ('periodos_match_inst', v_n::text);

    v_r := public.close_case('aa000000-0000-4000-8000-000000000031', '');
    INSERT INTO diag_out VALUES ('close_sin_motivo', v_r::text);

    v_r := public.close_case('aa000000-0000-4000-8000-000000000031', 'motivo');
    INSERT INTO diag_out VALUES ('close_ok', v_r::text);

    PERFORM set_config('request.jwt.claims',
        '{"sub":"a9000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
    INSERT INTO diag_out VALUES ('director_identity',
        format('role=%s inst=%s', public.get_user_role(), public.get_user_institution()));

    SELECT count(*) INTO v_n FROM institutions WHERE id = 'b0000000-0000-4000-8000-00000000000b';
    INSERT INTO diag_out VALUES ('director_sees_instB', v_n::text);
    SELECT count(*) INTO v_n FROM institutions WHERE id = 'a0000000-0000-4000-8000-00000000000a';
    INSERT INTO diag_out VALUES ('director_sees_instA', v_n::text);
    SELECT count(*) INTO v_n FROM institutions;
    INSERT INTO diag_out VALUES ('director_sees_inst_all', v_n::text);

    PERFORM set_config('request.jwt.claims',
        '{"sub":"a9000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
    UPDATE estudiantes SET updated_at = now() WHERE id = 'bb000000-0000-4000-8000-000000000002';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    INSERT INTO diag_out VALUES ('psicologoA_updated_estB', v_n::text);

    PERFORM set_config('request.jwt.claims',
        '{"sub":"a9000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
    SELECT count(*) INTO v_n FROM casos;
    INSERT INTO diag_out VALUES ('docente_sees_all_casos', v_n::text);
    SELECT count(*) INTO v_n FROM periodos_escolares;
    INSERT INTO diag_out VALUES ('docente_sees_all_periodos', v_n::text);

    PERFORM set_config('request.jwt.claims',
        '{"sub":"a9000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
    -- coordinador may not exist; skip if null
    IF public.get_user_role() IS NOT NULL THEN
        SELECT count(*) INTO v_n FROM periodos_escolares;
        INSERT INTO diag_out VALUES ('coordinador_sees_all_periodos', v_n::text);
    ELSE
        INSERT INTO diag_out VALUES ('coordinador', 'no user seeded in diag');
    END IF;
END $$;

SELECT step, info FROM diag_out ORDER BY step;

ROLLBACK;

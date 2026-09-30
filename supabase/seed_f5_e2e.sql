-- Seed E2E F5 (TRF/PRO) — proyecto alojado zyazpqrjaandccuzjfbl
-- Idempotente: usa IDs fijos y WHERE NOT EXISTS.
-- Institución A (origen) = MICAELA BASTIDAS PUYUCAHUA (ya existe).

-- ============================================================
-- 1. Institución B (destino de transferencias)
-- ============================================================
INSERT INTO institutions (id, name, code)
SELECT 'bee5eed0-0000-4000-8000-00000000000b', 'IE DESTINO E2E', 'E2EDST1'
WHERE NOT EXISTS (SELECT 1 FROM institutions WHERE id = 'bee5eed0-0000-4000-8000-00000000000b');

-- ============================================================
-- 2. Niveles y grados — Institución A (Micaela) y B (destino)
-- ============================================================
INSERT INTO niveles_educativos (id, name, order_number, institution_id)
SELECT v.id, v.name, v.order_number, v.inst
FROM (VALUES
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'::uuid, 'Primaria', 1, 'c3469fe6-206d-4536-90f9-8179791235eb'::uuid),
    ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'::uuid, 'Secundaria', 2, 'c3469fe6-206d-4536-90f9-8179791235eb'::uuid),
    ('bee5eed1-0000-4000-8000-000000000001'::uuid, 'Primaria', 1, 'bee5eed0-0000-4000-8000-00000000000b'::uuid),
    ('bee5eed1-0000-4000-8000-000000000002'::uuid, 'Secundaria', 2, 'bee5eed0-0000-4000-8000-00000000000b'::uuid)
) AS v(id, name, order_number, inst)
WHERE NOT EXISTS (SELECT 1 FROM niveles_educativos WHERE id = v.id);

INSERT INTO grados (id, name, order_number, nivel_id)
SELECT v.id, v.name, v.order_number, v.nivel
FROM (VALUES
    -- A / Primaria
    ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a41'::uuid, 'Primero', 1, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'::uuid),
    ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a42'::uuid, 'Segundo', 2, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'::uuid),
    ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a43'::uuid, 'Tercero', 3, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'::uuid),
    ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44'::uuid, 'Cuarto', 4, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'::uuid),
    ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a45'::uuid, 'Quinto', 5, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'::uuid),
    ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a46'::uuid, 'Sexto', 6, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'::uuid),
    -- A / Secundaria
    ('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a51'::uuid, 'Primero', 1, 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'::uuid),
    ('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a52'::uuid, 'Segundo', 2, 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'::uuid),
    ('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a53'::uuid, 'Tercero', 3, 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'::uuid),
    ('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a54'::uuid, 'Cuarto', 4, 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'::uuid),
    ('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55'::uuid, 'Quinto', 5, 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'::uuid),
    -- B / Primaria
    ('bee5ee01-0000-4000-8000-000000000001'::uuid, 'Primero', 1, 'bee5eed1-0000-4000-8000-000000000001'::uuid),
    ('bee5ee02-0000-4000-8000-000000000002'::uuid, 'Segundo', 2, 'bee5eed1-0000-4000-8000-000000000001'::uuid),
    ('bee5ee03-0000-4000-8000-000000000003'::uuid, 'Tercero', 3, 'bee5eed1-0000-4000-8000-000000000001'::uuid),
    ('bee5ee04-0000-4000-8000-000000000004'::uuid, 'Cuarto', 4, 'bee5eed1-0000-4000-8000-000000000001'::uuid),
    ('bee5ee05-0000-4000-8000-000000000005'::uuid, 'Quinto', 5, 'bee5eed1-0000-4000-8000-000000000001'::uuid),
    ('bee5ee06-0000-4000-8000-000000000006'::uuid, 'Sexto', 6, 'bee5eed1-0000-4000-8000-000000000001'::uuid),
    -- B / Secundaria
    ('bee5ee11-0000-4000-8000-000000000011'::uuid, 'Primero', 1, 'bee5eed1-0000-4000-8000-000000000002'::uuid),
    ('bee5ee12-0000-4000-8000-000000000012'::uuid, 'Segundo', 2, 'bee5eed1-0000-4000-8000-000000000002'::uuid),
    ('bee5ee13-0000-4000-8000-000000000013'::uuid, 'Tercero', 3, 'bee5eed1-0000-4000-8000-000000000002'::uuid),
    ('bee5ee14-0000-4000-8000-000000000014'::uuid, 'Cuarto', 4, 'bee5eed1-0000-4000-8000-000000000002'::uuid),
    ('bee5ee15-0000-4000-8000-000000000015'::uuid, 'Quinto', 5, 'bee5eed1-0000-4000-8000-000000000002'::uuid)
) AS v(id, name, order_number, nivel)
WHERE NOT EXISTS (SELECT 1 FROM grados WHERE id = v.id);

-- ============================================================
-- 3. Estudiantes de prueba (con DNI fijo para TRF-02)
-- ============================================================
INSERT INTO estudiantes (id, first_names, last_names, document_type, document_number, birth_date)
SELECT v.id, v.fn, v.ln, 'DNI', v.dni, '2015-05-01'::date
FROM (VALUES
    ('ca5e0001-0000-4000-8000-000000000001'::uuid, 'Alumno Transferible', 'Prueba E2E', '33333331'),
    ('ca5e0002-0000-4000-8000-000000000002'::uuid, 'Alumno Promocion', 'Prueba E2E', '33333332'),
    ('ca5e0003-0000-4000-8000-000000000003'::uuid, 'Alumno Sexto', 'Prueba E2E', '33333333'),
    ('ca5e0004-0000-4000-8000-000000000004'::uuid, 'Alumno Egreso Sec', 'Prueba E2E', '33333334')
) AS v(id, fn, ln, dni)
WHERE NOT EXISTS (SELECT 1 FROM estudiantes WHERE id = v.id);

UPDATE estudiantes SET document_type = 'DNI', first_names = 'Alumno Sexto'
WHERE id = 'ca5e0003-0000-4000-8000-000000000003'
  AND (document_type <> 'DNI' OR first_names <> 'Alumno Sexto');

UPDATE estudiantes SET document_type = 'DNI'
WHERE id IN (
    'ca5e0001-0000-4000-8000-000000000001',
    'ca5e0002-0000-4000-8000-000000000002',
    'ca5e0004-0000-4000-8000-000000000004'
) AND document_type <> 'DNI';

-- ============================================================
-- 4. Períodos escolares activos 2026 en A (end_date NULL = activo)
-- ============================================================
INSERT INTO periodos_escolares (id, student_id, institution_id, school_year, nivel_id, grado_id, section, start_date, tipo)
SELECT v.id, v.sid, v.inst, 2026, v.nivel, v.grado, 'A', '2026-03-01'::date, 'regular'
FROM (VALUES
    -- transferible: 3° de Primaria A
    ('0e5f0001-0000-4000-8000-000000000001'::uuid, 'ca5e0001-0000-4000-8000-000000000001'::uuid, 'c3469fe6-206d-4536-90f9-8179791235eb'::uuid, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'::uuid, 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a43'::uuid),
    -- promoción: 5° de Primaria A
    ('0e5f0002-0000-4000-8000-000000000002'::uuid, 'ca5e0002-0000-4000-8000-000000000002'::uuid, 'c3469fe6-206d-4536-90f9-8179791235eb'::uuid, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'::uuid, 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a45'::uuid),
    -- 6° de Primaria A (cambia de nivel: promueve a 1° de Secundaria)
    ('0e5f0003-0000-4000-8000-000000000003'::uuid, 'ca5e0003-0000-4000-8000-000000000003'::uuid, 'c3469fe6-206d-4536-90f9-8179791235eb'::uuid, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'::uuid, 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a46'::uuid),
    -- 5° de Secundaria A (egreso real: último grado del último nivel)
    ('0e5f0004-0000-4000-8000-000000000004'::uuid, 'ca5e0004-0000-4000-8000-000000000004'::uuid, 'c3469fe6-206d-4536-90f9-8179791235eb'::uuid, 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'::uuid, 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55'::uuid)
) AS v(id, sid, inst, nivel, grado)
WHERE NOT EXISTS (SELECT 1 FROM periodos_escolares WHERE id = v.id);

-- ============================================================
-- 5. Caso activo para el estudiante transferible (en A)
-- ============================================================
INSERT INTO casos (id, student_id, situation, estado, created_by)
SELECT 'ca5e000c-0000-4000-8000-00000000000c',
       'ca5e0001-0000-4000-8000-000000000001',
       'Dificultades de aprendizaje — caso de prueba para transferencia E2E',
       'inicio',
       '8f5e6509-efc7-41ff-b88e-ae35dc4ae534'
WHERE NOT EXISTS (SELECT 1 FROM casos WHERE id = 'ca5e000c-0000-4000-8000-00000000000c');

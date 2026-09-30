-- Seed F6 — E2E-09/10/11 (§8)
-- Encuesta con los 9 tipos de pregunta y ambas presentaciones
-- (normal + visual), una versión publicada EN USO con aplicaciones
-- y tokens fijos para la experiencia pública /e/[token].
-- Idempotente: ON CONFLICT DO NOTHING + UPDATE de estado/ventanas.
-- Orden compatible con los triggers de inmutabilidad (migración 059):
-- V1 se crea como draft, recibe la estructura y recién entonces se
-- publica; los bloques de estructura se saltan si ya existen.

-- ------------------------------------------------------------
-- Encuesta institucional (I.E. MICAELA BASTIDAS, Inst A)
-- ------------------------------------------------------------
INSERT INTO encuestas (id, institution_id, title, description, created_by)
SELECT 'f6e50001-0000-4000-8000-000000000001',
       'c3469fe6-206d-4536-90f9-8179791235eb',
       'Encuesta de Bienestar Escolar 2026',
       'Seed F6: 9 tipos de pregunta y ambas presentaciones.',
       COALESCE((SELECT user_id FROM perfiles WHERE role = 'director' AND institution_id = 'c3469fe6-206d-4536-90f9-8179791235eb' LIMIT 1),
                (SELECT id FROM auth.users LIMIT 1))
ON CONFLICT (id) DO NOTHING;

-- V1 nace en draft (se publica al final del seed) y V2 queda en borrador
INSERT INTO encuesta_versiones (id, survey_id, version_number, status, published_at)
VALUES
  ('f6e50002-0000-4000-8000-000000000002', 'f6e50001-0000-4000-8000-000000000001', 1, 'draft', NULL),
  ('f6e50003-0000-4000-8000-000000000003', 'f6e50001-0000-4000-8000-000000000001', 2, 'draft', NULL)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- Secciones (solo si la versión aún no tiene estructura)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM encuesta_secciones
    WHERE version_id = 'f6e50002-0000-4000-8000-000000000002'
  ) THEN
    INSERT INTO encuesta_secciones (id, version_id, title, description, sort_order)
    VALUES
      ('f6e50010-0000-4000-8000-000000000010', 'f6e50002-0000-4000-8000-000000000002', 'General', 'Preguntas generales del bienestar', 1),
      ('f6e50011-0000-4000-8000-000000000011', 'f6e50002-0000-4000-8000-000000000002', 'Académico', 'Ámbito académico y actividades', 2)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ------------------------------------------------------------
-- Preguntas: los 9 tipos + presentación visual y normal
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM encuesta_preguntas p
    JOIN encuesta_secciones s ON s.id = p.section_id
    WHERE s.version_id = 'f6e50002-0000-4000-8000-000000000002'
  ) THEN
    INSERT INTO encuesta_preguntas (id, section_id, question_type, label, description, is_required, sort_order, config, presentation)
    VALUES
      ('f6e50021-0000-4000-8000-000000000021', 'f6e50010-0000-4000-8000-000000000010', 'texto_corto',
       '¿Cómo te sientes hoy?', NULL, true, 1,
       '{"max_length":255}'::jsonb, '{"width":"full"}'::jsonb),
      ('f6e50022-0000-4000-8000-000000000022', 'f6e50010-0000-4000-8000-000000000010', 'texto_largo',
       'Cuéntanos un poco más', NULL, false, 2,
       '{"max_length":2000}'::jsonb, '{"width":"full"}'::jsonb),
      ('f6e50023-0000-4000-8000-000000000023', 'f6e50010-0000-4000-8000-000000000010', 'opcion_unica',
       '¿Participas en actividades extracurriculares?', NULL, true, 3,
       '{}'::jsonb, '{"mode":"visual","option_icons":{"f6e50041-0000-4000-8000-000000000041":"⚽","f6e50042-0000-4000-8000-000000000042":"📚","f6e50043-0000-4000-8000-000000000043":"🎨"}}'::jsonb),
      ('f6e50024-0000-4000-8000-000000000024', 'f6e50011-0000-4000-8000-000000000011', 'seleccion_multiple',
       '¿Qué áreas te gustan más?', NULL, true, 1,
       '{}'::jsonb, '{"mode":"visual","option_icons":{"f6e50051-0000-4000-8000-000000000051":"🔬","f6e50052-0000-4000-8000-000000000052":"⚽","f6e50053-0000-4000-8000-000000000053":"🎵","f6e50054-0000-4000-8000-000000000054":"📖"}}'::jsonb),
      ('f6e50025-0000-4000-8000-000000000025', 'f6e50011-0000-4000-8000-000000000011', 'si_no',
       '¿Cuentas con apoyo en casa?', NULL, true, 2,
       '{}'::jsonb, '{"mode":"visual"}'::jsonb),
      ('f6e50026-0000-4000-8000-000000000026', 'f6e50011-0000-4000-8000-000000000011', 'numero',
       '¿Cuántas horas estudias en casa?', NULL, true, 3,
       '{"min":0,"max":20,"decimal_places":0}'::jsonb, '{"width":"full"}'::jsonb),
      ('f6e50027-0000-4000-8000-000000000027', 'f6e50011-0000-4000-8000-000000000011', 'fecha',
       'Fecha de la última reunión con tutores', NULL, false, 4,
       '{"min_date":null,"max_date":null}'::jsonb, '{"width":"full"}'::jsonb),
      ('f6e50028-0000-4000-8000-000000000028', 'f6e50010-0000-4000-8000-000000000010', 'escala',
       '¿Qué tan contento te sientes en la escuela?', 'Escala visual con estrellas', true, 4,
       '{"min":1,"max":5,"min_label":"Nada contento","max_label":"Muy contento"}'::jsonb,
       '{"mode":"visual","style":"stars"}'::jsonb),
      ('f6e50029-0000-4000-8000-000000000029', 'f6e50011-0000-4000-8000-000000000011', 'seleccion_opciones',
       'Elige tu curso favorito', NULL, false, 5,
       '{"allow_multiple":false}'::jsonb, '{"width":"full"}'::jsonb),
      ('f6e50030-0000-4000-8000-000000000030', 'f6e50010-0000-4000-8000-000000000010', 'escala',
       'Escala tradicional de 1 a 10', 'Presentación normal', true, 5,
       '{"min":1,"max":10,"min_label":"Mínimo","max_label":"Máximo"}'::jsonb,
       '{"mode":"normal"}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ------------------------------------------------------------
-- Opciones (mismo criterio: solo si aún no existen)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM encuesta_opciones o
    JOIN encuesta_preguntas p ON p.id = o.question_id
    JOIN encuesta_secciones s ON s.id = p.section_id
    WHERE s.version_id = 'f6e50002-0000-4000-8000-000000000002'
  ) THEN
    INSERT INTO encuesta_opciones (id, question_id, label, sort_order)
    VALUES
      ('f6e50041-0000-4000-8000-000000000041', 'f6e50023-0000-4000-8000-000000000023', 'Sí, deportes', 1),
      ('f6e50042-0000-4000-8000-000000000042', 'f6e50023-0000-4000-8000-000000000023', 'Sí, estudios', 2),
      ('f6e50043-0000-4000-8000-000000000043', 'f6e50023-0000-4000-8000-000000000023', 'No participo', 3),
      ('f6e50051-0000-4000-8000-000000000051', 'f6e50024-0000-4000-8000-000000000024', 'Ciencias', 1),
      ('f6e50052-0000-4000-8000-000000000052', 'f6e50024-0000-4000-8000-000000000024', 'Deporte', 2),
      ('f6e50053-0000-4000-8000-000000000053', 'f6e50024-0000-4000-8000-000000000024', 'Música', 3),
      ('f6e50054-0000-4000-8000-000000000054', 'f6e50024-0000-4000-8000-000000000024', 'Lectura', 4),
      ('f6e50061-0000-4000-8000-000000000061', 'f6e50029-0000-4000-8000-000000000029', '1° A', 1),
      ('f6e50062-0000-4000-8000-000000000062', 'f6e50029-0000-4000-8000-000000000029', '2° B', 2),
      ('f6e50063-0000-4000-8000-000000000063', 'f6e50029-0000-4000-8000-000000000029', '3° A', 3)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ------------------------------------------------------------
-- V1 se publica recién con la estructura cargada
-- (en re-ejecuciones ya está publicada: el WHERE la deja intacta)
-- ------------------------------------------------------------
UPDATE encuesta_versiones
SET status = 'published', published_at = '2026-03-01T10:00:00-05:00'
WHERE id = 'f6e50002-0000-4000-8000-000000000002'
  AND status = 'draft';

-- ------------------------------------------------------------
-- Aplicaciones con tokens fijos (una por respondiente)
--   A1/A2: ventana abierta (activas)
--   A3:    vencida (para ampliar plazo)
--   A4:    programada (aún no disponible)
--   A5:    completada (agradecimiento / reanudación)
-- ------------------------------------------------------------
INSERT INTO encuesta_aplicaciones (
  id, version_id, institution_id, respondent_student_id, respondent_user_id,
  year, section_name, grade_id, started_at, ends_at, status, progress, access_token
)
VALUES
  ('f6e50101-0000-4000-8000-000000000101', 'f6e50002-0000-4000-8000-000000000002',
   'c3469fe6-206d-4536-90f9-8179791235eb', 'ca5e0001-0000-4000-8000-000000000001', NULL,
   2026, NULL, NULL, '2026-03-01T08:00:00-05:00', '2026-12-31T23:59:00-05:00', 'active', 0,
   'f6seedtokenopen0001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
  ('f6e50102-0000-4000-8000-000000000102', 'f6e50002-0000-4000-8000-000000000002',
   'c3469fe6-206d-4536-90f9-8179791235eb', 'ca5e0002-0000-4000-8000-000000000002', NULL,
   2026, NULL, NULL, '2026-03-01T08:00:00-05:00', '2026-12-31T23:59:00-05:00', 'active', 45,
   'f6seedtokenopen0002bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
  ('f6e50103-0000-4000-8000-000000000103', 'f6e50002-0000-4000-8000-000000000002',
   'c3469fe6-206d-4536-90f9-8179791235eb', 'ca5e0003-0000-4000-8000-000000000003', NULL,
   2026, NULL, NULL, '2026-01-10T08:00:00-05:00', '2026-09-01T23:59:00-05:00', 'expired', 30,
   'f6seedtokenexpired0003cccccccccccccccccccccccccccccccccccc'),
  ('f6e50104-0000-4000-8000-000000000104', 'f6e50002-0000-4000-8000-000000000002',
   'c3469fe6-206d-4536-90f9-8179791235eb', 'ca5e0004-0000-4000-8000-000000000004', NULL,
   2026, NULL, NULL, '2026-11-01T08:00:00-05:00', '2026-12-15T23:59:00-05:00', 'scheduled', 0,
   'f6seedtokenfuture0004dddddddddddddddddddddddddddddddddddd'),
  ('f6e50105-0000-4000-8000-000000000105', 'f6e50002-0000-4000-8000-000000000002',
   'c3469fe6-206d-4536-90f9-8179791235eb', 'ca5e0001-0000-4000-8000-000000000001', NULL,
   2026, NULL, NULL, '2026-01-05T08:00:00-05:00', '2026-01-20T23:59:00-05:00', 'completed', 100,
   'f6seedtokendone00005eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')
ON CONFLICT (id) DO NOTHING;

-- Restaura ventanas/estados si un e2e previo los modificó
UPDATE encuesta_aplicaciones SET status = 'active', progress = 0,
       started_at = '2026-03-01T08:00:00-05:00', ends_at = '2026-12-31T23:59:00-05:00'
WHERE id = 'f6e50101-0000-4000-8000-000000000101';

UPDATE encuesta_aplicaciones SET status = 'active', progress = 45,
       started_at = '2026-03-01T08:00:00-05:00', ends_at = '2026-12-31T23:59:00-05:00'
WHERE id = 'f6e50102-0000-4000-8000-000000000102';

UPDATE encuesta_aplicaciones SET status = 'expired', progress = 30,
       started_at = '2026-01-10T08:00:00-05:00', ends_at = '2026-09-01T23:59:00-05:00',
       extended_at = NULL, extended_by = NULL
WHERE id = 'f6e50103-0000-4000-8000-000000000103';

UPDATE encuesta_aplicaciones SET status = 'scheduled', progress = 0,
       started_at = '2026-11-01T08:00:00-05:00', ends_at = '2026-12-15T23:59:00-05:00'
WHERE id = 'f6e50104-0000-4000-8000-000000000104';

UPDATE encuesta_aplicaciones SET status = 'completed', progress = 100,
       started_at = '2026-01-05T08:00:00-05:00', ends_at = '2026-01-20T23:59:00-05:00'
WHERE id = 'f6e50105-0000-4000-8000-000000000105';

-- Limpia respuestas previas de A1/A2 (estado inicial del e2e)
DELETE FROM encuesta_respuestas
WHERE application_id IN (
  'f6e50101-0000-4000-8000-000000000101',
  'f6e50102-0000-4000-8000-000000000102'
);

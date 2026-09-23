-- Seed data para Evolución Psicológica
-- Datos iniciales de prueba

-- Insertar institución de prueba
INSERT INTO institutions (id, name, code) VALUES
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Institución Educativa Modelo', 'IEM001');

-- Insertar niveles educativos
INSERT INTO niveles_educativos (id, name, order_number, institution_id) VALUES
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Primaria', 1, 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),
    ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'Secundaria', 2, 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');

-- Insertar grados de Primaria
INSERT INTO grados (id, name, order_number, nivel_id) VALUES
    ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a41', 'Primero', 1, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'),
    ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a42', 'Segundo', 2, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'),
    ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a43', 'Tercero', 3, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'),
    ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'Cuarto', 4, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'),
    ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a45', 'Quinto', 5, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'),
    ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a46', 'Sexto', 6, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22');

-- Insertar grados de Secundaria
INSERT INTO grados (id, name, order_number, nivel_id) VALUES
    ('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a51', 'Primero', 1, 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'),
    ('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a52', 'Segundo', 2, 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'),
    ('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a53', 'Tercero', 3, 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'),
    ('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a54', 'Cuarto', 4, 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'),
    ('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55', 'Quinto', 5, 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33');

-- Insertar usuario Global de prueba (debe coincidir con auth.users)
-- NOTA: Este usuario debe crearse primero en Supabase Auth
-- INSERT INTO perfiles (user_id, full_name, document_number, role, institution_id)
-- VALUES ('your-auth-user-id', 'Administrador Global', '00000000', 'global', NULL);

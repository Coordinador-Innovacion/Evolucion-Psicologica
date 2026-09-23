-- Migración 015: Perfiles de usuario
-- Evolución Psicológica

-- Tabla de perfiles de usuario
-- (creada en 014 para que get_user_role()/las políticas de 014 tengan la tabla;
--  esta migración añade índices, RLS, políticas y el trigger de alta)
CREATE TABLE IF NOT EXISTS perfiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    document_number VARCHAR(50) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (
        role IN ('global', 'director', 'admin_ie', 'coordinador', 'docente', 'psicologo')
    ),
    institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Un usuario solo puede tener un perfil
    UNIQUE(user_id)
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_perfiles_user ON perfiles(user_id);
CREATE INDEX idx_perfiles_role ON perfiles(role);
CREATE INDEX idx_perfiles_institution ON perfiles(institution_id);

-- Triggers para updated_at
CREATE TRIGGER update_perfiles_updated_at
    BEFORE UPDATE ON perfiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Habilitar RLS
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;

-- Políticas para perfiles
-- Reglas de permisos para creación/asignación de roles:
-- - Global Admin: Único rol que puede crear Director y Admin I.E.
-- - Director: Puede administrar personal permitido (coordinador, docente, psicologo) de su I.E.
-- - Admin I.E.: No puede crear ni asignar Director
-- - Psicólogo: No es un rol administrativo de personal

-- SELECT: cada usuario ve su propio perfil
CREATE POLICY "Users can view own profile"
    ON perfiles FOR SELECT
    USING (user_id = auth.uid());

-- SELECT: Global ve todos los perfiles
CREATE POLICY "Global can view all profiles"
    ON perfiles FOR SELECT
    USING (is_global_user());

-- SELECT: Director ve perfiles de su institución
CREATE POLICY "Director can view profiles in their institution"
    ON perfiles FOR SELECT
    USING (
        get_user_role() = 'director' AND
        institution_id = get_user_institution()
    );

-- SELECT: Coordinador ve perfiles de su institución
CREATE POLICY "Coordinator can view profiles in their institution"
    ON perfiles FOR SELECT
    USING (
        get_user_role() = 'coordinador' AND
        institution_id = get_user_institution()
    );

-- INSERT: Solo Global puede crear perfiles con rol director o admin_ie
CREATE POLICY "Global can create Director and Admin I.E. profiles"
    ON perfiles FOR INSERT
    WITH CHECK (
        is_global_user() AND
        role IN ('global', 'director', 'admin_ie')
    );

-- INSERT: Director puede crear perfiles con roles permitidos (coordinador, docente, psicologo)
CREATE POLICY "Director can create allowed staff profiles"
    ON perfiles FOR INSERT
    WITH CHECK (
        get_user_role() = 'director' AND
        role IN ('coordinador', 'docente', 'psicologo') AND
        institution_id = get_user_institution()
    );

-- UPDATE: Solo Global puede modificar roles director o admin_ie
CREATE POLICY "Global can update Director and Admin I.E. profiles"
    ON perfiles FOR UPDATE
    USING (
        is_global_user() AND
        role IN ('global', 'director', 'admin_ie')
    );

-- UPDATE: Director puede modificar perfiles de su institución (no roles protegidos)
CREATE POLICY "Director can update staff profiles in their institution"
    ON perfiles FOR UPDATE
    USING (
        get_user_role() = 'director' AND
        institution_id = get_user_institution() AND
        role IN ('coordinador', 'docente', 'psicologo')
    );

-- DELETE: Solo Global puede eliminar perfiles
CREATE POLICY "Global can delete any profile"
    ON perfiles FOR DELETE
    USING (is_global_user());

-- Función para crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO perfiles (user_id, full_name, document_number, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'document_number', ''),
        COALESCE(NEW.raw_user_meta_data->>'role', 'docente')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para crear perfil al crear usuario
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

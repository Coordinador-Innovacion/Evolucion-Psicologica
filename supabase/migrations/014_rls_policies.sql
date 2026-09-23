-- Migración 014: Row Level Security (RLS)
-- Evolución Psicológica

-- Tabla perfiles: necesaria antes de get_user_role()/get_user_institution()
-- y de las políticas que referencian perfiles (015 la reutiliza con IF NOT EXISTS).
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
    UNIQUE(user_id)
);

-- Habilitar RLS en todas las tablas
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE niveles_educativos ENABLE ROW LEVEL SECURITY;
ALTER TABLE grados ENABLE ROW LEVEL SECURITY;
ALTER TABLE estudiantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE periodos_escolares ENABLE ROW LEVEL SECURITY;
ALTER TABLE familiares ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnosticos_anuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE necesidades_especiales ENABLE ROW LEVEL SECURITY;
ALTER TABLE derivaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE casos ENABLE ROW LEVEL SECURITY;
ALTER TABLE caso_responsables_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE atenciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE transferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE licencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE licencia_codigos ENABLE ROW LEVEL SECURITY;
ALTER TABLE lotes_promocion ENABLE ROW LEVEL SECURITY;
ALTER TABLE acciones_promocion ENABLE ROW LEVEL SECURITY;
ALTER TABLE excepciones_promocion ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;

-- Crear función para obtener el rol del usuario actual
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
BEGIN
    RETURN (
        SELECT role
        FROM perfiles
        WHERE user_id = auth.uid()
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear función para obtener la institución del usuario actual
CREATE OR REPLACE FUNCTION get_user_institution()
RETURNS UUID AS $$
BEGIN
    RETURN (
        SELECT institution_id
        FROM perfiles
        WHERE user_id = auth.uid()
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear función para verificar si el usuario es Global
CREATE OR REPLACE FUNCTION is_global_user()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (get_user_role() = 'global');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Políticas para institutions
CREATE POLICY "Global users can view all institutions"
    ON institutions FOR SELECT
    USING (is_global_user());

CREATE POLICY "Users can view their own institution"
    ON institutions FOR SELECT
    USING (id = get_user_institution());

CREATE POLICY "Global users can insert institutions"
    ON institutions FOR INSERT
    WITH CHECK (is_global_user());

CREATE POLICY "Global users can update institutions"
    ON institutions FOR UPDATE
    USING (is_global_user());

CREATE POLICY "Global users can delete institutions"
    ON institutions FOR DELETE
    USING (is_global_user());

-- Políticas para niveles_educativos
CREATE POLICY "Users can view levels in their institution"
    ON niveles_educativos FOR SELECT
    USING (
        institution_id = get_user_institution() OR
        is_global_user()
    );

CREATE POLICY "Global and Director users can manage levels"
    ON niveles_educativos FOR ALL
    USING (
        is_global_user() OR
        (get_user_role() IN ('director', 'admin_ie') AND
         institution_id = get_user_institution())
    );

-- Políticas para grados
CREATE POLICY "Users can view grades in their institution"
    ON grados FOR SELECT
    USING (
        nivel_id IN (
            SELECT id FROM niveles_educativos
            WHERE institution_id = get_user_institution()
        ) OR
        is_global_user()
    );

CREATE POLICY "Global and Director users can manage grades"
    ON grados FOR ALL
    USING (
        is_global_user() OR
        (get_user_role() IN ('director', 'admin_ie') AND
         nivel_id IN (
             SELECT id FROM niveles_educativos
             WHERE institution_id = get_user_institution()
         ))
    );

-- Políticas para estudiantes
CREATE POLICY "Users can view students in their institution"
    ON estudiantes FOR SELECT
    USING (
        id IN (
            SELECT student_id FROM periodos_escolares
            WHERE institution_id = get_user_institution()
        ) OR
        is_global_user()
    );

CREATE POLICY "Coordinator and Director can manage students"
    ON estudiantes FOR ALL
    USING (
        is_global_user() OR
        get_user_role() IN ('director', 'admin_ie', 'coordinador')
    );

-- Políticas para periodos_escolares
CREATE POLICY "Users can view periods in their institution"
    ON periodos_escolares FOR SELECT
    USING (
        institution_id = get_user_institution() OR
        is_global_user()
    );

CREATE POLICY "Coordinator and Director can manage periods"
    ON periodos_escolares FOR ALL
    USING (
        is_global_user() OR
        (get_user_role() IN ('director', 'admin_ie', 'coordinador') AND
         institution_id = get_user_institution())
    );

-- Políticas para familiares
CREATE POLICY "Users can view family members of students in their institution"
    ON familiares FOR SELECT
    USING (
        student_id IN (
            SELECT student_id FROM periodos_escolares
            WHERE institution_id = get_user_institution()
        ) OR
        is_global_user()
    );

CREATE POLICY "Coordinator and Director can manage family members"
    ON familiares FOR ALL
    USING (
        is_global_user() OR
        get_user_role() IN ('director', 'admin_ie', 'coordinador')
    );

-- Políticas para diagnosticos_anuales
-- Matriz de permisos según documentación del proyecto:

-- Global: acceso completo
CREATE POLICY "Global can view all diagnostics"
    ON diagnosticos_anuales FOR SELECT
    USING (is_global_user());

-- Psicólogo: acceso clínico completo
CREATE POLICY "Psychologist can view all diagnostics"
    ON diagnosticos_anuales FOR SELECT
    USING (get_user_role() = 'psicologo');

-- Coordinador: proyección institucional (sin contenido clínico completo)
CREATE POLICY "Coordinator can view institutional diagnostics"
    ON diagnosticos_anuales FOR SELECT
    USING (
        get_user_role() = 'coordinador' AND
        student_id IN (
            SELECT student_id FROM periodos_escolares
            WHERE institution_id = get_user_institution()
        )
    );

-- Estudiante: ve y edita su propio diagnóstico (flujo web)
CREATE POLICY "Student can view own diagnostic"
    ON diagnosticos_anuales FOR SELECT
    USING (
        student_id IN (
            SELECT id FROM estudiantes
            WHERE document_number = (
                SELECT document_number FROM perfiles
                WHERE user_id = auth.uid()
            )
        )
    );

-- Estudiante puede crear su propio diagnóstico
CREATE POLICY "Student can create own diagnostic"
    ON diagnosticos_anuales FOR INSERT
    WITH CHECK (
        student_id IN (
            SELECT id FROM estudiantes
            WHERE document_number = (
                SELECT document_number FROM perfiles
                WHERE user_id = auth.uid()
            )
        )
    );

-- Estudiante puede actualizar su propio diagnóstico (autosave)
CREATE POLICY "Student can update own diagnostic"
    ON diagnosticos_anuales FOR UPDATE
    USING (
        student_id IN (
            SELECT id FROM estudiantes
            WHERE document_number = (
                SELECT document_number FROM perfiles
                WHERE user_id = auth.uid()
            )
        )
    );

-- Director, Admin I.E., Docente: SIN acceso al diagnóstico clínico
-- (No se crean políticas de SELECT para estos roles)

-- Global y Psicólogo pueden gestionar todos los diagnósticos
CREATE POLICY "Global and Psychologist can manage all diagnostics"
    ON diagnosticos_anuales FOR ALL
    USING (
        is_global_user() OR
        get_user_role() = 'psicologo'
    );

-- Políticas para necesidades_especiales
-- Matriz de permisos:
-- Global: acceso completo
-- Psicólogo: acceso clínico completo
-- Director/Admin I.E.: información de su institución
-- Docente: solo orientación informativa (no clínica)

-- Global puede ver todo
CREATE POLICY "Global can view all special needs"
    ON necesidades_especiales FOR SELECT
    USING (is_global_user());

-- Psicólogo ve información clínica completa
CREATE POLICY "Psychologist can view all special needs"
    ON necesidades_especiales FOR SELECT
    USING (get_user_role() = 'psicologo');

-- Director/Admin I.E. ven información de su institución
CREATE POLICY "Director can view institution special needs"
    ON necesidades_especiales FOR SELECT
    USING (
        get_user_role() IN ('director', 'admin_ie') AND
        student_id IN (
            SELECT student_id FROM periodos_escolares
            WHERE institution_id = get_user_institution()
        )
    );

-- Docente solo ve información de sus estudiantes
-- La aplicación debe filtrar campos: solo teacher_orientation, no clinical_description
CREATE POLICY "Teacher can view special needs for their students"
    ON necesidades_especiales FOR SELECT
    USING (
        get_user_role() = 'docente' AND
        student_id IN (
            SELECT student_id FROM periodos_escolares
            WHERE institution_id = get_user_institution()
        )
    );

-- Global y Psicólogo pueden gestionar
CREATE POLICY "Global and Psychologist can manage special needs"
    ON necesidades_especiales FOR ALL
    USING (
        is_global_user() OR
        get_user_role() = 'psicologo'
    );

-- Políticas para derivaciones
CREATE POLICY "Users can view referrals in their institution"
    ON derivaciones FOR SELECT
    USING (
        school_period_id IN (
            SELECT id FROM periodos_escolares
            WHERE institution_id = get_user_institution()
        ) OR
        is_global_user()
    );

CREATE POLICY "Coordinator and Director can manage referrals"
    ON derivaciones FOR ALL
    USING (
        is_global_user() OR
        get_user_role() IN ('director', 'admin_ie', 'coordinador', 'docente')
    );

-- Políticas para casos
CREATE POLICY "Users can view cases in their institution"
    ON casos FOR SELECT
    USING (
        student_id IN (
            SELECT student_id FROM periodos_escolares
            WHERE institution_id = get_user_institution()
        ) OR
        is_global_user()
    );

-- Solo Psicólogo puede gestionar casos
CREATE POLICY "Psychologist can manage cases"
    ON casos FOR ALL
    USING (
        is_global_user() OR
        get_user_role() = 'psicologo'
    );

-- Políticas para caso_responsables_historial
CREATE POLICY "Users can view case history in their institution"
    ON caso_responsables_historial FOR SELECT
    USING (
        caso_id IN (
            SELECT id FROM casos
            WHERE student_id IN (
                SELECT student_id FROM periodos_escolares
                WHERE institution_id = get_user_institution()
            )
        ) OR
        is_global_user()
    );

CREATE POLICY "Psychologist can manage case history"
    ON caso_responsables_historial FOR ALL
    USING (
        is_global_user() OR
        get_user_role() = 'psicologo'
    );

-- Políticas para atenciones
CREATE POLICY "Users can view attentions in their institution"
    ON atenciones FOR SELECT
    USING (
        caso_id IN (
            SELECT id FROM casos
            WHERE student_id IN (
                SELECT student_id FROM periodos_escolares
                WHERE institution_id = get_user_institution()
            )
        ) OR
        is_global_user()
    );

-- Solo Psicólogo puede gestionar atenciones
CREATE POLICY "Psychologist can manage attentions"
    ON atenciones FOR ALL
    USING (
        is_global_user() OR
        get_user_role() = 'psicologo'
    );

-- Políticas para transferencias
-- V1: Institución B solicita, Institución A (Director) autoriza

-- Usuarios ven transferencias donde su institución es origen o destino
CREATE POLICY "Users can view transfers involving their institution"
    ON transferencias FOR SELECT
    USING (
        origin_institution_id = get_user_institution() OR
        destination_institution_id = get_user_institution() OR
        is_global_user()
    );

-- Coordinador o Director de Institución B pueden crear solicitudes
CREATE POLICY "Destination institution can request transfers"
    ON transferencias FOR INSERT
    WITH CHECK (
        get_user_role() IN ('director', 'coordinador') AND
        destination_institution_id = get_user_institution()
    );

-- Director de Institución A (origen) puede autorizar/rechazar
CREATE POLICY "Director can authorize transfers from their institution"
    ON transferencias FOR UPDATE
    USING (
        get_user_role() = 'director' AND
        origin_institution_id = get_user_institution()
    );

-- Global puede gestionar todas las transferencias (override)
CREATE POLICY "Global can manage all transfers"
    ON transferencias FOR ALL
    USING (is_global_user());

-- Políticas para licencias
CREATE POLICY "Global can view all licenses"
    ON licencias FOR SELECT
    USING (is_global_user());

CREATE POLICY "Users can view license for their institution"
    ON licencias FOR SELECT
    USING (institution_id = get_user_institution());

CREATE POLICY "Global can manage licenses"
    ON licencias FOR ALL
    USING (is_global_user());

-- Políticas para licencia_codigos
CREATE POLICY "Global can view all license codes"
    ON licencia_codigos FOR SELECT
    USING (is_global_user());

CREATE POLICY "Users can view codes for their institution license"
    ON licencia_codigos FOR SELECT
    USING (
        license_id IN (
            SELECT id FROM licencias
            WHERE institution_id = get_user_institution()
        )
    );

CREATE POLICY "Global can manage license codes"
    ON licencia_codigos FOR ALL
    USING (is_global_user());

-- Políticas para lotes_promocion
CREATE POLICY "Users can view promotion batches in their institution"
    ON lotes_promocion FOR SELECT
    USING (
        institution_id = get_user_institution() OR
        is_global_user()
    );

CREATE POLICY "Global and Coordinator can manage promotion batches"
    ON lotes_promocion FOR ALL
    USING (
        is_global_user() OR
        (get_user_role() = 'coordinador' AND
         institution_id = get_user_institution())
    );

-- Políticas para acciones_promocion
CREATE POLICY "Users can view promotion actions in their institution"
    ON acciones_promocion FOR SELECT
    USING (
        batch_id IN (
            SELECT id FROM lotes_promocion
            WHERE institution_id = get_user_institution()
        ) OR
        is_global_user()
    );

CREATE POLICY "Global and Coordinator can manage promotion actions"
    ON acciones_promocion FOR ALL
    USING (
        is_global_user() OR
        (get_user_role() = 'coordinador' AND
         batch_id IN (
             SELECT id FROM lotes_promocion
             WHERE institution_id = get_user_institution()
         ))
    );

-- Políticas para excepciones_promocion
CREATE POLICY "Users can view promotion exceptions in their institution"
    ON excepciones_promocion FOR SELECT
    USING (
        action_id IN (
            SELECT id FROM acciones_promocion
            WHERE batch_id IN (
                SELECT id FROM lotes_promocion
                WHERE institution_id = get_user_institution()
            )
        ) OR
        is_global_user()
    );

CREATE POLICY "Global and Coordinator can manage promotion exceptions"
    ON excepciones_promocion FOR ALL
    USING (
        is_global_user() OR
        (get_user_role() = 'coordinador' AND
         action_id IN (
             SELECT id FROM acciones_promocion
             WHERE batch_id IN (
                 SELECT id FROM lotes_promocion
                 WHERE institution_id = get_user_institution()
             )
         ))
    );

-- Políticas para auditoria
-- Solo Global puede ver auditoría completa
CREATE POLICY "Global can view all audit logs"
    ON auditoria FOR SELECT
    USING (is_global_user());

-- Usuarios pueden ver su propia auditoría
CREATE POLICY "Users can view own audit logs"
    ON auditoria FOR SELECT
    USING (user_id = auth.uid());

-- Sistema inserta logs (no usuarios directamente)
CREATE POLICY "System can insert audit logs"
    ON auditoria FOR INSERT
    WITH CHECK (true);

-- Políticas para documentos
CREATE POLICY "Users can view documents in their institution"
    ON documentos FOR SELECT
    USING (
        student_id IN (
            SELECT student_id FROM periodos_escolares
            WHERE institution_id = get_user_institution()
        ) OR
        is_global_user()
    );

CREATE POLICY "Coordinator and Director can manage documents"
    ON documentos FOR ALL
    USING (
        is_global_user() OR
        get_user_role() IN ('director', 'admin_ie', 'coordinador')
    );

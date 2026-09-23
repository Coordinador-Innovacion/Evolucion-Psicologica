-- Migración 041: fix list_student_documents — ORDER BY dentro de json_agg
-- Evolución Psicológica
--
-- En 037, ORDER BY d.created_at DESC estaba fuera de json_agg:
--   SELECT json_agg(...) FROM ... ORDER BY d.created_at DESC
-- PostgreSQL exige que la columna del ORDER BY esté en GROUP BY o en un
-- agregado; la corrección es llevar ORDER BY dentro de json_agg(... ORDER BY ...).

CREATE OR REPLACE FUNCTION list_student_documents(
    p_student_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_institution UUID;
BEGIN
    -- 1. Obtener usuario
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no autenticado');
    END IF;

    -- 2. Verificar rol autorizado para documentos
    IF v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador', 'psicologo') THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para ver documentos');
    END IF;

    -- 3. Verificar acceso por institución
    IF v_user_role != 'global' THEN
        IF v_user_institution IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'Usuario sin institución asignada');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM periodos_escolares
            WHERE student_id = p_student_id
            AND institution_id = v_user_institution
        ) THEN
            RETURN json_build_object('success', false, 'error', 'No tiene acceso a los documentos de este estudiante');
        END IF;
    END IF;

    -- 4. Retornar documentos (ORDER BY dentro de json_agg)
    RETURN (
        SELECT json_build_object(
            'success', true,
            'documents', (
                SELECT json_agg(
                    json_build_object(
                        'id', d.id,
                        'filename', d.filename,
                        'mime_type', d.mime_type,
                        'size_bytes', d.size_bytes,
                        'description', d.description,
                        'uploaded_by', d.uploaded_by,
                        'created_at', d.created_at
                    )
                    ORDER BY d.created_at DESC
                )
                FROM documentos d
                WHERE d.student_id = p_student_id
            )
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'list_student_documents'
    ) THEN
        RAISE EXCEPTION 'Error: list_student_documents no fue recreada';
    END IF;
END $$;

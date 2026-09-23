-- Migración 034: Storage — Bucket, Políticas y Funciones (T53)
-- Evolución Psicológica

-- ============================================================
-- BUCKET
-- ============================================================

-- Crear bucket de documentos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'documentos',
    'documentos',
    false,
    52428800, -- 50 MiB
    ARRAY[
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'application/rtf'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================
-- STORAGE POLICIES
-- ============================================================

-- Política SELECT: usuarios de la misma institución ven documentos de sus estudiantes
CREATE POLICY "Institution users can view student documents"
    ON storage.objects
    FOR SELECT
    USING (
        bucket_id = 'documentos'
        AND (
            -- Global ve todo
            is_global_user()
            OR
            -- Usuarios de la institución ven documentos de sus estudiantes
            (storage.foldername(name))[1] IN (
                SELECT i.id::text FROM institutions i
                JOIN perfiles p ON p.institution_id = i.id
                WHERE p.user_id = auth.uid()
            )
        )
    );

-- Política INSERT: roles autorizados suben documentos
CREATE POLICY "Authorized roles can upload documents"
    ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'documentos'
        AND (
            is_global_user()
            OR
            get_user_role() IN ('global', 'director', 'admin_ie', 'coordinador', 'psicologo')
        )
        -- La carpeta raíz debe ser el institution_id
        AND (storage.foldername(name))[1] = (
            SELECT COALESCE(i.id::text, '') FROM perfiles p
            JOIN institutions i ON i.id = p.institution_id
            WHERE p.user_id = auth.uid()
            LIMIT 1
        )
    );

-- Política DELETE: solo Global puede eliminar (soft delete implícito)
CREATE POLICY "Only global can delete documents"
    ON storage.objects
    FOR DELETE
    USING (
        bucket_id = 'documentos'
        AND is_global_user()
    );

-- ============================================================
-- T53: FUNCIÓN — Subir documento con validación
-- ============================================================

CREATE OR REPLACE FUNCTION upload_document(
    p_student_id UUID,
    p_filename VARCHAR(255),
    p_mime_type VARCHAR(100),
    p_size_bytes INTEGER,
    p_storage_path TEXT,
    p_description TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_institution UUID;
    v_new_doc_id UUID;
BEGIN
    -- 1. Obtener usuario
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no autenticado');
    END IF;

    -- 2. Verificar permisos
    IF v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador', 'psicologo') THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para subir documentos');
    END IF;

    -- 3. Verificar que el estudiante existe y pertenece a la institución
    IF v_user_role != 'global' THEN
        IF v_user_institution IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'Usuario sin institución asignada');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM periodos_escolares
            WHERE student_id = p_student_id
            AND institution_id = v_user_institution
        ) THEN
            RETURN json_build_object('success', false, 'error', 'El estudiante no pertenece a su institución');
        END IF;
    END IF;

    -- 4. Validar campos
    IF p_filename IS NULL OR TRIM(p_filename) = '' THEN
        RETURN json_build_object('success', false, 'error', 'El nombre del archivo es obligatorio');
    END IF;

    IF p_size_bytes <= 0 THEN
        RETURN json_build_object('success', false, 'error', 'El tamaño del archivo debe ser mayor a 0');
    END IF;

    IF p_size_bytes > 52428800 THEN
        RETURN json_build_object('success', false, 'error', 'El archivo excede el límite de 50 MiB');
    END IF;

    -- 5. Registrar metadatos
    INSERT INTO documentos (
        student_id, filename, mime_type, size_bytes,
        storage_path, uploaded_by, description
    ) VALUES (
        p_student_id, TRIM(p_filename), p_mime_type, p_size_bytes,
        p_storage_path, auth.uid(), p_description
    )
    RETURNING id INTO v_new_doc_id;

    -- 6. Auditar
    INSERT INTO auditoria (
        user_id, action, table_name, record_id, new_values
    ) VALUES (
        auth.uid(),
        'document_uploaded',
        'documentos',
        v_new_doc_id,
        json_build_object(
            'student_id', p_student_id,
            'filename', p_filename,
            'mime_type', p_mime_type,
            'size_bytes', p_size_bytes
        )
    );

    RETURN json_build_object(
        'success', true,
        'document_id', v_new_doc_id,
        'message', 'Documento registrado correctamente'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION upload_document(UUID, VARCHAR, VARCHAR, INTEGER, TEXT, TEXT) IS
'Registra metadatos de un documento subido a Storage. T53.';

-- ============================================================
-- T53: FUNCIÓN — Obtener URL firmada para descarga
-- ============================================================

CREATE OR REPLACE FUNCTION get_document_url(
    p_document_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_doc RECORD;
    v_user_role TEXT;
    v_user_institution UUID;
    v_signed_url TEXT;
BEGIN
    -- 1. Obtener usuario
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no autenticado');
    END IF;

    -- 2. Obtener documento
    SELECT * INTO v_doc FROM documentos WHERE id = p_document_id;

    IF v_doc IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Documento no encontrado');
    END IF;

    -- 3. Verificar acceso
    IF v_user_role != 'global' THEN
        IF v_user_institution IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'Usuario sin institución asignada');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM periodos_escolares
            WHERE student_id = v_doc.student_id
            AND institution_id = v_user_institution
        ) THEN
            RETURN json_build_object('success', false, 'error', 'No tiene acceso a este documento');
        END IF;
    END IF;

    -- 4. Generar URL firmada (1 hora de vigencia)
    v_signed_url := storage.sign('documentos', v_doc.storage_path, 3600);

    RETURN json_build_object(
        'success', true,
        'signed_url', v_signed_url,
        'filename', v_doc.filename,
        'mime_type', v_doc.mime_type,
        'size_bytes', v_doc.size_bytes
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION get_document_url(UUID) IS
'Genera URL firmada para descargar un documento. T53.';

-- ============================================================
-- T53: FUNCIÓN — Eliminar documento (soft delete)
-- ============================================================

CREATE OR REPLACE FUNCTION delete_document(
    p_document_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_doc RECORD;
BEGIN
    -- 1. Obtener usuario
    SELECT role INTO v_user_role
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no autenticado');
    END IF;

    -- 2. Solo Global puede eliminar
    IF v_user_role != 'global' THEN
        RETURN json_build_object('success', false, 'error', 'Solo Global puede eliminar documentos');
    END IF;

    -- 3. Obtener documento
    SELECT * INTO v_doc FROM documentos WHERE id = p_document_id;

    IF v_doc IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Documento no encontrado');
    END IF;

    -- 4. Eliminar de Storage
    DELETE FROM storage.objects
    WHERE bucket_id = 'documentos'
    AND name = v_doc.storage_path;

    -- 5. Eliminar metadatos
    DELETE FROM documentos WHERE id = p_document_id;

    -- 6. Auditar
    INSERT INTO auditoria (
        user_id, action, table_name, record_id, old_values
    ) VALUES (
        auth.uid(),
        'document_deleted',
        'documentos',
        p_document_id,
        json_build_object(
            'student_id', v_doc.student_id,
            'filename', v_doc.filename,
            'storage_path', v_doc.storage_path
        )
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Documento eliminado correctamente'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION delete_document(UUID) IS
'Elimina documento de Storage y metadatos. Solo Global. T53.';

-- ============================================================
-- T53: FUNCIÓN — Listar documentos de un estudiante
-- ============================================================

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

    -- 2. Verificar acceso
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

    -- 3. Retornar documentos
    RETURN (
        SELECT json_build_object(
            'success', true,
            'documents', (
                SELECT json_agg(json_build_object(
                    'id', d.id,
                    'filename', d.filename,
                    'mime_type', d.mime_type,
                    'size_bytes', d.size_bytes,
                    'description', d.description,
                    'uploaded_by', d.uploaded_by,
                    'created_at', d.created_at
                ))
                FROM documentos d
                WHERE d.student_id = p_student_id
                ORDER BY d.created_at DESC
            )
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION list_student_documents(UUID) IS
'Lista documentos de un estudiante. T53.';

-- ============================================================
-- VERIFICACIÓN DE INTEGRIDAD
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'upload_document') THEN
        RAISE EXCEPTION 'Error: Función upload_document no fue creada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_document_url') THEN
        RAISE EXCEPTION 'Error: Función get_document_url no fue creada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'delete_document') THEN
        RAISE EXCEPTION 'Error: Función delete_document no fue creada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'list_student_documents') THEN
        RAISE EXCEPTION 'Error: Función list_student_documents no fue creada';
    END IF;
END $$;

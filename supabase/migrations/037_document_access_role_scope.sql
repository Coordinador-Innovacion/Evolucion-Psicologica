-- Migración 037: Documentos — lectura acotada a roles autorizados (T53)
-- Evolución Psicológica
--
-- Corrección pendiente de T53 detectada al recuperar la tarea:
-- 1) get_document_url y list_student_documents NO verificaban el rol: cualquier
--    usuario autenticado de la institución (incluido Docente) podía obtener una
--    URL firmada y listar los documentos de cualquier estudiante.
-- 2) La política SELECT de `documentos` y la SELECT de `storage.objects` eran
--    institution-scope sin acote de rol, por lo que el cliente podía leer
--    metadatos y objetos directamente por la API de Storage/PostgREST.
--
-- Determinación con reglas existentes (no se inventa una regla nueva):
-- - PLAN (Documentos): "Metadatos en PostgreSQL; archivos en Supabase Storage.
--   Acceso coherente con registro y rol."
-- - Los roles que registran documentos ya están definidos en upload_document /
--   política INSERT (global, director, admin_ie, coordinador, psicologo).
-- - La SPECIFY no concede a Docente ninguna función sobre documentos.
-- Por lo tanto, lectura = mismo conjunto de roles que registro, más acote por
-- institución. Si el negocio desea habilitar lectura a otro rol, debe registrar
-- una decisión que modifique este alcance.
--
-- La URL firmada sigue generándose SOLO al momento de acceso y nunca se
-- persiste (regla vigente de T53).

-- ============================================================
-- 1) RLS TABLA documentos — SELECT acotado a roles de documentos
-- ============================================================

DROP POLICY IF EXISTS "Users can view documents in their institution" ON documentos;

CREATE POLICY "Authorized roles can view documents"
    ON documentos FOR SELECT
    USING (
        is_global_user()
        OR (
            get_user_role() IN ('director', 'admin_ie', 'coordinador', 'psicologo')
            AND student_id IN (
                SELECT student_id FROM periodos_escolares
                WHERE institution_id = get_user_institution()
            )
        )
    );

-- ============================================================
-- 2) STORAGE SELECT — mismo acote de rol + carpeta de la institución
-- ============================================================

DROP POLICY IF EXISTS "Institution users can view student documents" ON storage.objects;

CREATE POLICY "Authorized roles can view student documents"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'documentos'
        AND (
            is_global_user()
            OR (
                get_user_role() IN ('director', 'admin_ie', 'coordinador', 'psicologo')
                AND (storage.foldername(name))[1] = get_user_institution()::text
            )
        )
    );

-- ============================================================
-- 3) get_document_url — verificar rol antes de firmar
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
    v_path_parts TEXT[];
BEGIN
    -- 1. Obtener usuario
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no autenticado');
    END IF;

    -- 2. Verificar rol autorizado para documentos
    IF v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador', 'psicologo') THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para acceder a documentos');
    END IF;

    -- 3. Obtener documento
    SELECT * INTO v_doc FROM documentos WHERE id = p_document_id;

    IF v_doc IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Documento no encontrado');
    END IF;

    -- 4. Verificar acceso por institución del estudiante
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

    -- 5. Revalidar estructura del storage_path antes de firmar
    --    (la URL firmada se genera SOLO al momento de acceso; nunca se persiste)
    v_path_parts := string_to_array(v_doc.storage_path, '/');

    IF array_length(v_path_parts, 1) IS DISTINCT FROM 3
       OR v_path_parts[3] IN ('', '.', '..')
       OR v_path_parts[2] IS DISTINCT FROM v_doc.student_id::text THEN
        RETURN json_build_object('success', false, 'error', 'El documento tiene una ruta de almacenamiento inválida');
    END IF;

    IF v_user_role != 'global' THEN
        IF v_path_parts[1] IS DISTINCT FROM v_user_institution::text THEN
            RETURN json_build_object('success', false, 'error', 'No tiene acceso a este documento');
        END IF;
    ELSE
        IF NOT EXISTS (
            SELECT 1 FROM periodos_escolares
            WHERE student_id = v_doc.student_id
            AND institution_id::text = v_path_parts[1]
        ) THEN
            RETURN json_build_object('success', false, 'error', 'El documento tiene una ruta de almacenamiento inválida');
        END IF;
    END IF;

    -- 6. Generar URL firmada (1 hora de vigencia) — temporal, solo para este acceso
    v_signed_url := storage.sign('documentos', v_doc.storage_path, 3600);

    RETURN json_build_object(
        'success', true,
        'signed_url', v_signed_url,
        'expires_in_seconds', 3600,
        'filename', v_doc.filename,
        'mime_type', v_doc.mime_type,
        'size_bytes', v_doc.size_bytes
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION get_document_url(UUID) IS
'Genera URL firmada temporal (1h) SOLO al momento de acceso, tras validar rol autorizado, institución y estructura de path. La URL firmada nunca se persiste. T53.';

-- ============================================================
-- 4) list_student_documents — verificar rol antes de listar
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

    -- 4. Retornar documentos
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

COMMENT ON FUNCTION list_student_documents(UUID) IS
'Lista documentos de un estudiante. Solo roles autorizados para documentos (global, director, admin_ie, coordinador, psicologo), acotado por institución. T53.';

-- ============================================================
-- VERIFICACIÓN DE INTEGRIDAD
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'documentos'
        AND policyname = 'Authorized roles can view documents'
    ) THEN
        RAISE EXCEPTION 'Error: política SELECT de documentos no fue creada';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'documentos'
        AND policyname = 'Users can view documents in their institution'
    ) THEN
        RAISE EXCEPTION 'Error: la política SELECT sin acote de rol de documentos no fue eliminada';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'objects'
        AND schemaname = 'storage'
        AND policyname = 'Authorized roles can view student documents'
    ) THEN
        RAISE EXCEPTION 'Error: política SELECT de storage.objects no fue creada';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'objects'
        AND schemaname = 'storage'
        AND policyname = 'Institution users can view student documents'
    ) THEN
        RAISE EXCEPTION 'Error: la política SELECT sin acote de rol de storage.objects no fue eliminada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_document_url') THEN
        RAISE EXCEPTION 'Error: Función get_document_url no fue recreada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'list_student_documents') THEN
        RAISE EXCEPTION 'Error: Función list_student_documents no fue recreada';
    END IF;
END $$;

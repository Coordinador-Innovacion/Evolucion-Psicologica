-- Migración 035: Documentos y Storage — Correcciones de seguridad y alcance (T53)
-- Evolución Psicológica
--
-- Correcciones supervisadas sobre T53:
-- 1) RLS de `documentos`: la política FOR ALL no acotaba institución y concedía
--    SELECT/UPDATE/DELETE a roles no autorizados por la lógica server-side.
-- 2) Storage INSERT: Global sin institución no podía subir; se habilita bypass Global
--    y se acota la carpeta al estudiante de la institución del usuario.
-- 3) upload_document: validación server-side de la estructura del storage_path para
--    impedir que un cliente manipulado registre rutas de otra institución/estudiante.
-- 4) get_document_url: revalida la estructura del storage_path antes de firmar la URL.
-- 5) delete_document: se documenta su alcance real (eliminación física) y por qué es
--    válido (los documentos NO están clasificados como historia clínica/histórica en
--    la especificación vigente).
-- 6) derivaciones.adjunto_url: se documenta que NO existe relación formal con la
--    entidad `documentos`; la integración queda PENDIENTE DE ESPECIFICACIÓN.
--    Prohibido persistir URLs firmadas temporales como referencia permanente.

-- ============================================================
-- 1) RLS TABLA documentos — reemplazar política permisiva
-- ============================================================

-- La política anterior ("Coordinator and Director can manage documents" FOR ALL)
-- permitía SELECT/UPDATE/DELETE a director/admin_ie/coordinador SIN acotar por
-- institución, y contradecía delete_document (solo Global) y upload_document
-- (roles autorizados con validación de institución).
DROP POLICY IF EXISTS "Coordinator and Director can manage documents" ON documentos;

-- INSERT: roles autorizados (mismo alcance que upload_document) + aislamiento por institución
CREATE POLICY "Authorized roles can insert documents"
    ON documentos FOR INSERT
    WITH CHECK (
        is_global_user()
        OR (
            get_user_role() IN ('director', 'admin_ie', 'coordinador', 'psicologo')
            AND student_id IN (
                SELECT student_id FROM periodos_escolares
                WHERE institution_id = get_user_institution()
            )
        )
    );

-- UPDATE: no se crea política de UPDATE para usuarios directos.
-- Ninguna operación de negocio actualiza filas de `documentos` desde el cliente;
-- cualquier cambio debe pasar por funciones SECURITY DEFINER. Sin política de
-- UPDATE, un cliente manipulado no puede alterar storage_path u otros metadatos
-- para obtener después una URL firmada de un archivo ajeno.

-- DELETE: solo Global (alineado con delete_document)
CREATE POLICY "Only global can delete document metadata"
    ON documentos FOR DELETE
    USING (is_global_user());

-- La política SELECT existente ("Users can view documents in their institution")
-- se mantiene sin cambios: lectura acotada a la institución del usuario o Global.

-- ============================================================
-- 2) STORAGE POLICIES — corrección del INSERT
-- ============================================================

-- Política anterior: exigía folder == institución propia también a Global
-- (COALESCE a '' cuando institution_id es NULL), lo que impedía subir a Global.
DROP POLICY IF EXISTS "Authorized roles can upload documents" ON storage.objects;

CREATE POLICY "Authorized roles can upload documents"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'documentos'
        AND (
            -- Global: bypass total (Constitution/IMPLEMENT: Global bypass)
            is_global_user()
            OR (
                get_user_role() IN ('director', 'admin_ie', 'coordinador', 'psicologo')
                -- Carpeta raíz = institución del usuario
                AND (storage.foldername(name))[1] = get_user_institution()::text
                -- Segundo nivel = estudiante de esa institución
                AND (storage.foldername(name))[2] IN (
                    SELECT student_id::text FROM periodos_escolares
                    WHERE institution_id = get_user_institution()
                )
            )
        )
    );

-- Políticas SELECT y DELETE de storage.objects existentes se mantienen:
-- SELECT: institución (o Global). DELETE: solo Global.

-- ============================================================
-- 3) upload_document — validación server-side del storage_path
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
    v_path_parts TEXT[];
BEGIN
    -- 1. Obtener usuario
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no autenticado');
    END IF;

    -- 2. Verificar permisos por rol
    IF v_user_role NOT IN ('global', 'director', 'admin_ie', 'coordinador', 'psicologo') THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para subir documentos');
    END IF;

    -- 3. Verificar que el estudiante existe y pertenece a la institución del usuario
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

    -- 5. Validar estructura del storage_path: <institution_id>/<student_id>/<filename>
    --    Impide que un cliente manipulado registre la ruta de un archivo de otra
    --    institución/estudiante y obtenga después una URL firmada mediante
    --    get_document_url (defensa en profundidad frente a manipulación del cliente).
    v_path_parts := string_to_array(p_storage_path, '/');

    IF array_length(v_path_parts, 1) IS DISTINCT FROM 3 THEN
        RETURN json_build_object('success', false, 'error', 'Ruta de almacenamiento inválida');
    END IF;

    IF v_path_parts[3] IS NULL OR v_path_parts[3] IN ('', '.', '..') THEN
        RETURN json_build_object('success', false, 'error', 'Ruta de almacenamiento inválida');
    END IF;

    IF v_path_parts[2] IS DISTINCT FROM p_student_id::text THEN
        RETURN json_build_object('success', false, 'error', 'La ruta no corresponde al estudiante indicado');
    END IF;

    IF v_user_role != 'global' THEN
        -- La carpeta raíz debe ser exactamente la institución del usuario
        IF v_path_parts[1] IS DISTINCT FROM v_user_institution::text THEN
            RETURN json_build_object('success', false, 'error', 'La ruta no corresponde a su institución');
        END IF;
    ELSE
        -- Global: la carpeta raíz debe ser una institución donde el estudiante tenga periodo
        IF NOT EXISTS (
            SELECT 1 FROM periodos_escolares
            WHERE student_id = p_student_id
            AND institution_id::text = v_path_parts[1]
        ) THEN
            RETURN json_build_object('success', false, 'error', 'La ruta no corresponde a una institución del estudiante');
        END IF;
    END IF;

    -- 6. Registrar metadatos
    INSERT INTO documentos (
        student_id, filename, mime_type, size_bytes,
        storage_path, uploaded_by, description
    ) VALUES (
        p_student_id, TRIM(p_filename), p_mime_type, p_size_bytes,
        p_storage_path, auth.uid(), p_description
    )
    RETURNING id INTO v_new_doc_id;

    -- 7. Auditar
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
'Registra metadatos de un documento subido a Storage, con validación server-side de rol, institución y estructura de storage_path. T53.';

-- ============================================================
-- 4) get_document_url — revalidación de path + URL temporal solo al acceso
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

    -- 2. Obtener documento
    SELECT * INTO v_doc FROM documentos WHERE id = p_document_id;

    IF v_doc IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Documento no encontrado');
    END IF;

    -- 3. Verificar acceso por institución del estudiante
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

    -- 4. Revalidar estructura del storage_path antes de firmar
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

    -- 5. Generar URL firmada (1 hora de vigencia) — temporal, solo para este acceso
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
'Genera URL firmada temporal (1h) SOLO al momento de acceso, tras validar rol/institución/estructura de path. La URL firmada nunca se persiste. T53.';

-- ============================================================
-- 5) delete_document — alcance documentado (eliminación física)
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

    -- 4. Eliminar objeto de Storage (bucket privado 'documentos')
    DELETE FROM storage.objects
    WHERE bucket_id = 'documentos'
    AND name = v_doc.storage_path;

    -- 5. Eliminar metadatos
    DELETE FROM documentos WHERE id = p_document_id;

    -- 6. Auditar (la auditoría registra la acción; NO sustituye histórico clínico,
    --    porque el documento no está clasificado como historia clínica/histórica)
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
'ALCANCE: eliminación física del archivo en Storage y de sus metadatos, SOLO por Global, con auditoría. Válida porque la especificación vigente (Constitution 8, SPECIFY, CONVERGE) clasifica como historia clínica/histórica a atenciones, casos, derivaciones, periodos e historia del estudiante —NO a la entidad documentos (PLAN la define como documentos/metadatos con acceso por registro y rol, sin regla de inmutabilidad). No se inventa una regla de retención que la especificación no contiene. T53.';

-- ============================================================
-- 6) derivaciones.adjunto_url — relación con documentos NO definida
-- ============================================================

COMMENT ON COLUMN derivaciones.adjunto_url IS
'URL u referencia textual opcional de la derivación. NO existe relación formal definida con la entidad documentos/Storage (sin FK, sin regla de negocio en SPECIFY/CLARIFY/PLAN). NO almacenar aquí URLs firmadas temporales (viven 1h y no son referencia permanente). Integración documento <-> derivación: PENDIENTE DE ESPECIFICACIÓN.';

COMMENT ON TABLE documentos IS
'Metadatos de archivos en bucket privado "documentos". Entidad auxiliar sujeta a rol/institución. Sin relación formal definida con derivaciones (ver derivaciones.adjunto_url).';

-- ============================================================
-- VERIFICACIÓN DE INTEGRIDAD
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'documentos'
        AND policyname = 'Authorized roles can insert documents'
    ) THEN
        RAISE EXCEPTION 'Error: política INSERT de documentos no fue creada';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'documentos'
        AND policyname = 'Only global can delete document metadata'
    ) THEN
        RAISE EXCEPTION 'Error: política DELETE de documentos no fue creada';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'documentos'
        AND policyname = 'Coordinator and Director can manage documents'
    ) THEN
        RAISE EXCEPTION 'Error: la política permisiva FOR ALL de documentos no fue eliminada';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'upload_document'
    ) THEN
        RAISE EXCEPTION 'Error: Función upload_document no fue recreada';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'get_document_url'
    ) THEN
        RAISE EXCEPTION 'Error: Función get_document_url no fue recreada';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'delete_document'
    ) THEN
        RAISE EXCEPTION 'Error: Función delete_document no fue recreada';
    END IF;
END $$;

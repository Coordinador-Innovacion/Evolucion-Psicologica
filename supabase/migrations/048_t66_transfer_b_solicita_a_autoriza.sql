-- Migración 048: T66/A1 — Transferencias: B solicita → A autoriza (DC-007)
-- Evolución Psicológica
--
-- Regla vigente (SPECIFY + A1 confirmada):
--   1. B (destino) solicita  → status pending, SIN efecto inmediato en A
--   2. A (origen) autoriza   → efectos: cierra período A, crea período B,
--      transfiere responsabilidad operativa, A pierde gestión
--   3. A puede rechazar      → status rejected, sin efectos
-- Reemplaza el flujo 019 (A inicia con efecto inmediato → B acepta).
--
-- RLS 014 ya alinea con este flujo (INSERT = destino solicita;
-- UPDATE = director origen autoriza). Se conserva.

-- ============================================================
-- 0. Limpieza de firmas antiguas
-- ============================================================
DROP FUNCTION IF EXISTS initiate_transfer(UUID, UUID);
DROP FUNCTION IF EXISTS accept_transfer(UUID);
DROP FUNCTION IF EXISTS accept_transfer(UUID, UUID, UUID, VARCHAR);
DROP FUNCTION IF EXISTS execute_transfer(UUID, UUID);
DROP FUNCTION IF EXISTS process_transfer(UUID, TEXT, UUID, TEXT);

-- ============================================================
-- 1. Columnas de destino en transferencias (si no existen)
-- ============================================================
ALTER TABLE transferencias
    ADD COLUMN IF NOT EXISTS destination_nivel_id UUID
        REFERENCES niveles_educativos(id) ON DELETE SET NULL;
ALTER TABLE transferencias
    ADD COLUMN IF NOT EXISTS destination_grado_id UUID
        REFERENCES grados(id) ON DELETE SET NULL;
ALTER TABLE transferencias
    ADD COLUMN IF NOT EXISTS section VARCHAR(10);
ALTER TABLE transferencias
    ADD COLUMN IF NOT EXISTS school_year INTEGER;
ALTER TABLE transferencias
    ADD COLUMN IF NOT EXISTS authorized_at TIMESTAMPTZ;
ALTER TABLE transferencias
    ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE transferencias
    ADD COLUMN IF NOT EXISTS reject_reason TEXT;

COMMENT ON COLUMN transferencias.destination_nivel_id IS
'Destino B: nivel al recibir al estudiante (fijado al solicitar).';
COMMENT ON COLUMN transferencias.destination_grado_id IS
'Destino B: grado al recibir al estudiante (fijado al solicitar).';
COMMENT ON COLUMN transferencias.section IS
'Sección destino en B.';
COMMENT ON COLUMN transferencias.school_year IS
'Año escolar de la transferencia (año origen).';
COMMENT ON COLUMN transferencias.authorized_at IS
'Instante en que A autorizó (frontera de transferencia).';
COMMENT ON COLUMN transferencias.rejected_at IS
'Instante en que A rechazó la solicitud.';
COMMENT ON COLUMN transferencias.reject_reason IS
'Motivo de rechazo (obligatorio al rechazar).';

-- requested_by: B solicita; authorized_by: A autoriza (se llena al aprobar/rechazar)

-- ============================================================
-- 2. Índice único parcial: solo pending cuenta como activa
-- ============================================================
DROP INDEX IF EXISTS ux_transferencias_active_caso;
CREATE UNIQUE INDEX ux_transferencias_active_caso
    ON transferencias (caso_id)
    WHERE status = 'pending';

COMMENT ON INDEX ux_transferencias_active_caso IS
'Máx. una solicitud pending por caso (A1). approved/rejected son terminales.';

-- ============================================================
-- 3. initiate_transfer: B (destino) solicita — SIN efecto en A
-- ============================================================
CREATE OR REPLACE FUNCTION initiate_transfer(
    p_caso_id UUID,
    p_origin_institution_id UUID,
    p_destination_nivel_id UUID DEFAULT NULL,
    p_destination_grado_id UUID DEFAULT NULL,
    p_section VARCHAR DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_institution UUID;
    v_caso RECORD;
    v_student_id UUID;
    v_origin_period RECORD;
    v_transfer_id UUID;
    v_school_year INTEGER;
    v_dest_level UUID;
    v_dest_grado UUID;
    v_section_out VARCHAR;
BEGIN
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no autenticado o sin perfil');
    END IF;

    IF v_user_role NOT IN ('global', 'director', 'admin_ie') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo Director o Admin I.E. pueden solicitar transferencias'
        );
    END IF;

    IF v_user_role != 'global' THEN
        IF v_user_institution IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'Usuario sin institución asignada');
        END IF;
    END IF;

    SELECT * INTO v_caso FROM casos WHERE id = p_caso_id;
    IF v_caso IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Caso no encontrado');
    END IF;

    v_student_id := v_caso.student_id;

    -- Período activo en ORIGEN (A) del estudiante
    SELECT id, institution_id, school_year, nivel_id, grado_id, section
    INTO v_origin_period
    FROM periodos_escolares
    WHERE student_id = v_student_id
      AND institution_id = p_origin_institution_id
      AND end_date IS NULL
    ORDER BY school_year DESC, created_at DESC
    LIMIT 1;

    IF v_origin_period IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No se encontró período escolar activo en la institución origen'
        );
    END IF;

    -- Destino fijo en la solicitud: si no es Global, destino = propia institución
    DECLARE
        v_dest_inst UUID;
    BEGIN
        IF v_user_role = 'global' THEN
            -- Global puede solicitar en nombre de una IE destino si se infiere del nivel
            v_dest_inst := (
                SELECT n.institution_id FROM niveles_educativos n
                WHERE n.id = p_destination_nivel_id
                UNION
                SELECT n2.institution_id FROM grados g
                JOIN niveles_educativos n2 ON g.nivel_id = n2.id
                WHERE g.id = p_destination_grado_id
                LIMIT 1
            );
            IF v_dest_inst IS NULL THEN
                RETURN json_build_object(
                    'success', false,
                    'error', 'Global debe indicar nivel o grado destino (institución destino)'
                );
            END IF;
        ELSE
            v_dest_inst := v_user_institution;
        END IF;

        IF v_dest_inst = p_origin_institution_id THEN
            RETURN json_build_object(
                'success', false,
                'error', 'La institución origen y destino deben ser diferentes'
            );
        END IF;

        -- Validar nivel/grado de destino pertenecen a B (o heredan del origen)
        v_dest_level := p_destination_nivel_id;
        v_dest_grado := p_destination_grado_id;

        IF v_dest_level IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM niveles_educativos
            WHERE id = v_dest_level AND institution_id = v_dest_inst
        ) THEN
            RETURN json_build_object('success', false, 'error', 'Nivel destino no pertenece a la institución destino');
        END IF;

        IF v_dest_grado IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM grados g
            JOIN niveles_educativos n ON g.nivel_id = n.id
            WHERE g.id = v_dest_grado AND n.institution_id = v_dest_inst
        ) THEN
            RETURN json_build_object('success', false, 'error', 'Grado destino no pertenece a la institución destino');
        END IF;

        v_section_out := COALESCE(p_section, v_origin_period.section);
        v_school_year := v_origin_period.school_year;

        -- Una sola solicitud activa por caso
        IF EXISTS (
            SELECT 1 FROM transferencias
            WHERE caso_id = p_caso_id AND status = 'pending'
        ) THEN
            RETURN json_build_object(
                'success', false,
                'error', 'Ya existe una transferencia activa para este caso'
            );
        END IF;

        -- Sin efecto inmediato en A: solo INSERT pending
        BEGIN
            INSERT INTO transferencias (
                caso_id,
                origin_institution_id,
                destination_institution_id,
                requested_by,
                authorized_by,
                status,
                destination_nivel_id,
                destination_grado_id,
                section,
                school_year,
                transferred_at
            ) VALUES (
                p_caso_id,
                p_origin_institution_id,
                v_dest_inst,
                auth.uid(),   -- B solicita
                NULL,         -- A aún no autoriza
                'pending',
                v_dest_level,
                v_dest_grado,
                v_section_out,
                v_school_year,
                NULL          -- SIN transferred_at hasta que A autorice
            )
            RETURNING id INTO v_transfer_id;

            INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
            VALUES (
                auth.uid(),
                'transfer_requested',
                'transferencias',
                v_transfer_id,
                json_build_object(
                    'caso_id', p_caso_id,
                    'student_id', v_student_id,
                    'origin_institution_id', p_origin_institution_id,
                    'destination_institution_id', v_dest_inst,
                    'status', 'pending',
                    'role_action', 'B_solicita'
                )
            );

            RETURN json_build_object(
                'success', true,
                'transfer_id', v_transfer_id,
                'status', 'pending',
                'message', 'Solicitud de transferencia creada. La institución origen conserva la gestión hasta que autorice.'
            );
        EXCEPTION WHEN unique_violation THEN
            RETURN json_build_object(
                'success', false,
                'error', 'Ya existe una transferencia activa para este caso'
            );
        WHEN OTHERS THEN
            RETURN json_build_object('success', false, 'error', 'Error al solicitar transferencia: ' || SQLERRM);
        END;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION initiate_transfer(UUID, UUID, UUID, UUID, VARCHAR) IS
'T66/A1 DC-007: B (destino) solicita transferencia → status pending, sin efecto inmediato en A.';

-- ============================================================
-- 4. authorize_transfer: A (origen) autoriza → efectos completos
-- ============================================================
CREATE OR REPLACE FUNCTION authorize_transfer(
    p_transfer_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_institution UUID;
    v_transfer RECORD;
    v_caso RECORD;
    v_new_period_id UUID;
    v_director UUID;
    v_open_row_id UUID;
    v_until TIMESTAMPTZ;
    v_origin_period RECORD;
BEGIN
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no autenticado');
    END IF;

    IF v_user_role NOT IN ('global', 'director', 'admin_ie') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo Director o Admin I.E. pueden autorizar transferencias'
        );
    END IF;

    SELECT * INTO v_transfer
    FROM transferencias
    WHERE id = p_transfer_id
    FOR UPDATE;

    IF v_transfer IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Transferencia no encontrada');
    END IF;

    -- A autoriza: no-global debe ser de la institución ORIGEN
    IF v_user_role != 'global' AND v_transfer.origin_institution_id != v_user_institution THEN
        RETURN json_build_object(
            'success',
            false,
            'error',
            'Solo puede autorizar transferencias de su institución (origen)'
        );
    END IF;

    IF v_transfer.status != 'pending' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo se pueden autorizar transferencias pendientes. Estado actual: ' || v_transfer.status
        );
    END IF;

    SELECT * INTO v_caso FROM casos WHERE id = v_transfer.caso_id;
    IF v_caso IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Caso no encontrado');
    END IF;

    -- Período origen activo
    SELECT id, school_year, section INTO v_origin_period
    FROM periodos_escolares
    WHERE student_id = v_caso.student_id
      AND institution_id = v_transfer.origin_institution_id
      AND end_date IS NULL
    ORDER BY school_year DESC
    LIMIT 1;

    IF v_origin_period IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No se encontró período escolar activo en la institución origen'
        );
    END IF;

    BEGIN
        -- 1. Cerrar fila abierta de historial de responsables (A)
        SELECT id INTO v_open_row_id
        FROM caso_responsables_historial
        WHERE caso_id = v_transfer.caso_id AND hasta IS NULL
        ORDER BY desde DESC
        LIMIT 1;

        IF v_open_row_id IS NOT NULL THEN
            SELECT desde INTO v_until FROM caso_responsables_historial WHERE id = v_open_row_id;
            v_until := GREATEST(NOW(), v_until + INTERVAL '1 microsecond');
            UPDATE caso_responsables_historial
            SET hasta = v_until, motivo_salida = 'transferencia'
            WHERE id = v_open_row_id;
        END IF;

        -- 2. Cerrar período escolar en A (A pierde gestión operativa)
        UPDATE periodos_escolares
        SET end_date = CURRENT_DATE,
            motivo_retiro = 'transferencia_a_otra_institucion',
            updated_at = NOW()
        WHERE id = v_origin_period.id;

        -- 3. Crear período en B
        BEGIN
            INSERT INTO periodos_escolares (
                student_id, institution_id, school_year,
                nivel_id, grado_id, section, start_date, tipo
            ) VALUES (
                v_caso.student_id,
                v_transfer.destination_institution_id,
                v_transfer.school_year,
                v_transfer.destination_nivel_id,
                v_transfer.destination_grado_id,
                v_transfer.section,
                CURRENT_DATE,
                'regular'
            )
            RETURNING id INTO v_new_period_id;
        EXCEPTION WHEN OTHERS THEN
            RETURN json_build_object('success', false, 'error', 'Error al crear período destino: ' || SQLERRM);
        END;

        -- 4. Actualizar transferencia: A autoriza
        UPDATE transferencias
        SET status = 'approved',
            authorized_by = auth.uid(),
            authorized_at = CURRENT_TIMESTAMP,
            transferred_at = CURRENT_TIMESTAMP,
            updated_at = NOW()
        WHERE id = p_transfer_id;

        -- 5. Responsable en B (Director/Admin de destino)
        SELECT user_id INTO v_director
        FROM perfiles
        WHERE institution_id = v_transfer.destination_institution_id
          AND role IN ('director', 'admin_ie')
        ORDER BY CASE WHEN role = 'director' THEN 0 ELSE 1 END, created_at
        LIMIT 1;

        UPDATE casos
        SET current_responsible_id = COALESCE(v_director, current_responsible_id),
            estado = CASE WHEN estado = 'inicio' THEN 'en_proceso' ELSE estado END,
            updated_at = NOW()
        WHERE id = v_transfer.caso_id;

        IF v_director IS NOT NULL THEN
            INSERT INTO caso_responsables_historial (caso_id, responsible_id, desde)
            VALUES (v_transfer.caso_id, v_director, NOW());
        END IF;

        -- 6. Auditoría
        INSERT INTO auditoria (user_id, action, table_name, record_id, old_values, new_values)
        VALUES (
            auth.uid(),
            'transfer_authorized',
            'transferencias',
            p_transfer_id,
            json_build_object('status', 'pending'),
            json_build_object(
                'status', 'approved',
                'new_period_id', v_new_period_id,
                'role_action', 'A_autoriza'
            )
        );

        RETURN json_build_object(
            'success', true,
            'status', 'approved',
            'new_period_id', v_new_period_id,
            'message', 'Transferencia autorizada. B asume la responsabilidad operativa; A pierde la gestión.'
        );
    EXCEPTION WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', 'Error al autorizar transferencia: ' || SQLERRM);
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION authorize_transfer(UUID) IS
'T66/A1 DC-007: A (origen) autoriza → cierra período A, crea período B, transfiere responsabilidad. FOR UPDATE anti-carrera.';

-- ============================================================
-- 5. reject_transfer: A (origen) rechaza → sin efectos
-- ============================================================
CREATE OR REPLACE FUNCTION reject_transfer(
    p_transfer_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_institution UUID;
    v_transfer RECORD;
BEGIN
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no autenticado');
    END IF;

    IF v_user_role NOT IN ('global', 'director', 'admin_ie') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo Director o Admin I.E. pueden rechazar transferencias'
        );
    END IF;

    SELECT * INTO v_transfer
    FROM transferencias
    WHERE id = p_transfer_id
    FOR UPDATE;

    IF v_transfer IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Transferencia no encontrada');
    END IF;

    IF v_user_role != 'global' AND v_transfer.origin_institution_id != v_user_institution THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo puede rechazar transferencias de su institución (origen)'
        );
    END IF;

    IF v_transfer.status != 'pending' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo se pueden rechazar transferencias pendientes. Estado actual: ' || v_transfer.status
        );
    END IF;

    UPDATE transferencias
    SET status = 'rejected',
        authorized_by = auth.uid(),
        rejected_at = CURRENT_TIMESTAMP,
        reject_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_transfer_id;

    INSERT INTO auditoria (user_id, action, table_name, record_id, old_values, new_values)
    VALUES (
        auth.uid(),
        'transfer_rejected',
        'transferencias',
        p_transfer_id,
        json_build_object('status', 'pending'),
        json_build_object('status', 'rejected', 'reason', p_reason, 'role_action', 'A_rechaza')
    );

    RETURN json_build_object(
        'success', true,
        'status', 'rejected',
        'message', 'Transferencia rechazada. Sin cambios en A ni B.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION reject_transfer(UUID, TEXT) IS
'T66/A1 DC-007: A (origen) rechaza solicitud pending sin efectos.';

-- ============================================================
-- 6. Comentario de constraint de status (flujo vigente)
-- ============================================================
COMMENT ON CONSTRAINT transferencias_status_check ON transferencias IS
'Estados vigentes A1: pending (B solicita) → approved|rejected (A autoriza/rechaza). accepted/completed históricos.';

-- ============================================================
-- 7. Verificación runtime
-- ============================================================
DO $$
DECLARE
    n INT;
BEGIN
    SELECT count(*) INTO n FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.proname IN ('initiate_transfer', 'authorize_transfer', 'reject_transfer');
    IF n < 3 THEN
        RAISE EXCEPTION 'Error: funciones de transferencia A1 no aplicadas (n=%)', n;
    END IF;

    SELECT count(*) INTO n FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.proname = 'accept_transfer';
    IF n > 0 THEN
        RAISE EXCEPTION 'Error: accept_transfer aún existe (debe eliminarse en A1)';
    END IF;

    SELECT count(*) INTO n FROM pg_indexes
    WHERE indexname = 'ux_transferencias_active_caso'
      AND indexdef LIKE '%pending%';
    IF n = 0 THEN
        RAISE EXCEPTION 'Error: índice único active no recriado sobre pending';
    END IF;
END $$;

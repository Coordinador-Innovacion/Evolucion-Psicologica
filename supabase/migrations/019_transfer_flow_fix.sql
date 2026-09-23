-- Migración 019: Corrección de transferencias según regla de negocio confirmada
-- Evolución Psicológica

-- ============================================================
-- REGLA CONFIRMADA:
-- 1. A (origen) pulsa "TRASLADAR" → efecto inmediato en A
-- 2. A pierde toda gestión operativa
-- 3. A conserva historial (no se elimina ni modifica)
-- 4. B puede aceptar posteriormente (crea PeriodoEscolar)
-- 5. Si B nunca acepta, queda PENDIENTE indefinidamente
-- 6. No hay reversión automática
-- ============================================================

-- Eliminar funciones anteriores que no cumplen la regla
DROP FUNCTION IF EXISTS execute_transfer(UUID, UUID);
DROP FUNCTION IF EXISTS process_transfer(UUID, TEXT, TEXT);

-- ============================================================
-- CAMBIO DE ESQUEMA: Agregar motivo_salida a caso_responsables_historial
-- ============================================================
ALTER TABLE caso_responsables_historial
ADD COLUMN IF NOT EXISTS motivo_salida TEXT;

COMMENT ON COLUMN caso_responsables_historial.motivo_salida IS
'Motivo por el cual el responsable dejó de atender el caso: transferencia, cierre, etc.';

-- ============================================================
-- FUNCIÓN 1: initiate_transfer()
-- A (origen) inicia la transferencia → efecto inmediato
-- ============================================================
CREATE OR REPLACE FUNCTION initiate_transfer(
    p_caso_id UUID,
    p_destination_institution_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_caso RECORD;
    v_origin_institution_id UUID;
    v_user_role TEXT;
    v_user_institution UUID;
    v_transfer_id UUID;
    v_current_responsible_id UUID;
    v_student_id UUID;
    v_school_year INTEGER;
    v_origin_period_id UUID;
BEGIN
    -- 1. Obtener usuario real desde auth.uid()
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles
    WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Usuario no autenticado o sin perfil'
        );
    END IF;

    -- 2. Solo Director o Admin I.E. pueden iniciar transferencia
    IF v_user_role NOT IN ('global', 'director', 'admin_ie') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo Director o Admin I.E. pueden iniciar transferencias'
        );
    END IF;

    -- 3. Si no es Global, debe ser de la institución origen
    IF v_user_role != 'global' AND v_user_institution IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Usuario sin institución asignada'
        );
    END IF;

    -- 4. Obtener el caso actual
    SELECT * INTO v_caso
    FROM casos
    WHERE id = p_caso_id;

    IF v_caso IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Caso no encontrado'
        );
    END IF;

    v_student_id := v_caso.student_id;

    -- 5. Obtener el período escolar actual del estudiante en la institución origen
    SELECT id, institution_id, school_year INTO v_origin_period_id, v_origin_institution_id, v_school_year
    FROM periodos_escolares
    WHERE student_id = v_student_id
    AND end_date IS NULL  -- Período activo (sin fecha de fin)
    ORDER BY school_year DESC, created_at DESC
    LIMIT 1;

    IF v_origin_period_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No se encontró período escolar activo para el estudiante'
        );
    END IF;

    -- 6. Verificar que no sea la misma institución
    IF v_origin_institution_id = p_destination_institution_id THEN
        RETURN json_build_object(
            'success', false,
            'error', 'La institución origen y destino deben ser diferentes'
        );
    END IF;

    -- 7. Verificar permisos de institución (si no es Global)
    IF v_user_role != 'global' AND v_user_institution != v_origin_institution_id THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo puede transferir estudiantes de su institución'
        );
    END IF;

    -- 8. Verificar que no haya una transferencia activa para este caso
    IF EXISTS (
        SELECT 1 FROM transferencias
        WHERE caso_id = p_caso_id
        AND status IN ('pending', 'accepted')
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Ya existe una transferencia activa para este caso'
        );
    END IF;

    -- 9. Obtener responsable actual
    v_current_responsible_id := v_caso.current_responsible_id;

    -- ============================================================
    -- 10. EJECUTAR TRANSFERENCIA (transaccional)
    -- ============================================================
    BEGIN
        -- 10a. Crear registro de transferencia (status: pending)
        INSERT INTO transferencias (
            caso_id,
            origin_institution_id,
            destination_institution_id,
            requested_by,      -- A inicia (origin)
            authorized_by,     -- A autoriza (origin) - mismo que requested_by
            status,
            transferred_at     -- Se llena ahora (efecto inmediato)
        ) VALUES (
            p_caso_id,
            v_origin_institution_id,
            p_destination_institution_id,
            auth.uid(),        -- A inicia
            auth.uid(),        -- A autoriza
            'pending',
            NOW()              -- Efecto inmediato
        )
        RETURNING id INTO v_transfer_id;

        -- 10b. Cerrar el período escolar del estudiante en A (marcar como transferido)
        UPDATE periodos_escolares
        SET end_date = CURRENT_DATE,
            motivo_retiro = 'transferencia_a_otra_institucion',
            updated_at = NOW()
        WHERE id = v_origin_period_id;

        -- 10c. Registrar cierre de responsabilidad en A
        INSERT INTO caso_responsables_historial (
            caso_id,
            responsible_id,
            desde,
            hasta,
            motivo_salida
        ) VALUES (
            p_caso_id,
            v_current_responsible_id,
            (SELECT opened_at FROM casos WHERE id = p_caso_id),
            NOW(),
            'transferencia_a_otra_institucion'
        );

        -- 10d. Actualizar el caso: A pierde gestión operativa
        UPDATE casos
        SET current_responsible_id = NULL,  -- A ya no tiene responsable
            estado = 'en_proceso',         -- Caso sigue activo pero sin responsable en A
            updated_at = NOW()
        WHERE id = p_caso_id;

        -- 10e. Registrar en auditoría
        INSERT INTO auditoria (
            user_id,
            action,
            table_name,
            record_id,
            new_values
        ) VALUES (
            auth.uid(),
            'transfer_initiated',
            'transferencias',
            v_transfer_id,
            json_build_object(
                'caso_id', p_caso_id,
                'student_id', v_student_id,
                'origin_institution_id', v_origin_institution_id,
                'destination_institution_id', p_destination_institution_id,
                'origin_period_id', v_origin_period_id,
                'status', 'pending'
            )
        );

        RETURN json_build_object(
            'success', true,
            'transfer_id', v_transfer_id,
            'status', 'pending',
            'message', 'Transferencia iniciada. La institución origen ha perdido la gestión operativa del estudiante.'
        );

    EXCEPTION WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Error al ejecutar transferencia: ' || SQLERRM
        );
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION initiate_transfer(UUID, UUID) IS
'Inicia transferencia de caso. A (origen) pulsa TRASLADAR → efecto inmediato. B acepta después.';

-- ============================================================
-- FUNCIÓN 2: accept_transfer()
-- B (destino) acepta la transferencia → crea PeriodoEscolar
-- ============================================================
CREATE OR REPLACE FUNCTION accept_transfer(
    p_transfer_id UUID,
    p_nivel_id UUID,
    p_grado_id UUID,
    p_section VARCHAR
)
RETURNS JSON AS $$
DECLARE
    v_transfer RECORD;
    v_user_role TEXT;
    v_user_institution UUID;
    v_caso RECORD;
    v_student_id UUID;
    v_new_period_id UUID;
    v_school_year INTEGER;
BEGIN
    -- 1. Obtener usuario real desde auth.uid()
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles
    WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Usuario no autenticado o sin perfil'
        );
    END IF;

    -- 2. Solo Director o Admin I.E. pueden aceptar transferencias
    IF v_user_role NOT IN ('global', 'director', 'admin_ie') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo Director o Admin I.E. pueden aceptar transferencias'
        );
    END IF;

    -- 3. Obtener la transferencia
    SELECT * INTO v_transfer
    FROM transferencias
    WHERE id = p_transfer_id;

    IF v_transfer IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Transferencia no encontrada'
        );
    END IF;

    -- 4. Verificar que esté pendiente
    IF v_transfer.status != 'pending' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo se pueden aceptar transferencias pendientes. Estado actual: ' || v_transfer.status
        );
    END IF;

    -- 5. Verificar permisos: debe ser de la institución destino
    IF v_user_role != 'global' AND v_user_institution != v_transfer.destination_institution_id THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo puede aceptar transferencias destinadas a su institución'
        );
    END IF;

    -- 6. Obtener el caso y estudiante
    SELECT * INTO v_caso
    FROM casos
    WHERE id = v_transfer.caso_id;

    v_student_id := v_caso.student_id;

    -- 7. Obtener el año escolar del período de origen
    SELECT school_year INTO v_school_year
    FROM periodos_escolares
    WHERE student_id = v_student_id
    AND institution_id = v_transfer.origin_institution_id
    ORDER BY school_year DESC
    LIMIT 1;

    -- ============================================================
    -- 8. EJECUTAR ACEPTACIÓN (transaccional)
    -- ============================================================
    BEGIN
        -- 8a. Actualizar estado de transferencia a 'accepted'
        UPDATE transferencias
        SET status = 'accepted',
            authorized_by = auth.uid(),
            updated_at = NOW()
        WHERE id = p_transfer_id;

        -- 8b. Crear nuevo período escolar en la institución destino (B)
        INSERT INTO periodos_escolares (
            student_id,
            institution_id,
            school_year,
            nivel_id,
            grado_id,
            section,
            start_date,
            tipo
        ) VALUES (
            v_student_id,
            v_transfer.destination_institution_id,
            v_school_year,  -- Mismo año escolar que en origen
            p_nivel_id,
            p_grado_id,
            p_section,
            CURRENT_DATE,
            'regular'
        )
        RETURNING id INTO v_new_period_id;

        -- 8c. Asignar responsable: Director de B
        UPDATE casos
        SET current_responsible_id = (
            SELECT user_id FROM perfiles
            WHERE role = 'director'
            AND institution_id = v_transfer.destination_institution_id
            LIMIT 1
        ),
        updated_at = NOW()
        WHERE id = v_transfer.caso_id;

        -- 8d. Registrar inicio de responsabilidad en B
        INSERT INTO caso_responsables_historial (
            caso_id,
            responsible_id,
            desde
        ) VALUES (
            v_transfer.caso_id,
            (SELECT user_id FROM perfiles WHERE role = 'director' AND institution_id = v_transfer.destination_institution_id LIMIT 1),
            NOW()
        );

        -- 8e. Registrar en auditoría
        INSERT INTO auditoria (
            user_id,
            action,
            table_name,
            record_id,
            new_values
        ) VALUES (
            auth.uid(),
            'transfer_accepted',
            'transferencias',
            p_transfer_id,
            json_build_object(
                'caso_id', v_transfer.caso_id,
                'student_id', v_student_id,
                'destination_institution_id', v_transfer.destination_institution_id,
                'new_period_id', v_new_period_id,
                'nivel_id', p_nivel_id,
                'grado_id', p_grado_id,
                'section', p_section,
                'status', 'accepted'
            )
        );

        RETURN json_build_object(
            'success', true,
            'status', 'accepted',
            'new_period_id', v_new_period_id,
            'message', 'Transferencia aceptada. Se creó el período escolar en la institución destino.'
        );

    EXCEPTION WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Error al aceptar transferencia: ' || SQLERRM
        );
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION accept_transfer(UUID, UUID, UUID, VARCHAR) IS
'Acepta transferencia pendiente. B crea PeriodoEscolar en su institución.';

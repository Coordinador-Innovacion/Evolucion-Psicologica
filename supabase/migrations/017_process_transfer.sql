-- Migración 017: Función para aprobar/rechazar transferencias pendientes
-- Evolución Psicológica

/**
 * Aprueba o rechaza una transferencia pendiente.
 * Solo el Director de la institución origen puede ejecutar esta acción.
 *
 * @param p_transfer_id - ID de la transferencia
 * @param p_action - 'approve' o 'reject'
 * @param p_user_id - ID del usuario que ejecuta
 * @param p_reason - Motivo (opcional para rechazo)
 * @return JSON con resultado
 */
CREATE OR REPLACE FUNCTION process_transfer(
    p_transfer_id UUID,
    p_action TEXT,
    p_user_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_transfer RECORD;
    v_user_role TEXT;
    v_user_institution UUID;
BEGIN
    -- Validar acción
    IF p_action NOT IN ('approve', 'reject') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Acción inválida. Use "approve" o "reject"'
        );
    END IF;

    -- Obtener la transferencia
    SELECT * INTO v_transfer
    FROM transferencias
    WHERE id = p_transfer_id;

    IF v_transfer IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Transferencia no encontrada'
        );
    END IF;

    -- Verificar que esté pendiente
    IF v_transfer.status != 'pending' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo se pueden procesar transferencias pendientes'
        );
    END IF;

    -- Obtener permisos del usuario
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles
    WHERE user_id = p_user_id;

    -- Verificar que sea Director de la institución origen o Global
    IF v_user_role != 'global' THEN
        IF v_user_role != 'director' OR v_user_institution != v_transfer.origin_institution_id THEN
            RETURN json_build_object(
                'success', false,
                'error', 'Solo el Director de la institución origen puede procesar esta transferencia'
            );
        END IF;
    END IF;

    -- Procesar acción
    IF p_action = 'approve' THEN
        -- Aprobar transferencia
        UPDATE transferencias
        SET status = 'approved',
            authorized_by = p_user_id,
            transferred_at = NOW(),
            updated_at = NOW()
        WHERE id = p_transfer_id;

        -- Actualizar el caso: cambiar responsable al Director del destino
        UPDATE casos
        SET current_responsible_id = (
            SELECT user_id FROM perfiles
            WHERE role = 'director'
            AND institution_id = v_transfer.destination_institution_id
            LIMIT 1
        ),
        updated_at = NOW()
        WHERE id = v_transfer.caso_id;

        -- Registrar en auditoría
        INSERT INTO auditoria (
            user_id, action, table_name, record_id, new_values
        ) VALUES (
            p_user_id, 'transfer_approve', 'transferencias', p_transfer_id,
            json_build_object('approved_by', p_user_id, 'reason', p_reason)
        );

        RETURN json_build_object(
            'success', true,
            'status', 'approved',
            'message', 'Transferencia aprobada. La institución destino asume la gestión.'
        );
    ELSE
        -- Rechazar transferencia
        UPDATE transferencias
        SET status = 'rejected',
            authorized_by = p_user_id,
            updated_at = NOW()
        WHERE id = p_transfer_id;

        -- Registrar en auditoría
        INSERT INTO auditoria (
            user_id, action, table_name, record_id, new_values
        ) VALUES (
            p_user_id, 'transfer_reject', 'transferencias', p_transfer_id,
            json_build_object('rejected_by', p_user_id, 'reason', p_reason)
        );

        RETURN json_build_object(
            'success', true,
            'status', 'rejected',
            'message', 'Transferencia rechazada'
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION process_transfer(UUID, TEXT, UUID, TEXT) IS
'Procesa transferencia pendiente: approve o reject. Solo Director origen o Global.';

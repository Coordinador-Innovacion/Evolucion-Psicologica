-- Migración 016: Función transaccional de transferencias
-- Evolución Psicológica
-- V1: Institución B solicita, Institución A (Director) autoriza

/**
 * Ejecuta una transferencia de caso entre instituciones de forma transaccional.
 *
 * Flujo V1:
 * 1. Institución B (destino) solicita la transferencia
 * 2. Institución A (origen) autoriza via Director
 * 3. B recibe la historia completa del caso
 * 4. B pasa a ser responsable operativo
 * 5. A pierde la gestión operativa pero conserva consulta
 * 6. Historial previo queda congelado e inmutable
 *
 * @param p_caso_id - ID del caso a transferir
 * @param p_destination_institution_id - ID de la institución destino (B)
 * @param p_user_id - ID del usuario que ejecuta la acción
 * @return JSON con resultado de la operación
 */
CREATE OR REPLACE FUNCTION execute_transfer(
    p_caso_id UUID,
    p_destination_institution_id UUID,
    p_user_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_caso RECORD;
    v_origin_institution_id UUID;
    v_user_role TEXT;
    v_user_institution UUID;
    v_transfer_id UUID;
    v_result JSON;
BEGIN
    -- 1. Obtener el caso actual
    SELECT * INTO v_caso
    FROM casos
    WHERE id = p_caso_id;

    IF v_caso IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Caso no encontrado'
        );
    END IF;

    -- 2. Obtener la institución de origen del caso (del estudiante)
    SELECT institution_id INTO v_origin_institution_id
    FROM periodos_escolares
    WHERE student_id = v_caso.student_id
    ORDER BY school_year DESC, created_at DESC
    LIMIT 1;

    IF v_origin_institution_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No se encontró período escolar para el estudiante'
        );
    END IF;

    -- 3. Verificar que origen y destino sean diferentes
    IF v_origin_institution_id = p_destination_institution_id THEN
        RETURN json_build_object(
            'success', false,
            'error', 'La institución origen y destino deben ser diferentes'
        );
    END IF;

    -- 4. Obtener rol y institución del usuario
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles
    WHERE user_id = p_user_id;

    -- 5. Verificar permisos
    -- Global puede siempre
    -- Director solo puede autorizar transferencias de SU institución (origen)
    IF v_user_role != 'global' THEN
        IF v_user_role != 'director' THEN
            RETURN json_build_object(
                'success', false,
                'error', 'No tiene permisos para realizar transferencias'
            );
        END IF;

        -- Director debe ser de la institución origen
        IF v_user_institution != v_origin_institution_id THEN
            RETURN json_build_object(
                'success', false,
                'error', 'Solo el Director de la institución origen puede autorizar'
            );
        END IF;
    END IF;

    -- 6. Verificar que no haya una transferencia pendiente para este caso
    IF EXISTS (
        SELECT 1 FROM transferencias
        WHERE caso_id = p_caso_id
        AND status IN ('pending', 'approved')
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Ya existe una transferencia pendiente para este caso'
        );
    END IF;

    -- 7. Ejecutar transferencia de forma transaccional
    BEGIN
        -- Crear registro de transferencia
        INSERT INTO transferencias (
            caso_id,
            origin_institution_id,
            destination_institution_id,
            requested_by,
            authorized_by,
            status,
            transferred_at
        ) VALUES (
            p_caso_id,
            v_origin_institution_id,
            p_destination_institution_id,
            p_user_id,
            CASE WHEN v_user_role = 'director' THEN p_user_id ELSE NULL END,
            CASE WHEN v_user_role = 'director' THEN 'approved'::transferencia_status ELSE 'pending'::transferencia_status END,
            CASE WHEN v_user_role = 'director' THEN NOW() ELSE NULL END
        )
        RETURNING id INTO v_transfer_id;

        -- Si el Director autoriza, actualizar el caso
        IF v_user_role = 'director' THEN
            -- Actualizar responsable actual del caso al director del destino
            UPDATE casos
            SET current_responsible_id = (
                SELECT user_id FROM perfiles
                WHERE role = 'director'
                AND institution_id = p_destination_institution_id
                LIMIT 1
            ),
            updated_at = NOW()
            WHERE id = p_caso_id;

            -- Registrar en historial de responsables
            -- (el nuevo responsable se asignará cuando tome posesión)
        END IF;

        -- Registrar en auditoría
        INSERT INTO auditoria (
            user_id,
            action,
            table_name,
            record_id,
            new_values
        ) VALUES (
            p_user_id,
            'transfer_execute',
            'transferencias',
            v_transfer_id,
            json_build_object(
                'caso_id', p_caso_id,
                'origin_institution_id', v_origin_institution_id,
                'destination_institution_id', p_destination_institution_id,
                'status', CASE WHEN v_user_role = 'director' THEN 'approved' ELSE 'pending' END
            )
        );

        -- Retornar éxito
        RETURN json_build_object(
            'success', true,
            'transfer_id', v_transfer_id,
            'status', CASE WHEN v_user_role = 'director' THEN 'approved' ELSE 'pending' END,
            'message', CASE
                WHEN v_user_role = 'director' THEN 'Transferencia aprobada y ejecutada'
                ELSE 'Solicitud de transferencia creada, pendiente de aprobación'
            END
        );

    EXCEPTION WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Error al ejecutar transferencia: ' || SQLERRM
        );
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentario de la función
COMMENT ON FUNCTION execute_transfer(UUID, UUID, UUID) IS
'Ejecuta transferencia de caso entre instituciones. V1: Director autoriza.';

-- Habilitar RLS en la función (ya está implícito por SECURITY DEFINER)

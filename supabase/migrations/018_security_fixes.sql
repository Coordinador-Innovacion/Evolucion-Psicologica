-- Migración 018: Correcciones de seguridad críticas
-- Evolución Psicológica

-- ============================================================
-- 1. CORRECCIÓN: execute_transfer() y process_transfer()
--    - Usar auth.uid() en lugar de p_user_id
--    - Definir search_path explícitamente
--    - Completar historial de responsables
--    - Validar estados permitidos (máquina de estados)
--    - Cerrar caso de institución origen
-- ============================================================

-- Eliminar funciones anteriores
DROP FUNCTION IF EXISTS execute_transfer(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS process_transfer(UUID, TEXT, UUID, TEXT);

-- Función corregida: execute_transfer
CREATE OR REPLACE FUNCTION execute_transfer(
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
    v_previous_responsible RECORD;
    v_origin_director_id UUID;
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

    -- 2. Obtener el caso actual
    SELECT * INTO v_caso
    FROM casos
    WHERE id = p_caso_id;

    IF v_caso IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Caso no encontrado'
        );
    END IF;

    -- 3. Obtener la institución de origen del caso (del estudiante)
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

    -- 4. Verificar que origen y destino sean diferentes
    IF v_origin_institution_id = p_destination_institution_id THEN
        RETURN json_build_object(
            'success', false,
            'error', 'La institución origen y destino deben ser diferentes'
        );
    END IF;

    -- 5. Verificar permisos
    -- Global puede siempre
    -- Director solo puede autorizar transferencias de SU institución (origen)
    IF v_user_role != 'global' THEN
        IF v_user_role != 'director' OR v_user_institution != v_origin_institution_id THEN
            RETURN json_build_object(
                'success', false,
                'error', 'Solo el Director de la institución origen puede autorizar'
            );
        END IF;
    END IF;

    -- 6. Verificar que no haya una transferencia pendiente/aprobada para este caso
    IF EXISTS (
        SELECT 1 FROM transferencias
        WHERE caso_id = p_caso_id
        AND status IN ('pending', 'approved', 'completed')
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Ya existe una transferencia activa para este caso'
        );
    END IF;

    -- 7. Obtener responsable actual del caso
    v_current_responsible_id := v_caso.current_responsible_id;

    -- 8. Ejecutar transferencia de forma transaccional
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
            auth.uid(),
            CASE WHEN v_user_role = 'director' THEN auth.uid() ELSE NULL END,
            CASE WHEN v_user_role = 'director' THEN 'approved'::transferencia_status ELSE 'pending'::transferencia_status END,
            CASE WHEN v_user_role = 'director' THEN NOW() ELSE NULL END
        )
        RETURNING id INTO v_transfer_id;

        -- Si el Director autoriza, ejecutar la transferencia inmediatamente
        IF v_user_role = 'director' THEN
            -- Obtener el Director de la institución origen para registrar salida
            SELECT user_id INTO v_origin_director_id
            FROM perfiles
            WHERE role = 'director'
            AND institution_id = v_origin_institution_id
            LIMIT 1;

            -- Registrar el cierre de responsabilidad en la institución origen
            INSERT INTO caso_responsables_historial (
                caso_id,
                responsible_id,
                institution_id,
                started_at,
                ended_at,
                end_reason
            ) VALUES (
                p_caso_id,
                v_current_responsible_id,
                v_origin_institution_id,
                (SELECT created_at FROM casos WHERE id = p_caso_id),
                NOW(),
                'transfer_to_institution'
            );

            -- Actualizar responsable actual al Director del destino
            UPDATE casos
            SET current_responsible_id = (
                SELECT user_id FROM perfiles
                WHERE role = 'director'
                AND institution_id = p_destination_institution_id
                LIMIT 1
            ),
            status = 'active',
            updated_at = NOW()
            WHERE id = p_caso_id;

            -- Registrar inicio de responsabilidad en la institución destino
            INSERT INTO caso_responsables_historial (
                caso_id,
                responsible_id,
                institution_id,
                started_at
            ) VALUES (
                p_caso_id,
                (SELECT user_id FROM perfiles WHERE role = 'director' AND institution_id = p_destination_institution_id LIMIT 1),
                p_destination_institution_id,
                NOW()
            );
        END IF;

        -- Registrar en auditoría
        INSERT INTO auditoria (
            user_id,
            action,
            table_name,
            record_id,
            new_values
        ) VALUES (
            auth.uid(),
            'transfer_execute',
            'transferencias',
            v_transfer_id,
            json_build_object(
                'caso_id', p_caso_id,
                'origin_institution_id', v_origin_institution_id,
                'destination_institution_id', p_destination_institution_id,
                'status', CASE WHEN v_user_role = 'director' THEN 'approved' ELSE 'pending' END,
                'previous_responsible_id', v_current_responsible_id
            )
        );

        RETURN json_build_object(
            'success', true,
            'transfer_id', v_transfer_id,
            'status', CASE WHEN v_user_role = 'director' THEN 'approved' ELSE 'pending' END,
            'message', CASE
                WHEN v_user_role = 'director' THEN 'Transferencia aprobada y ejecutada'
                ELSE 'Solicitud de transferencia creada, pendiente de aprobación del Director de origen'
            END
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

COMMENT ON FUNCTION execute_transfer(UUID, UUID) IS
'Ejecuta transferencia de caso entre instituciones. Director origen autoriza o Global intervienen.';

-- Función corregida: process_transfer
CREATE OR REPLACE FUNCTION process_transfer(
    p_transfer_id UUID,
    p_action TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_transfer RECORD;
    v_user_role TEXT;
    v_user_institution UUID;
    v_current_responsible_id UUID;
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

    -- 2. Validar acción
    IF p_action NOT IN ('approve', 'reject') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Acción inválida. Use "approve" o "reject"'
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

    -- 4. Verificar que esté pendiente (máquina de estados)
    IF v_transfer.status != 'pending' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo se pueden procesar transferencias pendientes. Estado actual: ' || v_transfer.status
        );
    END IF;

    -- 5. Verificar permisos
    IF v_user_role != 'global' THEN
        IF v_user_role != 'director' OR v_user_institution != v_transfer.origin_institution_id THEN
            RETURN json_build_object(
                'success', false,
                'error', 'Solo el Director de la institución origen puede procesar esta transferencia'
            );
        END IF;
    END IF;

    -- 6. Obtener responsable actual del caso
    SELECT current_responsible_id INTO v_current_responsible_id
    FROM casos
    WHERE id = v_transfer.caso_id;

    -- 7. Procesar acción
    IF p_action = 'approve' THEN
        -- Aprobar transferencia
        UPDATE transferencias
        SET status = 'approved',
            authorized_by = auth.uid(),
            transferred_at = NOW(),
            updated_at = NOW()
        WHERE id = p_transfer_id;

        -- Registrar cierre de responsabilidad en origen
        INSERT INTO caso_responsables_historial (
            caso_id, responsible_id, institution_id, started_at, ended_at, end_reason
        ) VALUES (
            v_transfer.caso_id, v_current_responsible_id, v_transfer.origin_institution_id,
            (SELECT created_at FROM casos WHERE id = v_transfer.caso_id),
            NOW(),
            'transfer_to_institution'
        );

        -- Actualizar el caso: cambiar responsable al Director del destino
        UPDATE casos
        SET current_responsible_id = (
            SELECT user_id FROM perfiles
            WHERE role = 'director'
            AND institution_id = v_transfer.destination_institution_id
            LIMIT 1
        ),
        status = 'active',
        updated_at = NOW()
        WHERE id = v_transfer.caso_id;

        -- Registrar inicio de responsabilidad en destino
        INSERT INTO caso_responsables_historial (
            caso_id, responsible_id, institution_id, started_at
        ) VALUES (
            v_transfer.caso_id,
            (SELECT user_id FROM perfiles WHERE role = 'director' AND institution_id = v_transfer.destination_institution_id LIMIT 1),
            v_transfer.destination_institution_id,
            NOW()
        );

        -- Registrar en auditoría
        INSERT INTO auditoria (
            user_id, action, table_name, record_id, new_values
        ) VALUES (
            auth.uid(), 'transfer_approve', 'transferencias', p_transfer_id,
            json_build_object('approved_by', auth.uid(), 'reason', p_reason)
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
            authorized_by = auth.uid(),
            updated_at = NOW()
        WHERE id = p_transfer_id;

        -- Registrar en auditoría
        INSERT INTO auditoria (
            user_id, action, table_name, record_id, new_values
        ) VALUES (
            auth.uid(), 'transfer_reject', 'transferencias', p_transfer_id,
            json_build_object('rejected_by', auth.uid(), 'reason', p_reason)
        );

        RETURN json_build_object(
            'success', true,
            'status', 'rejected',
            'message', 'Transferencia rechazada'
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

COMMENT ON FUNCTION process_transfer(UUID, TEXT, TEXT) IS
'Procesa transferencia pendiente: approve o reject. Solo Director origen o Global.';

-- ============================================================
-- 2. VISTAS SEGURAS PARA INFORMACIÓN CLÍNICA
--    RLS controla FILAS, no COLUMNAS.
--    Estas vistas exponen solo los campos permitidos por rol.
-- ============================================================

-- Vista para Docente: solo teacher_orientation, NO clinical_description
-- La vista filtra por institución del usuario actual
CREATE OR REPLACE VIEW v_necesidades_docente AS
SELECT
    ne.id,
    ne.student_id,
    ne.teacher_orientation,
    ne.created_at,
    ne.updated_at
FROM necesidades_especiales ne
WHERE ne.student_id IN (
    SELECT student_id FROM periodos_escolares
    WHERE institution_id = (
        SELECT institution_id FROM perfiles WHERE user_id = auth.uid() LIMIT 1
    )
);

COMMENT ON VIEW v_necesidades_docente IS
'Vista segura para Docente: solo orientación, sin información clínica.';

-- Vista para Director/Admin I.E.: información de su institución (sin clínica completa)
-- Solo campos administrativos, no clinical_description
-- Columnas alineadas al esquema real de necesidades_especiales (006):
-- condition_type, certifying_entity, certification_date, document_id, teacher_orientation
CREATE OR REPLACE VIEW v_necesidades_institucion AS
SELECT
    ne.id,
    ne.student_id,
    ne.condition_type,
    ne.certifying_entity,
    ne.certification_date,
    ne.document_id,
    ne.teacher_orientation,
    ne.created_at,
    ne.updated_at
FROM necesidades_especiales ne
WHERE ne.student_id IN (
    SELECT student_id FROM periodos_escolares
    WHERE institution_id = (
        SELECT institution_id FROM perfiles WHERE user_id = auth.uid() LIMIT 1
    )
);

COMMENT ON VIEW v_necesidades_institucion IS
'Vista para Director/Admin I.E.: información administrativa sin descripción clínica.';

-- Vista para Coordinador: proyección del diagnóstico (sin respuestas clínicas)
-- Columnas alineadas al esquema real de diagnosticos_anuales (005):
-- technical_status (no status), sin submitted_at
CREATE OR REPLACE VIEW v_diagnosticos_coordinador AS
SELECT
    da.id,
    da.student_id,
    da.school_year,
    da.form_version,
    da.technical_status,
    da.created_at,
    da.updated_at
FROM diagnosticos_anuales da
WHERE da.student_id IN (
    SELECT student_id FROM periodos_escolares
    WHERE institution_id = (
        SELECT institution_id FROM perfiles WHERE user_id = auth.uid() LIMIT 1
    )
);

COMMENT ON VIEW v_diagnosticos_coordinador IS
'Vista para Coordinador: metadatos del diagnóstico sin respuestas clínicas.';

-- Vista para Psicólogo/Global: acceso clínico completo
CREATE OR REPLACE VIEW v_diagnosticos_clinico AS
SELECT
    da.*
FROM diagnosticos_anuales da;

COMMENT ON VIEW v_diagnosticos_clinico IS
'Vista para Psicólogo/Global: acceso clínico completo al diagnóstico.';

-- Habilitar RLS en las vistas
ALTER VIEW v_necesidades_docente SET (security_barrier = true);
ALTER VIEW v_necesidades_institucion SET (security_barrier = true);
ALTER VIEW v_diagnosticos_coordinador SET (security_barrier = true);
ALTER VIEW v_diagnosticos_clinico SET (security_barrier = true);

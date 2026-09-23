-- Migración 031: Gestión de Casos y Atenciones (T28 + T29)
-- Evolución Psicológica

-- ============================================================
-- T28: ATENCIÓN — VENTANA DE 30 MINUTOS
-- ============================================================

-- Agregar columna edited_at para rastrear última edición
ALTER TABLE atenciones
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN atenciones.edited_at IS
'Última edición de la atención. NULL significa que no se ha editado. La atención es editable solo durante 30 minutos desde created_at.';

-- ============================================================
-- T28: FUNCIÓN — actualizar atención con validación de ventana
-- ============================================================

CREATE OR REPLACE FUNCTION update_attention(
    p_attention_id UUID,
    p_motivo TEXT DEFAULT NULL,
    p_que_se_hizo TEXT DEFAULT NULL,
    p_observaciones TEXT DEFAULT NULL,
    p_compromisos TEXT DEFAULT NULL,
    p_proxima_atencion TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_attention RECORD;
    v_user_role TEXT;
    v_user_institution UUID;
    v_caso RECORD;
    v_elapsed_minutes NUMERIC;
BEGIN
    -- 1. Obtener usuario
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no autenticado');
    END IF;

    -- 2. Solo Psicólogo y Global pueden editar atenciones
    IF v_user_role NOT IN ('global', 'psicologo') THEN
        RETURN json_build_object('success', false, 'error', 'Solo Psicólogo o Global pueden editar atenciones');
    END IF;

    -- 3. Obtener la atención
    SELECT * INTO v_attention FROM atenciones WHERE id = p_attention_id;

    IF v_attention IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Atención no encontrada');
    END IF;

    -- 4. Verificar institución (si no es Global)
    IF v_user_role != 'global' THEN
        SELECT c.* INTO v_caso
        FROM casos c WHERE c.id = v_attention.caso_id;

        IF v_caso IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'Caso asociado no encontrado');
        END IF;

        -- Verificar que el caso pertenece a la institución del usuario
        IF NOT EXISTS (
            SELECT 1 FROM periodos_escolares ps
            WHERE ps.student_id = v_caso.student_id
            AND ps.institution_id = v_user_institution
            AND ps.end_date IS NULL
        ) THEN
            RETURN json_build_object('success', false, 'error', 'La atención no pertenece a su institución');
        END IF;
    END IF;

    -- 5. Validar ventana de 30 minutos (hora del servidor)
    v_elapsed_minutes := EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - v_attention.created_at)) / 60;

    IF v_elapsed_minutes > 30 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'La atención solo puede editarse durante 30 minutos desde su registro. Tiempo transcurrido: ' ||
                     ROUND(v_elapsed_minutes, 1) || ' minutos.'
        );
    END IF;

    -- 6. Actualizar la atención
    UPDATE atenciones
    SET motivo = COALESCE(p_motivo, motivo),
        que_se_hizo = COALESCE(p_que_se_hizo, que_se_hizo),
        observaciones = COALESCE(p_observaciones, observaciones),
        compromisos = COALESCE(p_compromisos, compromisos),
        proxima_atencion = COALESCE(p_proxima_atencion, proxima_atencion),
        edited_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_attention_id;

    -- 7. Auditar el cambio
    INSERT INTO auditoria (
        user_id, action, table_name, record_id,
        old_values, new_values
    ) VALUES (
        auth.uid(),
        'attention_updated',
        'atenciones',
        p_attention_id,
        json_build_object(
            'motivo', v_attention.motivo,
            'que_se_hizo', v_attention.que_se_hizo,
            'observaciones', v_attention.observaciones,
            'compromisos', v_attention.compromisos,
            'proxima_atencion', v_attention.proxima_atencion
        ),
        json_build_object(
            'motivo', COALESCE(p_motivo, v_attention.motivo),
            'que_se_hizo', COALESCE(p_que_se_hizo, v_attention.que_se_hizo),
            'observaciones', COALESCE(p_observaciones, v_attention.observaciones),
            'compromisos', COALESCE(p_compromisos, v_attention.compromisos),
            'proxima_atencion', COALESCE(p_proxima_atencion, v_attention.proxima_atencion),
            'edited_at', CURRENT_TIMESTAMP
        )
    );

    RETURN json_build_object('success', true, 'message', 'Atención actualizada correctamente');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION update_attention(UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE) IS
'Actualiza una atención dentro de la ventana de 30 minutos desde su registro. Usa hora del servidor.';

-- ============================================================
-- T29: FUNCIONES DE TRANSICIÓN DE ESTADOS DEL CASO
-- ============================================================

-- Cerrar caso
CREATE OR REPLACE FUNCTION close_case(
    p_case_id UUID,
    p_close_reason TEXT
)
RETURNS JSON AS $$
DECLARE
    v_caso RECORD;
    v_user_role TEXT;
    v_user_institution UUID;
    v_old_estado TEXT;
BEGIN
    -- 1. Obtener usuario
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no autenticado');
    END IF;

    -- 2. Solo Psicólogo y Global pueden cerrar casos
    IF v_user_role NOT IN ('global', 'psicologo') THEN
        RETURN json_build_object('success', false, 'error', 'Solo Psicólogo o Global pueden cerrar casos');
    END IF;

    -- 3. Obtener el caso
    SELECT * INTO v_caso FROM casos WHERE id = p_case_id;

    IF v_caso IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Caso no encontrado');
    END IF;

    -- 4. Verificar institución (si no es Global)
    IF v_user_role != 'global' THEN
        IF NOT EXISTS (
            SELECT 1 FROM periodos_escolares ps
            WHERE ps.student_id = v_caso.student_id
            AND ps.institution_id = v_user_institution
            AND ps.end_date IS NULL
        ) THEN
            RETURN json_build_object('success', false, 'error', 'El caso no pertenece a su institución');
        END IF;
    END IF;

    -- 5. Verificar que el caso no esté ya cerrado
    IF v_caso.estado = 'cerrado' THEN
        RETURN json_build_object('success', false, 'error', 'El caso ya está cerrado');
    END IF;

    -- 6. Validar motivo
    IF p_close_reason IS NULL OR TRIM(p_close_reason) = '' THEN
        RETURN json_build_object('success', false, 'error', 'El motivo de cierre es obligatorio');
    END IF;

    -- 7. Cerrar caso
    v_old_estado := v_caso.estado;

    UPDATE casos
    SET estado = 'cerrado',
        closed_at = CURRENT_TIMESTAMP,
        close_reason = p_close_reason,
        current_responsible_id = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_case_id;

    -- 8. Registrar en historial de responsables si había responsable
    IF v_caso.current_responsible_id IS NOT NULL THEN
        INSERT INTO caso_responsables_historial (
            caso_id, responsible_id, desde, hasta, motivo_salida
        ) VALUES (
            p_case_id,
            v_caso.current_responsible_id,
            v_caso.opened_at,
            NOW(),
            'cierre_de_caso'
        );
    END IF;

    -- 9. Auditar
    INSERT INTO auditoria (
        user_id, action, table_name, record_id,
        old_values, new_values
    ) VALUES (
        auth.uid(),
        'case_closed',
        'casos',
        p_case_id,
        json_build_object('estado', v_old_estado, 'current_responsible_id', v_caso.current_responsible_id),
        json_build_object('estado', 'cerrado', 'close_reason', p_close_reason, 'closed_at', CURRENT_TIMESTAMP)
    );

    RETURN json_build_object('success', true, 'message', 'Caso cerrado correctamente');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION close_case(UUID, TEXT) IS
'Cierra un caso. Solo Psicólogo o Global. Requiere motivo.';

-- Reabrir caso
CREATE OR REPLACE FUNCTION reopen_case(
    p_case_id UUID,
    p_reopen_reason TEXT
)
RETURNS JSON AS $$
DECLARE
    v_caso RECORD;
    v_user_role TEXT;
    v_user_institution UUID;
    v_old_estado TEXT;
    v_psychologist_id UUID;
BEGIN
    -- 1. Obtener usuario
    SELECT role, institution_id INTO v_user_role, v_user_institution
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no autenticado');
    END IF;

    -- 2. Solo Psicólogo y Global pueden reabrir casos
    IF v_user_role NOT IN ('global', 'psicologo') THEN
        RETURN json_build_object('success', false, 'error', 'Solo Psicólogo o Global pueden reabrir casos');
    END IF;

    -- 3. Obtener el caso
    SELECT * INTO v_caso FROM casos WHERE id = p_case_id;

    IF v_caso IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Caso no encontrado');
    END IF;

    -- 4. Verificar institución (si no es Global)
    IF v_user_role != 'global' THEN
        IF NOT EXISTS (
            SELECT 1 FROM periodos_escolares ps
            WHERE ps.student_id = v_caso.student_id
            AND ps.institution_id = v_user_institution
            AND ps.end_date IS NULL
        ) THEN
            RETURN json_build_object('success', false, 'error', 'El caso no pertenece a su institución');
        END IF;
    END IF;

    -- 5. Verificar que el caso esté cerrado
    IF v_caso.estado != 'cerrado' THEN
        RETURN json_build_object('success', false, 'error', 'Solo se pueden reabrir casos cerrados');
    END IF;

    -- 6. Validar motivo
    IF p_reopen_reason IS NULL OR TRIM(p_reopen_reason) = '' THEN
        RETURN json_build_object('success', false, 'error', 'El motivo de reapertura es obligatorio');
    END IF;

    -- 7. Reabrir caso: Cerrado → Inicio
    v_old_estado := v_caso.estado;

    -- El usuario que reabre se convierte en responsable
    v_psychologist_id := auth.uid();

    UPDATE casos
    SET estado = 'inicio',
        closed_at = NULL,
        close_reason = NULL,
        current_responsible_id = v_psychologist_id,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_case_id;

    -- 8. Registrar inicio de responsabilidad
    INSERT INTO caso_responsables_historial (
        caso_id, responsible_id, desde
    ) VALUES (
        p_case_id,
        v_psychologist_id,
        NOW()
    );

    -- 9. Auditar
    INSERT INTO auditoria (
        user_id, action, table_name, record_id,
        old_values, new_values
    ) VALUES (
        auth.uid(),
        'case_reopened',
        'casos',
        p_case_id,
        json_build_object('estado', v_old_estado),
        json_build_object('estado', 'inicio', 'reopen_reason', p_reopen_reason, 'current_responsible_id', v_psychologist_id)
    );

    RETURN json_build_object('success', true, 'message', 'Caso reabierto correctamente');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION reopen_case(UUID, TEXT) IS
'Reabre un caso cerrado. Cerrado → Inicio. Exige motivo. El usuario que reabre se convierte en responsable.';

-- ============================================================
-- T29: TRIGGER — PRIMERA ATENCIÓN → EN PROCESO
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_case_first_attention()
RETURNS TRIGGER AS $$
DECLARE
    v_caso RECORD;
    v_attention_count BIGINT;
BEGIN
    -- Obtener el caso
    SELECT * INTO v_caso FROM casos WHERE id = NEW.caso_id;

    IF v_caso IS NULL THEN
        RAISE EXCEPTION 'Caso no encontrado: %', NEW.caso_id;
    END IF;

    -- Contar atenciones existentes (incluyendo la que se acaba de insertar)
    SELECT COUNT(*) INTO v_attention_count
    FROM atenciones WHERE caso_id = NEW.caso_id;

    -- Si es la primera atención y el caso está en 'inicio', transicionar a 'en_proceso'
    IF v_attention_count = 1 AND v_caso.estado = 'inicio' THEN
        UPDATE casos
        SET estado = 'en_proceso',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.caso_id;

        -- Auditar la transición
        INSERT INTO auditoria (
            user_id, action, table_name, record_id,
            old_values, new_values
        ) VALUES (
            NEW.created_by,
            'case_auto_transition',
            'casos',
            NEW.caso_id,
            json_build_object('estado', 'inicio'),
            json_build_object('estado', 'en_proceso', 'trigger', 'first_attention')
        );
    END IF;

    -- Si el caso estaba cerrado y se crea una atención, es reapertura implícita
    -- (esto no debería ocurrir con las reglas actuales, pero por seguridad)
    IF v_caso.estado = 'cerrado' THEN
        RAISE EXCEPTION 'No se puede crear una atención en un caso cerrado. Reabra el caso primero.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Trigger en atenciones
DROP TRIGGER IF EXISTS trg_case_first_attention ON atenciones;
CREATE TRIGGER trg_case_first_attention
    AFTER INSERT ON atenciones
    FOR EACH ROW
    EXECUTE FUNCTION trigger_case_first_attention();

COMMENT ON FUNCTION trigger_case_first_attention() IS
'Trigger: cuando se inserta la primera atención de un caso en estado Inicio, transiciona automáticamente a En proceso.';

-- ============================================================
-- T29: RESTRICCIÓN — NO CREAR ATENCIÓN EN CASO CERRADO
-- ============================================================

-- Ya manejado en el trigger con RAISE EXCEPTION, pero reforzar con CHECK
-- El trigger es más informativo y auditado.

-- ============================================================
-- VERIFICACIÓN DE INTEGRIDAD
-- ============================================================

-- Verificar que edited_at fue agregada
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'atenciones' AND column_name = 'edited_at'
    ) THEN
        RAISE EXCEPTION 'Error: Columna edited_at no fue agregada a atenciones';
    END IF;
END $$;

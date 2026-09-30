-- Migración 054: Flujo de Casos, Derivaciones y Atenciones (F3)
-- Evolución Psicológica
-- Cierra la Falla #2 del UI_GAP_AUDIT: no existía create_case y
-- caso_responsables_historial solo acepta INSERT de Global (047:119),
-- por lo que el alta de Caso debe ser SECURITY DEFINER.
-- Cubre: CAS-01..07, ATN-01..04, DER-01..03 (spec §5.6/5.7/5.8).

-- ============================================================
-- 1) server_now — ATN-03 (cuenta regresiva con hora del servidor)
-- ============================================================
CREATE OR REPLACE FUNCTION server_now()
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT CURRENT_TIMESTAMP;
$$;

COMMENT ON FUNCTION server_now() IS
'ATN-03: hora del servidor para la ventana de 30 minutos de edición de atenciones.';

REVOKE ALL ON FUNCTION server_now() FROM anon;

-- ============================================================
-- 2) list_institution_psychologists — CAS-02/CAS-06
-- El frontend necesita la lista de Psicólogos de una I.E.:
-- la RLS de perfiles (015) no permite listar perfiles a
-- Psicólogo ni a Admin I.E., así que se expone por RPC.
-- ============================================================
CREATE OR REPLACE FUNCTION list_institution_psychologists(
    p_institution_id UUID DEFAULT NULL
)
RETURNS TABLE(user_id UUID, full_name TEXT)
AS $$
DECLARE
    v_role TEXT;
    v_user_inst UUID;
    v_inst UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    SELECT role, institution_id INTO v_role, v_user_inst
    FROM perfiles WHERE user_id = auth.uid();

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    v_inst := COALESCE(p_institution_id, v_user_inst);

    -- No Global: solo puede consultar psicólogos de su propia institución
    IF v_role != 'global' AND v_inst IS DISTINCT FROM v_user_inst THEN
        RAISE EXCEPTION 'No tienes permiso para ver esto.';
    END IF;

    RETURN QUERY
    SELECT p.user_id, p.full_name
    FROM perfiles p
    WHERE p.role = 'psicologo'
      AND p.institution_id = v_inst
    ORDER BY p.full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION list_institution_psychologists(UUID) IS
'CAS-02/CAS-06: lista de Psicólogos de una institución (selector de responsable).';

REVOKE ALL ON FUNCTION list_institution_psychologists(UUID) FROM anon;

-- ============================================================
-- 3) create_case — CAS-02 (Falla #2)
-- ============================================================
CREATE OR REPLACE FUNCTION create_case(
    p_student_id UUID,
    p_situation TEXT,
    p_derivation_id UUID DEFAULT NULL,
    p_responsible_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_inst UUID;
    v_period RECORD;
    v_case_id UUID;
    v_responsible UUID;
    v_resp_role TEXT;
    v_resp_inst UUID;
    v_derivation RECORD;
BEGIN
    -- 1. Usuario
    SELECT role, institution_id INTO v_user_role, v_user_inst
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no autenticado');
    END IF;

    -- 2. Roles (permissions.ts casos.gestionar; Docente excluido, §4)
    IF v_user_role NOT IN ('global', 'psicologo', 'director', 'admin_ie', 'coordinador') THEN
        RETURN json_build_object('success', false, 'error', 'Solo Psicólogo, Director, Admin I.E. o Coordinador pueden crear casos');
    END IF;

    -- 3. Situación obligatoria (CAS-02)
    IF p_situation IS NULL OR TRIM(p_situation) = '' THEN
        RETURN json_build_object('success', false, 'error', 'La situación del caso es obligatoria');
    END IF;

    -- 4. Estudiante
    IF NOT EXISTS (SELECT 1 FROM estudiantes WHERE id = p_student_id) THEN
        RETURN json_build_object('success', false, 'error', 'Estudiante no encontrado');
    END IF;

    -- 5. Período activo obligatorio: estudiante sin período activo no admite Caso
    SELECT * INTO v_period
    FROM periodos_escolares
    WHERE student_id = p_student_id AND end_date IS NULL
    ORDER BY start_date DESC
    LIMIT 1;

    IF v_period IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'El estudiante no tiene un período activo; no se puede crear un caso');
    END IF;

    -- 6. Institución (si no es Global)
    IF v_user_role != 'global' AND v_period.institution_id != v_user_inst THEN
        RETURN json_build_object('success', false, 'error', 'El caso no pertenece a su institución');
    END IF;

    -- 7. Derivación opcional: sin duplicar Caso (CAS-02)
    IF p_derivation_id IS NOT NULL THEN
        SELECT * INTO v_derivation
        FROM derivaciones WHERE id = p_derivation_id;

        IF v_derivation IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'La derivación no existe');
        END IF;
        IF v_derivation.student_id != p_student_id THEN
            RETURN json_build_object('success', false, 'error', 'La derivación no pertenece a este estudiante');
        END IF;
        IF v_derivation.caso_id IS NOT NULL THEN
            RETURN json_build_object('success', false, 'error', 'La derivación ya está vinculada a un caso');
        END IF;
        IF EXISTS (SELECT 1 FROM casos WHERE derivation_id = p_derivation_id) THEN
            RETURN json_build_object('success', false, 'error', 'Ya existe un caso para esta derivación');
        END IF;
    END IF;

    -- 8. Responsable: por defecto el usuario Psicólogo; si no lo es, obligatorio
    IF p_responsible_id IS NULL THEN
        IF v_user_role = 'psicologo' THEN
            v_responsible := auth.uid();
        ELSE
            RETURN json_build_object('success', false, 'error', 'Selecciona un Psicólogo responsable del caso');
        END IF;
    ELSE
        v_responsible := p_responsible_id;
    END IF;

    SELECT role, institution_id INTO v_resp_role, v_resp_inst
    FROM perfiles WHERE user_id = v_responsible;

    IF v_resp_role IS NULL OR v_resp_role != 'psicologo' THEN
        RETURN json_build_object('success', false, 'error', 'El responsable debe ser un Psicólogo');
    END IF;
    IF v_resp_inst IS DISTINCT FROM v_period.institution_id THEN
        RETURN json_build_object('success', false, 'error', 'El responsable debe pertenecer a la institución del estudiante');
    END IF;

    -- 9. Insertar caso (estado inicial: Inicio)
    INSERT INTO casos (student_id, situation, derivation_id, estado, current_responsible_id, created_by)
    VALUES (p_student_id, TRIM(p_situation), p_derivation_id, 'inicio', v_responsible, auth.uid())
    RETURNING id INTO v_case_id;

    -- 10. Historial de responsables (solo RPCs escriben aquí)
    INSERT INTO caso_responsables_historial (caso_id, responsible_id, desde)
    VALUES (v_case_id, v_responsible, NOW());

    -- 11. Vincular la derivación en ambos sentidos
    IF p_derivation_id IS NOT NULL THEN
        UPDATE derivaciones SET caso_id = v_case_id WHERE id = p_derivation_id;
    END IF;

    -- 12. Auditoría
    INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
    VALUES (
        auth.uid(),
        'case_created',
        'casos',
        v_case_id,
        json_build_object(
            'student_id', p_student_id,
            'situation', TRIM(p_situation),
            'derivation_id', p_derivation_id,
            'current_responsible_id', v_responsible
        )
    );

    RETURN json_build_object('success', true, 'case_id', v_case_id, 'message', 'Caso creado correctamente');

EXCEPTION
    -- Todo o nada (CAS-02): el handler revierte el bloque completo
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', 'No se pudo crear el caso: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION create_case(UUID, TEXT, UUID, UUID) IS
'CAS-02 (Falla #2): crea un Caso con responsable, historial y vinculación opcional de derivación.';

REVOKE ALL ON FUNCTION create_case(UUID, TEXT, UUID, UUID) FROM anon;

-- ============================================================
-- 4) reassign_case_responsible — CAS-06
-- ============================================================
CREATE OR REPLACE FUNCTION reassign_case_responsible(
    p_case_id UUID,
    p_new_responsible_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_inst UUID;
    v_caso RECORD;
    v_period RECORD;
    v_resp_role TEXT;
    v_resp_inst UUID;
    v_open_row_id UUID;
    v_open_desde TIMESTAMP WITH TIME ZONE;
    v_until TIMESTAMP WITH TIME ZONE;
BEGIN
    -- 1. Usuario
    SELECT role, institution_id INTO v_user_role, v_user_inst
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no autenticado');
    END IF;

    -- 2. Roles (§4: reasignar; Docente excluido)
    IF v_user_role NOT IN ('global', 'psicologo', 'director', 'admin_ie', 'coordinador') THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para reasignar casos');
    END IF;

    -- 3. Caso
    SELECT * INTO v_caso FROM casos WHERE id = p_case_id;
    IF v_caso IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Caso no encontrado');
    END IF;

    -- 4. Institución (si no es Global)
    IF v_user_role != 'global' THEN
        IF NOT EXISTS (
            SELECT 1 FROM periodos_escolares ps
            WHERE ps.student_id = v_caso.student_id
              AND ps.institution_id = v_user_inst
              AND ps.end_date IS NULL
        ) THEN
            RETURN json_build_object('success', false, 'error', 'El caso no pertenece a su institución');
        END IF;
    END IF;

    -- 5. Un caso cerrado no tiene responsable activo
    IF v_caso.estado = 'cerrado' THEN
        RETURN json_build_object('success', false, 'error', 'No se puede reasignar un caso cerrado');
    END IF;

    -- 6. Nuevo responsable: Psicólogo de la institución del estudiante
    IF p_new_responsible_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Selecciona un Psicólogo responsable');
    END IF;
    IF p_new_responsible_id = v_caso.current_responsible_id THEN
        RETURN json_build_object('success', false, 'error', 'El nuevo responsable ya es el responsable actual');
    END IF;

    SELECT role, institution_id INTO v_resp_role, v_resp_inst
    FROM perfiles WHERE user_id = p_new_responsible_id;

    IF v_resp_role IS NULL OR v_resp_role != 'psicologo' THEN
        RETURN json_build_object('success', false, 'error', 'El responsable debe ser un Psicólogo');
    END IF;

    SELECT * INTO v_period
    FROM periodos_escolares
    WHERE student_id = v_caso.student_id AND end_date IS NULL
    ORDER BY start_date DESC LIMIT 1;

    IF v_resp_inst IS DISTINCT FROM v_period.institution_id THEN
        RETURN json_build_object('success', false, 'error', 'El responsable debe pertenecer a la institución del estudiante');
    END IF;

    -- 7. Cerrar el registro abierto del responsable saliente (hasta > desde, 043)
    IF v_caso.current_responsible_id IS NOT NULL THEN
        SELECT id, desde INTO v_open_row_id, v_open_desde
        FROM caso_responsables_historial
        WHERE caso_id = p_case_id
          AND responsible_id = v_caso.current_responsible_id
          AND hasta IS NULL
        ORDER BY desde DESC
        LIMIT 1;

        IF v_open_row_id IS NOT NULL THEN
            v_until := GREATEST(NOW(), v_open_desde + INTERVAL '1 microsecond');
            UPDATE caso_responsables_historial
            SET hasta = v_until,
                motivo_salida = 'reasignacion'
            WHERE id = v_open_row_id;
        ELSE
            v_until := GREATEST(NOW(), v_caso.opened_at + INTERVAL '1 microsecond');
            INSERT INTO caso_responsables_historial (caso_id, responsible_id, desde, hasta, motivo_salida)
            VALUES (p_case_id, v_caso.current_responsible_id, v_caso.opened_at, v_until, 'reasignacion');
        END IF;
    END IF;

    -- 8. Nuevo responsable activo
    INSERT INTO caso_responsables_historial (caso_id, responsible_id, desde)
    VALUES (p_case_id, p_new_responsible_id, NOW());

    UPDATE casos
    SET current_responsible_id = p_new_responsible_id,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_case_id;

    -- 9. Auditoría
    INSERT INTO auditoria (user_id, action, table_name, record_id, old_values, new_values)
    VALUES (
        auth.uid(),
        'case_reassigned',
        'casos',
        p_case_id,
        json_build_object('current_responsible_id', v_caso.current_responsible_id),
        json_build_object(
            'current_responsible_id', p_new_responsible_id,
            'reason', p_reason
        )
    );

    RETURN json_build_object('success', true, 'message', 'Responsable actualizado');

EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', 'No se pudo reasignar: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION reassign_case_responsible(UUID, UUID, TEXT) IS
'CAS-06: reasigna el responsable del Caso con historial desde/hasta y auditoría.';

REVOKE ALL ON FUNCTION reassign_case_responsible(UUID, UUID, TEXT) FROM anon;

-- ============================================================
-- 5) create_derivation — DER-02 (sin Caso)
--    El período escolar se determina por la fecha del evento.
-- ============================================================
CREATE OR REPLACE FUNCTION create_derivation(
    p_student_id UUID,
    p_derivation_date DATE,
    p_derivador_nombre VARCHAR,
    p_derivador_cargo VARCHAR,
    p_motivo TEXT,
    p_resumen TEXT DEFAULT NULL,
    p_acciones_previas TEXT DEFAULT NULL,
    p_adjunto_url TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_inst UUID;
    v_derivation_id UUID;
    v_period_id UUID;
BEGIN
    -- 1. Usuario
    SELECT role, institution_id INTO v_user_role, v_user_inst
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no autenticado');
    END IF;

    -- 2. Roles (permissions.ts derivaciones.crear; Docente excluido, §4)
    IF v_user_role NOT IN ('global', 'psicologo', 'director', 'admin_ie', 'coordinador') THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para crear derivaciones');
    END IF;

    -- 3. Campos obligatorios
    IF p_derivador_nombre IS NULL OR TRIM(p_derivador_nombre) = '' THEN
        RETURN json_build_object('success', false, 'error', 'El nombre del derivador es obligatorio');
    END IF;
    IF p_derivador_cargo IS NULL OR TRIM(p_derivador_cargo) = '' THEN
        RETURN json_build_object('success', false, 'error', 'El cargo del derivador es obligatorio');
    END IF;
    IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
        RETURN json_build_object('success', false, 'error', 'El motivo de la derivación es obligatorio');
    END IF;
    IF p_derivation_date IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'La fecha de la derivación es obligatoria');
    END IF;

    -- 4. Estudiante
    IF NOT EXISTS (SELECT 1 FROM estudiantes WHERE id = p_student_id) THEN
        RETURN json_build_object('success', false, 'error', 'Estudiante no encontrado');
    END IF;

    -- 5. Institución (si no es Global): mismo alcance que RLS derivaciones_insert_scoped
    IF v_user_role != 'global' THEN
        IF NOT EXISTS (
            SELECT 1 FROM periodos_escolares
            WHERE student_id = p_student_id AND institution_id = v_user_inst
        ) THEN
            RETURN json_build_object('success', false, 'error', 'La derivación no pertenece a su institución');
        END IF;
    END IF;

    -- 6. Período escolar por fecha del evento [inicio, cierre]; el abierto cubre cualquier fecha posterior
    SELECT id INTO v_period_id
    FROM periodos_escolares
    WHERE student_id = p_student_id
      AND start_date <= p_derivation_date
      AND (end_date IS NULL OR p_derivation_date <= end_date)
    ORDER BY (end_date IS NULL) DESC, start_date DESC
    LIMIT 1;

    IF v_period_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'El estudiante no tiene un período escolar que incluya la fecha indicada');
    END IF;

    -- 7. Insertar derivación (sin Caso: puede guardarse sin Caso, DER-02)
    INSERT INTO derivaciones (
        student_id, derivation_date, school_period_id,
        derivador_nombre, derivador_cargo, registrador_id,
        motivo, resumen, acciones_previas, adjunto_url
    ) VALUES (
        p_student_id, p_derivation_date, v_period_id,
        TRIM(p_derivador_nombre), TRIM(p_derivador_cargo), auth.uid(),
        TRIM(p_motivo), p_resumen, p_acciones_previas, p_adjunto_url
    )
    RETURNING id INTO v_derivation_id;

    -- 8. Auditoría
    INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
    VALUES (
        auth.uid(),
        'derivation_created',
        'derivaciones',
        v_derivation_id,
        json_build_object('student_id', p_student_id, 'derivation_date', p_derivation_date)
    );

    RETURN json_build_object('success', true, 'derivation_id', v_derivation_id, 'message', 'Derivación registrada');

EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', 'No se pudo registrar la derivación: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION create_derivation(UUID, DATE, VARCHAR, VARCHAR, TEXT, TEXT, TEXT, TEXT) IS
'DER-02: crea una derivación; el período escolar se determina por la fecha del evento.';

REVOKE ALL ON FUNCTION create_derivation(UUID, DATE, VARCHAR, VARCHAR, TEXT, TEXT, TEXT, TEXT) FROM anon;

-- ============================================================
-- 6) create_referral_with_case — DER-02 (toggle) + CAS-02 (mini-form)
--    Derivación + Caso en una sola transacción (todo o nada).
-- ============================================================
CREATE OR REPLACE FUNCTION create_referral_with_case(
    p_student_id UUID,
    p_derivation_date DATE,
    p_derivador_nombre VARCHAR,
    p_derivador_cargo VARCHAR,
    p_motivo TEXT,
    p_situation TEXT,
    p_resumen TEXT DEFAULT NULL,
    p_acciones_previas TEXT DEFAULT NULL,
    p_adjunto_url TEXT DEFAULT NULL,
    p_responsible_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_der JSON;
    v_case JSON;
    v_derivation_id UUID;
    v_case_id UUID;
BEGIN
    -- 1. Derivación primero (valida campos, período e institución)
    v_der := create_derivation(
        p_student_id, p_derivation_date, p_derivador_nombre, p_derivador_cargo,
        p_motivo, p_resumen, p_acciones_previas, p_adjunto_url
    );

    IF NOT (v_der->>'success')::BOOLEAN THEN
        RETURN v_der;
    END IF;

    v_derivation_id := (v_der->>'derivation_id')::UUID;

    -- 2. Caso ligado a la derivación recién creada
    v_case := create_case(p_student_id, p_situation, v_derivation_id, p_responsible_id);

    IF NOT (v_case->>'success')::BOOLEAN THEN
        -- Todo o nada: revierte también la derivación insertada en este bloque
        RAISE EXCEPTION '%', COALESCE(v_case->>'error', 'No se pudo crear el caso');
    END IF;

    v_case_id := (v_case->>'case_id')::UUID;

    RETURN json_build_object(
        'success', true,
        'derivation_id', v_derivation_id,
        'case_id', v_case_id,
        'message', 'Derivación y caso creados'
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION create_referral_with_case(UUID, DATE, VARCHAR, VARCHAR, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) IS
'DER-02 (toggle "Crear Caso") y CAS-02 (mini-form de derivación): derivación + caso en una transacción.';

REVOKE ALL ON FUNCTION create_referral_with_case(UUID, DATE, VARCHAR, VARCHAR, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM anon;

-- ============================================================
-- 7) link_case_derivation — DER-03 (vincular como antecedente)
-- ============================================================
CREATE OR REPLACE FUNCTION link_case_derivation(
    p_case_id UUID,
    p_derivation_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_user_role TEXT;
    v_user_inst UUID;
    v_caso RECORD;
    v_derivation RECORD;
BEGIN
    -- 1. Usuario
    SELECT role, institution_id INTO v_user_role, v_user_inst
    FROM perfiles WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no autenticado');
    END IF;

    -- 2. Roles
    IF v_user_role NOT IN ('global', 'psicologo', 'director', 'admin_ie', 'coordinador') THEN
        RETURN json_build_object('success', false, 'error', 'No tiene permisos para vincular derivaciones');
    END IF;

    -- 3. Caso
    SELECT * INTO v_caso FROM casos WHERE id = p_case_id;
    IF v_caso IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Caso no encontrado');
    END IF;

    IF v_user_role != 'global' THEN
        IF NOT EXISTS (
            SELECT 1 FROM periodos_escolares ps
            WHERE ps.student_id = v_caso.student_id
              AND ps.institution_id = v_user_inst
              AND ps.end_date IS NULL
        ) THEN
            RETURN json_build_object('success', false, 'error', 'El caso no pertenece a su institución');
        END IF;
    END IF;

    -- 4. Derivación
    SELECT * INTO v_derivation FROM derivaciones WHERE id = p_derivation_id;
    IF v_derivation IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'La derivación no existe');
    END IF;
    IF v_derivation.student_id != v_caso.student_id THEN
        RETURN json_build_object('success', false, 'error', 'La derivación pertenece a otro estudiante');
    END IF;

    -- 5. Sin duplicados en ninguno de los dos lados
    IF v_caso.derivation_id IS NOT NULL THEN
        RETURN json_build_object('success', false, 'error', 'El caso ya tiene una derivación vinculada');
    END IF;
    IF v_derivation.caso_id IS NOT NULL THEN
        RETURN json_build_object('success', false, 'error', 'La derivación ya está vinculada a un caso');
    END IF;

    -- 6. Vincular (la derivación queda como antecedente; no se reescribe)
    UPDATE casos SET derivation_id = p_derivation_id, updated_at = CURRENT_TIMESTAMP
    WHERE id = p_case_id;
    UPDATE derivaciones SET caso_id = p_case_id
    WHERE id = p_derivation_id;

    -- 7. Auditoría
    INSERT INTO auditoria (user_id, action, table_name, record_id, new_values)
    VALUES (
        auth.uid(),
        'case_derivation_linked',
        'casos',
        p_case_id,
        json_build_object('derivation_id', p_derivation_id)
    );

    RETURN json_build_object('success', true, 'message', 'Derivación vinculada como antecedente');

EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', 'No se pudo vincular: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION link_case_derivation(UUID, UUID) IS
'DER-03: vincula una derivación existente a un Caso como antecedente, sin reescribirla.';

REVOKE ALL ON FUNCTION link_case_derivation(UUID, UUID) FROM anon;

-- ============================================================
-- 8) list_attention_audit — ATN-04
-- La RLS de auditoría (014) solo deja ver Global las filas ajenas;
-- roles con acceso a auditoría (§4) consultan metadatos por RPC.
-- ============================================================
CREATE OR REPLACE FUNCTION list_attention_audit(
    p_attention_id UUID
)
RETURNS TABLE(
    action TEXT,
    user_id UUID,
    user_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE
)
AS $$
DECLARE
    v_role TEXT;
    v_user_inst UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    SELECT role, institution_id INTO v_role, v_user_inst
    FROM perfiles WHERE user_id = auth.uid();

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    -- §4: Auditoría solo Global/Director/Admin I.E./Coordinador (nunca Psicólogo/Docente)
    IF v_role NOT IN ('global', 'director', 'admin_ie', 'coordinador') THEN
        RAISE EXCEPTION 'No tienes permiso para ver esto.';
    END IF;

    -- La atención debe existir y pertenecer a la institución (si no es Global)
    IF NOT EXISTS (
        SELECT 1
        FROM atenciones a
        JOIN casos c ON c.id = a.caso_id
        WHERE a.id = p_attention_id
          AND (
              v_role = 'global'
              OR EXISTS (
                  SELECT 1 FROM periodos_escolares ps
                  WHERE ps.student_id = c.student_id
                    AND ps.institution_id = v_user_inst
              )
          )
    ) THEN
        RAISE EXCEPTION 'Atención no encontrada';
    END IF;

    -- Solo metadatos (quién/cuándo), sin contenido clínico
    RETURN QUERY
    SELECT au.action, au.user_id, COALESCE(pf.full_name, 'Usuario'), au.created_at
    FROM auditoria au
    LEFT JOIN perfiles pf ON pf.user_id = au.user_id
    WHERE au.table_name = 'atenciones'
      AND au.record_id = p_attention_id
    ORDER BY au.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION list_attention_audit(UUID) IS
'ATN-04: historial de cambios de una atención (solo metadatos) para roles con acceso a auditoría.';

REVOKE ALL ON FUNCTION list_attention_audit(UUID) FROM anon;

-- ============================================================
-- VERIFICACIÓN DE INTEGRIDAD
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_case') THEN
        RAISE EXCEPTION 'Error: create_case no fue creada (Falla #2)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reassign_case_responsible') THEN
        RAISE EXCEPTION 'Error: reassign_case_responsible no fue creada';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_derivation') THEN
        RAISE EXCEPTION 'Error: create_derivation no fue creada';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_referral_with_case') THEN
        RAISE EXCEPTION 'Error: create_referral_with_case no fue creada';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'link_case_derivation') THEN
        RAISE EXCEPTION 'Error: link_case_derivation no fue creada';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'list_institution_psychologists') THEN
        RAISE EXCEPTION 'Error: list_institution_psychologists no fue creada';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'list_attention_audit') THEN
        RAISE EXCEPTION 'Error: list_attention_audit no fue creada';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'server_now') THEN
        RAISE EXCEPTION 'Error: server_now no fue creada';
    END IF;
END $$;

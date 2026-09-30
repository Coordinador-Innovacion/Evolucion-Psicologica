-- ============================================================
-- 056 — FASE 5 (TRF): find_transferable_case
-- Contexto: P7 (§10.7) resuelto por el dueño — B (institución
-- destino) necesita identificar el Caso/estudiante de otra I.E.
-- para solicitar una transferencia, pero la RLS no le deja ver
-- `casos` ni `estudiantes` de A. Se expone una RPC SECURITY
-- DEFINER con DATOS MÍNIMOS (sin contenido clínico): datos del
-- estudiante, I.E. de origen (período activo) e id/situación/
-- estado de sus casos.
-- Flujo TRF-02: check_student_duplicates_by_dni (DNI → student)
-- → find_transferable_case (student → casos + origen) →
-- initiate_transfer (048).
-- ============================================================

CREATE OR REPLACE FUNCTION find_transferable_case(
    p_student_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_role TEXT;
    v_student RECORD;
    v_origin RECORD;
    v_cases JSONB;
BEGIN
    SELECT role INTO v_role
    FROM perfiles
    WHERE user_id = auth.uid() AND activo;

    IF v_role IS NULL OR v_role NOT IN ('global', 'director', 'admin_ie') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo Director o Admin I.E. pueden identificar casos transferibles'
        );
    END IF;

    SELECT id, first_names, last_names, document_number
    INTO v_student
    FROM estudiantes
    WHERE id = p_student_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Estudiante no encontrado');
    END IF;

    -- Origen de la transferencia = I.E. del período activo del estudiante.
    SELECT i.id AS institution_id, i.name AS institution_name
    INTO v_origin
    FROM periodos_escolares pe
    JOIN institutions i ON i.id = pe.institution_id
    WHERE pe.student_id = p_student_id
      AND pe.end_date IS NULL
      AND pe.tipo = 'regular'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'El estudiante no tiene un período activo en ninguna institución'
        );
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'caso_id', c.id,
                'situation', c.situation,
                'estado', c.estado,
                'created_at', c.created_at
            )
            ORDER BY c.created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_cases
    FROM casos c
    WHERE c.student_id = p_student_id;

    RETURN json_build_object(
        'success', true,
        'student_id', v_student.id,
        'student_name', v_student.last_names || ', ' || v_student.first_names,
        'document_number', v_student.document_number,
        'origin_institution_id', v_origin.institution_id,
        'origin_institution_name', v_origin.institution_name,
        'cases', v_cases
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION find_transferable_case(UUID) IS
'TRF-02/F5 (P7): B (destino) localiza el caso y la I.E. origen para iniciar transferencia. Datos mínimos sin contenido clínico. Solo Global/Director/Admin I.E.';

REVOKE ALL ON FUNCTION find_transferable_case(UUID) FROM anon;

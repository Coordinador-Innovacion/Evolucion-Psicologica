-- Migración 042: fix check_student_duplicates_by_name — HAVING sin GROUP BY
-- Evolución Psicológica
--
-- En 021, RETURN QUERY usaba HAVING sobre expresiones de estudiantes e
-- sin GROUP BY ni agregado; PostgreSQL rechaza columnas de e en HAVING
-- cuando no hay agrupación. Se reestructura como subquery con WHERE sim > 0.5.

CREATE OR REPLACE FUNCTION check_student_duplicates_by_name(
    p_first_names VARCHAR,
    p_last_names VARCHAR,
    p_birth_date DATE,
    p_exclude_id UUID DEFAULT NULL
)
RETURNS TABLE (
    student_id UUID,
    full_name VARCHAR,
    document_type VARCHAR,
    document_number VARCHAR,
    birth_date DATE,
    match_type TEXT,
    similarity NUMERIC
) AS $$
DECLARE
    v_normalized_first VARCHAR;
    v_normalized_last VARCHAR;
BEGIN
    v_normalized_first := LOWER(TRIM(p_first_names));
    v_normalized_last := LOWER(TRIM(p_last_names));

    RETURN QUERY
    SELECT
        sub.id,
        (sub.first_names || ' ' || sub.last_names)::VARCHAR,
        sub.document_type,
        sub.document_number,
        sub.birth_date,
        'name_similarity'::TEXT,
        sub.sim
    FROM (
        SELECT
            e.id,
            e.first_names,
            e.last_names,
            e.document_type,
            e.document_number,
            e.birth_date,
            CASE
                WHEN LOWER(TRIM(e.first_names)) = v_normalized_first
                 AND LOWER(TRIM(e.last_names)) = v_normalized_last
                 AND e.birth_date = p_birth_date
                THEN 1.0::NUMERIC
                WHEN LOWER(TRIM(e.first_names)) = v_normalized_first
                 AND LOWER(TRIM(e.last_names)) = v_normalized_last
                THEN 0.8::NUMERIC
                WHEN similarity(LOWER(TRIM(e.first_names)), v_normalized_first) > 0.6
                 AND similarity(LOWER(TRIM(e.last_names)), v_normalized_last) > 0.6
                THEN 0.6::NUMERIC
                ELSE 0.0::NUMERIC
            END AS sim
        FROM estudiantes e
        WHERE (p_exclude_id IS NULL OR e.id != p_exclude_id)
        AND (
            (LOWER(TRIM(e.first_names)) = v_normalized_first
             AND LOWER(TRIM(e.last_names)) = v_normalized_last
             AND e.birth_date = p_birth_date)
            OR
            (similarity(LOWER(TRIM(e.first_names)), v_normalized_first) > 0.6
             AND similarity(LOWER(TRIM(e.last_names)), v_normalized_last) > 0.6)
        )
    ) sub
    WHERE sub.sim > 0.5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, pg_temp;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'check_student_duplicates_by_name'
    ) THEN
        RAISE EXCEPTION 'Error: check_student_duplicates_by_name no fue recreada';
    END IF;
END $$;

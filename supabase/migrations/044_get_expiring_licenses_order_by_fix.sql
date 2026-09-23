-- Migración 044: fix get_expiring_licenses — ORDER BY fuera de json_agg
-- Evolución Psicológica
--
-- 032 generaba:
--   SELECT json_agg(...) ... ORDER BY l.end_date ASC
-- En PostgreSQL, ORDER BY en consulta agregada exige columna en GROUP BY
-- o dentro de un agregado → ERROR 42803 en runtime.
-- Fix: ORDER BY dentro de json_agg(... ORDER BY l.end_date ASC).

CREATE OR REPLACE FUNCTION get_expiring_licenses()
RETURNS JSON AS $$
DECLARE
    v_today DATE;
BEGIN
    v_today := CURRENT_DATE;

    RETURN (
        SELECT json_build_object(
            'success', true,
            'data', (
                SELECT json_agg(
                    json_build_object(
                        'license_id', l.id,
                        'institution_id', l.institution_id,
                        'institution_name', i.name,
                        'end_date', l.end_date,
                        'days_remaining', l.end_date - v_today,
                        'message', CASE
                            WHEN l.end_date < v_today THEN
                                'Licencia vencida desde el ' || l.end_date || '.'
                            ELSE
                                'Faltan ' || (l.end_date - v_today) || ' día(s) para el vencimiento.'
                        END
                    )
                    ORDER BY l.end_date ASC
                )
                FROM licencias l
                JOIN institutions i ON i.id = l.institution_id
                WHERE l.end_date <= v_today + 30
            )
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION get_expiring_licenses() IS
'Retorna licencias con ≤30 días para vencer o ya vencidas. ORDER BY dentro de json_agg. T38/044.';

DO $$
DECLARE r JSON;
BEGIN
    r := public.get_expiring_licenses();
    IF r->>'success' IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'Error: get_expiring_licenses no retornó success=true: %', r;
    END IF;
END $$;

CREATE TEMP TABLE _diag_t64 AS
SELECT public.get_expiring_licenses() AS r
UNION ALL
SELECT (
        SELECT json_build_object(
            'success', true,
            'data', (
                SELECT json_agg(json_build_object(
                    'license_id', l.id,
                    'institution_id', l.institution_id,
                    'institution_name', i.name,
                    'end_date', l.end_date,
                    'days_remaining', l.end_date - (CURRENT_DATE)::date,
                    'message', 'x'
                ))
                FROM licencias l
                JOIN institutions i ON i.id = l.institution_id
                WHERE l.end_date <= (CURRENT_DATE)::date + 30
                ORDER BY l.end_date ASC
            )
        )
    )::text
UNION ALL
SELECT (
        SELECT json_agg(json_build_object(
                    'license_id', l.id,
                    'end_date', l.end_date,
                    'days_remaining', l.end_date - (CURRENT_DATE)::date
                ))
                FROM licencias l
                WHERE l.end_date <= (CURRENT_DATE)::date + 30
                ORDER BY l.end_date ASC
        )::text
;

GRANT SELECT ON _diag_t64 TO authenticated;
SELECT r FROM _diag_t64;

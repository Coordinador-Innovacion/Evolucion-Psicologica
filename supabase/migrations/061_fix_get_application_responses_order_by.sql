-- 061: get_application_responses fallaba con
--   42803: column "p.sort_order" must appear in the GROUP BY clause
-- porque el ORDER BY estaba fuera del agregado:
--   SELECT json_agg(...) FROM ... ORDER BY p.sort_order
-- El respondiente que recargaba la página no recuperaba sus respuestas
-- (hidratación rota en useSurveyResponse). Mismo patrón ya corregido en
-- 041 y 044: ORDER BY dentro de json_agg(... ORDER BY ...).

CREATE OR REPLACE FUNCTION get_application_responses(
    p_token TEXT,
    p_application_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_application RECORD;
BEGIN
    -- Verificar token y que la aplicación coincide
    SELECT * INTO v_application
    FROM encuesta_aplicaciones
    WHERE access_token = p_token AND id = p_application_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Aplicación no válida para este enlace');
    END IF;

    RETURN (
        SELECT json_build_object(
            'success', true,
            'data', (
                SELECT json_agg(json_build_object(
                    'question_id', r.question_id,
                    'question_label', p.label,
                    'question_type', p.question_type,
                    'answer', r.answer,
                    'answered_at', r.answered_at
                ) ORDER BY p.sort_order)
                FROM encuesta_respuestas r
                JOIN encuesta_preguntas p ON p.id = r.question_id
                WHERE r.application_id = p_application_id
            )
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

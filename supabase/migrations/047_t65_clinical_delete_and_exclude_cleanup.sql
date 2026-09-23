-- Migración 047: T65 — limpieza EXCLUDE invertida + DELETE clínico solo Global
-- Evolución Psicológica
--
-- 1) Quitar EXCLUDE original invertido (WHERE end_date IS NOT NULL) —
--    superado por periodos_escolares_student_year_excl (045/046, semiabierto '[)').
-- 2) CONSTITUTION 8 / IMPLEMENT:9 — no borrado físico de historia clínica
--    por roles de IE; solo Global (y aún así operación sensible auditada).

-- 1) Drop EXCLUDE invertida legada (003)
ALTER TABLE periodos_escolares
    DROP CONSTRAINT IF EXISTS periodos_escolares_student_id_school_year_daterange_excl;

-- 2) casos: DELETE solo Global (antes: FOR ALL incluía psicologo en 036)
DROP POLICY IF EXISTS "Psychologist can manage cases in institution" ON casos;
DROP POLICY IF EXISTS "Global can manage all cases" ON casos;

CREATE POLICY "casos_select_scoped"
    ON casos FOR SELECT
    USING (
        is_global_user()
        OR student_id IN (
            SELECT pe.student_id FROM periodos_escolares pe
            WHERE pe.institution_id = get_user_institution()
        )
    );

CREATE POLICY "casos_insert_scoped"
    ON casos FOR INSERT
    WITH CHECK (
        is_global_user()
        OR (
            get_user_role() IN ('psicologo', 'director', 'admin_ie', 'coordinador')
            AND student_id IN (
                SELECT pe.student_id FROM periodos_escolares pe
                WHERE pe.institution_id = get_user_institution()
            )
        )
    );

CREATE POLICY "casos_update_scoped"
    ON casos FOR UPDATE
    USING (
        is_global_user()
        OR (
            get_user_role() IN ('psicologo', 'director', 'admin_ie', 'coordinador')
            AND student_id IN (
                SELECT pe.student_id FROM periodos_escolares pe
                WHERE pe.institution_id = get_user_institution()
            )
        )
    );

CREATE POLICY "casos_delete_global"
    ON casos FOR DELETE
    USING (is_global_user());

-- 3) atenciones: DELETE solo Global
DROP POLICY IF EXISTS "Psychologist can manage attentions in their institution" ON atenciones;
DROP POLICY IF EXISTS "Global can manage all attentions" ON atenciones;

CREATE POLICY "atenciones_select_scoped"
    ON atenciones FOR SELECT
    USING (
        is_global_user()
        OR caso_id IN (
            SELECT c.id FROM casos c
            JOIN periodos_escolares pe ON pe.student_id = c.student_id
            WHERE pe.institution_id = get_user_institution()
        )
    );

CREATE POLICY "atenciones_insert_scoped"
    ON atenciones FOR INSERT
    WITH CHECK (
        is_global_user()
        OR (
            get_user_role() IN ('psicologo', 'director', 'admin_ie', 'coordinador')
            AND caso_id IN (
                SELECT c.id FROM casos c
                JOIN periodos_escolares pe ON pe.student_id = c.student_id
                WHERE pe.institution_id = get_user_institution()
            )
        )
    );

CREATE POLICY "atenciones_update_scoped"
    ON atenciones FOR UPDATE
    USING (
        is_global_user()
        OR (
            get_user_role() IN ('psicologo', 'director', 'admin_ie', 'coordinador')
            AND caso_id IN (
                SELECT c.id FROM casos c
                JOIN periodos_escolares pe ON pe.student_id = c.student_id
                WHERE pe.institution_id = get_user_institution()
            )
        )
    );

CREATE POLICY "atenciones_delete_global"
    ON atenciones FOR DELETE
    USING (is_global_user());

-- 4) caso_responsables_historial: DELETE solo Global
DROP POLICY IF EXISTS "Psych can manage case history" ON caso_responsables_historial;
DROP POLICY IF EXISTS "Global can manage case history" ON caso_responsables_historial;

CREATE POLICY "historial_select_scoped"
    ON caso_responsables_historial FOR SELECT
    USING (
        is_global_user()
        OR caso_id IN (
            SELECT c.id FROM casos c
            JOIN periodos_escolares pe ON pe.student_id = c.student_id
            WHERE pe.institution_id = get_user_institution()
        )
    );

CREATE POLICY "historial_write_definer_only"
    ON caso_responsables_historial FOR INSERT
    WITH CHECK (is_global_user());

CREATE POLICY "historial_update_global"
    ON caso_responsables_historial FOR UPDATE
    USING (is_global_user());

CREATE POLICY "historial_delete_global"
    ON caso_responsables_historial FOR DELETE
    USING (is_global_user());

-- Verificación
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM pg_constraint
    WHERE conname = 'periodos_escolares_student_id_school_year_daterange_excl';
    IF n > 0 THEN
        RAISE EXCEPTION 'Error: EXCLUDE invertida aún existe';
    END IF;

    SELECT count(*) INTO n FROM pg_constraint
    WHERE conname = 'periodos_escolares_student_year_excl';
    IF n = 0 THEN
        RAISE EXCEPTION 'Error: EXCLUDE semiabierta ausente';
    END IF;

    SELECT count(*) INTO n FROM pg_policies
    WHERE tablename = 'casos' AND policyname = 'casos_delete_global';
    IF n = 0 THEN
        RAISE EXCEPTION 'Error: casos_delete_global ausente';
    END IF;
END $$;

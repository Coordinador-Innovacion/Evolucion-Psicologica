-- Migración 036: Casos — RLS acotado por institución (T54)
-- Evolución Psicológica
--
-- Corrección de aislamiento requerida por la UX de Caso (T54) y por
-- Constitution 4/5 (seguridad por rol e institución validada en servidor):
-- las políticas FOR ALL anteriores de casos, atenciones y
-- caso_responsables_historiales concedían UPDATE/INSERT/DELETE a cualquier
-- Psicólogo/GLOBAL SIN acotar por institución (el USING solo verificaba el rol),
-- por lo que un cliente manipulado podía alterar registros de otra institución
-- saltándose las validaciones de close_case/reopen_case/update_attention/
-- create_attention. El alcance por ROL no cambia; solo se añade el acote por
-- INSTITUCIÓN que la documentación ya exige.

-- ============================================================
-- casos
-- ============================================================

DROP POLICY IF EXISTS "Psychologist can manage cases" ON casos;

CREATE POLICY "Psychologist can manage cases in their institution"
    ON casos FOR ALL
    USING (
        is_global_user()
        OR (
            get_user_role() = 'psicologo'
            AND student_id IN (
                SELECT student_id FROM periodos_escolares
                WHERE institution_id = get_user_institution()
            )
        )
    );

-- ============================================================
-- atenciones
-- ============================================================

DROP POLICY IF EXISTS "Psychologist can manage attentions" ON atenciones;

CREATE POLICY "Psychologist can manage attentions in their institution"
    ON atenciones FOR ALL
    USING (
        is_global_user()
        OR (
            get_user_role() = 'psicologo'
            AND caso_id IN (
                SELECT c.id FROM casos c
                WHERE c.student_id IN (
                    SELECT student_id FROM periodos_escolares
                    WHERE institution_id = get_user_institution()
                )
            )
        )
    );

-- ============================================================
-- caso_responsables_historial
-- ============================================================

DROP POLICY IF EXISTS "Psychologist can manage case history" ON caso_responsables_historial;

CREATE POLICY "Psychologist can manage case history in their institution"
    ON caso_responsables_historial FOR ALL
    USING (
        is_global_user()
        OR (
            get_user_role() = 'psicologo'
            AND caso_id IN (
                SELECT c.id FROM casos c
                WHERE c.student_id IN (
                    SELECT student_id FROM periodos_escolares
                    WHERE institution_id = get_user_institution()
                )
            )
        )
    );

-- ============================================================
-- VERIFICACIÓN DE INTEGRIDAD
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'casos'
        AND policyname = 'Psychologist can manage cases in their institution'
    ) THEN
        RAISE EXCEPTION 'Error: política de casos no fue creada';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'casos'
        AND policyname = 'Psychologist can manage cases'
    ) THEN
        RAISE EXCEPTION 'Error: la política sin acote institucional de casos no fue eliminada';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'atenciones'
        AND policyname = 'Psychologist can manage attentions in their institution'
    ) THEN
        RAISE EXCEPTION 'Error: política de atenciones no fue creada';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'atenciones'
        AND policyname = 'Psychologist can manage attentions'
    ) THEN
        RAISE EXCEPTION 'Error: la política sin acote institucional de atenciones no fue eliminada';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'caso_responsables_historial'
        AND policyname = 'Psychologist can manage case history in their institution'
    ) THEN
        RAISE EXCEPTION 'Error: política de historial de responsables no fue creada';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'caso_responsables_historial'
        AND policyname = 'Psychologist can manage case history'
    ) THEN
        RAISE EXCEPTION 'Error: la política sin acote institucional del historial no fue eliminada';
    END IF;
END $$;

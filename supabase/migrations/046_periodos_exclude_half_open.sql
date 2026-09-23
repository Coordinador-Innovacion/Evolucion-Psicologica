-- Migración 046: fix EXCLUDE periodos — semiabierto '[)' evita solape same-day
-- Evolución Psicológica
--
-- 045 usó daterange(..., '[]') con end_date inclusivo: transferir cierra origen
-- y abre destino el MISMO día → boundary overlap → 23514.
-- Fix: '[)' (fin exclusivo), estándar para rangos de fechas contiguos.

ALTER TABLE periodos_escolares
    DROP CONSTRAINT IF EXISTS periodos_escolares_student_year_excl;

ALTER TABLE periodos_escolares
    ADD CONSTRAINT periodos_escolares_student_year_excl
    EXCLUDE USING gist (
        student_id WITH =,
        school_year WITH =,
        daterange(start_date, COALESCE(end_date, 'infinity'::date), '[)') WITH &&
    );

DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM pg_constraint
    WHERE conname = 'periodos_escolares_student_year_excl';
    IF n = 0 THEN
        RAISE EXCEPTION 'Error: EXCLUDE periodos no aplicado';
    END IF;
END $$;

COMMENT ON CONSTRAINT periodos_escolares_student_year_excl ON periodos_escolares IS
'Un estudiante/año sin solape de períodos (activos con end=infinity, fin exclusivo). T65/H2+046.';

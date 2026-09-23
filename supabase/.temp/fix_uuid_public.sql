DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'uuid_generate_v4'
        AND n.nspname = 'public'
    ) THEN
        CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid AS
        $fn$ SELECT extensions.uuid_generate_v4() $fn$
        LANGUAGE sql VOLATILE;
    END IF;
END $$;

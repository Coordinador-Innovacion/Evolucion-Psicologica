BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"a9000000-0000-4000-8000-0000000000a0","role":"authenticated","email":"t64.global@test.local"}', true);
SELECT set_config('request.jwt.role', 'authenticated', true);

-- Solo el primer DO de T61 (sin helper)
DO $$
DECLARE r JSON;
BEGIN
    r := public.close_case('aa000000-0000-4000-8000-000000000031', 'motivo');
    RAISE NOTICE 'close_case result: %', r;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ERR T61.1: % %', SQLSTATE, SQLERRM;
END $$;

-- Segundo: t64_rec con detail boolean cast
DO $$
DECLARE r JSON;
BEGIN
    r := json_build_object('success', false, 'error', 'test');
    PERFORM public.t64_rec(
        'probe',
        (r->>'success')::boolean IS FALSE,
        r::text
    );
    RAISE NOTICE 't64_rec ok';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ERR rec: % %', SQLSTATE, SQLERRM;
END $$;

SELECT 1 AS ok;
ROLLBACK;

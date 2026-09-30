-- 060: Funciones creadas con search_path restringido (public, pg_temp) que
-- llaman funciones de pgcrypto, las cuales viven en el esquema extensions.
-- Fallaban en runtime con:
--   function gen_random_bytes(integer) does not exist   (bulk_create_survey_applications,
--                                                        create_survey_application)
--   function crypt(text, text) does not exist           (admin_create_staff)
-- Se agrega extensions al search_path de las tres funciones afectadas.
-- pg_temp va al final por seguridad (no debe ser searcheado primero).

ALTER FUNCTION public.bulk_create_survey_applications(uuid, integer, timestamp with time zone, timestamp with time zone, varchar, uuid, uuid[], uuid[])
  SET search_path = public, extensions, pg_temp;

ALTER FUNCTION public.create_survey_application(uuid, integer, timestamp with time zone, timestamp with time zone, uuid, uuid, varchar, uuid)
  SET search_path = public, extensions, pg_temp;

ALTER FUNCTION public.admin_create_staff(uuid, text, text, text, text, text)
  SET search_path = public, extensions, pg_temp;

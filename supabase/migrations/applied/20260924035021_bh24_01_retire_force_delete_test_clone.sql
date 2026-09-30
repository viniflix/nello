CREATE OR REPLACE FUNCTION public.force_delete_test_clone(p_patient_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION 'Test clone deletion has been disabled for patient safety'
    USING ERRCODE = '42501';
END;
$function$;

REVOKE ALL ON FUNCTION public.force_delete_test_clone(uuid) FROM PUBLIC, anon, authenticated;

-- BH24-01: the legacy marker lived in a user-editable text field and the
-- function could delete clinical records for any marked patient. Retire the
-- unsafe operation while preserving a clear error for old clients.
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

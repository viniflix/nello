-- CI-only current definitions absent from recorded CREATE FUNCTION statements.

-- A name appearing in a consumer is NOT proof that its definition was recorded.

CREATE SCHEMA IF NOT EXISTS private;

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION private.get_own_profile_attrs()
 RETURNS TABLE(is_admin boolean, user_type text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select up.is_admin, up.user_type
  from public.user_profiles up
  where up.id = auth.uid()
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION private.is_nutritionist()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and user_type = 'nutritionist'
  );
$function$;

CREATE OR REPLACE FUNCTION public.auth_uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.generate_random_invite_code(length integer DEFAULT 6)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  chars text := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text := '';
  i int;
BEGIN
  FOR i IN 1..length LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_unique_invite_code(col_name text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  new_code text;
  found text;
BEGIN
  LOOP
    new_code := generate_random_invite_code(6);
    -- Check uniqueness
    IF col_name = 'invite_code' THEN
      SELECT invite_code INTO found FROM public.user_profiles WHERE invite_code = new_code LIMIT 1;
    ELSE
      SELECT patient_invite_code INTO found FROM public.user_profiles WHERE patient_invite_code = new_code LIMIT 1;
    END IF;
    
    IF found IS NULL THEN
      RETURN new_code;
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_food_stats(p_nutritionist_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT json_build_object(
    'total', count(*),
    'custom', count(*) FILTER (WHERE source = 'custom' OR nutritionist_id = p_nutritionist_id),
    'public', count(*) FILTER (WHERE source != 'custom' AND nutritionist_id IS NULL),
    'taco', count(*) FILTER (WHERE source = 'TACO'),
    'tbca', count(*) FILTER (WHERE source = 'TBCA'),
    'tucunduva', count(*) FILTER (WHERE source = 'TUCUNDUVA'),
    'usda', count(*) FILTER (WHERE source = 'USDA'),
    'nello', count(*) FILTER (WHERE source = 'Nello')
  ) FROM foods WHERE is_active = true;
$function$;

CREATE OR REPLACE FUNCTION public.get_own_profile_attrs()
 RETURNS TABLE(is_admin boolean, user_type text)
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ select * from private.get_own_profile_attrs(); $function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select private.is_admin(); $function$;

CREATE OR REPLACE FUNCTION public.is_nutritionist()
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ select private.is_nutritionist(); $function$;

CREATE OR REPLACE FUNCTION public.trg_set_invite_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.user_type = 'nutritionist' AND NEW.invite_code IS NULL THEN
    NEW.invite_code := generate_random_invite_code(6);
  END IF;
  RETURN NEW;
END;
$function$;

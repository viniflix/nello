create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_type text;
  v_name text;
  v_needs_password_reset boolean;
begin
  v_name := nullif(new.raw_user_meta_data->>'name', '');
  if v_name is null then
    v_name := nullif(new.raw_user_meta_data->>'full_name', '');
  end if;
  if v_name is null then
    v_name := nullif(new.raw_user_meta_data->>'display_name', '');
  end if;
  if v_name is null then
    v_name := 'Usuário';
  end if;

  v_user_type := lower(nullif(new.raw_user_meta_data->>'user_type', ''));
  if v_user_type not in ('patient', 'nutritionist') then
    v_user_type := 'patient';
  end if;

  v_needs_password_reset := (new.raw_user_meta_data->>'needs_password_reset')::boolean;
  if v_needs_password_reset is null then
    v_needs_password_reset := false;
  end if;

  insert into public.user_profiles (
    id,
    email,
    name,
    user_type,
    crn,
    birth_date,
    gender,
    height,
    weight,
    goal,
    nutritionist_id,
    phone,
    cpf,
    occupation,
    civil_status,
    observations,
    address,
    needs_password_reset
  )
  values (
    new.id,
    new.email,
    v_name,
    v_user_type,
    nullif(new.raw_user_meta_data->>'crn', ''),
    nullif(new.raw_user_meta_data->>'birth_date', '')::date,
    nullif(new.raw_user_meta_data->>'gender', ''),
    nullif(new.raw_user_meta_data->>'height', '')::numeric,
    nullif(new.raw_user_meta_data->>'weight', '')::numeric,
    nullif(new.raw_user_meta_data->>'goal', ''),
    nullif(new.raw_user_meta_data->>'nutritionist_id', '')::uuid,
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'cpf', ''),
    nullif(new.raw_user_meta_data->>'occupation', ''),
    nullif(new.raw_user_meta_data->>'civil_status', ''),
    nullif(new.raw_user_meta_data->>'observations', ''),
    new.raw_user_meta_data->'address',
    v_needs_password_reset
  );
  return new;
end;
$function$;

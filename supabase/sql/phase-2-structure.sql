-- Fase 2: correcoes estruturais
-- Objetivo: endurecer RPCs, ajustar search_path, preparar migracao de auth.

begin;

-- RPCs seguros (nao substituem funcoes existentes automaticamente)

create or replace function public.log_meal_action_secure(
  p_meal_id text,
  p_action text,
  p_details jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient_id uuid;
  v_has_meal_nutritionist boolean;
  v_has_audit_nutritionist boolean;
  v_nutritionist_id uuid;
begin
  -- buscar patient_id de forma resiliente (id pode ser uuid ou bigint)
  select m.patient_id
    into v_patient_id
  from public.meals m
  where m.id::text = p_meal_id
  limit 1;

  if v_patient_id is null then
    raise exception 'meal not found';
  end if;

  -- verificar se existe coluna nutritionist_id em meals
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'meals'
      and column_name = 'nutritionist_id'
  ) into v_has_meal_nutritionist;

  if v_has_meal_nutritionist then
    execute format('select nutritionist_id from public.meals where id::text = %L', p_meal_id)
      into v_nutritionist_id;
  else
    -- derivar nutritionist_id pelo patient_id (via user_profiles)
    select p.nutritionist_id into v_nutritionist_id
    from public.user_profiles p
    where p.id = v_patient_id
    limit 1;
  end if;

  if not (v_patient_id = auth.uid() or v_nutritionist_id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  -- verificar se audit_log possui nutritionist_id
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'meal_audit_log'
      and column_name = 'nutritionist_id'
  ) into v_has_audit_nutritionist;

  if v_has_audit_nutritionist then
    execute format(
      'insert into public.meal_audit_log (meal_id, patient_id, nutritionist_id, action, details, created_at)
       values (%L, %L, %L, %L, %L, now())',
      p_meal_id,
      v_patient_id::text,
      v_nutritionist_id::text,
      p_action,
      p_details::text
    );
  else
    execute format(
      'insert into public.meal_audit_log (meal_id, patient_id, action, details, created_at)
       values (%L, %L, %L, %L, now())',
      p_meal_id,
      v_patient_id::text,
      p_action,
      p_details::text
    );
  end if;
end;
$$;

create or replace function public.can_delete_user(p_target_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select is_admin()
  or exists (
    select 1 from public.user_profiles p
    where p.id = p_target_id
      and p.nutritionist_id = auth.uid()
  );
$$;

-- Ajustar search_path das RPCs existentes (seguranca)
do $$
declare
  r record;
begin
  for r in
    select n.nspname, p.proname, p.oid,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'get_admin_dashboard_stats',
        'get_daily_adherence',
        'get_patients_low_adherence_optimized',
        'get_patients_pending_data_optimized',
        'get_comprehensive_activity_feed_optimized',
        'calculate_macro_targets',
        'calculate_goal_progress',
        'check_and_grant_achievements',
        'log_meal_action',
        'get_chat_recipient_profile',
        'mark_chat_notifications_as_read',
        'get_unread_senders',
        'delete_user_account'
      )
  loop
    execute format(
      'alter function %I.%I(%s) set search_path = public',
      r.nspname, r.proname, r.args
    );
  end loop;
end $$;

-- Opcional: preparar trigger auth.users -> user_profiles (ajuste conforme schema)
-- Recomendado executar apos validar em staging e remover policy temporaria de insert.
-- create or replace function public.handle_new_user()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- begin
--   insert into public.user_profiles (id, email, name, user_type, nutritionist_id)
--   values (
--     new.id,
--     new.email,
--     coalesce(new.raw_user_meta_data->>'name', 'Usuario'),
--     coalesce(new.raw_app_meta_data->>'role', 'patient'),
--     null
--   )
--   on conflict (id) do nothing;
--   return new;
-- end;
-- $$;

-- drop trigger if exists on_auth_user_created on auth.users;
-- create trigger on_auth_user_created
-- after insert on auth.users
-- for each row execute function public.handle_new_user();

commit;

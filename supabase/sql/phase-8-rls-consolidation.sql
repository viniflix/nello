-- Fase 8: consolidar policies duplicadas (multiple_permissive_policies)
-- Usa as expressoes existentes para criar uma unica policy de leitura.

begin;

do $$
declare
  v1 text;
  v2 text;
  v_check text;
  v_using text;
begin
  -- user_profiles (select)
  select pg_get_expr(p.polqual, p.polrelid)
    into v1
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'user_profiles'
    and p.polname = 'Users can read own profile';

  select pg_get_expr(p.polqual, p.polrelid)
    into v2
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'user_profiles'
    and p.polname = 'Nutritionists can read their patients';

  if v1 is not null and v2 is not null then
    v1 := regexp_replace(v1, 'auth\\.uid\\(\\)', '(select auth.uid())', 'g');
    v2 := regexp_replace(v2, 'auth\\.uid\\(\\)', '(select auth.uid())', 'g');

    execute 'drop policy if exists "Users can read own profile" on public.user_profiles';
    execute 'drop policy if exists "Nutritionists can read their patients" on public.user_profiles';
    execute format(
      'create policy "Read user_profiles" on public.user_profiles for select to authenticated using ((%s) or (%s))',
      v1, v2
    );
  end if;

  -- patient_goals (select)
  select pg_get_expr(p.polqual, p.polrelid)
    into v1
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'patient_goals'
    and p.polname = 'Users can view their own goals';

  select pg_get_expr(p.polqual, p.polrelid)
    into v2
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'patient_goals'
    and p.polname = 'Nutritionists can view patient goals';

  if v1 is not null and v2 is not null then
    v1 := regexp_replace(v1, 'auth\\.uid\\(\\)', '(select auth.uid())', 'g');
    v2 := regexp_replace(v2, 'auth\\.uid\\(\\)', '(select auth.uid())', 'g');

    execute 'drop policy if exists "Users can view their own goals" on public.patient_goals';
    execute 'drop policy if exists "Nutritionists can view patient goals" on public.patient_goals';
    execute format(
      'create policy "Read patient_goals" on public.patient_goals for select to authenticated using ((%s) or (%s))',
      v1, v2
    );
  end if;

  -- appointments (select + write)
  select pg_get_expr(p.polqual, p.polrelid),
         pg_get_expr(p.polwithcheck, p.polrelid)
    into v_using, v_check
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'appointments'
    and p.polname = 'Nutritionists manage own appointments';

  select pg_get_expr(p.polqual, p.polrelid)
    into v1
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'appointments'
    and p.polname = 'Patients read own appointments';

  if v_using is not null and v1 is not null then
    v_using := regexp_replace(v_using, 'auth\\.uid\\(\\)', '(select auth.uid())', 'g');
    v_check := regexp_replace(coalesce(v_check, v_using), 'auth\\.uid\\(\\)', '(select auth.uid())', 'g');
    v1 := regexp_replace(v1, 'auth\\.uid\\(\\)', '(select auth.uid())', 'g');

    execute 'drop policy if exists "Nutritionists manage own appointments" on public.appointments';
    execute 'drop policy if exists "Patients read own appointments" on public.appointments';

    execute format(
      'create policy "Read appointments" on public.appointments for select to authenticated using ((%s) or (%s))',
      v_using, v1
    );

    execute format(
      'create policy "Nutritionists insert appointments" on public.appointments for insert to authenticated with check (%s)',
      v_check
    );
    execute format(
      'create policy "Nutritionists update appointments" on public.appointments for update to authenticated using (%s) with check (%s)',
      v_using, v_check
    );
    execute format(
      'create policy "Nutritionists delete appointments" on public.appointments for delete to authenticated using (%s)',
      v_using
    );
  end if;

  -- foods (select)
  select pg_get_expr(p.polqual, p.polrelid)
    into v1
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'foods'
    and p.polname = 'Nutritionists can view their own foods';

  select pg_get_expr(p.polqual, p.polrelid)
    into v2
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'foods'
    and p.polname = 'Users can view relevant foods';

  if v1 is not null and v2 is not null then
    v1 := regexp_replace(v1, 'auth\\.uid\\(\\)', '(select auth.uid())', 'g');
    v2 := regexp_replace(v2, 'auth\\.uid\\(\\)', '(select auth.uid())', 'g');

    execute 'drop policy if exists "Nutritionists can view their own foods" on public.foods';
    execute 'drop policy if exists "Users can view relevant foods" on public.foods';
    execute format(
      'create policy "Read foods" on public.foods for select to authenticated using ((%s) or (%s))',
      v1, v2
    );
  end if;

  -- meal_plans (select + write)
  select pg_get_expr(p.polqual, p.polrelid),
         pg_get_expr(p.polwithcheck, p.polrelid)
    into v_using, v_check
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'meal_plans'
    and p.polname = 'Nutritionists manage patient meal plans';

  select pg_get_expr(p.polqual, p.polrelid)
    into v1
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'meal_plans'
    and p.polname = 'Patients can read own meal plans';

  if v_using is not null and v1 is not null then
    v_using := regexp_replace(v_using, 'auth\\.uid\\(\\)', '(select auth.uid())', 'g');
    v_check := regexp_replace(coalesce(v_check, v_using), 'auth\\.uid\\(\\)', '(select auth.uid())', 'g');
    v1 := regexp_replace(v1, 'auth\\.uid\\(\\)', '(select auth.uid())', 'g');

    execute 'drop policy if exists "Nutritionists manage patient meal plans" on public.meal_plans';
    execute 'drop policy if exists "Patients can read own meal plans" on public.meal_plans';

    execute format(
      'create policy "Read meal_plans" on public.meal_plans for select to authenticated using ((%s) or (%s))',
      v_using, v1
    );

    execute format(
      'create policy "Nutritionists insert meal_plans" on public.meal_plans for insert to authenticated with check (%s)',
      v_check
    );
    execute format(
      'create policy "Nutritionists update meal_plans" on public.meal_plans for update to authenticated using (%s) with check (%s)',
      v_using, v_check
    );
    execute format(
      'create policy "Nutritionists delete meal_plans" on public.meal_plans for delete to authenticated using (%s)',
      v_using
    );
  end if;
end $$;

commit;

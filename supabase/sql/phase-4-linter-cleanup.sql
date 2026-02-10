-- Fase 4: limpeza de lints restantes (seguranca/performance)
-- Objetivo: resolver security_definer_view, RLS faltante, search_path e policies duplicadas.
-- Execute em staging primeiro.

begin;

-- 1) Views SECURITY DEFINER -> INVOKER
alter view public.active_foods set (security_invoker = true);
alter view public.patient_hub_summary set (security_invoker = true);

-- 2) RLS para tabelas restantes (glycemia_records, meal_history)
alter table public.glycemia_records enable row level security;
alter table public.meal_history enable row level security;

-- Resolver dinamicamente a coluna de paciente (patient_id/user_id) para evitar erro de coluna inexistente
do $$
declare
  v_patient_col text;
begin
  -- glycemia_records
  select c.column_name
    into v_patient_col
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'glycemia_records'
    and c.column_name in ('patient_id', 'user_id')
  order by case when c.column_name = 'patient_id' then 1 else 2 end
  limit 1;

  if v_patient_col is null then
    select a.attname
      into v_patient_col
    from pg_constraint con
    join pg_class tbl on tbl.oid = con.conrelid
    join pg_class ref on ref.oid = con.confrelid
    join pg_namespace nsp on nsp.oid = ref.relnamespace
    join pg_attribute a on a.attrelid = tbl.oid and a.attnum = any(con.conkey)
    where con.contype = 'f'
      and tbl.relname = 'glycemia_records'
      and ((nsp.nspname = 'public' and ref.relname = 'user_profiles')
        or (nsp.nspname = 'auth' and ref.relname = 'users'))
    limit 1;
  end if;

  if v_patient_col is not null then
    execute 'drop policy if exists "Access glycemia_records" on public.glycemia_records';
    execute format(
      'create policy "Access glycemia_records" on public.glycemia_records
       for all to authenticated
       using (
         %1$I = (select auth.uid())
         or exists (
           select 1 from public.user_profiles up
           where up.id = %1$I
             and up.nutritionist_id = (select auth.uid())
         )
       )
       with check (
         %1$I = (select auth.uid())
         or exists (
           select 1 from public.user_profiles up
           where up.id = %1$I
             and up.nutritionist_id = (select auth.uid())
         )
       )', v_patient_col
    );
  else
    raise notice 'glycemia_records: coluna patient_id/user_id nao encontrada, policy nao criada';
  end if;

  -- meal_history
  select c.column_name
    into v_patient_col
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'meal_history'
    and c.column_name in ('patient_id', 'user_id')
  order by case when c.column_name = 'patient_id' then 1 else 2 end
  limit 1;

  if v_patient_col is null then
    select a.attname
      into v_patient_col
    from pg_constraint con
    join pg_class tbl on tbl.oid = con.conrelid
    join pg_class ref on ref.oid = con.confrelid
    join pg_namespace nsp on nsp.oid = ref.relnamespace
    join pg_attribute a on a.attrelid = tbl.oid and a.attnum = any(con.conkey)
    where con.contype = 'f'
      and tbl.relname = 'meal_history'
      and ((nsp.nspname = 'public' and ref.relname = 'user_profiles')
        or (nsp.nspname = 'auth' and ref.relname = 'users'))
    limit 1;
  end if;

  if v_patient_col is not null then
    execute 'drop policy if exists "Access meal_history" on public.meal_history';
    execute format(
      'create policy "Access meal_history" on public.meal_history
       for select to authenticated
       using (
         %1$I = (select auth.uid())
         or exists (
           select 1 from public.user_profiles up
           where up.id = %1$I
             and up.nutritionist_id = (select auth.uid())
         )
       )', v_patient_col
    );
    execute 'revoke insert, update, delete on public.meal_history from authenticated';
  else
    raise notice 'meal_history: coluna patient_id/user_id nao encontrada, policy nao criada';
  end if;
end $$;

-- 3) Corrigir policies permissivas antigas (remover duplicadas mais comuns)
-- Se ainda existirem, as policies antigas geram "multiple_permissive_policies".
-- Remova somente nomes que aparecem nos alerts.
do $$
begin
  -- meal_audit_log
  execute 'drop policy if exists "Nutritionists can view their patients audit logs" on public.meal_audit_log';
  execute 'drop policy if exists "Patients can view their own audit logs" on public.meal_audit_log';
  execute 'drop policy if exists "System can insert audit logs" on public.meal_audit_log';

  -- meals / meal_items (nomes antigos)
  execute 'drop policy if exists "Users can insert their own meals" on public.meals';
  execute 'drop policy if exists "Users can update their own meals" on public.meals';
  execute 'drop policy if exists "Users can delete their own meals" on public.meals';
  execute 'drop policy if exists "Users can view their own meals" on public.meals';
  execute 'drop policy if exists "Nutritionists can view their patients meals" on public.meals';
  execute 'drop policy if exists "Nutricionistas podem ver as refeições dos seus pacientes" on public.meals';
  execute 'drop policy if exists "Utilizadores podem gerir as suas próprias refeições" on public.meals';

  execute 'drop policy if exists "Users can view their own meal items" on public.meal_items';
  execute 'drop policy if exists "Nutricionistas podem ver os items das refeições dos seus paci" on public.meal_items';
  execute 'drop policy if exists "Utilizadores podem gerir os items das suas refeições" on public.meal_items';

  -- appointments
  execute 'drop policy if exists "Users can manage their own appointments" on public.appointments';

  -- meal_plans (template policy antiga)
  execute 'drop policy if exists "Nutritionists can view/manage own templates" on public.meal_plans';

  -- chats (policies antigas)
  execute 'drop policy if exists "Users can insert their own chats" on public.chats';
  execute 'drop policy if exists "Users can read their own messages" on public.chats';

  -- lab_results
  execute 'drop policy if exists "Pacientes podem ver seus próprios exames" on public.lab_results';
  execute 'drop policy if exists "Nutricionistas podem ver exames dos seus pacientes" on public.lab_results';
  execute 'drop policy if exists "Nutricionistas podem inserir exames para seus pacientes" on public.lab_results';
  execute 'drop policy if exists "Nutricionistas podem atualizar exames dos seus pacientes" on public.lab_results';
  execute 'drop policy if exists "Nutricionistas podem deletar exames dos seus pacientes" on public.lab_results';

  -- user_profiles
  execute 'drop policy if exists "Utilizadores podem gerir os seus próprios perfis" on public.user_profiles';
  execute 'drop policy if exists "Nutricionistas podem ver os perfis dos seus pacientes" on public.user_profiles';
  execute 'drop policy if exists "Admins can view all profiles" on public.user_profiles';
  execute 'drop policy if exists "Admins can update profiles" on public.user_profiles';
  execute 'drop policy if exists "Admins can delete profiles" on public.user_profiles';
  execute 'drop policy if exists "Admins can insert profiles" on public.user_profiles';
  execute 'drop policy if exists "Users can create own profile" on public.user_profiles';

  -- financial
  execute 'drop policy if exists "Users can manage own financial records" on public.financial_records';
  execute 'drop policy if exists "Nutritionists can manage their own financial transactions" on public.financial_transactions';
  execute 'drop policy if exists "Manage own recurring expenses" on public.recurring_expenses';

  -- services (policy antiga duplicada)
  execute 'drop policy if exists "Nutritionists manage own services" on public.services';

  -- food_household_measures duplicada antiga
  execute 'drop policy if exists "Write food_household_measures via foods" on public.food_household_measures';
end $$;

-- 4) Fix search_path mutable para TODAS as functions public sem search_path
do $$
declare
  r record;
  has_config boolean;
begin
  for r in
    select n.nspname, p.proname, p.oid,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    -- se function nao tem search_path definido, setar
    select exists (
      select 1
      from pg_proc p2
      where p2.oid = r.oid
        and p2.proconfig is not null
        and array_to_string(p2.proconfig, ',') like '%search_path%'
    ) into has_config;

    if not has_config then
      begin
        execute format(
          'alter function %I.%I(%s) set search_path = public',
          r.nspname, r.proname, r.args
        );
      exception when insufficient_privilege or undefined_function then
        -- Ignora funcoes nao pertencentes ao owner (ex: extensoes)
        raise notice 'Skipping function %.% due to permissions', r.nspname, r.proname;
      end;
    end if;
  end loop;
end $$;

commit;

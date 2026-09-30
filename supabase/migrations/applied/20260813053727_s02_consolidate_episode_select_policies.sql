-- S0.2 / estágio 3: combina as duas policies permissivas de SELECT sem mudar
-- a expressão efetiva. Policies ALL são separadas por comando para preservar
-- as regras originais de INSERT/UPDATE/DELETE.
set lock_timeout = '5s';
set statement_timeout = '60s';

do $migration$
declare
  config record;
  relation_oid oid;
  relation_sql text;
  base_policy record;
  episode_policy record;
  effective_check text;
begin
  for config in
    select *
    from (values
      ('anamnesis_records', 'Nutricionists can view anamnesis of their patients'),
      ('appointments', 'appointments_select'),
      ('checkin_schedules', 'Leitura schedules'),
      ('checkin_sessions', 'Acesso a sessoes'),
      ('energy_expenditure_calculations', 'Nutricionistas podem ver cálculos dos seus pacientes'),
      ('glycemia_records', 'Access glycemia_records'),
      ('growth_records', 'Users can manage growth records for their patients/themselves'),
      ('lab_results', 'Access lab_results'),
      ('meal_audit_log', 'Access meal_audit_log'),
      ('meal_edit_history', 'Nutritionists can view their patients meal edit history'),
      ('meal_plans', 'Read meal_plans'),
      ('meals', 'Access meals for patient or nutritionist'),
      ('patient_goals', 'Read patient_goals'),
      ('prescriptions', 'Users can see their own prescriptions'),
      ('supplement_logs', 'Leitura suplementos'),
      ('weekly_summaries', 'Users can manage their own summaries')
    ) as expected(table_name, base_policy_name)
  loop
    relation_oid := to_regclass(format('public.%I', config.table_name));
    if relation_oid is null then
      raise exception 's02_missing_table:%', config.table_name;
    end if;
    relation_sql := format('%I.%I', 'public', config.table_name);

    select
      pol.polcmd,
      pg_get_expr(pol.polqual, pol.polrelid) as using_expression,
      pg_get_expr(pol.polwithcheck, pol.polrelid) as check_expression
    into base_policy
    from pg_policy pol
    where pol.polrelid = relation_oid
      and pol.polname = config.base_policy_name;

    if not found or base_policy.polcmd not in ('r', '*') or base_policy.using_expression is null then
      raise exception 's02_unexpected_base_policy:%:%', config.table_name, config.base_policy_name;
    end if;

    select pg_get_expr(pol.polqual, pol.polrelid) as using_expression
    into episode_policy
    from pg_policy pol
    where pol.polrelid = relation_oid
      and pol.polname = 'b2_episode_participant_select'
      and pol.polcmd = 'r'
      and pol.polpermissive;

    if not found or episode_policy.using_expression is null then
      raise exception 's02_missing_episode_select:%', config.table_name;
    end if;

    execute format('drop policy %I on %s', config.base_policy_name, relation_sql);
    execute format('drop policy %I on %s', 'b2_episode_participant_select', relation_sql);

    execute format(
      'create policy %I on %s for select to authenticated using ((%s) or (%s))',
      config.base_policy_name,
      relation_sql,
      base_policy.using_expression,
      episode_policy.using_expression
    );

    if base_policy.polcmd = '*' then
      effective_check := coalesce(base_policy.check_expression, base_policy.using_expression);

      execute format(
        'create policy %I on %s for insert to authenticated with check (%s)',
        's02_' || config.table_name || '_insert', relation_sql, effective_check
      );
      execute format(
        'create policy %I on %s for update to authenticated using (%s) with check (%s)',
        's02_' || config.table_name || '_update', relation_sql,
        base_policy.using_expression, effective_check
      );
      execute format(
        'create policy %I on %s for delete to authenticated using (%s)',
        's02_' || config.table_name || '_delete', relation_sql,
        base_policy.using_expression
      );
    end if;
  end loop;
end;
$migration$;

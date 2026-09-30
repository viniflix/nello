begin;

do $$
declare
  v_table text;
  v_count integer;
begin
  foreach v_table in array array[
    'anamnesis_records', 'appointments', 'checkin_schedules', 'checkin_sessions',
    'energy_expenditure_calculations', 'glycemia_records', 'growth_records',
    'lab_results', 'meal_audit_log', 'meal_edit_history', 'meal_plans', 'meals',
    'patient_goals', 'prescriptions', 'supplement_logs', 'weekly_summaries'
  ] loop
    select count(*) into v_count
    from pg_policies
    where schemaname = 'public'
      and tablename = v_table
      and permissive = 'PERMISSIVE'
      and cmd in ('SELECT', 'ALL')
      and 'authenticated' = any(roles);

    if v_count <> 1 then
      raise exception 's02_permissive_select_count:%:%', v_table, v_count;
    end if;

    if exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = v_table
        and policyname = 'b2_episode_participant_select'
    ) then
      raise exception 's02_legacy_episode_select_remains:%', v_table;
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = v_table
        and policyname = 'b2_episode_isolation'
        and permissive = 'RESTRICTIVE'
    ) then
      raise exception 's02_restrictive_episode_guard_missing:%', v_table;
    end if;
  end loop;
end;
$$;

-- A policy ALL de glicemia foi dividida. Leitura histórica continua permitida,
-- mas a policy de episódio não pode ampliar escrita para um terceiro.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000085', true);
do $$
begin
  begin
    insert into public.glycemia_records(
      patient_id, nutritionist_id, care_episode_id, date, value, condition
    ) values (
      '20000000-0000-0000-0000-000000000081',
      '10000000-0000-0000-0000-000000000085',
      '40000000-0000-0000-0000-000000000081',
      now(), 100, 'fasting'
    );
    raise exception 's02_episode_select_expanded_write';
  exception
    when insufficient_privilege or check_violation then null;
  end;
end;
$$;

rollback;


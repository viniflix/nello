begin;

create temp table meal_plan_permission_pairs on commit drop as
select distinct on (np.nutritionist_id)
  np.nutritionist_id,
  np.patient_id
from public.nutritionist_patients np
join public.care_episodes ce
  on ce.patient_id = np.patient_id
 and ce.nutritionist_id = np.nutritionist_id
 and ce.status = 'active'
where np.status = 'active'
order by np.nutritionist_id, np.created_at;

create temp table meal_plan_permission_results (
  nutritionist_id uuid,
  patient_id uuid,
  plan_id bigint,
  ok boolean,
  sqlstate text,
  error_message text
) on commit drop;

grant select on pg_temp.meal_plan_permission_pairs to authenticated;
grant insert, select on pg_temp.meal_plan_permission_results to authenticated;

set local role authenticated;

do $$
declare
  r record;
  v_plan_id bigint;
begin
  for r in select * from pg_temp.meal_plan_permission_pairs loop
    perform set_config('request.jwt.claim.sub', r.nutritionist_id::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);

    begin
      insert into public.meal_plans (
        patient_id, nutritionist_id, name, start_date,
        is_active, is_draft, is_template, active_days
      ) values (
        r.patient_id, r.nutritionist_id, 'SMOKE DIETA - ROLLBACK',
        current_date, false, true, false, '[]'::jsonb
      ) returning id into v_plan_id;

      perform public.upsert_full_meal_plan(
        v_plan_id,
        jsonb_build_object(
          'name', 'SMOKE DIETA ATUALIZADA - ROLLBACK',
          'start_date', current_date,
          'is_active', false,
          'is_draft', true
        ),
        '[]'::jsonb
      );

      insert into pg_temp.meal_plan_permission_results
      values (r.nutritionist_id, r.patient_id, v_plan_id, true, null, null);
    exception when others then
      insert into pg_temp.meal_plan_permission_results
      values (
        r.nutritionist_id, r.patient_id, v_plan_id,
        false, sqlstate, sqlerrm
      );
    end;
  end loop;
end $$;

reset role;

do $$
begin
  if exists (
    select 1 from pg_temp.meal_plan_permission_results where not ok
  ) then
    raise exception 'A matriz de permissão de dietas possui falhas.';
  end if;
end $$;

rollback;

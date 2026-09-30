-- Onda B2: linhagem e isolamento do nÃºcleo clÃ­nico por episÃ³dio de cuidado.

do $$
declare
  v_table text;
  v_tables text[] := array[
    'anamnesis_records',
    'appointments',
    'checkin_schedules',
    'checkin_sessions',
    'energy_expenditure_calculations',
    'glycemia_records',
    'meal_plans',
    'patient_goals',
    'prescriptions',
    'supplement_logs',
    'weekly_summaries'
  ];
begin
  foreach v_table in array v_tables loop
    execute format('alter table public.%I add column if not exists care_episode_id uuid', v_table);

    if not exists (
      select 1 from pg_constraint
      where conname = v_table || '_care_episode_id_fkey'
        and conrelid = format('public.%I', v_table)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (care_episode_id) references public.care_episodes(id) on delete restrict',
        v_table,
        v_table || '_care_episode_id_fkey'
      );
    end if;

    execute format(
      'create index if not exists %I on public.%I (care_episode_id)',
      'idx_' || v_table || '_care_episode_id',
      v_table
    );
  end loop;
end $$;

-- Pares histÃ³ricos com autoria conhecida recebem um episÃ³dio fechado prÃ³prio.
with clinical_pairs as (
  select patient_id, nutritionist_id from public.anamnesis_records
  union select patient_id, nutritionist_id from public.appointments where patient_id is not null
  union select patient_id, nutritionist_id from public.checkin_schedules
  union select patient_id, nutritionist_id from public.checkin_sessions
  union select patient_id, nutritionist_id from public.energy_expenditure_calculations where nutritionist_id is not null
  union select patient_id, nutritionist_id from public.glycemia_records where nutritionist_id is not null
  union select patient_id, nutritionist_id from public.meal_plans where patient_id is not null
  union select patient_id, nutritionist_id from public.patient_goals
  union select patient_id, nutritionist_id from public.prescriptions
  union select patient_id, nutritionist_id from public.supplement_logs where nutritionist_id is not null
  union select patient_id, nutritionist_id from public.weekly_summaries
), missing_pairs as (
  select distinct cp.patient_id, cp.nutritionist_id
  from clinical_pairs cp
  where cp.patient_id is not null
    and cp.nutritionist_id is not null
    and not exists (
      select 1 from public.care_episodes ce
      where ce.patient_id = cp.patient_id
        and ce.nutritionist_id = cp.nutritionist_id
    )
)
insert into public.care_episodes (
  patient_id,
  nutritionist_id,
  status,
  started_at,
  ended_at,
  start_reason,
  end_reason
)
select
  patient_id,
  nutritionist_id,
  'ended',
  now(),
  now(),
  'legacy_clinical_data_migration',
  'legacy_episode_reconstructed'
from missing_pairs;

-- O par paciente-profissional determina a linhagem. EpisÃ³dio ativo tem prioridade;
-- quando o par Ã© histÃ³rico, usa-se o episÃ³dio fechado mais recente daquele par.
update public.anamnesis_records t set care_episode_id = (
  select ce.id from public.care_episodes ce
  where ce.patient_id=t.patient_id and ce.nutritionist_id=t.nutritionist_id
  order by (ce.status='active') desc, ce.started_at desc limit 1
) where t.care_episode_id is null;

update public.appointments t set care_episode_id = (
  select ce.id from public.care_episodes ce
  where ce.patient_id=t.patient_id and ce.nutritionist_id=t.nutritionist_id
  order by (ce.status='active') desc, ce.started_at desc limit 1
) where t.patient_id is not null and t.care_episode_id is null;

update public.checkin_schedules t set care_episode_id = (
  select ce.id from public.care_episodes ce
  where ce.patient_id=t.patient_id and ce.nutritionist_id=t.nutritionist_id
  order by (ce.status='active') desc, ce.started_at desc limit 1
) where t.care_episode_id is null;

update public.checkin_sessions t set care_episode_id = (
  select ce.id from public.care_episodes ce
  where ce.patient_id=t.patient_id and ce.nutritionist_id=t.nutritionist_id
  order by (ce.status='active') desc, ce.started_at desc limit 1
) where t.care_episode_id is null;

update public.energy_expenditure_calculations t set care_episode_id = (
  select ce.id from public.care_episodes ce
  where ce.patient_id=t.patient_id and ce.nutritionist_id=t.nutritionist_id
  order by (ce.status='active') desc, ce.started_at desc limit 1
) where t.care_episode_id is null;

update public.glycemia_records t set care_episode_id = (
  select ce.id from public.care_episodes ce
  where ce.patient_id=t.patient_id and ce.nutritionist_id=t.nutritionist_id
  order by (ce.status='active') desc, ce.started_at desc limit 1
) where t.care_episode_id is null;

update public.meal_plans t set care_episode_id = (
  select ce.id from public.care_episodes ce
  where ce.patient_id=t.patient_id and ce.nutritionist_id=t.nutritionist_id
  order by (ce.status='active') desc, ce.started_at desc limit 1
) where t.patient_id is not null and t.care_episode_id is null;

update public.patient_goals t set care_episode_id = (
  select ce.id from public.care_episodes ce
  where ce.patient_id=t.patient_id and ce.nutritionist_id=t.nutritionist_id
  order by (ce.status='active') desc, ce.started_at desc limit 1
) where t.care_episode_id is null;

update public.prescriptions t set care_episode_id = (
  select ce.id from public.care_episodes ce
  where ce.patient_id=t.patient_id and ce.nutritionist_id=t.nutritionist_id
  order by (ce.status='active') desc, ce.started_at desc limit 1
) where t.care_episode_id is null;

update public.supplement_logs t set care_episode_id = (
  select ce.id from public.care_episodes ce
  where ce.patient_id=t.patient_id and ce.nutritionist_id=t.nutritionist_id
  order by (ce.status='active') desc, ce.started_at desc limit 1
) where t.care_episode_id is null;

update public.weekly_summaries t set care_episode_id = (
  select ce.id from public.care_episodes ce
  where ce.patient_id=t.patient_id and ce.nutritionist_id=t.nutritionist_id
  order by (ce.status='active') desc, ce.started_at desc limit 1
) where t.care_episode_id is null;

create or replace function private.assign_clinical_care_episode()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_episode public.care_episodes%rowtype;
begin
  if new.patient_id is null then
    new.care_episode_id := null;
    return new;
  end if;

  if new.nutritionist_id is null then
    raise exception 'Registro clÃ­nico exige nutricionista identificado.' using errcode = '23514';
  end if;

  if new.care_episode_id is null then
    select * into v_episode
    from public.care_episodes ce
    where ce.patient_id = new.patient_id
      and ce.nutritionist_id = new.nutritionist_id
      and ce.status = 'active'
    limit 1;

    if not found then
      raise exception 'NÃ£o existe episÃ³dio ativo para este paciente e nutricionista.' using errcode = '23514';
    end if;

    new.care_episode_id := v_episode.id;
  elsif not exists (
    select 1 from public.care_episodes ce
    where ce.id = new.care_episode_id
      and ce.patient_id = new.patient_id
      and ce.nutritionist_id = new.nutritionist_id
  ) then
    raise exception 'EpisÃ³dio incompatÃ­vel com paciente ou nutricionista.' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.assign_clinical_care_episode() from public, anon, authenticated;

do $$
declare
  v_table text;
  v_tables text[] := array[
    'anamnesis_records',
    'appointments',
    'checkin_schedules',
    'checkin_sessions',
    'energy_expenditure_calculations',
    'glycemia_records',
    'meal_plans',
    'patient_goals',
    'prescriptions',
    'supplement_logs',
    'weekly_summaries'
  ];
begin
  foreach v_table in array v_tables loop
    execute format('drop trigger if exists trg_assign_clinical_care_episode on public.%I', v_table);
    execute format(
      'create trigger trg_assign_clinical_care_episode before insert or update of patient_id, nutritionist_id, care_episode_id on public.%I for each row execute function private.assign_clinical_care_episode()',
      v_table
    );

    execute format('drop policy if exists b2_episode_isolation on public.%I', v_table);
    execute format('drop policy if exists b2_episode_participant_select on public.%I', v_table);
    execute format(
      'create policy b2_episode_participant_select on public.%I for select to authenticated using (
         exists (
           select 1 from public.care_episodes ce
           where ce.id = care_episode_id
             and (ce.patient_id = (select auth.uid()) or ce.nutritionist_id = (select auth.uid()))
         )
       )',
      v_table
    );
    execute format(
      'create policy b2_episode_isolation on public.%I as restrictive for all to authenticated using (
         patient_id is null or exists (
           select 1 from public.care_episodes ce
           where ce.id = care_episode_id
             and (ce.patient_id = (select auth.uid()) or ce.nutritionist_id = (select auth.uid()))
         )
       ) with check (
         patient_id is null or exists (
           select 1 from public.care_episodes ce
           where ce.id = care_episode_id
             and (ce.patient_id = (select auth.uid()) or ce.nutritionist_id = (select auth.uid()))
         )
       )',
      v_table
    );

    if not exists (
      select 1 from pg_constraint
      where conname = v_table || '_episode_required_for_patient_check'
        and conrelid = format('public.%I', v_table)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I check (patient_id is null or care_episode_id is not null) not valid',
        v_table,
        v_table || '_episode_required_for_patient_check'
      );
    end if;

    execute format(
      'alter table public.%I validate constraint %I',
      v_table,
      v_table || '_episode_required_for_patient_check'
    );
  end loop;
end $$;

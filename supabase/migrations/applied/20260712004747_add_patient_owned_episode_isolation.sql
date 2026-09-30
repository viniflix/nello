-- Onda B2: tabelas clÃ­nicas centradas no paciente, sem nutritionist_id prÃ³prio.

do $$
declare
  v_table text;
  v_tables text[] := array[
    'growth_records',
    'lab_results',
    'meals',
    'progress_photos',
    'meal_audit_log',
    'meal_edit_history'
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

-- O legado contÃ©m avaliaÃ§Ãµes parciais vÃ¡lidas para preservaÃ§Ã£o histÃ³rica.
-- Evita revalidar campos clÃ­nicos nÃ£o alterados durante este backfill tÃ©cnico.
alter table public.growth_records disable trigger user;
update public.growth_records t set care_episode_id = (
  select ce.id from public.care_episodes ce where ce.patient_id=t.patient_id
  order by (ce.status='active') desc, ce.started_at desc limit 1
) where t.care_episode_id is null;
alter table public.growth_records enable trigger user;

update public.lab_results t set care_episode_id = (
  select ce.id from public.care_episodes ce where ce.patient_id=t.patient_id
  order by (ce.status='active') desc, ce.started_at desc limit 1
) where t.care_episode_id is null;

update public.meals t set care_episode_id = (
  select ce.id from public.care_episodes ce where ce.patient_id=t.patient_id
  order by (ce.status='active') desc, ce.started_at desc limit 1
) where t.care_episode_id is null;

update public.progress_photos t set care_episode_id = (
  select ce.id from public.care_episodes ce where ce.patient_id=t.patient_id
  order by (ce.status='active') desc, ce.started_at desc limit 1
) where t.care_episode_id is null;

update public.meal_audit_log t set care_episode_id = (
  select ce.id from public.care_episodes ce where ce.patient_id=t.patient_id
  order by (ce.status='active') desc, ce.started_at desc limit 1
) where t.care_episode_id is null;

update public.meal_edit_history t set care_episode_id = (
  select ce.id from public.care_episodes ce where ce.patient_id=t.patient_id
  order by (ce.status='active') desc, ce.started_at desc limit 1
) where t.care_episode_id is null;

create or replace function private.assign_patient_owned_care_episode()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_episode public.care_episodes%rowtype;
begin
  if new.care_episode_id is not null then
    if not exists (
      select 1 from public.care_episodes ce
      where ce.id = new.care_episode_id
        and ce.patient_id = new.patient_id
    ) then
      raise exception 'EpisÃ³dio incompatÃ­vel com o paciente.' using errcode = '23514';
    end if;
    return new;
  end if;

  select * into v_episode
  from public.care_episodes ce
  where ce.patient_id = new.patient_id
    and ce.status = 'active'
  limit 1;

  if not found then
    -- Paciente ainda sem nutricionista: o registro continua privado e sem episÃ³dio.
    new.care_episode_id := null;
    return new;
  end if;

  new.care_episode_id := v_episode.id;
  return new;
end;
$$;

revoke all on function private.assign_patient_owned_care_episode() from public, anon, authenticated;

do $$
declare
  v_table text;
  v_tables text[] := array[
    'growth_records',
    'lab_results',
    'meals',
    'progress_photos',
    'meal_audit_log',
    'meal_edit_history'
  ];
begin
  foreach v_table in array v_tables loop
    execute format('drop trigger if exists trg_assign_patient_owned_care_episode on public.%I', v_table);
    execute format(
      'create trigger trg_assign_patient_owned_care_episode before insert or update of patient_id, care_episode_id on public.%I for each row execute function private.assign_patient_owned_care_episode()',
      v_table
    );

    execute format('drop policy if exists b2_episode_isolation on public.%I', v_table);
    execute format('drop policy if exists b2_episode_participant_select on public.%I', v_table);
    execute format(
      'create policy b2_episode_participant_select on public.%I for select to authenticated using (
         (care_episode_id is null and patient_id = (select auth.uid()))
         or exists (
           select 1 from public.care_episodes ce
           where ce.id = care_episode_id
             and (ce.patient_id = (select auth.uid()) or ce.nutritionist_id = (select auth.uid()))
         )
       )',
      v_table
    );
    execute format(
      'create policy b2_episode_isolation on public.%I as restrictive for all to authenticated using (
         (care_episode_id is null and patient_id = (select auth.uid()))
         or exists (
           select 1 from public.care_episodes ce
           where ce.id = care_episode_id
             and (ce.patient_id = (select auth.uid()) or ce.nutritionist_id = (select auth.uid()))
         )
       ) with check (
         (care_episode_id is null and patient_id = (select auth.uid()))
         or exists (
           select 1 from public.care_episodes ce
           where ce.id = care_episode_id
             and (ce.patient_id = (select auth.uid()) or ce.nutritionist_id = (select auth.uid()))
         )
       )',
      v_table
    );

    execute format(
      'alter table public.%I drop constraint if exists %I',
      v_table,
      v_table || '_care_episode_required_check'
    );
  end loop;
end $$;

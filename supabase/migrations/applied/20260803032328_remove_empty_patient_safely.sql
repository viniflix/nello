-- Remove accidental, clinically empty patient registrations from a nutritionist's
-- workspace without destroying the patient's platform identity or legal history.

create table if not exists private.empty_patient_removal_audit (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  nutritionist_id uuid not null,
  care_episode_id uuid not null,
  removed_by uuid not null,
  removed_at timestamptz not null default now(),
  reason text not null default 'empty_profile_removed',
  patient_snapshot jsonb not null default '{}'::jsonb
);

revoke all on table private.empty_patient_removal_audit from public, anon, authenticated;

create or replace function private.patient_has_meaningful_data(p_patient_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_column record;
  v_found boolean;
begin
  -- Any current or future base table carrying patient/user-owned data blocks
  -- removal. Only relationship/bootstrap/audit rows are intentionally ignored.
  for v_column in
    select n.nspname as schema_name, c.relname as table_name, a.attname as column_name
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and a.attnum > 0
      and not a.attisdropped
      and a.attname in ('patient_id', 'user_id')
      and c.relname not in (
        'activity_log',
        'archived_patient_links',
        'bug_reports',
        'care_episodes',
        'notifications',
        'nutritionist_patients',
        'operational_observability_log',
        'patient_module_sync_flags',
        'patient_profile_events',
        'patient_reminder_preferences',
        'professional_verifications',
        'reminder_delivery_log'
      )
  loop
    execute format(
      'select exists (select 1 from %I.%I where %I = $1)',
      v_column.schema_name,
      v_column.table_name,
      v_column.column_name
    ) using p_patient_id into v_found;

    if v_found then
      return true;
    end if;
  end loop;

  return false;
end;
$function$;

revoke all on function private.patient_has_meaningful_data(uuid) from public, anon, authenticated;

create or replace function private.empty_patient_removal_status(p_patient_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_episode public.care_episodes%rowtype;
  v_episode_count integer;
begin
  if v_actor is null then
    return jsonb_build_object('can_remove', false, 'reason', 'authentication_required');
  end if;

  if not exists (
    select 1 from public.user_profiles
    where id = v_actor and user_type = 'nutritionist'
  ) then
    return jsonb_build_object('can_remove', false, 'reason', 'nutritionist_required');
  end if;

  select * into v_episode
  from public.care_episodes
  where patient_id = p_patient_id
    and nutritionist_id = v_actor
    and status = 'active'
  order by started_at desc
  limit 1;

  if not found then
    return jsonb_build_object('can_remove', false, 'reason', 'active_relationship_not_found');
  end if;

  if not exists (
    select 1 from public.user_profiles
    where id = p_patient_id and user_type = 'patient'
  ) then
    return jsonb_build_object('can_remove', false, 'reason', 'patient_not_found');
  end if;

  select count(*) into v_episode_count
  from public.care_episodes
  where patient_id = p_patient_id;

  if v_episode_count <> 1 or exists (
    select 1 from public.archived_patient_links where patient_id = p_patient_id
  ) then
    return jsonb_build_object('can_remove', false, 'reason', 'care_history_exists');
  end if;

  if private.patient_has_meaningful_data(p_patient_id) then
    return jsonb_build_object('can_remove', false, 'reason', 'clinical_data_exists');
  end if;

  return jsonb_build_object(
    'can_remove', true,
    'reason', null,
    'care_episode_id', v_episode.id
  );
end;
$function$;

revoke all on function private.empty_patient_removal_status(uuid) from public, anon, authenticated;

create or replace function public.get_empty_patient_removal_status(p_patient_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, private, pg_temp
as $function$
  select private.empty_patient_removal_status($1);
$function$;

revoke all on function public.get_empty_patient_removal_status(uuid) from public, anon;
grant execute on function public.get_empty_patient_removal_status(uuid) to authenticated;

create or replace function public.remove_empty_patient(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_status jsonb;
  v_episode public.care_episodes%rowtype;
  v_snapshot jsonb;
begin
  if v_actor is null then
    raise exception 'AutenticaÃ§Ã£o obrigatÃ³ria.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_patient_id::text, 0));
  v_status := private.empty_patient_removal_status(p_patient_id);

  if not coalesce((v_status ->> 'can_remove')::boolean, false) then
    raise exception 'Este cadastro nÃ£o pode ser removido: %.', coalesce(v_status ->> 'reason', 'unknown')
      using errcode = 'P0001';
  end if;

  select * into strict v_episode
  from public.care_episodes
  where id = (v_status ->> 'care_episode_id')::uuid
  for update;

  v_snapshot := private.minimal_patient_snapshot(p_patient_id);

  update public.care_episodes
  set status = 'ended',
      ended_at = now(),
      ended_by = v_actor,
      end_reason = 'empty_profile_removed',
      patient_snapshot = coalesce(nullif(patient_snapshot, '{}'::jsonb), v_snapshot),
      updated_at = now()
  where id = v_episode.id;

  update public.nutritionist_patients
  set status = 'removed'
  where nutritionist_id = v_actor
    and patient_id = p_patient_id
    and status = 'active';

  update public.user_profiles
  set nutritionist_id = null
  where id = p_patient_id
    and nutritionist_id = v_actor;

  insert into private.empty_patient_removal_audit (
    patient_id, nutritionist_id, care_episode_id, removed_by, patient_snapshot
  ) values (
    p_patient_id, v_actor, v_episode.id, v_actor, coalesce(v_snapshot, '{}'::jsonb)
  );

  perform private.write_care_episode_activity(
    'care_episode.empty_profile_removed',
    v_episode,
    v_actor,
    'empty_profile_removed'
  );

  return jsonb_build_object('success', true, 'patient_id', p_patient_id);
end;
$function$;

revoke all on function public.remove_empty_patient(uuid) from public, anon;
grant execute on function public.remove_empty_patient(uuid) to authenticated;

-- Removed empty profiles should disappear from both active and archived lists;
-- later episodes for the same patient remain visible normally.
create or replace function public.list_nutritionist_care_patients()
returns setof jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with caller as (
    select auth.uid() as id
  ), ranked as (
    select
      ce.*,
      row_number() over (
        partition by ce.patient_id
        order by (ce.status = 'active') desc, ce.started_at desc
      ) as position,
      count(*) over (partition by ce.patient_id) as episode_count
    from public.care_episodes ce, caller c
    where ce.nutritionist_id = c.id
  )
  select jsonb_strip_nulls(
    (case when r.status = 'active'
      then private.minimal_patient_snapshot(r.patient_id)
      else coalesce(nullif(r.patient_snapshot, '{}'::jsonb), private.minimal_patient_snapshot(r.patient_id))
    end)
    || jsonb_build_object(
      'id', r.patient_id,
      'care_episode_id', r.id,
      'care_status', r.status,
      'link_status', r.status,
      'is_active', r.status = 'active',
      'arquivadoHistorico', r.status = 'ended',
      'episode_count', r.episode_count,
      'care_started_at', r.started_at,
      'care_ended_at', r.ended_at,
      'care_end_reason', r.end_reason,
      'created_at', r.started_at
    )
  )
  from ranked r
  where r.position = 1
    and r.end_reason is distinct from 'empty_profile_removed'
    and exists (
      select 1 from public.user_profiles caller_profile
      where caller_profile.id = auth.uid()
        and caller_profile.user_type = 'nutritionist'
    )
  order by (r.status = 'active') desc, r.started_at desc;
$function$;

revoke all on function public.list_nutritionist_care_patients() from public, anon;
grant execute on function public.list_nutritionist_care_patients() to authenticated;

-- The legacy hard-delete SQL surface is unsafe for a health product.
revoke all on function public.delete_patient(uuid) from public, anon, authenticated;

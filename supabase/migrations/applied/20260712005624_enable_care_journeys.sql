-- Onda B3: jornadas de encerramento, status e histÃ³rico por participante.

alter table public.care_episodes
  add column if not exists patient_snapshot jsonb not null default '{}'::jsonb;

create or replace function private.minimal_patient_snapshot(p_patient_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'email', p.email,
    'avatar_url', p.avatar_url,
    'phone', p.phone,
    'birth_date', p.birth_date,
    'gender', p.gender,
    'height', p.height,
    'weight', p.weight,
    'goal', p.goal,
    'patient_category', p.patient_category
  ))
  from public.user_profiles p
  where p.id = p_patient_id;
$$;

revoke all on function private.minimal_patient_snapshot(uuid) from public, anon, authenticated;

update public.care_episodes ce
set patient_snapshot = private.minimal_patient_snapshot(ce.patient_id)
where ce.patient_snapshot = '{}'::jsonb;

create or replace function private.capture_ended_care_episode_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status = 'active' and new.status = 'ended' then
    new.patient_snapshot := private.minimal_patient_snapshot(new.patient_id);
  end if;
  return new;
end;
$$;

revoke all on function private.capture_ended_care_episode_snapshot() from public, anon, authenticated;

drop trigger if exists trg_capture_ended_care_episode_snapshot on public.care_episodes;
create trigger trg_capture_ended_care_episode_snapshot
before update of status on public.care_episodes
for each row execute function private.capture_ended_care_episode_snapshot();

create or replace function public.list_nutritionist_care_patients()
returns setof jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
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
    and exists (
      select 1 from public.user_profiles caller_profile
      where caller_profile.id = auth.uid()
        and caller_profile.user_type = 'nutritionist'
    )
  order by (r.status = 'active') desc, r.started_at desc;
$$;

create or replace function public.get_care_patient_profile(p_patient_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_strip_nulls(
    (case when ce.status = 'active'
      then private.minimal_patient_snapshot(ce.patient_id)
      else coalesce(nullif(ce.patient_snapshot, '{}'::jsonb), private.minimal_patient_snapshot(ce.patient_id))
    end)
    || jsonb_build_object(
      'id', ce.patient_id,
      'care_episode_id', ce.id,
      'care_status', ce.status,
      'is_active', ce.status = 'active',
      'arquivadoHistorico', ce.status = 'ended',
      'care_started_at', ce.started_at,
      'care_ended_at', ce.ended_at
    )
  )
  from public.care_episodes ce
  where ce.patient_id = p_patient_id
    and ce.nutritionist_id = auth.uid()
  order by (ce.status = 'active') desc, ce.started_at desc
  limit 1;
$$;

create or replace function public.get_my_care_relationship()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select jsonb_strip_nulls(jsonb_build_object(
      'episode_id', ce.id,
      'status', ce.status,
      'started_at', ce.started_at,
      'ended_at', ce.ended_at,
      'end_reason', ce.end_reason,
      'nutritionist_id', ce.nutritionist_id,
      'nutritionist_name', n.name,
      'nutritionist_avatar_url', n.avatar_url
    ))
    from public.care_episodes ce
    join public.user_profiles n on n.id = ce.nutritionist_id
    where ce.patient_id = auth.uid()
    order by (ce.status = 'active') desc, ce.started_at desc
    limit 1
  ), jsonb_build_object('status', 'unlinked'));
$$;

revoke all on function public.list_nutritionist_care_patients() from public, anon;
revoke all on function public.get_care_patient_profile(uuid) from public, anon;
revoke all on function public.get_my_care_relationship() from public, anon;
grant execute on function public.list_nutritionist_care_patients() to authenticated, service_role;
grant execute on function public.get_care_patient_profile(uuid) to authenticated, service_role;
grant execute on function public.get_my_care_relationship() to authenticated, service_role;

-- A B2 jÃ¡ garante o isolamento clÃ­nico; o encerramento pode agora ser chamado
-- diretamente pelos dois participantes e continua validado na rotina privada.
grant execute on function public.end_care_episode(uuid, text) to authenticated, service_role;

-- A funÃ§Ã£o legada de aprovaÃ§Ã£o pertence ao papel postgres e encadeia a rotina
-- privada de inÃ­cio. O cliente continua sem EXECUTE direto nessa rotina.
grant execute on function private.start_care_episode(uuid, text) to postgres, service_role;

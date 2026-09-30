-- Onda B1: episÃ³dios independentes por paciente e nutricionista.
-- Esta migration nÃ£o muda as queries clÃ­nicas existentes; o isolamento delas Ã© a Onda B2.

create table if not exists public.care_episodes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.user_profiles(id) on update cascade on delete restrict,
  nutritionist_id uuid not null references public.user_profiles(id) on update cascade on delete restrict,
  status text not null default 'active' check (status in ('active', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  start_reason text not null default 'care_started',
  end_reason text,
  started_by uuid references auth.users(id) on delete set null,
  ended_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'active' and ended_at is null and end_reason is null and ended_by is null)
    or (status = 'ended' and ended_at is not null)
  )
);

create unique index if not exists care_episodes_one_active_per_patient
  on public.care_episodes (patient_id)
  where status = 'active';

create index if not exists care_episodes_nutritionist_patient_started_idx
  on public.care_episodes (nutritionist_id, patient_id, started_at desc);

create index if not exists care_episodes_patient_started_idx
  on public.care_episodes (patient_id, started_at desc);

alter table public.nutritionist_patients
  drop constraint if exists nutritionist_patients_status_check;

alter table public.nutritionist_patients
  add constraint nutritionist_patients_status_check
  check (status in ('pending', 'active', 'rejected', 'ended'));

-- Cada vÃ­nculo ativo prÃ©-existente passa a ter exatamente um episÃ³dio ativo.
insert into public.care_episodes (
  patient_id,
  nutritionist_id,
  status,
  started_at,
  start_reason
)
select
  np.patient_id,
  np.nutritionist_id,
  'active',
  coalesce(np.created_at, now()),
  'legacy_active_link_migration'
from public.nutritionist_patients np
where np.status = 'active'
  and not exists (
    select 1
    from public.care_episodes ce
    where ce.patient_id = np.patient_id
      and ce.status = 'active'
  );

alter table public.care_episodes enable row level security;

drop policy if exists care_episodes_select_participant on public.care_episodes;
create policy care_episodes_select_participant
  on public.care_episodes
  for select
  to authenticated
  using (patient_id = (select auth.uid()) or nutritionist_id = (select auth.uid()));

-- NÃ£o hÃ¡ mutaÃ§Ã£o direta pelo cliente: transiÃ§Ãµes passam obrigatoriamente pelas RPCs.
revoke all on table public.care_episodes from anon;
grant select on table public.care_episodes to authenticated;

create or replace function private.write_care_episode_activity(
  p_event_name text,
  p_episode public.care_episodes,
  p_actor_user_id uuid,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.activity_log (
    event_name,
    patient_id,
    nutritionist_id,
    actor_user_id,
    source_module,
    payload
  ) values (
    p_event_name,
    p_episode.patient_id,
    p_episode.nutritionist_id,
    p_actor_user_id,
    'care_episodes',
    jsonb_strip_nulls(jsonb_build_object(
      'care_episode_id', p_episode.id,
      'status', p_episode.status,
      'reason', p_reason
    ))
  );
end;
$$;

create or replace function private.notify_care_episode_participant(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_episode_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notifications (user_id, type, title, message, content)
  values (
    p_user_id,
    p_type,
    p_title,
    p_message,
    jsonb_build_object('care_episode_id', p_episode_id)
  );
end;
$$;

create or replace function private.start_care_episode(
  p_patient_id uuid,
  p_start_reason text default 'care_started'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nutritionist_id uuid := auth.uid();
  v_existing public.care_episodes%rowtype;
  v_episode public.care_episodes%rowtype;
  v_user_type text;
begin
  if v_nutritionist_id is null then
    raise exception 'AutenticaÃ§Ã£o obrigatÃ³ria.' using errcode = '42501';
  end if;

  select user_type into v_user_type
  from public.user_profiles
  where id = v_nutritionist_id;

  if v_user_type <> 'nutritionist' then
    raise exception 'Apenas nutricionistas podem iniciar um atendimento.' using errcode = '42501';
  end if;

  perform 1 from public.user_profiles where id = p_patient_id and user_type = 'patient';
  if not found then
    raise exception 'Paciente nÃ£o encontrado.' using errcode = 'P0002';
  end if;

  -- Serializa decisÃµes concorrentes sobre o mesmo paciente.
  perform pg_advisory_xact_lock(hashtextextended(p_patient_id::text, 0));

  select * into v_existing
  from public.care_episodes
  where patient_id = p_patient_id and status = 'active'
  for update;

  if found then
    if v_existing.nutritionist_id = v_nutritionist_id then
      return jsonb_build_object('success', true, 'episode_id', v_existing.id, 'already_active', true);
    end if;

    raise exception 'O paciente possui atendimento ativo com outro nutricionista; ele deve encerrar o vÃ­nculo atual antes de iniciar outro.'
      using errcode = '23505';
  end if;

  insert into public.nutritionist_patients (nutritionist_id, patient_id, status)
  values (v_nutritionist_id, p_patient_id, 'active')
  on conflict (nutritionist_id, patient_id) do update
    set status = 'active';

  update public.user_profiles
  set nutritionist_id = v_nutritionist_id,
      is_active = true
  where id = p_patient_id;

  insert into public.care_episodes (
    patient_id, nutritionist_id, status, start_reason, started_by
  ) values (
    p_patient_id, v_nutritionist_id, 'active', coalesce(nullif(trim(p_start_reason), ''), 'care_started'), v_nutritionist_id
  ) returning * into v_episode;

  perform private.write_care_episode_activity('care_episode.started', v_episode, v_nutritionist_id, v_episode.start_reason);
  perform private.notify_care_episode_participant(
    p_patient_id,
    'care_episode_started',
    'Novo acompanhamento iniciado',
    'Seu acompanhamento nutricional foi iniciado.',
    v_episode.id
  );

  return jsonb_build_object('success', true, 'episode_id', v_episode.id, 'already_active', false);
end;
$$;

create or replace function private.end_care_episode(
  p_patient_id uuid,
  p_end_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_episode public.care_episodes%rowtype;
  v_recipient_id uuid;
begin
  if v_actor_user_id is null then
    raise exception 'AutenticaÃ§Ã£o obrigatÃ³ria.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_patient_id::text, 0));

  select * into v_episode
  from public.care_episodes
  where patient_id = p_patient_id and status = 'active'
  for update;

  if not found then
    raise exception 'NÃ£o existe atendimento ativo para encerrar.' using errcode = 'P0002';
  end if;

  if v_actor_user_id not in (v_episode.patient_id, v_episode.nutritionist_id) then
    raise exception 'Sem permissÃ£o para encerrar este atendimento.' using errcode = '42501';
  end if;

  update public.care_episodes
  set status = 'ended',
      ended_at = now(),
      ended_by = v_actor_user_id,
      end_reason = coalesce(nullif(trim(p_end_reason), ''), 'ended_by_participant'),
      updated_at = now()
  where id = v_episode.id
  returning * into v_episode;

  update public.nutritionist_patients
  set status = 'ended'
  where nutritionist_id = v_episode.nutritionist_id
    and patient_id = v_episode.patient_id
    and status = 'active';

  update public.user_profiles
  set nutritionist_id = null,
      is_active = false
  where id = v_episode.patient_id
    and nutritionist_id = v_episode.nutritionist_id;

  perform private.write_care_episode_activity('care_episode.ended', v_episode, v_actor_user_id, v_episode.end_reason);

  v_recipient_id := case
    when v_actor_user_id = v_episode.patient_id then v_episode.nutritionist_id
    else v_episode.patient_id
  end;

  perform private.notify_care_episode_participant(
    v_recipient_id,
    'care_episode_ended',
    'Acompanhamento encerrado',
    'O vÃ­nculo de acompanhamento foi encerrado. O histÃ³rico clÃ­nico permanece preservado.',
    v_episode.id
  );

  return jsonb_build_object('success', true, 'episode_id', v_episode.id);
end;
$$;

-- A aprovaÃ§Ã£o existente passa a materializar o episÃ³dio, sem alterar o contrato do frontend.
create or replace function private.approve_patient_link(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nutritionist_id uuid := auth.uid();
  v_link_status text;
begin
  if v_nutritionist_id is null then
    raise exception 'AutenticaÃ§Ã£o obrigatÃ³ria.' using errcode = '42501';
  end if;

  select status into v_link_status
  from public.nutritionist_patients
  where nutritionist_id = v_nutritionist_id and patient_id = p_patient_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'message', 'SolicitaÃ§Ã£o nÃ£o encontrada');
  end if;

  if v_link_status not in ('pending', 'active', 'ended') then
    return jsonb_build_object('success', false, 'message', 'SolicitaÃ§Ã£o nÃ£o pode ser aprovada');
  end if;

  return private.start_care_episode(p_patient_id, 'link_approved');
end;
$$;

create or replace function public.start_care_episode(p_patient_id uuid, p_start_reason text default 'care_started')
returns jsonb
language sql
security definer
set search_path = public, private, pg_temp
as $$ select private.start_care_episode($1, $2); $$;

create or replace function public.end_care_episode(p_patient_id uuid, p_end_reason text default null)
returns jsonb
language sql
security definer
set search_path = public, private, pg_temp
as $$ select private.end_care_episode($1, $2); $$;

revoke all on function public.start_care_episode(uuid, text) from public, anon;
revoke all on function public.end_care_episode(uuid, text) from public, anon;
grant execute on function public.start_care_episode(uuid, text) to authenticated, service_role;
grant execute on function public.end_care_episode(uuid, text) to authenticated, service_role;

revoke all on function private.start_care_episode(uuid, text) from public, anon, authenticated;
revoke all on function private.end_care_episode(uuid, text) from public, anon, authenticated;
revoke all on function private.write_care_episode_activity(text, public.care_episodes, uuid, text) from public, anon, authenticated;
revoke all on function private.notify_care_episode_participant(uuid, text, text, text, uuid) from public, anon, authenticated;

revoke all on function private.approve_patient_link(uuid) from public, anon;
revoke all on function public.approve_patient_link(uuid) from public, anon;
grant execute on function public.approve_patient_link(uuid) to authenticated, service_role;

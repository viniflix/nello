-- Notifications are addressed to authenticated platform accounts. Offline
-- patient profiles are valid clinical records, but they do not have an
-- auth.users row and therefore cannot receive in-app notifications yet.

create or replace function private.start_care_episode(
  p_patient_id uuid,
  p_start_reason text default 'care_started'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_nutritionist_id uuid := auth.uid();
  v_existing public.care_episodes%rowtype;
  v_episode public.care_episodes%rowtype;
  v_user_type text;
begin
  if v_nutritionist_id is null then
    raise exception 'AutenticaÃ§Ã£o obrigatÃ³ria.' using errcode = '42501';
  end if;

  select profile.user_type into v_user_type
  from public.user_profiles profile
  where profile.id = v_nutritionist_id;

  if v_user_type <> 'nutritionist' then
    raise exception 'Apenas nutricionistas podem iniciar um atendimento.' using errcode = '42501';
  end if;

  perform 1
  from public.user_profiles profile
  where profile.id = p_patient_id and profile.user_type = 'patient';
  if not found then
    raise exception 'Paciente nÃ£o encontrado.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_patient_id::text, 0));

  select episode.* into v_existing
  from public.care_episodes episode
  where episode.patient_id = p_patient_id and episode.status = 'active'
  for update;

  if found then
    if v_existing.nutritionist_id = v_nutritionist_id then
      return jsonb_build_object('success', true, 'episode_id', v_existing.id, 'already_active', true);
    end if;

    raise exception 'O paciente possui atendimento ativo com outro nutricionista; ele deve encerrar o vÃ­nculo atual antes de iniciar outro.'
      using errcode = '23505';
  end if;

  -- The active-link trigger owns compatibility episode creation. Selecting
  -- its result avoids the previous double insert; the fallback repairs an
  -- old active link that predates the trigger.
  insert into public.nutritionist_patients (nutritionist_id, patient_id, status)
  values (v_nutritionist_id, p_patient_id, 'active')
  on conflict (nutritionist_id, patient_id) do update
    set status = 'active';

  select episode.* into v_episode
  from public.care_episodes episode
  where episode.patient_id = p_patient_id
    and episode.nutritionist_id = v_nutritionist_id
    and episode.status = 'active'
  for update;

  if not found then
    insert into public.care_episodes (
      patient_id, nutritionist_id, status, start_reason, started_by
    ) values (
      p_patient_id,
      v_nutritionist_id,
      'active',
      coalesce(nullif(trim(p_start_reason), ''), 'care_started'),
      v_nutritionist_id
    ) returning * into v_episode;
  else
    update public.care_episodes
    set start_reason = coalesce(nullif(trim(p_start_reason), ''), start_reason),
        started_by = coalesce(started_by, v_nutritionist_id),
        updated_at = now()
    where id = v_episode.id
    returning * into v_episode;
  end if;

  update public.user_profiles
  set nutritionist_id = v_nutritionist_id,
      is_active = true
  where id = p_patient_id;

  perform private.write_care_episode_activity(
    'care_episode.started', v_episode, v_nutritionist_id, v_episode.start_reason
  );
  perform private.notify_care_episode_participant(
    p_patient_id,
    'care_episode_started',
    'Novo acompanhamento iniciado',
    'Seu acompanhamento nutricional foi iniciado.',
    v_episode.id
  );

  return jsonb_build_object(
    'success', true,
    'episode_id', v_episode.id,
    'already_active', false
  );
end;
$function$;

create or replace function private.notify_care_episode_participant(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_episode_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (select 1 from auth.users where id = p_user_id) then
    return;
  end if;

  insert into public.notifications (user_id, type, title, message, content)
  values (
    p_user_id,
    p_type,
    p_title,
    p_message,
    jsonb_build_object('care_episode_id', p_episode_id)
  );
end;
$function$;

create or replace function private.create_daily_log_reminders()
returns void
language sql
security definer
set search_path = ''
as $function$
  insert into public.notifications (user_id, type, content, is_read)
  select
    profile.id,
    'daily_log_reminder',
    jsonb_build_object('message', 'NÃ£o se esqueÃ§a de registrar suas refeiÃ§Ãµes hoje!'),
    false
  from public.user_profiles profile
  join auth.users account on account.id = profile.id
  where profile.user_type = 'patient'
    and exists (
      select 1
      from public.care_episodes episode
      where episode.patient_id = profile.id
        and episode.status = 'active'
    )
    and not exists (
      select 1
      from public.notifications notification
      where notification.user_id = profile.id
        and notification.type = 'daily_log_reminder'
        and notification.created_at >= date_trunc('day', now())
    );
$function$;

create or replace function private.create_appointment_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  appointment_record record;
begin
  for appointment_record in
    select appointment.id, appointment.patient_id, appointment.appointment_time
    from public.appointments appointment
    join auth.users account on account.id = appointment.patient_id
    where appointment.status = 'scheduled'
      and appointment.reminder_sent_at is null
      and appointment.appointment_time between now() and now() + interval '48 hours'
    for update of appointment skip locked
  loop
    insert into public.notifications (user_id, type, content, is_read)
    values (
      appointment_record.patient_id,
      'appointment_reminder',
      jsonb_build_object('appointment_time', appointment_record.appointment_time),
      false
    );

    update public.appointments
    set reminder_sent_at = now()
    where id = appointment_record.id;
  end loop;
end;
$function$;

revoke all on function private.notify_care_episode_participant(uuid, text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function private.start_care_episode(uuid, text)
  from public, anon, authenticated;
revoke all on function private.create_daily_log_reminders()
  from public, anon, authenticated;
revoke all on function private.create_appointment_reminders()
  from public, anon, authenticated;

grant execute on function private.notify_care_episode_participant(uuid, text, text, text, uuid)
  to service_role;
grant execute on function private.start_care_episode(uuid, text)
  to service_role;
grant execute on function private.create_daily_log_reminders()
  to service_role;
grant execute on function private.create_appointment_reminders()
  to service_role;

-- These scheduler entry points are infrastructure operations, not client RPCs.
revoke all on function public.create_daily_log_reminders()
  from public, anon, authenticated;
revoke all on function public.create_appointment_reminders()
  from public, anon, authenticated;
grant execute on function public.create_daily_log_reminders() to service_role;
grant execute on function public.create_appointment_reminders() to service_role;

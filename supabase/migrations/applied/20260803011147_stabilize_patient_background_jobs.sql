create or replace function private.process_patient_reminders(p_patient_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_patient_id uuid := coalesce(p_patient_id, auth.uid());
  v_now timestamptz := now();
  v_today date;
  v_now_time time;
  v_timezone text;
  v_prefs record;
  v_daily_due boolean := false;
  v_measurement_due boolean := false;
  v_has_meal_today boolean := false;
  v_last_measurement_date date;
  v_notification_id bigint;
  v_daily_sent integer := 0;
  v_measurement_sent integer := 0;
begin
  if v_actor_id is null or v_patient_id is null or v_patient_id <> v_actor_id then
    raise exception using errcode = '42501', message = 'patient_reminder_forbidden';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('patient-reminders:' || v_patient_id::text, 0));

  insert into public.patient_reminder_preferences (patient_id)
  values (v_patient_id)
  on conflict (patient_id) do nothing;

  select * into v_prefs
  from public.patient_reminder_preferences
  where patient_id = v_patient_id;

  if not found then
    return jsonb_build_object('processed', false, 'reason', 'missing_preferences');
  end if;

  v_timezone := coalesce(nullif(v_prefs.timezone, ''), 'America/Sao_Paulo');
  begin
    v_today := (v_now at time zone v_timezone)::date;
    v_now_time := (v_now at time zone v_timezone)::time;
  exception when invalid_parameter_value then
    v_timezone := 'America/Sao_Paulo';
    v_today := (v_now at time zone v_timezone)::date;
    v_now_time := (v_now at time zone v_timezone)::time;
  end;

  select exists (
    select 1 from public.meals m
    where m.patient_id = v_patient_id
      and m.meal_date = v_today
      and m.deleted_at is null
  ) into v_has_meal_today;

  select max(gr.record_date) into v_last_measurement_date
  from public.growth_records gr
  where gr.patient_id = v_patient_id;

  if coalesce(v_prefs.channel_in_app, true) then
    v_daily_due := coalesce(v_prefs.daily_log_enabled, true)
      and v_now_time >= coalesce(v_prefs.daily_log_time, '20:00'::time)
      and not v_has_meal_today;
    v_measurement_due := coalesce(v_prefs.measurement_enabled, true)
      and v_now_time >= coalesce(v_prefs.measurement_time, '09:00'::time)
      and (v_last_measurement_date is null or v_last_measurement_date <= v_today - 7);
  end if;

  if v_daily_due and not exists (
    select 1 from public.reminder_delivery_log r
    where r.patient_id = v_patient_id
      and r.reminder_type = 'daily_log_reminder'
      and r.delivery_channel = 'in_app'
      and r.reminder_date = v_today
  ) then
    insert into public.notifications(user_id, type, content, is_read)
    values (v_patient_id, 'daily_log_reminder', jsonb_build_object(
      'title', 'Lembrete DiÃ¡rio',
      'message', 'NÃ£o se esqueÃ§a de registrar suas refeiÃ§Ãµes hoje!',
      'source_module', 'reminder_engine'
    ), false)
    returning id into v_notification_id;

    insert into public.reminder_delivery_log(
      patient_id, reminder_type, delivery_channel, reminder_date,
      reminder_time, status, notification_id
    ) values (
      v_patient_id, 'daily_log_reminder', 'in_app', v_today,
      coalesce(v_prefs.daily_log_time, '20:00'::time), 'sent', v_notification_id
    );
    v_daily_sent := 1;
  end if;

  if v_measurement_due and not exists (
    select 1 from public.reminder_delivery_log r
    where r.patient_id = v_patient_id
      and r.reminder_type = 'measurement_reminder'
      and r.delivery_channel = 'in_app'
      and r.reminder_date = v_today
  ) then
    insert into public.notifications(user_id, type, content, is_read)
    values (v_patient_id, 'measurement_reminder', jsonb_build_object(
      'title', 'Atualizar Medidas',
      'message', 'Atualize suas medidas para manter seu plano calibrado.',
      'source_module', 'reminder_engine'
    ), false)
    returning id into v_notification_id;

    insert into public.reminder_delivery_log(
      patient_id, reminder_type, delivery_channel, reminder_date,
      reminder_time, status, notification_id
    ) values (
      v_patient_id, 'measurement_reminder', 'in_app', v_today,
      coalesce(v_prefs.measurement_time, '09:00'::time), 'sent', v_notification_id
    );
    v_measurement_sent := 1;
  end if;

  return jsonb_build_object(
    'processed', true,
    'patient_id', v_patient_id,
    'daily_sent', v_daily_sent,
    'measurement_sent', v_measurement_sent,
    'timezone', v_timezone,
    'local_date', v_today,
    'timestamp', v_now
  );
end;
$$;

create or replace function public.process_patient_reminders(p_patient_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if auth.uid() is null or p_patient_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'patient_reminder_forbidden';
  end if;
  return private.process_patient_reminders(p_patient_id);
end;
$$;

revoke all on function private.process_patient_reminders(uuid) from public, anon, authenticated;
revoke all on function public.process_patient_reminders(uuid) from public, anon;
grant execute on function private.process_patient_reminders(uuid) to service_role;
grant execute on function public.process_patient_reminders(uuid) to authenticated, service_role;

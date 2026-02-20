begin;

-- Sprint 06 - Etapa 2
-- Motor de notificacoes de consulta (D-1 e H-2) com processamento in-app.

create or replace function public.sync_appointment_notification_schedule(
  p_appointment_id uuid,
  p_force_reschedule boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appt record;
  v_now timestamptz := now();
  v_d1_ts timestamptz;
  v_h2_ts timestamptz;
  v_cancelled_count int := 0;
  v_inserted_count int := 0;
  v_last_insert_count int := 0;
begin
  if p_appointment_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_appointment_id');
  end if;

  select
    a.id,
    a.nutritionist_id,
    a.patient_id,
    a.start_time,
    a.status,
    a.confirmation_channel,
    a.confirmation_status
  into v_appt
  from public.appointments a
  where a.id = p_appointment_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'appointment_not_found', 'appointment_id', p_appointment_id);
  end if;

  -- Se consulta nao esta em estado agendavel, cancela notificacoes pendentes.
  if v_appt.status in ('canceled', 'completed')
     or v_appt.confirmation_status in ('confirmed', 'cancelled') then
    update public.appointment_notifications
    set
      delivery_status = 'cancelled',
      cancelled_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cancel_reason', 'appointment_not_schedulable')
    where appointment_id = v_appt.id
      and delivery_status in ('pending', 'failed', 'processing');

    get diagnostics v_cancelled_count = row_count;

    return jsonb_build_object(
      'ok', true,
      'appointment_id', v_appt.id,
      'scheduled', 0,
      'cancelled', v_cancelled_count
    );
  end if;

  if p_force_reschedule then
    update public.appointment_notifications
    set
      delivery_status = 'cancelled',
      cancelled_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cancel_reason', 'rescheduled')
    where appointment_id = v_appt.id
      and notification_type in ('confirmation_d1', 'confirmation_h2')
      and delivery_status in ('pending', 'failed', 'processing');

    get diagnostics v_cancelled_count = row_count;
  end if;

  v_d1_ts := v_appt.start_time - interval '1 day';
  v_h2_ts := v_appt.start_time - interval '2 hours';

  -- Agenda D-1 se consulta ainda nao ocorreu.
  if v_appt.start_time > v_now then
    insert into public.appointment_notifications (
      appointment_id,
      nutritionist_id,
      patient_id,
      notification_type,
      channel,
      scheduled_for,
      delivery_status,
      payload,
      metadata
    )
    values (
      v_appt.id,
      v_appt.nutritionist_id,
      v_appt.patient_id,
      'confirmation_d1',
      coalesce(v_appt.confirmation_channel, 'in_app'),
      v_d1_ts,
      'pending',
      jsonb_build_object(
        'appointment_id', v_appt.id,
        'window', 'D-1'
      ),
      jsonb_build_object('source', 'sync_appointment_notification_schedule')
    )
    on conflict (appointment_id, notification_type, scheduled_for) do nothing;
    get diagnostics v_inserted_count = row_count;

    insert into public.appointment_notifications (
      appointment_id,
      nutritionist_id,
      patient_id,
      notification_type,
      channel,
      scheduled_for,
      delivery_status,
      payload,
      metadata
    )
    values (
      v_appt.id,
      v_appt.nutritionist_id,
      v_appt.patient_id,
      'confirmation_h2',
      coalesce(v_appt.confirmation_channel, 'in_app'),
      v_h2_ts,
      'pending',
      jsonb_build_object(
        'appointment_id', v_appt.id,
        'window', 'H-2'
      ),
      jsonb_build_object('source', 'sync_appointment_notification_schedule')
    )
    on conflict (appointment_id, notification_type, scheduled_for) do nothing;
    get diagnostics v_last_insert_count = row_count;
    v_inserted_count := v_inserted_count + v_last_insert_count;
  end if;

  update public.appointments
  set
    reminder_d1_scheduled_at = case when v_appt.start_time > v_now then v_d1_ts else reminder_d1_scheduled_at end,
    reminder_h2_scheduled_at = case when v_appt.start_time > v_now then v_h2_ts else reminder_h2_scheduled_at end
  where id = v_appt.id;

  return jsonb_build_object(
    'ok', true,
    'appointment_id', v_appt.id,
    'scheduled', v_inserted_count,
    'cancelled', v_cancelled_count,
    'd1_at', v_d1_ts,
    'h2_at', v_h2_ts
  );
end;
$$;

create or replace function public.process_appointment_notifications(
  p_limit int default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_item record;
  v_notification_id uuid;
  v_sent int := 0;
  v_failed int := 0;
  v_processed int := 0;
  v_safe_limit int := greatest(1, least(coalesce(p_limit, 50), 500));
  v_message text;
begin
  for v_item in
    select n.*
    from public.appointment_notifications n
    where n.delivery_status in ('pending', 'failed')
      and n.scheduled_for <= v_now
    order by n.scheduled_for asc, n.id asc
    limit v_safe_limit
    for update skip locked
  loop
    v_processed := v_processed + 1;

    update public.appointment_notifications
    set delivery_status = 'processing'
    where id = v_item.id;

    begin
      v_message := case
        when v_item.notification_type = 'confirmation_d1'
          then 'Sua consulta e amanha. Confirme sua presenca no app.'
        when v_item.notification_type = 'confirmation_h2'
          then 'Sua consulta e em ate 2 horas. Confirme sua presenca.'
        when v_item.notification_type = 'cancellation_followup'
          then 'Registramos um cancelamento. Deseja reagendar?'
        when v_item.notification_type = 'no_show_followup'
          then 'Notamos ausencia na consulta. Deseja reagendar?'
        else 'Atualizacao de consulta disponivel.'
      end;

      insert into public.notifications (user_id, type, title, message, link_url, read_at)
      values (
        v_item.patient_id,
        'appointment_reminder',
        'Lembrete de consulta',
        v_message,
        '/patient/home?appointment=' || v_item.appointment_id::text,
        null
      )
      returning id into v_notification_id;

      update public.appointment_notifications
      set
        delivery_status = 'sent',
        attempts = attempts + 1,
        sent_at = now(),
        provider_message_id = coalesce(v_notification_id::text, provider_message_id),
        error_message = null,
        last_error_at = null,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('notification_id', v_notification_id::text)
      where id = v_item.id;

      update public.appointments
      set
        last_notification_at = now(),
        confirmation_requested_at = coalesce(confirmation_requested_at, now())
      where id = v_item.appointment_id;

      begin
        perform public.log_activity_event(
          'appointment_notification_sent',
          1,
          'appointment_notification_engine',
          v_item.patient_id,
          v_item.nutritionist_id,
          jsonb_build_object(
            'appointment_id', v_item.appointment_id,
            'notification_type', v_item.notification_type,
            'notification_id', v_notification_id::text
          )
        );
      exception when undefined_function then
        null;
      end;

      v_sent := v_sent + 1;
    exception when others then
      update public.appointment_notifications
      set
        delivery_status = 'failed',
        attempts = attempts + 1,
        last_error_at = now(),
        error_message = left(sqlerrm, 500)
      where id = v_item.id;

      v_failed := v_failed + 1;
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'processed', v_processed,
    'sent', v_sent,
    'failed', v_failed,
    'timestamp', v_now
  );
end;
$$;

grant execute on function public.sync_appointment_notification_schedule(uuid, boolean) to authenticated;
grant execute on function public.process_appointment_notifications(int) to authenticated;

commit;

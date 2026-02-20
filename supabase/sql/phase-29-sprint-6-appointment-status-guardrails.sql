begin;

-- Sprint 06 - Etapa 3
-- Guardrails de transicao de status para agendamentos.

do $$
begin
  alter type public.appointment_status add value if not exists 'no_show';
exception
  when duplicate_object then null;
end $$;

create or replace function public.enforce_appointment_status_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status is null then
    return new;
  end if;

  if old.status is null or new.status = old.status then
    return new;
  end if;

  -- scheduled -> confirmed/canceled
  if old.status = 'scheduled' and new.status in ('confirmed', 'canceled') then
    return new;
  end if;

  -- confirmed -> completed/canceled/no_show
  if old.status = 'confirmed' and new.status in ('completed', 'canceled', 'no_show') then
    return new;
  end if;

  -- estados finais nao podem transicionar por update simples
  if old.status in ('completed', 'canceled', 'no_show') then
    raise exception 'Transicao invalida: status final nao pode ser alterado (% -> %)', old.status, new.status;
  end if;

  raise exception 'Transicao invalida de status: % -> %', old.status, new.status;
end;
$$;

drop trigger if exists trg_enforce_appointment_status_transition on public.appointments;
create trigger trg_enforce_appointment_status_transition
before update of status on public.appointments
for each row
execute function public.enforce_appointment_status_transition();

create or replace function public.transition_appointment_status(
  p_appointment_id uuid,
  p_next_status public.appointment_status,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appt record;
  v_actor uuid := auth.uid();
  v_result jsonb;
begin
  if p_appointment_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_appointment_id');
  end if;

  select *
    into v_appt
  from public.appointments
  where id = p_appointment_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'appointment_not_found');
  end if;

  if v_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_actor');
  end if;

  -- nutricionista dono pode transicionar tudo; paciente apenas confirmar/cancelar
  if v_actor <> v_appt.nutritionist_id and v_actor <> v_appt.patient_id then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  if v_actor = v_appt.patient_id and p_next_status not in ('confirmed', 'canceled') then
    return jsonb_build_object('ok', false, 'reason', 'patient_transition_not_allowed');
  end if;

  if p_next_status = v_appt.status then
    return jsonb_build_object('ok', true, 'appointment_id', p_appointment_id, 'status', v_appt.status, 'no_change', true);
  end if;

  if v_appt.status = 'scheduled' and p_next_status not in ('confirmed', 'canceled') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_transition', 'from', v_appt.status, 'to', p_next_status);
  end if;

  if v_appt.status = 'confirmed' and p_next_status not in ('completed', 'canceled', 'no_show') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_transition', 'from', v_appt.status, 'to', p_next_status);
  end if;

  if v_appt.status in ('completed', 'canceled', 'no_show') then
    return jsonb_build_object('ok', false, 'reason', 'terminal_status_locked', 'from', v_appt.status, 'to', p_next_status);
  end if;

  update public.appointments
  set
    status = p_next_status,
    confirmation_status = case
      when p_next_status = 'confirmed' then 'confirmed'
      when p_next_status = 'canceled' then 'cancelled'
      when p_next_status = 'no_show' then 'no_response'
      else confirmation_status
    end,
    confirmed_at = case when p_next_status = 'confirmed' then now() else confirmed_at end,
    cancelled_at = case when p_next_status = 'canceled' then now() else cancelled_at end,
    cancellation_reason = case when p_next_status = 'canceled' then coalesce(nullif(trim(p_reason), ''), cancellation_reason) else cancellation_reason end,
    attendance_marked_at = case when p_next_status = 'completed' then now() else attendance_marked_at end,
    no_show_marked_at = case when p_next_status = 'no_show' then now() else no_show_marked_at end
  where id = p_appointment_id;

  if p_next_status in ('confirmed', 'completed') then
    update public.appointment_notifications
    set
      delivery_status = 'cancelled',
      cancelled_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cancel_reason', 'status_' || p_next_status::text)
    where appointment_id = p_appointment_id
      and delivery_status in ('pending', 'failed', 'processing');
  end if;

  if p_next_status = 'canceled' then
    update public.appointment_notifications
    set
      delivery_status = 'cancelled',
      cancelled_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cancel_reason', 'appointment_canceled')
    where appointment_id = p_appointment_id
      and delivery_status in ('pending', 'failed', 'processing');

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
      'cancellation_followup',
      coalesce(v_appt.confirmation_channel, 'in_app'),
      now(),
      'pending',
      jsonb_build_object('appointment_id', v_appt.id, 'reason', coalesce(p_reason, 'canceled')),
      jsonb_build_object('source', 'transition_appointment_status')
    )
    on conflict (appointment_id, notification_type, scheduled_for) do nothing;
  end if;

  if p_next_status = 'no_show' then
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
      'no_show_followup',
      coalesce(v_appt.confirmation_channel, 'in_app'),
      now(),
      'pending',
      jsonb_build_object('appointment_id', v_appt.id),
      jsonb_build_object('source', 'transition_appointment_status')
    )
    on conflict (appointment_id, notification_type, scheduled_for) do nothing;
  end if;

  select to_jsonb(a.*)
    into v_result
  from public.appointments a
  where a.id = p_appointment_id;

  return jsonb_build_object('ok', true, 'appointment', v_result);
end;
$$;

grant execute on function public.transition_appointment_status(uuid, public.appointment_status, text) to authenticated;

commit;

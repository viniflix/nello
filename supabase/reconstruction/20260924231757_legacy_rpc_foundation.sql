-- CI-only captured legacy UUID definitions missing from CREATE history.

-- They remain retired: the following recorded migration must revoke client grants unchanged.

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION private.transition_appointment_status(p_appointment_id uuid, p_next_status text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_appt record;
  v_actor uuid := auth.uid();
  v_result jsonb;
  v_next text := p_next_status;
begin
  if p_appointment_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_appointment_id');
  end if;

  select * into v_appt
  from public.appointments
  where id = p_appointment_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'appointment_not_found');
  end if;

  if v_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_actor');
  end if;

  if v_actor <> v_appt.nutritionist_id and (v_appt.patient_id is null or v_actor <> v_appt.patient_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  if v_next = 'cancelled' then
    v_next := 'canceled';
  end if;

  if v_next = v_appt.status::text or (v_next = 'canceled' and v_appt.status::text = 'cancelled') then
    return jsonb_build_object('ok', true, 'appointment_id', p_appointment_id, 'status', v_appt.status, 'no_change', true);
  end if;

  -- Validações de transição
  if v_appt.status::text = 'scheduled' and v_next not in ('confirmed', 'canceled') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_transition', 'from', v_appt.status, 'to', v_next);
  end if;
  if v_appt.status::text = 'confirmed' and v_next not in ('completed', 'canceled', 'no_show') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_transition', 'from', v_appt.status, 'to', v_next);
  end if;
  if v_appt.status::text in ('completed', 'canceled', 'no_show') then
    return jsonb_build_object('ok', false, 'reason', 'terminal_status_locked', 'from', v_appt.status, 'to', v_next);
  end if;

  -- Update do status
  update public.appointments
  set status = v_next
  where id = p_appointment_id;

  select to_jsonb(a.*) into v_result
  from public.appointments a
  where a.id = p_appointment_id;

  return jsonb_build_object('ok', true, 'appointment', v_result);
end;
$function$;

REVOKE ALL ON FUNCTION private.transition_appointment_status(uuid,text,text) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION private.transition_appointment_status(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.transition_appointment_status(p_appointment_id uuid, p_next_status text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ select private.transition_appointment_status($1, $2, $3); $function$;

REVOKE ALL ON FUNCTION public.transition_appointment_status(uuid,text,text) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.transition_appointment_status(uuid,text,text) TO service_role;

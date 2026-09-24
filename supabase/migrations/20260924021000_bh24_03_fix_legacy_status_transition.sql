-- Keep the existing public transition wrapper usable by older clients.
-- The table accepts 'cancelled', while the prior private function wrote
-- 'canceled' and failed the CHECK constraint.
CREATE OR REPLACE FUNCTION private.transition_appointment_status(
  p_appointment_id bigint,
  p_next_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_tx public.financial_transactions%ROWTYPE;
  v_actor uuid := auth.uid();
  v_next text := CASE WHEN p_next_status = 'canceled' THEN 'cancelled' ELSE p_next_status END;
BEGIN
  IF p_appointment_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_appointment_id');
  END IF;
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_actor');
  END IF;
  SELECT * INTO v_appt FROM public.appointments
  WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'appointment_not_found');
  END IF;
  IF v_actor <> v_appt.nutritionist_id AND
     (v_appt.patient_id IS NULL OR v_actor <> v_appt.patient_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authorized');
  END IF;
  IF v_next = v_appt.status THEN
    RETURN jsonb_build_object('ok', true, 'appointment_id', p_appointment_id,
      'status', v_appt.status, 'no_change', true);
  END IF;
  IF NOT (
    (v_appt.status IN ('scheduled', 'awaiting_confirmation') AND v_next IN ('confirmed', 'cancelled'))
    OR (v_appt.status = 'confirmed' AND v_next IN ('completed', 'cancelled', 'no_show'))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason',
      CASE WHEN v_appt.status IN ('completed', 'cancelled', 'no_show')
        THEN 'terminal_status_locked' ELSE 'invalid_transition' END);
  END IF;
  SELECT * INTO v_tx FROM public.financial_transactions
  WHERE appointment_id = p_appointment_id FOR UPDATE;
  UPDATE public.appointments SET status = v_next
  WHERE id = p_appointment_id RETURNING * INTO v_appt;
  IF v_next = 'cancelled' AND v_tx.id IS NOT NULL
     AND v_tx.status IN ('pending', 'overdue') THEN
    DELETE FROM public.financial_transactions WHERE id = v_tx.id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'appointment', to_jsonb(v_appt));
END;
$function$;

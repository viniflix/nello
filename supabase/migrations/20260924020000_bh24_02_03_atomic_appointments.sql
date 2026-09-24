-- BH24-02/03: new appointments and their charges must commit together.
-- Legacy charges are deliberately not guessed/backfilled from descriptions.
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS appointment_id bigint;

ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_transactions_appointment_id_fkey
  FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS financial_transactions_appointment_id_key
  ON public.financial_transactions (appointment_id)
  WHERE appointment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.save_appointment_with_finance(
  p_appointment jsonb,
  p_financial jsonb DEFAULT '{}'::jsonb,
  p_appointment_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_patient uuid;
  v_name text;
  v_start timestamptz;
  v_duration integer;
  v_type text;
  v_notes text;
  v_status text;
  v_service uuid;
  v_service_name text;
  v_amount numeric;
  v_description text;
  v_patient_name text;
  v_day date;
  v_old public.appointments%ROWTYPE;
  v_appt public.appointments%ROWTYPE;
  v_tx public.financial_transactions%ROWTYPE;
  v_tx_json jsonb := NULL;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'APPOINTMENT_AUTH_REQUIRED'; END IF;
  IF p_appointment IS NULL OR jsonb_typeof(p_appointment) <> 'object' THEN
    RAISE EXCEPTION 'APPOINTMENT_INVALID_PAYLOAD';
  END IF;
  IF NULLIF(p_appointment->>'nutritionist_id', '') IS NOT NULL
     AND (p_appointment->>'nutritionist_id')::uuid <> v_actor THEN
    RAISE EXCEPTION 'APPOINTMENT_OWNER_MISMATCH';
  END IF;

  v_patient := NULLIF(p_appointment->>'patient_id', '')::uuid;
  v_name := NULLIF(btrim(p_appointment->>'unregistered_patient_name'), '');
  IF v_patient IS NULL AND v_name IS NULL THEN
    RAISE EXCEPTION 'APPOINTMENT_PATIENT_REQUIRED';
  END IF;
  v_start := NULLIF(p_appointment->>'start_time', '')::timestamptz;
  v_duration := COALESCE(NULLIF(p_appointment->>'duration', '')::integer, 60);
  v_type := COALESCE(NULLIF(p_appointment->>'appointment_type', ''), 'first_appointment');
  v_notes := NULLIF(p_appointment->>'notes', '');
  v_status := COALESCE(NULLIF(p_appointment->>'status', ''), 'scheduled');
  IF v_status = 'canceled' THEN v_status := 'cancelled'; END IF;
  IF v_start IS NULL OR v_duration NOT BETWEEN 1 AND 480 THEN
    RAISE EXCEPTION 'APPOINTMENT_INVALID_TIME';
  END IF;
  v_day := (v_start AT TIME ZONE 'America/Fortaleza')::date;

  IF p_appointment_id IS NULL THEN
    IF v_status <> 'scheduled' THEN RAISE EXCEPTION 'APPOINTMENT_CREATE_SCHEDULED_FIRST'; END IF;
    v_service := NULLIF(p_financial->>'service_id', '')::uuid;
    IF v_service IS NOT NULL THEN
      SELECT s.name, s.price INTO v_service_name, v_amount
      FROM public.services s
      WHERE s.id = v_service AND s.nutritionist_id = v_actor AND s.active = true;
      IF NOT FOUND THEN RAISE EXCEPTION 'APPOINTMENT_SERVICE_NOT_FOUND'; END IF;
    ELSIF NULLIF(p_financial->>'custom_price', '') IS NOT NULL THEN
      v_amount := (p_financial->>'custom_price')::numeric;
    END IF;
    IF v_amount IS NOT NULL AND (v_amount::text IN ('NaN', 'Infinity', '-Infinity') OR v_amount < 0) THEN
      RAISE EXCEPTION 'APPOINTMENT_INVALID_PRICE';
    END IF;

    INSERT INTO public.appointments (
      nutritionist_id, patient_id, unregistered_patient_name,
      appointment_time, start_time, duration, appointment_type, notes, status
    ) VALUES (
      v_actor, v_patient, v_name, v_start, v_start, v_duration, v_type, v_notes, v_status
    ) RETURNING * INTO v_appt;

    IF v_amount > 0 THEN
      IF v_patient IS NOT NULL THEN
        SELECT up.name INTO v_patient_name FROM public.user_profiles up WHERE up.id = v_patient;
      END IF;
      v_patient_name := COALESCE(v_patient_name, v_name, 'Paciente');
      v_description := 'Agendamento: ' || v_patient_name;
      IF v_service IS NOT NULL THEN
        v_description := v_description || ' - ' || v_service_name;
      ELSIF NULLIF(p_financial->>'custom_description', '') IS NOT NULL THEN
        v_description := v_description || ' - ' || btrim(p_financial->>'custom_description');
      END IF;
      INSERT INTO public.financial_transactions (
        nutritionist_id, patient_id, appointment_id, type, category,
        description, amount, transaction_date, due_date, status
      ) VALUES (
        v_actor, v_patient, v_appt.id, 'income',
        CASE WHEN v_service IS NOT NULL THEN 'consulta' ELSE 'outros' END,
        v_description, v_amount, v_day, v_day, 'pending'
      ) RETURNING * INTO v_tx;
      v_tx_json := to_jsonb(v_tx);
    END IF;
  ELSE
    SELECT * INTO v_old FROM public.appointments a
    WHERE a.id = p_appointment_id FOR UPDATE;
    IF NOT FOUND OR v_old.nutritionist_id <> v_actor THEN
      RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND_OR_FORBIDDEN';
    END IF;
    IF v_old.status IN ('completed', 'cancelled', 'no_show') THEN
      RAISE EXCEPTION 'APPOINTMENT_TERMINAL_LOCKED';
    END IF;
    IF v_status <> v_old.status THEN
      IF NOT (
        (v_old.status IN ('scheduled', 'awaiting_confirmation') AND v_status IN ('confirmed', 'cancelled'))
        OR (v_old.status = 'confirmed' AND v_status IN ('completed', 'cancelled', 'no_show'))
      ) THEN RAISE EXCEPTION 'APPOINTMENT_INVALID_TRANSITION'; END IF;
    END IF;
    IF NULLIF(p_financial->>'service_id', '') IS NOT NULL
       OR NULLIF(p_financial->>'custom_price', '') IS NOT NULL THEN
      RAISE EXCEPTION 'APPOINTMENT_EDIT_CHARGE_SEPARATELY';
    END IF;

    SELECT * INTO v_tx FROM public.financial_transactions ft
    WHERE ft.appointment_id = p_appointment_id FOR UPDATE;
    IF FOUND AND (v_patient IS DISTINCT FROM v_old.patient_id
       OR v_name IS DISTINCT FROM v_old.unregistered_patient_name) THEN
      RAISE EXCEPTION 'APPOINTMENT_PATIENT_WITH_CHARGE_LOCKED';
    END IF;

    UPDATE public.appointments SET
      patient_id = v_patient, unregistered_patient_name = v_name,
      appointment_time = v_start, start_time = v_start,
      duration = v_duration, appointment_type = v_type,
      notes = v_notes, status = v_status
    WHERE id = p_appointment_id
    RETURNING * INTO v_appt;

    IF v_tx.id IS NOT NULL THEN
      IF v_status = 'cancelled' AND v_tx.status IN ('pending', 'overdue') THEN
        DELETE FROM public.financial_transactions WHERE id = v_tx.id;
      ELSIF v_tx.status IN ('pending', 'overdue') AND v_day IS DISTINCT FROM
            (v_old.start_time AT TIME ZONE 'America/Fortaleza')::date THEN
        UPDATE public.financial_transactions SET
          transaction_date = v_day, due_date = v_day
        WHERE id = v_tx.id RETURNING * INTO v_tx;
        v_tx_json := to_jsonb(v_tx);
      ELSE
        v_tx_json := to_jsonb(v_tx);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('appointment', to_jsonb(v_appt), 'transaction', v_tx_json);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_appointment_with_finance(p_appointment_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_tx public.financial_transactions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'APPOINTMENT_AUTH_REQUIRED'; END IF;
  SELECT * INTO v_appt FROM public.appointments
  WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND OR v_appt.nutritionist_id <> auth.uid() THEN
    RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND_OR_FORBIDDEN';
  END IF;
  SELECT * INTO v_tx FROM public.financial_transactions
  WHERE appointment_id = p_appointment_id FOR UPDATE;
  IF FOUND THEN
    IF v_tx.status IN ('paid', 'refunded') THEN
      RAISE EXCEPTION 'APPOINTMENT_PAID_CHARGE_REQUIRES_MANUAL_ADJUSTMENT';
    END IF;
    DELETE FROM public.financial_transactions WHERE id = v_tx.id;
  END IF;
  DELETE FROM public.appointments WHERE id = p_appointment_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_appointment_with_finance(jsonb,jsonb,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_appointment_with_finance(jsonb,jsonb,bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_appointment_with_finance(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_appointment_with_finance(bigint) TO authenticated;

-- Run as a database administrator. Every synthetic row is rolled back by the
-- inner exception block, including failures in the assertions.
DO $test$
DECLARE
  v_owner uuid;
  v_result jsonb;
  v_id bigint;
  v_tx_id bigint;
  v_second_id bigint;
  v_second_tx_id bigint;
  v_original timestamptz := '2026-10-01T12:00:00Z';
  v_new timestamptz := '2026-10-02T12:00:00Z';
BEGIN
  SELECT id INTO v_owner FROM public.user_profiles
  WHERE user_type = 'nutritionist' ORDER BY id LIMIT 1;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'TEST_REQUIRES_NUTRITIONIST'; END IF;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    EXECUTE 'SET LOCAL ROLE authenticated';

    v_result := public.save_appointment_with_finance(
      jsonb_build_object('nutritionist_id', v_owner, 'unregistered_patient_name',
        'Teste transacional rollback', 'start_time', v_original, 'duration', 60,
        'appointment_type', 'return', 'status', 'scheduled'),
      '{"custom_price":"50","custom_description":"Teste"}'::jsonb, NULL
    );
    v_id := (v_result->'appointment'->>'id')::bigint;
    v_tx_id := (v_result->'transaction'->>'id')::bigint;
    IF v_id IS NULL OR v_tx_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.financial_transactions
      WHERE id = v_tx_id AND appointment_id = v_id AND status = 'pending'
    ) THEN RAISE EXCEPTION 'TEST_ATOMIC_CREATE_FAILED'; END IF;

    BEGIN
      PERFORM public.save_appointment_with_finance(
        jsonb_build_object('nutritionist_id', v_owner, 'unregistered_patient_name',
          'Teste transacional rollback', 'start_time', v_new, 'duration', 60,
          'appointment_type', 'return', 'status', 'completed'), '{}', v_id
      );
      RAISE EXCEPTION 'TEST_INVALID_TRANSITION_ACCEPTED';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'APPOINTMENT_INVALID_TRANSITION' THEN RAISE; END IF;
    END;
    IF (SELECT start_time FROM public.appointments WHERE id = v_id) <> v_original THEN
      RAISE EXCEPTION 'TEST_PARTIAL_UPDATE';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
    BEGIN
      PERFORM public.save_appointment_with_finance(
        jsonb_build_object('unregistered_patient_name', 'Teste transacional rollback',
          'start_time', v_new, 'duration', 60, 'appointment_type', 'return',
          'status', 'confirmed'), '{}', v_id
      );
      RAISE EXCEPTION 'TEST_OTHER_ACTOR_ACCEPTED';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'APPOINTMENT_NOT_FOUND_OR_FORBIDDEN' THEN RAISE; END IF;
    END;
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);

    PERFORM public.save_appointment_with_finance(
      jsonb_build_object('nutritionist_id', v_owner, 'unregistered_patient_name',
        'Teste transacional rollback', 'start_time', v_new, 'duration', 60,
        'appointment_type', 'return', 'status', 'confirmed'), '{}', v_id
    );
    IF (SELECT due_date FROM public.financial_transactions WHERE id = v_tx_id)
       <> DATE '2026-10-02' THEN RAISE EXCEPTION 'TEST_DUE_DATE_NOT_MOVED'; END IF;

    UPDATE public.financial_transactions SET status = 'paid' WHERE id = v_tx_id;
    PERFORM public.save_appointment_with_finance(
      jsonb_build_object('nutritionist_id', v_owner, 'unregistered_patient_name',
        'Teste transacional rollback', 'start_time', v_new, 'duration', 60,
        'appointment_type', 'return', 'status', 'cancelled'), '{}', v_id
    );
    IF (SELECT status FROM public.financial_transactions WHERE id = v_tx_id) <> 'paid' THEN
      RAISE EXCEPTION 'TEST_PAID_CHARGE_WAS_CHANGED';
    END IF;
    BEGIN
      PERFORM public.delete_appointment_with_finance(v_id);
      RAISE EXCEPTION 'TEST_PAID_APPOINTMENT_DELETED';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'APPOINTMENT_PAID_CHARGE_REQUIRES_MANUAL_ADJUSTMENT' THEN RAISE; END IF;
    END;

    v_result := public.save_appointment_with_finance(
      jsonb_build_object('nutritionist_id', v_owner, 'unregistered_patient_name',
        'Teste transacional rollback', 'start_time', v_original, 'duration', 60,
        'appointment_type', 'return', 'status', 'scheduled'),
      '{"custom_price":"25"}'::jsonb, NULL
    );
    v_second_id := (v_result->'appointment'->>'id')::bigint;
    v_second_tx_id := (v_result->'transaction'->>'id')::bigint;
    v_result := public.transition_appointment_status(v_second_id, 'canceled', NULL);
    IF v_result->>'ok' <> 'true'
       OR (SELECT status FROM public.appointments WHERE id = v_second_id) <> 'cancelled'
       OR EXISTS (SELECT 1 FROM public.financial_transactions WHERE id = v_second_tx_id) THEN
      RAISE EXCEPTION 'TEST_LEGACY_CANCEL_FAILED';
    END IF;

    RAISE EXCEPTION USING ERRCODE = 'ZX001', MESSAGE = 'ROLLBACK_SYNTHETIC_DATA';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN
    NULL;
  END;
END;
$test$;

-- Agenda: concurrent reservations and explicit guest-to-patient association.
-- No historical data is rewritten. Conflicting history must be reviewed first.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE FUNCTION private.agenda_reservation_range(p_start timestamptz, p_duration integer)
RETURNS tstzrange LANGUAGE sql IMMUTABLE STRICT
SET search_path = '' SET timezone = 'UTC'
AS $function$
 SELECT pg_catalog.tstzrange(p_start, p_start + pg_catalog.make_interval(mins => p_duration), '[)')
$function$;
REVOKE ALL ON FUNCTION private.agenda_reservation_range(timestamptz,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.agenda_reservation_range(timestamptz,integer) TO authenticated,service_role;

ALTER TABLE public.appointments ADD CONSTRAINT appointments_professional_reservation_excl
 EXCLUDE USING gist (
   nutritionist_id WITH =,
   (private.agenda_reservation_range(coalesce(start_time,appointment_time),coalesce(duration,60))) WITH &&
 ) WHERE (status <> 'cancelled');

-- Episode writes remain unavailable to the client. This narrowly scoped helper
-- only locks an already authorized active episode during the linking transaction.
CREATE FUNCTION private.agenda_active_episode(p_patient uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_episode uuid;
BEGIN
 PERFORM private.wave05_require_active_actor();
 IF NOT private.wave09_professional_actor() THEN
   RAISE EXCEPTION USING errcode='42501',message='forbidden';
 END IF;
 SELECT id INTO v_episode FROM public.care_episodes
   WHERE patient_id=p_patient AND nutritionist_id=auth.uid() AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING errcode='42501',message='active_episode_required'; END IF;
 RETURN v_episode;
END $function$;
REVOKE ALL ON FUNCTION private.agenda_active_episode(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.agenda_active_episode(uuid) TO authenticated;

CREATE FUNCTION public.link_appointment_patient(
 p_appointment_id bigint, p_patient_id uuid, p_expected timestamptz,
 p_financial_expected timestamptz, p_nonce uuid, p_actor uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
 v_actor uuid := auth.uid();
 v_appointment public.appointments%ROWTYPE;
 v_charge public.financial_transactions%ROWTYPE;
 v_episode uuid;
 v_ids text[];
 v_hash text;
 v_charge_found boolean;
BEGIN
 IF v_actor IS NULL OR v_actor IS DISTINCT FROM p_actor OR p_nonce IS NULL
   OR NOT private.wave09_professional_actor() THEN
   RAISE EXCEPTION USING errcode='42501',message='forbidden';
 END IF;
 IF p_appointment_id IS NULL OR p_patient_id IS NULL OR p_expected IS NULL THEN
   RAISE EXCEPTION USING errcode='22023',message='invalid_link_arguments';
 END IF;
 v_hash := md5(jsonb_build_object('appointment',p_appointment_id,'patient',p_patient_id,
   'expected',p_expected,'financial_expected',p_financial_expected)::text);
 v_ids := private.wave09_receipt(p_nonce,'agenda:link_patient',v_hash);
 SELECT * INTO v_appointment FROM public.appointments
   WHERE id=p_appointment_id AND nutritionist_id=v_actor FOR NO KEY UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING errcode='42501',message='appointment_not_available'; END IF;
 SELECT * INTO v_charge FROM public.financial_transactions
   WHERE appointment_id=p_appointment_id AND nutritionist_id=v_actor FOR UPDATE;
 v_charge_found := FOUND;
 IF v_ids IS NOT NULL THEN
   IF v_appointment.patient_id IS DISTINCT FROM p_patient_id THEN
     RAISE EXCEPTION USING errcode='PT409',message='appointment_link_changed';
   END IF;
   RETURN jsonb_build_object('appointment',to_jsonb(v_appointment),
     'transaction',CASE WHEN v_charge_found THEN to_jsonb(v_charge) ELSE NULL END);
 END IF;
 IF v_appointment.updated_at IS DISTINCT FROM p_expected
   OR (v_charge_found AND v_charge.updated_at IS DISTINCT FROM p_financial_expected)
   OR (NOT v_charge_found AND p_financial_expected IS NOT NULL) THEN
   RAISE EXCEPTION USING errcode='PT409',message='record_changed';
 END IF;
 IF v_appointment.patient_id IS NOT NULL OR v_appointment.status NOT IN ('scheduled','awaiting_confirmation','confirmed') THEN
   RAISE EXCEPTION USING errcode='22023',message='appointment_link_not_allowed';
 END IF;
 IF v_charge_found AND (v_charge.patient_id IS NOT NULL OR v_charge.type <> 'income') THEN
   RAISE EXCEPTION USING errcode='22023',message='appointment_charge_incompatible';
 END IF;
 -- The lock prevents a concurrently ended episode from passing this check.
 v_episode := private.agenda_active_episode(p_patient_id);
 UPDATE public.appointments SET patient_id=p_patient_id,care_episode_id=v_episode
   WHERE id=p_appointment_id AND nutritionist_id=v_actor RETURNING * INTO v_appointment;
 IF v_charge_found THEN
   UPDATE public.financial_transactions SET patient_id=p_patient_id
     WHERE id=v_charge.id AND nutritionist_id=v_actor RETURNING * INTO v_charge;
 END IF;
 PERFORM public.log_activity_event('agenda.patient_linked',1,'agenda',p_patient_id,v_actor,
   jsonb_build_object('appointment_id',p_appointment_id,'transaction_id',CASE WHEN v_charge_found THEN v_charge.id ELSE NULL END));
 PERFORM private.wave09_receipt(p_nonce,'agenda:link_patient',v_hash,ARRAY[p_appointment_id::text]);
 RETURN jsonb_build_object('appointment',to_jsonb(v_appointment),
   'transaction',CASE WHEN v_charge_found THEN to_jsonb(v_charge) ELSE NULL END);
END $function$;
REVOKE ALL ON FUNCTION public.link_appointment_patient(bigint,uuid,timestamptz,timestamptz,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.link_appointment_patient(bigint,uuid,timestamptz,timestamptz,uuid,uuid) TO authenticated;

-- Reconstructed disposable database only. Every synthetic row rolls back.
BEGIN;
SET LOCAL timezone='America/Los_Angeles';
DO $seed$
DECLARE owner_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); patient_id uuid:=gen_random_uuid();
BEGIN
 PERFORM set_config('qa.agenda_owner',owner_id::text,true);
 PERFORM set_config('qa.agenda_other',other_id::text,true);
 PERFORM set_config('qa.agenda_patient',patient_id::text,true);
 INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data) VALUES
 (owner_id,'authenticated','authenticated','agenda-owner-'||owner_id||'@example.invalid','{"name":"Synthetic Agenda owner","user_type":"nutritionist"}'),
 (other_id,'authenticated','authenticated','agenda-other-'||other_id||'@example.invalid','{"name":"Synthetic Agenda other","user_type":"nutritionist"}'),
 (patient_id,'authenticated','authenticated','agenda-patient-'||patient_id||'@example.invalid','{"name":"Synthetic Agenda patient","user_type":"nutritionist"}');
 UPDATE public.professional_verifications SET status='approved',professional_role='nutritionist',
   verification_method='approved_by_migration',valid_until=now()+interval '1 year',
   crn_region='CRN-3',crn_number='QA-'||user_id::text,normalized_crn='QA'||user_id::text
   WHERE user_id IN (owner_id,other_id);
 UPDATE public.user_profiles SET user_type='patient',nutritionist_id=owner_id WHERE id=patient_id;
 UPDATE public.professional_verifications SET status='suspended' WHERE user_id=patient_id;
 INSERT INTO public.nutritionist_patients(nutritionist_id,patient_id,status) VALUES(owner_id,patient_id,'active');
END $seed$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.agenda_owner'),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.agenda_owner'),'role','authenticated','aal','aal2')::text,true);
DO $test$
DECLARE actor uuid:=auth.uid(); patient uuid:=current_setting('qa.agenda_patient')::uuid;
 a public.appointments%ROWTYPE; t public.financial_transactions%ROWTYPE; result jsonb; repeated jsonb; nonce uuid:=gen_random_uuid(); draft jsonb;
BEGIN
 draft:=jsonb_build_object('nutritionist_id',actor,'unregistered_patient_name','Synthetic original guest','start_time','2038-10-12T13:00:00Z','duration',60,'status','scheduled');
 result:=public.save_appointment_with_finance(draft,jsonb_build_object('custom_price',125.75));
 SELECT * INTO a FROM public.appointments WHERE id=(result->'appointment'->>'id')::bigint;
 SELECT * INTO t FROM public.financial_transactions WHERE appointment_id=a.id;
 BEGIN
   PERFORM public.save_appointment_with_finance(draft);
   RAISE EXCEPTION 'agenda_overlapping_reservation_accepted';
 EXCEPTION WHEN exclusion_violation THEN NULL; END;
 -- Half-open ranges allow an immediately consecutive appointment.
 PERFORM public.save_appointment_with_finance(draft||jsonb_build_object('start_time','2038-10-12T14:00:00Z'));
 UPDATE public.financial_transactions SET status='paid',paid_at=current_date WHERE id=t.id RETURNING * INTO t;
 BEGIN
   PERFORM public.link_appointment_patient(a.id,patient,a.updated_at,t.updated_at-interval '1 second',gen_random_uuid(),actor);
   RAISE EXCEPTION 'agenda_stale_financial_revision_accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 result:=public.link_appointment_patient(a.id,patient,a.updated_at,t.updated_at,nonce,actor);
 repeated:=public.link_appointment_patient(a.id,patient,a.updated_at,t.updated_at,nonce,actor);
 IF result<>repeated THEN RAISE EXCEPTION 'agenda_idempotent_link_changed'; END IF;
 IF result->'appointment'->>'patient_id'<>patient::text OR result->'transaction'->>'patient_id'<>patient::text THEN RAISE EXCEPTION 'agenda_incomplete_link'; END IF;
 IF result->'appointment'->>'unregistered_patient_name'<>'Synthetic original guest'
   OR (result->'appointment'->>'appointment_time')::timestamptz<>a.appointment_time
   OR (result->'transaction'->>'amount')::numeric<>t.amount
   OR result->'transaction'->>'status'<>'paid'
   OR (result->'transaction'->>'paid_at')::date<>t.paid_at
   OR (result->'transaction'->>'due_date')::date IS DISTINCT FROM t.due_date
 THEN RAISE EXCEPTION 'agenda_link_changed_original_history'; END IF;
 BEGIN
   PERFORM public.link_appointment_patient(a.id,patient,a.updated_at,t.updated_at,gen_random_uuid(),actor);
   RAISE EXCEPTION 'agenda_stale_appointment_revision_accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM set_config('qa.agenda_appointment',a.id::text,true);
 PERFORM set_config('qa.agenda_revision',result->'appointment'->>'updated_at',true);
 PERFORM set_config('qa.agenda_charge_revision',result->'transaction'->>'updated_at',true);
 -- Pending and uncharged bookings use the same identity contract.
 result:=public.save_appointment_with_finance(draft||jsonb_build_object('start_time','2038-10-12T16:00:00Z'),jsonb_build_object('custom_price',40.05));
 SELECT * INTO a FROM public.appointments WHERE id=(result->'appointment'->>'id')::bigint;
 SELECT * INTO t FROM public.financial_transactions WHERE appointment_id=a.id;
 result:=public.link_appointment_patient(a.id,patient,a.updated_at,t.updated_at,gen_random_uuid(),actor);
 IF result->'transaction'->>'status'<>'pending' OR (result->'transaction'->>'amount')::numeric<>40.05
   OR (SELECT count(*) FROM public.financial_transactions WHERE appointment_id=a.id)<>1 THEN RAISE EXCEPTION 'agenda_pending_charge_changed_or_duplicated'; END IF;
 result:=public.save_appointment_with_finance(draft||jsonb_build_object('start_time','2038-10-12T17:00:00Z'));
 SELECT * INTO a FROM public.appointments WHERE id=(result->'appointment'->>'id')::bigint;
 result:=public.link_appointment_patient(a.id,patient,a.updated_at,NULL,gen_random_uuid(),actor);
 IF result->'appointment'->>'patient_id'<>patient::text OR result->'transaction'<>'null'::jsonb THEN RAISE EXCEPTION 'agenda_uncharged_link_changed'; END IF;
 result:=public.save_appointment_with_finance(draft||jsonb_build_object('start_time','2038-10-12T18:00:00Z'));
 UPDATE public.appointments SET status='cancelled' WHERE id=(result->'appointment'->>'id')::bigint RETURNING * INTO a;
 BEGIN
   PERFORM public.link_appointment_patient(a.id,patient,a.updated_at,NULL,gen_random_uuid(),actor);
   RAISE EXCEPTION 'agenda_closed_guest_reassigned';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
   PERFORM public.link_appointment_patient(a.id,patient,a.updated_at,NULL,NULL,actor);
   RAISE EXCEPTION 'agenda_missing_nonce_accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- An explicit cancellation releases the time, preserving its record.
 result:=public.save_appointment_with_finance(draft||jsonb_build_object('start_time','2038-10-12T15:00:00Z'));
 UPDATE public.appointments SET status='cancelled' WHERE id=(result->'appointment'->>'id')::bigint;
 PERFORM public.save_appointment_with_finance(draft||jsonb_build_object('start_time','2038-10-12T15:00:00Z'));
 PERFORM public.end_care_episode(patient,'Synthetic closed episode negative test');
 result:=public.save_appointment_with_finance(draft||jsonb_build_object('start_time','2038-10-12T19:00:00Z'));
 SELECT * INTO a FROM public.appointments WHERE id=(result->'appointment'->>'id')::bigint;
 BEGIN
   PERFORM public.link_appointment_patient(a.id,patient,a.updated_at,NULL,gen_random_uuid(),actor);
   RAISE EXCEPTION 'agenda_closed_episode_link_accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.agenda_other'),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.agenda_other'),'role','authenticated','aal','aal2')::text,true);
DO $test$ BEGIN
 IF EXISTS(SELECT 1 FROM public.appointments WHERE id=current_setting('qa.agenda_appointment')::bigint) THEN RAISE EXCEPTION 'agenda_cross_owner_read'; END IF;
 BEGIN
   PERFORM public.link_appointment_patient(current_setting('qa.agenda_appointment')::bigint,current_setting('qa.agenda_patient')::uuid,current_setting('qa.agenda_revision')::timestamptz,current_setting('qa.agenda_charge_revision')::timestamptz,gen_random_uuid(),auth.uid());
   RAISE EXCEPTION 'agenda_cross_owner_link';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- A different professional can use the same instant for their own reservation.
 PERFORM public.save_appointment_with_finance(jsonb_build_object('nutritionist_id',auth.uid(),'unregistered_patient_name','Synthetic other guest','start_time','2038-10-12T13:00:00Z','duration',60,'status','scheduled'));
END $test$;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
DO $test$ BEGIN
 BEGIN
   PERFORM public.link_appointment_patient(current_setting('qa.agenda_appointment')::bigint,current_setting('qa.agenda_patient')::uuid,current_setting('qa.agenda_revision')::timestamptz,NULL,gen_random_uuid(),current_setting('qa.agenda_owner')::uuid);
   RAISE EXCEPTION 'agenda_anonymous_link';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
ROLLBACK;

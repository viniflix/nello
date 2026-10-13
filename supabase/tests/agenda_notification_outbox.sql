-- Synthetic identities only; all fixture data and injected failures roll back.
BEGIN;
DO $seed$
DECLARE owner_id uuid:=gen_random_uuid();other_id uuid:=gen_random_uuid();patient_id uuid:=gen_random_uuid();offline_id uuid:=gen_random_uuid();
BEGIN
 PERFORM set_config('qa.notice_owner',owner_id::text,true);PERFORM set_config('qa.notice_other',other_id::text,true);PERFORM set_config('qa.notice_patient',patient_id::text,true);
 INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data) VALUES
 (owner_id,'authenticated','authenticated','notice-owner-'||owner_id||'@example.invalid','{"name":"Synthetic notice owner","user_type":"nutritionist"}'),
 (other_id,'authenticated','authenticated','notice-other-'||other_id||'@example.invalid','{"name":"Synthetic notice other","user_type":"nutritionist"}'),
 (patient_id,'authenticated','authenticated','notice-patient-'||patient_id||'@example.invalid','{"name":"Synthetic notice patient","user_type":"nutritionist"}');
 UPDATE public.professional_verifications SET status='approved',professional_role='nutritionist',verification_method='approved_by_migration',valid_until=now()+interval '1 year',crn_region='CRN-3',crn_number='QA-'||user_id::text,normalized_crn='QA'||user_id::text WHERE user_id IN(owner_id,other_id);
 UPDATE public.user_profiles SET user_type='patient',nutritionist_id=owner_id WHERE id=patient_id;
 UPDATE public.professional_verifications SET status='suspended' WHERE user_id=patient_id;
 INSERT INTO public.nutritionist_patients(nutritionist_id,patient_id,status) VALUES(owner_id,patient_id,'active');
 INSERT INTO public.user_profiles(id,name,user_type,nutritionist_id,is_active) VALUES(offline_id,'Synthetic offline patient','patient',owner_id,true);
 INSERT INTO public.nutritionist_patients(nutritionist_id,patient_id,status) VALUES(owner_id,offline_id,'active');
 PERFORM set_config('qa.notice_offline',offline_id::text,true);
 INSERT INTO public.message_templates(nutritionist_id,template_key,name,context,channel,title_template,body_template,is_active)
 VALUES(owner_id,'synthetic_post','Synthetic post','post_consultation','in_app','Após a consulta','Olá {{nome_paciente}}, confira o Nello.',true);
END $seed$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.notice_owner'),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.notice_owner'),'role','authenticated','aal','aal2')::text,true);
DO $test$
DECLARE a public.appointments%ROWTYPE;q public.appointment_notifications%ROWTYPE;r jsonb;v_revision timestamptz;v_first bigint;v_owner uuid:=auth.uid();v_patient uuid:=current_setting('qa.notice_patient')::uuid;
BEGIN
 r:=public.save_appointment_with_finance(jsonb_build_object('nutritionist_id',v_owner,'patient_id',v_patient,'start_time',now()+interval '3 hours','duration',45,'status','scheduled'));
 SELECT * INTO a FROM public.appointments WHERE id=(r->'appointment'->>'id')::bigint;v_revision:=a.updated_at;
 IF NOT EXISTS(SELECT 1 FROM public.appointment_notifications WHERE appointment_id=a.id AND delivery_status='queued') THEN RAISE EXCEPTION 'notice_not_enrolled';END IF;
 PERFORM public.sync_appointment_notification_schedule(a.id,true);
 SELECT * INTO q FROM public.appointment_notifications WHERE appointment_id=a.id AND event_kind='reminder';v_first:=q.notification_id;
 IF q.delivery_status<>'available' OR q.attempts<>1 OR q.notification_id IS NULL THEN RAISE EXCEPTION 'notice_not_available';END IF;
 PERFORM public.sync_appointment_notification_schedule(a.id,true);
 IF (SELECT count(*) FROM public.appointment_notifications WHERE appointment_id=a.id)<>1 OR (SELECT attempts FROM public.appointment_notifications WHERE id=q.id)<>1 THEN RAISE EXCEPTION 'notice_replay_duplicated';END IF;
 IF (SELECT updated_at FROM public.appointments WHERE id=a.id) IS DISTINCT FROM v_revision THEN RAISE EXCEPTION 'notice_changed_clinical_revision';END IF;
 UPDATE public.appointments SET appointment_time=appointment_time+interval '1 hour',start_time=start_time+interval '1 hour' WHERE id=a.id;
 IF (SELECT delivery_status FROM public.appointment_notifications WHERE id=q.id)<>'superseded' THEN RAISE EXCEPTION 'old_notice_not_invalidated';END IF;
 PERFORM public.sync_appointment_notification_schedule(a.id,true);
 IF (SELECT count(*) FROM public.appointment_notifications WHERE appointment_id=a.id AND delivery_status='available')<>1 THEN RAISE EXCEPTION 'rescheduled_notice_not_unique';END IF;
 UPDATE public.appointments SET status='confirmed' WHERE id=a.id;
 PERFORM public.sync_appointment_notification_schedule(a.id,true);
 IF (SELECT count(*) FROM public.appointment_notifications WHERE appointment_id=a.id)<>2 THEN RAISE EXCEPTION 'confirmation_resent_notice';END IF;
 UPDATE public.appointments SET status='cancelled' WHERE id=a.id;
 IF EXISTS(SELECT 1 FROM public.appointment_notifications WHERE appointment_id=a.id AND delivery_status IN('queued','available')) THEN RAISE EXCEPTION 'cancelled_notice_live';END IF;
 -- A completed consultation is not re-saved to deliver its configured internal notice.
 r:=public.save_appointment_with_finance(jsonb_build_object('nutritionist_id',v_owner,'patient_id',v_patient,'start_time',now()+interval '6 hours','duration',45,'status','scheduled'));
 SELECT * INTO a FROM public.appointments WHERE id=(r->'appointment'->>'id')::bigint;
 UPDATE public.appointments SET status='confirmed' WHERE id=a.id;
 UPDATE public.appointments SET status='completed' WHERE id=a.id;
 PERFORM public.sync_appointment_notification_schedule(a.id,true);PERFORM public.sync_appointment_notification_schedule(a.id,true);
 IF (SELECT count(*) FROM public.appointment_notifications WHERE appointment_id=a.id AND event_kind='post_consultation' AND delivery_status='available')<>1 THEN RAISE EXCEPTION 'post_notice_missing_or_duplicated';END IF;
 PERFORM set_config('qa.notice_post',a.id::text,true);
 -- Guest and future notices remain honest; the client cannot process the global queue.
 r:=public.save_appointment_with_finance(jsonb_build_object('nutritionist_id',v_owner,'unregistered_patient_name','Synthetic guest','start_time',now()+interval '9 hours','duration',45,'status','scheduled'));
 IF NOT EXISTS(SELECT 1 FROM public.appointment_notifications WHERE appointment_id=(r->'appointment'->>'id')::bigint AND reason_code='no_patient_account' AND delivery_status='blocked') THEN RAISE EXCEPTION 'guest_notice_not_blocked';END IF;
 BEGIN PERFORM public.process_appointment_notifications(50);RAISE EXCEPTION 'global_processor_exposed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 r:=public.save_appointment_with_finance(jsonb_build_object('nutritionist_id',v_owner,'patient_id',current_setting('qa.notice_offline')::uuid,'start_time',now()+interval '10 hours','duration',45,'status','scheduled'));
 PERFORM public.sync_appointment_notification_schedule((r->'appointment'->>'id')::bigint,true);
 IF NOT EXISTS(SELECT 1 FROM public.appointment_notifications WHERE appointment_id=(r->'appointment'->>'id')::bigint AND delivery_status='cancelled' AND reason_code='no_patient_account') THEN RAISE EXCEPTION 'offline_patient_notice_dispatched';END IF;
 PERFORM set_config('qa.notice_probe',a.id::text,true);
END $test$;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.notice_other'),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.notice_other'),'role','authenticated','aal','aal2')::text,true);
DO $negative$
BEGIN
 IF EXISTS(SELECT 1 FROM public.appointment_notifications WHERE nutritionist_id=current_setting('qa.notice_owner')::uuid) THEN RAISE EXCEPTION 'notice_cross_tenant_visible';END IF;
 BEGIN PERFORM public.sync_appointment_notification_schedule(current_setting('qa.notice_probe')::bigint,true);RAISE EXCEPTION 'notice_cross_tenant_sync';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $negative$;
RESET ROLE;
DO $verify$
BEGIN
 IF (SELECT count(*) FROM public.notifications WHERE user_id=current_setting('qa.notice_patient')::uuid AND type='post_consultation')<>1 THEN RAISE EXCEPTION 'post_patient_notice_duplicated';END IF;
 IF (SELECT count(*) FROM public.template_dispatch_log WHERE patient_id=current_setting('qa.notice_patient')::uuid AND metadata->>'delivery_evidence'='internal_available')<>1 THEN RAISE EXCEPTION 'post_history_not_available_evidence';END IF;
 IF has_function_privilege('anon','public.sync_appointment_notification_schedule(bigint,boolean)','execute') OR has_function_privilege('authenticated','public.process_appointment_notifications(integer)','execute') THEN RAISE EXCEPTION 'notice_privileges_broadened';END IF;
END $verify$;
-- A failure is confined to delivery and its retry, never the committed appointment.
CREATE FUNCTION private.qa_fail_agenda_notice() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
BEGIN
 IF current_setting('qa.notice_fail',true)='on' AND NEW.user_id=current_setting('qa.notice_patient')::uuid AND NEW.type='appointment_reminder' THEN
   RAISE EXCEPTION 'synthetic_delivery_failure';
 END IF;
 RETURN NEW;
END $f$;
CREATE TRIGGER qa_fail_agenda_notice BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION private.qa_fail_agenda_notice();
SELECT set_config('request.jwt.claim.sub',current_setting('qa.notice_owner'),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.notice_owner'),'role','authenticated','aal','aal2')::text,true);
SET LOCAL ROLE authenticated;
DO $failure$
DECLARE a public.appointments%ROWTYPE;r jsonb;v_revision timestamptz;
BEGIN
 r:=public.save_appointment_with_finance(jsonb_build_object('nutritionist_id',auth.uid(),'patient_id',current_setting('qa.notice_patient')::uuid,'start_time',now()+interval '12 hours','duration',45,'status','scheduled'));
 SELECT * INTO a FROM public.appointments WHERE id=(r->'appointment'->>'id')::bigint;v_revision:=a.updated_at;
 PERFORM set_config('qa.notice_fail','on',true);PERFORM public.sync_appointment_notification_schedule(a.id,true);
 IF NOT EXISTS(SELECT 1 FROM public.appointment_notifications WHERE appointment_id=a.id AND delivery_status='failed' AND attempts=1 AND last_error_code='P0001' AND next_attempt_at>now()) THEN RAISE EXCEPTION 'delivery_failure_unrecorded';END IF;
 PERFORM public.sync_appointment_notification_schedule(a.id,true);
 IF (SELECT attempts FROM public.appointment_notifications WHERE appointment_id=a.id)<>1 THEN RAISE EXCEPTION 'delivery_backoff_bypassed';END IF;
 IF (SELECT updated_at FROM public.appointments WHERE id=a.id) IS DISTINCT FROM v_revision THEN RAISE EXCEPTION 'failed_delivery_changed_booking';END IF;
 PERFORM set_config('qa.notice_retry',a.id::text,true);
END $failure$;
RESET ROLE;
UPDATE public.appointment_notifications SET next_attempt_at=now() WHERE appointment_id=current_setting('qa.notice_retry')::bigint;
SELECT set_config('qa.notice_fail','off',true);
SET LOCAL ROLE authenticated;
DO $retry$
BEGIN
 PERFORM public.sync_appointment_notification_schedule(current_setting('qa.notice_retry')::bigint,true);
 IF NOT EXISTS(SELECT 1 FROM public.appointment_notifications WHERE appointment_id=current_setting('qa.notice_retry')::bigint AND delivery_status='available' AND attempts=2) THEN RAISE EXCEPTION 'delivery_retry_not_recovered';END IF;
END $retry$;
RESET ROLE;
DO $bounded$
DECLARE r jsonb;a_id bigint;i integer;
BEGIN
 r:=public.save_appointment_with_finance(jsonb_build_object('nutritionist_id',auth.uid(),'patient_id',current_setting('qa.notice_patient')::uuid,'start_time',now()+interval '15 hours','duration',45,'status','scheduled'));
 a_id:=(r->'appointment'->>'id')::bigint;PERFORM set_config('qa.notice_fail','on',true);
 FOR i IN 1..3 LOOP
   UPDATE public.appointment_notifications SET next_attempt_at=now() WHERE appointment_id=a_id;
   PERFORM public.sync_appointment_notification_schedule(a_id,true);
 END LOOP;
 UPDATE public.appointment_notifications SET next_attempt_at=now() WHERE appointment_id=a_id;
 PERFORM public.sync_appointment_notification_schedule(a_id,true);
 IF NOT EXISTS(SELECT 1 FROM public.appointment_notifications WHERE appointment_id=a_id AND attempts=3 AND delivery_status='failed') THEN RAISE EXCEPTION 'notice_retry_limit_bypassed';END IF;
 PERFORM set_config('qa.notice_fail','off',true);
 BEGIN PERFORM public.process_appointment_notifications(0);RAISE EXCEPTION 'notice_processor_unbounded';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN PERFORM public.process_appointment_notifications(201);RAISE EXCEPTION 'notice_processor_unbounded';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
END $bounded$;
-- External templates are recorded, never invoked; closing care invalidates future notices.
UPDATE public.message_templates SET channel='email' WHERE nutritionist_id=current_setting('qa.notice_owner')::uuid;
SET LOCAL ROLE authenticated;
DO $external$
DECLARE r jsonb;a_id bigint;
BEGIN
 r:=public.save_appointment_with_finance(jsonb_build_object('nutritionist_id',auth.uid(),'patient_id',current_setting('qa.notice_patient')::uuid,'start_time',now()+interval '18 hours','duration',45,'status','scheduled'));
 a_id:=(r->'appointment'->>'id')::bigint;
 UPDATE public.appointments SET status='confirmed' WHERE id=a_id;UPDATE public.appointments SET status='completed' WHERE id=a_id;
 PERFORM public.sync_appointment_notification_schedule(a_id,true);
 IF NOT EXISTS(SELECT 1 FROM public.appointment_notifications WHERE appointment_id=a_id AND event_kind='post_consultation' AND delivery_status='blocked' AND reason_code='external_channel_unconfigured') THEN RAISE EXCEPTION 'external_notice_not_blocked';END IF;
END $external$;
RESET ROLE;
UPDATE public.care_episodes SET status='ended',ended_at=now() WHERE patient_id=current_setting('qa.notice_patient')::uuid AND status='active';
DO $ended$
BEGIN
 IF EXISTS(SELECT 1 FROM public.appointment_notifications WHERE patient_id=current_setting('qa.notice_patient')::uuid AND event_kind='reminder' AND delivery_status IN('queued','available','failed')) THEN RAISE EXCEPTION 'ended_care_notice_live';END IF;
END $ended$;
-- Exercise the actual cron wrapper, not only the per-appointment processor.
SELECT private.create_appointment_reminders();
ROLLBACK;

-- Only synthetic users in the disposable reconstruction; all changes roll back.
BEGIN;
INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data) VALUES
('10000000-0000-0000-0000-000000000921','authenticated','authenticated','feed-n1@example.invalid','{"name":"Synthetic Feed N1","user_type":"nutritionist"}'),
('10000000-0000-0000-0000-000000000922','authenticated','authenticated','feed-n2@example.invalid','{"name":"Synthetic Feed N2","user_type":"nutritionist"}'),
('20000000-0000-0000-0000-000000000921','authenticated','authenticated','feed-p1@example.invalid','{"name":"Synthetic Feed P1","user_type":"patient"}'),
('20000000-0000-0000-0000-000000000922','authenticated','authenticated','feed-p2@example.invalid','{"name":"Synthetic Feed P2","user_type":"patient"}');
UPDATE public.user_profiles SET nutritionist_id='10000000-0000-0000-0000-000000000921' WHERE id='20000000-0000-0000-0000-000000000921';
INSERT INTO public.nutritionist_patients(nutritionist_id,patient_id,status) VALUES
('10000000-0000-0000-0000-000000000921','20000000-0000-0000-0000-000000000921','active'),
('10000000-0000-0000-0000-000000000922','20000000-0000-0000-0000-000000000922','active');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000921',true);
DO $test$
DECLARE patient uuid:='20000000-0000-0000-0000-000000000921';actor uuid:=auth.uid();episode uuid;next_episode uuid;v jsonb;j jsonb;old_task uuid;nonce uuid:=gen_random_uuid();
BEGIN
 IF has_function_privilege('anon','public.get_active_feed_patients()','execute')
 OR has_function_privilege('anon','public.get_my_feed_task_states()','execute')
 OR has_function_privilege('authenticated','private.retire_care_feed_tasks()','execute') THEN RAISE EXCEPTION 'unsafe_feed_grants';END IF;
 SELECT care_episode_id INTO episode FROM public.get_active_feed_patients() WHERE id=patient;
 IF episode IS NULL OR (SELECT count(*) FROM public.get_active_feed_patients())<>1 THEN RAISE EXCEPTION 'invalid_active_scope';END IF;
 IF NOT EXISTS (SELECT 1 FROM public.get_patients_pending_data_optimized(actor) WHERE patient_id=patient)
 OR NOT EXISTS (SELECT 1 FROM public.get_patients_low_adherence_optimized(actor,2) WHERE patient_id=patient) THEN RAISE EXCEPTION 'active_priorities_missing';END IF;
 INSERT INTO public.growth_records(patient_id,weight,height,record_date) VALUES(patient,60,165,current_date);
 v:=jsonb_build_object('nutritionist_id',actor,'patient_id',patient,'source_type','pending','source_id','synthetic-feed-epoch','title','Synthetic','metadata',jsonb_build_object('care_episode_id',episode));
 j:=public.save_feed_task(v,NULL,NULL,nonce,actor);old_task:=(j->>'id')::uuid;
 j:=public.save_feed_task(v,(j->>'updated_at')::timestamptz,'resolved',gen_random_uuid(),actor);
 IF (SELECT status FROM public.get_my_feed_task_states() WHERE id=old_task)<>'resolved' THEN RAISE EXCEPTION 'active_resolution_lost';END IF;
 PERFORM public.end_care_episode(patient,'ended_by_nutritionist');
 IF EXISTS (SELECT 1 FROM public.get_active_feed_patients()) OR EXISTS (SELECT 1 FROM public.get_my_feed_task_states())
 OR EXISTS (SELECT 1 FROM public.get_patients_pending_data_optimized(actor) WHERE patient_id=patient)
 OR EXISTS (SELECT 1 FROM public.get_patients_low_adherence_optimized(actor,2) WHERE patient_id=patient)
 OR (SELECT is_current FROM public.feed_tasks WHERE id=old_task) THEN RAISE EXCEPTION 'archived_ghost';END IF;
 j:=public.save_feed_task(v,NULL,NULL,nonce,actor);
 IF j->>'no_longer_applicable'<>'true' THEN RAISE EXCEPTION 'archived_retry_loop';END IF;
 PERFORM public.start_care_episode(patient,'restarted_by_nutritionist');
 SELECT care_episode_id INTO next_episode FROM public.get_active_feed_patients() WHERE id=patient;
 IF next_episode IS NULL OR next_episode=episode THEN RAISE EXCEPTION 'care_epoch_not_renewed';END IF;
 IF (SELECT has_anthropometry FROM public.get_patients_pending_data_optimized(actor) WHERE patient_id=patient)
 OR EXISTS (SELECT 1 FROM public.get_comprehensive_activity_feed_optimized(actor,100) WHERE patient_id=patient AND activity_type='anthropometry') THEN RAISE EXCEPTION 'historical_record_became_current_priority';END IF;
 j:=public.save_feed_task(v,NULL,'resolved',gen_random_uuid(),actor);
 IF j->>'no_longer_applicable'<>'true' OR EXISTS (SELECT 1 FROM public.get_my_feed_task_states()) THEN RAISE EXCEPTION 'stale_action_changed_new_episode';END IF;
 v:=v||jsonb_build_object('metadata',jsonb_build_object('care_episode_id',next_episode));
 j:=public.save_feed_task(v,NULL,NULL,gen_random_uuid(),actor);
 IF j->>'status'<>'open' OR j->>'id'=old_task::text OR j->'metadata'->>'care_episode_id'<>next_episode::text
 OR (SELECT status FROM public.feed_tasks WHERE id=old_task)<>'resolved' THEN RAISE EXCEPTION 'historical_state_reused_or_destroyed';END IF;
 BEGIN PERFORM public.save_feed_task(v||jsonb_build_object('patient_id','20000000-0000-0000-0000-000000000922'),NULL,NULL,gen_random_uuid(),actor);
 RAISE EXCEPTION 'foreign_scope_allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.start_care_episode('20000000-0000-0000-0000-000000000922','restarted_by_nutritionist');
 RAISE EXCEPTION 'foreign_reactivation_allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $test$;
RESET ROLE;
-- A prior professional cannot reclaim the patient from a different active care.
INSERT INTO public.care_episodes(patient_id,nutritionist_id,status,started_at,ended_at,end_reason,ended_by)
VALUES('20000000-0000-0000-0000-000000000921','10000000-0000-0000-0000-000000000922','ended',now()-interval '2 days',now()-interval '1 day','synthetic_history','10000000-0000-0000-0000-000000000922');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000922',true);
DO $test$ BEGIN
 BEGIN PERFORM public.start_care_episode('20000000-0000-0000-0000-000000000921','restarted_by_nutritionist');
 RAISE EXCEPTION 'history_reclaimed_foreign_active_patient';EXCEPTION WHEN unique_violation THEN NULL;END;
END $test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000921',true);
-- Patient choice is authoritative even if the caller supplied a misleading reason.
UPDATE public.care_episodes SET started_at=now()-interval '2 days'
 WHERE patient_id='20000000-0000-0000-0000-000000000921' AND status='ended';
UPDATE public.care_episodes SET status='ended',ended_at=now(),ended_by=patient_id,end_reason='ended_by_nutritionist'
 WHERE patient_id='20000000-0000-0000-0000-000000000921' AND status='active';
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
 BEGIN PERFORM public.start_care_episode('20000000-0000-0000-0000-000000000921','restarted_by_nutritionist');
 RAISE EXCEPTION 'patient_ending_overridden';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $test$;
RESET ROLE;
-- Reproduce stale legacy owner fields without creating an active relationship.
UPDATE public.care_episodes SET ended_by=NULL,end_reason='legacy_episode_reconstructed'
 WHERE patient_id='20000000-0000-0000-0000-000000000921' AND nutritionist_id=auth.uid() AND status='ended';
UPDATE public.user_profiles SET nutritionist_id='10000000-0000-0000-0000-000000000921',is_active=true
 WHERE id='20000000-0000-0000-0000-000000000921';
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
 IF EXISTS (SELECT 1 FROM public.get_active_feed_patients())
 OR EXISTS (SELECT 1 FROM public.get_patients_pending_data_optimized(auth.uid()))
 OR EXISTS (SELECT 1 FROM public.get_patients_low_adherence_optimized(auth.uid(),2)) THEN RAISE EXCEPTION 'legacy_owner_ghost';END IF;
END $test$;
RESET ROLE;
ROLLBACK;

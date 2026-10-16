-- Synthetic SQL oracle: no production connection, no historical recalculation.
BEGIN;
INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data) VALUES
 ('10000000-0000-0000-0000-000000316041','authenticated','authenticated','rc03-nutri@example.invalid','{"user_type":"nutritionist"}'),
 ('20000000-0000-0000-0000-000000316042','authenticated','authenticated','rc03-patient@example.invalid','{"user_type":"patient"}');
UPDATE public.user_profiles SET nutritionist_id='10000000-0000-0000-0000-000000316041' WHERE id='20000000-0000-0000-0000-000000316042';
UPDATE public.professional_verifications SET status='approved',professional_role='nutritionist',verification_method='approved_by_migration',valid_until=now()+interval '1 year',crn_region='CRN-3',crn_number='QA-RC03',normalized_crn='QARC03' WHERE user_id='10000000-0000-0000-0000-000000316041';
INSERT INTO public.nutritionist_patients(nutritionist_id,patient_id,status) VALUES('10000000-0000-0000-0000-000000316041','20000000-0000-0000-0000-000000316042','active');
CREATE FUNCTION pg_temp.assert_checkin(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'checkin contract failed: %',label; END IF; END; $$;
DO $test$
DECLARE fields jsonb; s record; old_count bigint; id uuid:=gen_random_uuid(); p uuid:='20000000-0000-0000-0000-000000316042'; n uuid:='10000000-0000-0000-0000-000000316041';
BEGIN
 fields:='[{"id":"positive","field_type":"yes_no","is_required":true,"score_weight":3,"scoring_rule":{"version":2,"mode":"yes"}},{"id":"symptom","field_type":"yes_no","is_required":true,"score_weight":1,"scoring_rule":{"version":2,"mode":"no"}}]';
 SELECT * INTO s FROM private.checkin_score_v2(fields,'{"positive":"yes","symptom":"yes"}');
 PERFORM pg_temp.assert_checkin(s.total=30 AND s.maximum=40,'positive/symptom weighted75');
 SELECT * INTO s FROM private.checkin_score_v2(fields,'{"positive":"yes","symptom":"no"}');
 PERFORM pg_temp.assert_checkin(s.total=40 AND s.maximum=40,'explicit desired no100');
 SELECT * INTO s FROM private.checkin_score_v2('[{"id":"scale","field_type":"scale_1_10","score_weight":2,"scoring_rule":{"version":2,"mode":"lower_better"}}]','{"scale":[1]}');
 PERFORM pg_temp.assert_checkin(s.total=20 AND s.maximum=20,'inverse scale minimum100');
 SELECT * INTO s FROM private.checkin_score_v2('[{"id":"scale","field_type":"scale_1_10","score_weight":2,"scoring_rule":{"version":2,"mode":"higher_better"}}]','{"scale":[1]}');
 PERFORM pg_temp.assert_checkin(s.total=0 AND s.maximum=20,'positive scale minimum0');
 SELECT * INTO s FROM private.checkin_score_v2('[{"id":"optional","field_type":"yes_no","is_required":false,"score_weight":100,"scoring_rule":{"version":2,"mode":"yes"}},{"id":"zero","field_type":"yes_no","score_weight":0,"scoring_rule":{"version":2,"mode":"yes"}},{"id":"text","field_type":"text","score_weight":10},{"id":"number","field_type":"number","score_weight":1}]','{"zero":"no","text":"Synthetic","number":0}');
 PERFORM pg_temp.assert_checkin(s.total=0 AND s.maximum=0,'descriptive/zero/absent optional excluded');
 BEGIN PERFORM private.checkin_score_v2(fields,'{"positive":"yes"}');RAISE EXCEPTION 'missing required accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CHECKIN_REQUIRED_FIELD_MISSING' THEN RAISE;END IF;END;
 BEGIN PERFORM private.checkin_score_v2('[{"id":"scale","field_type":"scale_1_10"}]','{"scale":[0]}');RAISE EXCEPTION 'zero scale accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CHECKIN_INVALID_SCALE' THEN RAISE;END IF;END;
 BEGIN PERFORM private.checkin_score_v2('[{"id":"scale","field_type":"scale_1_10"}]','{"scale":[5,6]}');RAISE EXCEPTION 'array shape accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CHECKIN_INVALID_SCALE' THEN RAISE;END IF;END;
 BEGIN PERFORM private.checkin_score_v2(fields,'{"positive":"yes","symptom":"no","unknown":true}');RAISE EXCEPTION 'unknown field accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CHECKIN_UNKNOWN_FIELD' THEN RAISE;END IF;END;
 PERFORM pg_temp.assert_checkin(NOT has_function_privilege('authenticated','private.checkin_score_v2(jsonb,jsonb)','EXECUTE'),'private scoring has no public execute');
 -- Sessions/recipients are the existing synthetic C5 personas, isolated in this DB.
 INSERT INTO public.checkin_templates(id,nutritionist_id,name,frequency) VALUES(id,n,'Synthetic scoring','weekly');
 INSERT INTO public.checkin_fields(template_id,label,field_type,score_weight,scoring_rule) VALUES(id,'Synthetic symptom','yes_no',1,'{"version":2,"mode":"no"}');
 SELECT count(*) INTO old_count FROM public.checkin_sessions;
 INSERT INTO public.checkin_sessions(template_id,patient_id,nutritionist_id,status,score_version,fields_snapshot,responses,score_total,score_max,adherence_percentage)
 VALUES(id,p,n,'completed',1,fields,'{"positive":"yes","symptom":"yes"}',40,40,100);
 PERFORM pg_temp.assert_checkin((SELECT count(*) FROM public.checkin_sessions WHERE score_version=1 AND score_total=40 AND adherence_percentage=100)=1,'historical score untouched');
 PERFORM pg_temp.assert_checkin((SELECT count(*) FROM public.checkin_sessions)=old_count+1,'history retained');
 INSERT INTO public.checkin_sessions(id,template_id,patient_id,nutritionist_id,fields_snapshot) VALUES('30000000-0000-0000-0000-000000316043',id,p,n,fields);
 INSERT INTO public.checkin_sessions(id,template_id,patient_id,nutritionist_id,fields_snapshot,score_version) VALUES('30000000-0000-0000-0000-000000316044',id,p,n,fields,1);
 INSERT INTO public.checkin_sessions(id,template_id,patient_id,nutritionist_id,fields_snapshot,status) VALUES('30000000-0000-0000-0000-000000316045',id,p,n,fields,'expired');
 INSERT INTO public.checkin_sessions(id,template_id,patient_id,nutritionist_id,fields_snapshot) VALUES('30000000-0000-0000-0000-000000316046',id,p,n,fields);
 INSERT INTO public.checkin_sessions(id,template_id,patient_id,nutritionist_id,fields_snapshot,expires_at) VALUES('30000000-0000-0000-0000-000000316047',id,p,n,fields,now()-interval '1 minute');
 PERFORM private.dispatch_due_checkins();
 PERFORM pg_temp.assert_checkin((SELECT c.status='expired' FROM public.checkin_sessions c WHERE c.id='30000000-0000-0000-0000-000000316047'),'dispatcher marks expiration');
END;
$test$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000316042","role":"authenticated","aal":"aal1"}',true);
SELECT pg_temp.assert_checkin(public.submit_checkin_session('30000000-0000-0000-0000-000000316043','{"positive":"yes","symptom":"yes"}')=75,'RPC and update trigger match v2 oracle');
SELECT pg_temp.assert_checkin(public.submit_checkin_session('30000000-0000-0000-0000-000000316044','{"positive":"yes","symptom":"yes"}')=100,'issued v1 remains original rule');
DO $retry$
BEGIN
 BEGIN PERFORM public.submit_checkin_session('30000000-0000-0000-0000-000000316043','{"positive":"no","symptom":"no"}');RAISE EXCEPTION 'double submit accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CHECKIN_ALREADY_COMPLETED' THEN RAISE;END IF;END;
 BEGIN PERFORM public.submit_checkin_session('30000000-0000-0000-0000-000000316045','{"positive":"yes","symptom":"no"}');RAISE EXCEPTION 'expired accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CHECKIN_EXPIRED' THEN RAISE;END IF;END;
END;
$retry$;
RESET ROLE;
SELECT pg_temp.assert_checkin((SELECT adherence_percentage=75 AND score_version=2 FROM public.checkin_sessions WHERE id='30000000-0000-0000-0000-000000316043'),'repeat preserves confirmed result');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000316041","role":"authenticated","aal":"aal1"}',true);
SELECT public.end_care_episode('20000000-0000-0000-0000-000000316042','ended_by_nutritionist');
SELECT public.start_care_episode('20000000-0000-0000-0000-000000316042','restarted_by_nutritionist');
SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000316042","role":"authenticated","aal":"aal1"}',true);
DO $stale$
BEGIN
 BEGIN PERFORM public.submit_checkin_session('30000000-0000-0000-0000-000000316046','{"positive":"yes","symptom":"no"}');RAISE EXCEPTION 'old episode session accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN UPDATE public.checkin_sessions SET status='completed',responses='{"positive":"yes","symptom":"no"}' WHERE id='30000000-0000-0000-0000-000000316046';IF FOUND THEN RAISE EXCEPTION 'old episode direct write accepted';END IF;EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END;
$stale$;
RESET ROLE;
SELECT pg_temp.assert_checkin((SELECT status='pending' AND responses='{}'::jsonb FROM public.checkin_sessions WHERE id='30000000-0000-0000-0000-000000316046'),'revocation and restart preserve old responses');
ROLLBACK;

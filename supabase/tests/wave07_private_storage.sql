-- Synthetic fixtures only. Metadata inserts represent the trusted Storage API;
-- the HTTP suite separately proves actual bytes/decoder/storage integration.
BEGIN;
INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data) VALUES
('10000000-0000-4000-8000-000000000701','authenticated','authenticated','wave7-a@example.invalid','{"name":"QA A","user_type":"nutritionist"}'),
('10000000-0000-4000-8000-000000000702','authenticated','authenticated','wave7-b@example.invalid','{"name":"QA B","user_type":"nutritionist"}');
CREATE TEMP TABLE qa_storage(id uuid,path text);
GRANT SELECT,INSERT ON qa_storage TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000701',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $test$ DECLARE r jsonb; again jsonb; p text:='10000000-0000-4000-8000-000000000701/10000000-0000-4000-8000-000000000710.png'; BEGIN
 r:=public.reserve_storage_upload('avatars',p,'image/png',100);
 again:=public.reserve_storage_upload('avatars',p,'image/png',100);
 IF r->>'id' IS DISTINCT FROM again->>'id' THEN RAISE EXCEPTION 'retry_not_idempotent'; END IF;
 INSERT INTO qa_storage VALUES((r->>'id')::uuid,p);
 BEGIN PERFORM public.reserve_storage_upload('avatars',replace(p,'701/','702/'),'image/png',100); RAISE EXCEPTION 'cross_tenant_upload_allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.reserve_storage_upload('avatars',p||'/../evil.png','image/png',100); RAISE EXCEPTION 'forged_path_allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.reserve_storage_upload('avatars',replace(p,'.png','.pdf'),'application/pdf',100); RAISE EXCEPTION 'avatar_pdf_allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.reserve_storage_upload('avatars',p,'image/png',5242881); RAISE EXCEPTION 'oversize_allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES('avatars',p); RAISE EXCEPTION 'direct_client_write_allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.user_profiles SET avatar_url='storage:avatars/'||p WHERE id=auth.uid(); RAISE EXCEPTION 'unverified_reference_bound'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM public.claim_storage_upload((r->>'id')::uuid);
 BEGIN PERFORM public.claim_storage_upload((r->>'id')::uuid); RAISE EXCEPTION 'simultaneous_claim_allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'upload_not_pending' THEN RAISE; END IF; END;
END $test$;
RESET ROLE;
INSERT INTO storage.objects(bucket_id,name,metadata) SELECT 'avatars',path,'{"size":90,"mimetype":"image/png"}'::jsonb FROM qa_storage;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $test$ DECLARE r jsonb; BEGIN
 r:=public.finish_storage_upload((SELECT id FROM qa_storage),repeat('a',64),repeat('b',64),90);
 IF r->>'status'<>'confirmed' OR (r->>'size')::bigint<>90 THEN RAISE EXCEPTION 'verified_bytes_not_confirmed'; END IF;
 IF public.fail_storage_upload((SELECT id FROM qa_storage),'cleanup_required') THEN RAISE EXCEPTION 'confirmed_object_failure_claimed'; END IF;
END $test$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $test$ BEGIN
 UPDATE public.user_profiles SET avatar_url='storage:avatars/'||(SELECT path FROM qa_storage) WHERE id=auth.uid();
 IF (SELECT count(*) FROM storage.objects WHERE name=(SELECT path FROM qa_storage))<>1 THEN RAISE EXCEPTION 'authorized_read_denied'; END IF;
 BEGIN PERFORM public.abandon_storage_upload('avatars',(SELECT path FROM qa_storage)); RAISE EXCEPTION 'bound_avatar_abandoned'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.finish_storage_upload((SELECT id FROM qa_storage),repeat('c',64),repeat('c',64),90); RAISE EXCEPTION 'client_hash_confirmed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000702',true);
DO $test$ BEGIN
 IF EXISTS(SELECT 1 FROM storage.objects WHERE name=(SELECT path FROM qa_storage)) THEN RAISE EXCEPTION 'cross_tenant_read_allowed'; END IF;
 BEGIN PERFORM public.claim_storage_upload((SELECT id FROM qa_storage)); RAISE EXCEPTION 'foreign_retry_allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
DO $test$ BEGIN
 IF EXISTS(SELECT 1 FROM storage.buckets WHERE id IN ('avatars','financial-docs','chat_media','lab-results-pdfs','patient-photos','clinical-attachments','document-assets','anamnesis-attachments','IDV','brand-archive') AND public) THEN RAISE EXCEPTION 'public_sensitive_bucket'; END IF;
 IF (SELECT file_size_limit FROM storage.buckets WHERE id='chat_media')<>20971520 THEN RAISE EXCEPTION 'chat_limit_not_20_mib'; END IF;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd IN ('INSERT','UPDATE','DELETE','ALL') AND permissive='PERMISSIVE') THEN RAISE EXCEPTION 'client_storage_write_policy_survived'; END IF;
 IF has_function_privilege('anon','public.finish_storage_upload(uuid,text,text,bigint)','EXECUTE') OR has_function_privilege('authenticated','public.claim_expired_storage_uploads(integer)','EXECUTE') THEN RAISE EXCEPTION 'trusted_boundary_client_callable'; END IF;
 IF has_table_privilege('authenticated','private.storage_upload_reservations','SELECT') THEN RAISE EXCEPTION 'ledger_client_readable'; END IF;
END $test$;
-- A removed public-anamnesis attachment loses fresh URL authorization while
-- the token/form remain open; bytes then become technical cleanup candidates.
INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data) VALUES
('20000000-0000-4000-8000-000000000701','authenticated','authenticated','wave7-p@example.invalid','{"name":"QA patient","user_type":"patient"}');
UPDATE public.user_profiles SET nutritionist_id='10000000-0000-4000-8000-000000000701' WHERE id='20000000-0000-4000-8000-000000000701';
INSERT INTO public.nutritionist_patients(nutritionist_id,patient_id,status) VALUES('10000000-0000-4000-8000-000000000701','20000000-0000-4000-8000-000000000701','active');
INSERT INTO public.anamnesis_records(id,patient_id,nutritionist_id,care_episode_id,content,status,template_snapshot,public_access_token,token_expires_at,filled_by)
SELECT '30000000-0000-4000-8000-000000000701','20000000-0000-4000-8000-000000000701','10000000-0000-4000-8000-000000000701',id,'{}','in_progress',
 '{"sections":[{"fields":[{"id":"file","type":"file"}]}]}','40000000-0000-4000-8000-000000000701',now()+interval '1 hour','patient'
 FROM public.care_episodes WHERE patient_id='20000000-0000-4000-8000-000000000701' AND status='active';
SELECT set_config('qa.anamnesis_path','public/40000000-0000-4000-8000-000000000701/30000000-0000-4000-8000-000000000701/50000000-0000-4000-8000-000000000701.pdf',true);
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claim.role','anon',true);
DO $test$ DECLARE r jsonb; BEGIN
 r:=public.reserve_storage_upload('anamnesis-attachments',current_setting('qa.anamnesis_path'),'application/pdf',100,NULL,'40000000-0000-4000-8000-000000000701');
 PERFORM set_config('qa.anamnesis_upload',r->>'id',true);
 PERFORM public.claim_storage_upload((r->>'id')::uuid,'40000000-0000-4000-8000-000000000701');
END $test$;
RESET ROLE;
INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('anamnesis-attachments',current_setting('qa.anamnesis_path'),'{"size":100,"mimetype":"application/pdf"}');
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT public.finish_storage_upload(current_setting('qa.anamnesis_upload')::uuid,repeat('c',64),repeat('c',64),100);
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role','anon',true);
DO $test$ DECLARE attachments jsonb; BEGIN
 attachments:=public.attach_anamnesis_file('30000000-0000-4000-8000-000000000701','40000000-0000-4000-8000-000000000701',current_setting('qa.anamnesis_path'),'file','Arquivo','synthetic.pdf');
 IF NOT private.storage_object_readable('anamnesis-attachments',current_setting('qa.anamnesis_path')) THEN RAISE EXCEPTION 'attached_public_file_read_denied'; END IF;
 PERFORM public.detach_anamnesis_file('30000000-0000-4000-8000-000000000701','40000000-0000-4000-8000-000000000701',(attachments->0->>'id')::uuid);
 IF private.storage_object_readable('anamnesis-attachments',current_setting('qa.anamnesis_path')) THEN RAISE EXCEPTION 'removed_public_file_still_readable'; END IF;
END $test$;
RESET ROLE;
DO $test$ BEGIN
 IF (SELECT bound_at FROM private.storage_upload_reservations WHERE id=current_setting('qa.anamnesis_upload')::uuid) IS NOT NULL THEN RAISE EXCEPTION 'removed_file_not_orphaned'; END IF;
END $test$;
-- Approval immediately tombstones live avatar bytes, and cannot be fulfilled
-- without independently verified live deletion AND backup retirement evidence.
INSERT INTO private.admin_operators(user_id,grant_reason) VALUES('10000000-0000-4000-8000-000000000702','synthetic Wave 7 operator');
SELECT set_config('qa.erasure_path','20000000-0000-4000-8000-000000000701/60000000-0000-4000-8000-000000000701.png',true);
INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('avatars',current_setting('qa.erasure_path'),'{"size":100,"mimetype":"image/png"}');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000701',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('qa.erasure_request',(public.create_my_data_subject_request('deletion','Synthetic non-clinical erasure')->>'id'),true);
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000702',true);
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000702","role":"authenticated","aal":"aal2"}',true);
SELECT public.update_data_subject_request(current_setting('qa.erasure_request')::uuid,1,'triaged','Synthetic triage',NULL,NULL,true);
SELECT public.update_data_subject_request(current_setting('qa.erasure_request')::uuid,2,'in_progress','Synthetic approved erasure','delete_non_clinical','Synthetic legal assessment',true);
DO $test$ BEGIN
 BEGIN PERFORM public.update_data_subject_request(current_setting('qa.erasure_request')::uuid,3,'fulfilled','Premature fulfillment','delete_non_clinical','Synthetic assessment',true);
 RAISE EXCEPTION 'live_storage_erasure_falsely_fulfilled'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN PERFORM public.list_storage_recovery_exclusions(); RAISE EXCEPTION 'client_erasure_export_allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $test$ DECLARE exclusions jsonb; BEGIN
 exclusions:=public.list_storage_recovery_exclusions();
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(exclusions->'exclusions') e WHERE e->>'object_path'=current_setting('qa.erasure_path')) THEN
  RAISE EXCEPTION 'approved_erasure_not_excluded_from_restore'; END IF;
 IF EXISTS(SELECT 1 FROM private.storage_erasure_work_items WHERE bucket_id<>'avatars') THEN RAISE EXCEPTION 'legal_clinical_files_queued_for_erasure'; END IF;
 BEGIN PERFORM public.acknowledge_storage_erasure_backups(current_setting('qa.erasure_request')::uuid,repeat('a',64));
 RAISE EXCEPTION 'backup_retirement_before_live_erasure_allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'backup_retirement_evidence_invalid' THEN RAISE; END IF; END;
END $test$;
ROLLBACK;

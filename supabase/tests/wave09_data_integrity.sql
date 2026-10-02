-- Synthetic actors only; this suite is restricted to disposable local/CI clones.
BEGIN;
INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data) VALUES
('10000000-0000-0000-0000-000000000901','authenticated','authenticated','w9-n1@example.invalid','{"name":"Synthetic N1","user_type":"nutritionist"}'),
('10000000-0000-0000-0000-000000000902','authenticated','authenticated','w9-n2@example.invalid','{"name":"Synthetic N2","user_type":"nutritionist"}'),
('20000000-0000-0000-0000-000000000901','authenticated','authenticated','w9-p1@example.invalid','{"name":"Synthetic P1","user_type":"patient"}');
UPDATE public.user_profiles SET nutritionist_id='10000000-0000-0000-0000-000000000901' WHERE id='20000000-0000-0000-0000-000000000901';
INSERT INTO public.nutritionist_patients(nutritionist_id,patient_id,status) VALUES
('10000000-0000-0000-0000-000000000901','20000000-0000-0000-0000-000000000901','active');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000901',true);
DO $test$
DECLARE actor uuid:=auth.uid();j jsonb;j2 jsonb;nonce uuid;values_ jsonb;first_id text;review jsonb;food jsonb;revision bigint;plan_id bigint;plan_revision timestamptz;meal_id bigint;
BEGIN
 IF has_function_privilege('anon','public.save_feed_task(jsonb,timestamp with time zone,text,uuid,uuid)','execute')
  OR has_function_privilege('anon','public.mutate_record_idempotently(text,jsonb,text,timestamp with time zone,uuid,uuid)','execute')
  OR has_table_privilege('authenticated','private.mutation_receipts','select') THEN RAISE EXCEPTION 'unsafe_grants';END IF;
 values_:=jsonb_build_object('nutritionist_id',actor,'patient_id','20000000-0000-0000-0000-000000000901','source_type','pending','source_id','synthetic-feed-1','title','Synthetic');
 nonce:=gen_random_uuid();j:=public.save_feed_task(values_,NULL,NULL,nonce,actor);
 j2:=public.save_feed_task(values_,NULL,NULL,nonce,actor);
 IF j->>'id'<>j2->>'id' OR (SELECT count(*) FROM public.feed_tasks WHERE source_id='synthetic-feed-1' AND is_current)<>1 THEN RAISE EXCEPTION 'duplicate_feed_retry';END IF;
 j:=public.save_feed_task(values_,(j->>'updated_at')::timestamptz,'resolved',gen_random_uuid(),actor);
 first_id:=j->>'id';
 j2:=public.save_feed_task(values_,NULL,NULL,gen_random_uuid(),actor);
 IF j2->>'status'<>'resolved' OR jsonb_array_length(j2->'metadata'->'audit_history')<>1 THEN RAISE EXCEPTION 'automatic_snapshot_reopened_or_duplicated_audit';END IF;
 BEGIN PERFORM public.save_feed_task(values_,(j->>'updated_at')::timestamptz,'reopened',gen_random_uuid(),actor);RAISE EXCEPTION 'stale_feed_overwrite';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
 BEGIN PERFORM public.save_feed_task(values_,NULL,NULL,gen_random_uuid(),'10000000-0000-0000-0000-000000000902');RAISE EXCEPTION 'account_switch_write';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 values_:=values_||'{"nutritionist_id":"10000000-0000-0000-0000-000000000902"}';
 BEGIN PERFORM public.save_feed_task(values_,NULL,NULL,gen_random_uuid(),actor);RAISE EXCEPTION 'foreign_task';EXCEPTION WHEN insufficient_privilege THEN NULL;END;

 values_:=jsonb_build_object('nutritionist_id',actor,'type','income','category','consulta','description','Synthetic','amount',10.01,'transaction_date','2026-10-01','status','pending');
 nonce:=gen_random_uuid();j:=public.mutate_record_idempotently('financial_transactions',values_,NULL,NULL,nonce,actor);
 j2:=public.mutate_record_idempotently('financial_transactions',values_,NULL,NULL,nonce,actor);
 IF j->>'id'<>j2->>'id' THEN RAISE EXCEPTION 'duplicate_financial_retry';END IF;
 BEGIN PERFORM public.mutate_record_idempotently('financial_transactions',values_||'{"amount":11}',NULL,NULL,nonce,actor);RAISE EXCEPTION 'nonce_payload_reuse';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN PERFORM public.mutate_record_idempotently('user_profiles','{}',NULL,NULL,gen_random_uuid(),actor);RAISE EXCEPTION 'unlisted_table';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN PERFORM public.mutate_record_idempotently('financial_transactions',values_||'{"amount":1.005}',NULL,NULL,gen_random_uuid(),actor);RAISE EXCEPTION 'fraction_of_cent';EXCEPTION WHEN check_violation THEN NULL;END;
 BEGIN PERFORM public.mutate_record_idempotently('financial_transactions',values_||'{"nutritionist_id":"10000000-0000-0000-0000-000000000902"}',NULL,NULL,gen_random_uuid(),actor);RAISE EXCEPTION 'foreign_finance';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 nonce:=gen_random_uuid();j:=public.save_financial_installments(jsonb_build_array(values_,values_),nonce,actor);
 j2:=public.save_financial_installments(jsonb_build_array(values_,values_),nonce,actor);
 IF j<>j2 OR jsonb_array_length(j)<>2 THEN RAISE EXCEPTION 'installments_not_atomic_or_duplicate';END IF;
 BEGIN PERFORM public.save_financial_installments(jsonb_build_array(values_,values_||'{"amount":1.005}'),gen_random_uuid(),actor);RAISE EXCEPTION 'partial_installments';EXCEPTION WHEN check_violation THEN NULL;END;
 IF (SELECT count(*) FROM public.financial_transactions)<>3 THEN RAISE EXCEPTION 'partial_batch_was_committed';END IF;

 food:='{"name":"Synthetic food","base_qty":100,"base_unit":"g","energy_kcal":100,"protein_g":10,"carbohydrate_g":10,"lipid_g":2}';
 review:=jsonb_build_object('source','openfoodfacts','product_id','synthetic-code','fetched_at',now(),'basis','100g');
 BEGIN PERFORM public.save_reviewed_custom_food(NULL,food,'[]',review,false,NULL,gen_random_uuid(),actor);RAISE EXCEPTION 'unreviewed_food';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 nonce:=gen_random_uuid();j:=public.save_reviewed_custom_food(NULL,food,'[]',review,true,NULL,nonce,actor);
 j2:=public.save_reviewed_custom_food(NULL,food,'[]',review,true,NULL,nonce,actor);
 IF j->>'id'<>j2->>'id' THEN RAISE EXCEPTION 'duplicate_custom_food';END IF;
 revision:=(j->>'revision')::bigint;
 j2:=public.save_reviewed_custom_food((j->>'id')::uuid,food||'{"energy_kcal":101}','[]',review,true,revision,gen_random_uuid(),actor);
 BEGIN PERFORM public.save_reviewed_custom_food((j->>'id')::uuid,food,'[]',review,true,revision,gen_random_uuid(),actor);RAISE EXCEPTION 'stale_food_overwrite';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
 IF NOT EXISTS(SELECT 1 FROM public.nutritionist_foods WHERE id=(j->>'id')::uuid AND reviewed_by=actor AND reviewed_at IS NOT NULL AND external_provenance=review) THEN RAISE EXCEPTION 'missing_provenance';END IF;

 INSERT INTO public.meal_plans(patient_id,nutritionist_id,name,is_draft,is_active,start_date)
 VALUES('20000000-0000-0000-0000-000000000901',actor,'Synthetic draft',true,false,'2026-10-01') RETURNING id,updated_at INTO plan_id,plan_revision;
 values_:='{"name":"Synthetic meal","meal_type":"lunch","foods":[]}';
 nonce:=gen_random_uuid();j:=public.save_draft_meal(plan_id,NULL,values_,plan_revision,nonce,actor);
 meal_id:=(j->>'id')::bigint;
 j2:=public.save_draft_meal(plan_id,NULL,values_,plan_revision,nonce,actor);
 IF j->>'id'<>j2->>'id' OR (SELECT count(*) FROM public.meal_plan_meals WHERE meal_plan_id=plan_id)<>1 THEN RAISE EXCEPTION 'draft_meal_retry_duplicate';END IF;
 BEGIN PERFORM public.save_draft_meal(plan_id,meal_id,values_||'{"name":"Stale overwrite"}',plan_revision,gen_random_uuid(),actor);RAISE EXCEPTION 'draft_meal_stale_overwrite';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
 SELECT updated_at INTO plan_revision FROM public.meal_plans WHERE id=plan_id;
 BEGIN
  PERFORM public.save_draft_meal(plan_id,meal_id,values_||'{"name":"Partial overwrite","foods":[{"food_id":"00000000-0000-0000-0000-000000000099","quantity":1,"unit":"g"}]}',plan_revision,gen_random_uuid(),actor);
  RAISE EXCEPTION 'draft_meal_partial_commit';
 EXCEPTION WHEN foreign_key_violation OR check_violation THEN NULL;END;
 IF (SELECT name FROM public.meal_plan_meals WHERE id=meal_id)<>'Synthetic meal' OR (SELECT updated_at FROM public.meal_plans WHERE id=plan_id) IS DISTINCT FROM plan_revision THEN RAISE EXCEPTION 'draft_meal_failed_transaction_changed_history';END IF;
 BEGIN PERFORM public.save_draft_meal(plan_id,meal_id,values_,plan_revision,gen_random_uuid(),'10000000-0000-0000-0000-000000000902');RAISE EXCEPTION 'draft_meal_account_switch';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 nonce:=gen_random_uuid();j:=public.save_draft_meal(plan_id,meal_id,'{"delete":true}',plan_revision,nonce,actor);
 j2:=public.save_draft_meal(plan_id,meal_id,'{"delete":true}',plan_revision,nonce,actor);
 IF j->>'deleted'<>'true' OR j2->>'deleted'<>'true' OR EXISTS(SELECT 1 FROM public.meal_plan_meals WHERE id=meal_id) THEN RAISE EXCEPTION 'draft_delete_retry_failed';END IF;
 IF (j->>'plan_revision')::timestamptz IS DISTINCT FROM (j2->>'plan_revision')::timestamptz THEN RAISE EXCEPTION 'draft_receipt_revision_changed';END IF;
END $test$;
RESET ROLE;
DO $check$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','private') AND p.prosrc LIKE '%40001%')
 THEN RAISE EXCEPTION 'business_conflict_automatic_retry_loop';END IF;
END $check$;
ROLLBACK;

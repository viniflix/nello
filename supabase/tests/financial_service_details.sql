-- Run only in the reconstructed disposable database. All synthetic rows roll back.
BEGIN;
INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data) VALUES
('10000000-0000-0000-0000-000000000971','authenticated','authenticated','financial-owner@example.invalid','{"name":"Synthetic financial owner","user_type":"nutritionist"}'),
('10000000-0000-0000-0000-000000000972','authenticated','authenticated','financial-other@example.invalid','{"name":"Synthetic financial other","user_type":"nutritionist"}');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000971',true);
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000971","role":"authenticated","aal":"aal1"}',true);
DO $test$
DECLARE actor uuid:=auth.uid(); nonce uuid:=gen_random_uuid(); first_row jsonb; updated_row jsonb; values_ jsonb;
BEGIN
 values_:=jsonb_build_object('nutritionist_id',actor,'name','Synthetic metadata service','price',80,'description','PRIVATE-SERVICE-DESCRIPTION','category','plano_mensal');
 first_row:=public.mutate_record_idempotently('services',values_,null,null,nonce,actor);
 IF first_row->>'description'<>'PRIVATE-SERVICE-DESCRIPTION' OR first_row->>'category'<>'plano_mensal' THEN RAISE EXCEPTION 'financial_service_details_lost'; END IF;
 IF public.mutate_record_idempotently('services',values_,null,null,nonce,actor)<>first_row THEN RAISE EXCEPTION 'financial_service_retry_changed'; END IF;
 updated_row:=public.mutate_record_idempotently('services',jsonb_build_object('price',90,'description','UPDATED-PRIVATE-DESCRIPTION'),first_row->>'id',(first_row->>'updated_at')::timestamptz,gen_random_uuid(),actor);
 IF (updated_row->>'price')::numeric<>90 OR updated_row->>'description'<>'UPDATED-PRIVATE-DESCRIPTION' THEN RAISE EXCEPTION 'financial_service_edit_lost'; END IF;
 BEGIN
  PERFORM public.mutate_record_idempotently('services',jsonb_build_object('price',99),first_row->>'id',(first_row->>'updated_at')::timestamptz,gen_random_uuid(),actor);
  RAISE EXCEPTION 'financial_service_stale_edit_accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
  PERFORM public.mutate_record_idempotently('services',jsonb_build_object('price',99),first_row->>'id',null,gen_random_uuid(),actor);
  RAISE EXCEPTION 'financial_service_missing_revision_accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.mutate_record_idempotently('services',jsonb_build_object('category','unsupported'),first_row->>'id',(updated_row->>'updated_at')::timestamptz,gen_random_uuid(),actor);
  RAISE EXCEPTION 'financial_service_invalid_category_accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF public.financial_audit_history(null,100)::text LIKE '%PRIVATE-DESCRIPTION%' THEN RAISE EXCEPTION 'financial_service_audit_description_leak'; END IF;
 PERFORM set_config('qa.financial_service_id',first_row->>'id',true);
 PERFORM set_config('qa.financial_service_revision',updated_row->>'updated_at',true);
END $test$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000972',true);
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000972","role":"authenticated","aal":"aal1"}',true);
DO $test$
BEGIN
 IF EXISTS(SELECT 1 FROM public.services WHERE id=current_setting('qa.financial_service_id')::uuid) THEN RAISE EXCEPTION 'financial_service_cross_owner_read'; END IF;
 BEGIN
  PERFORM public.mutate_record_idempotently('services',jsonb_build_object('price',1),current_setting('qa.financial_service_id'),current_setting('qa.financial_service_revision')::timestamptz,gen_random_uuid(),auth.uid());
  RAISE EXCEPTION 'financial_service_cross_owner_write';
 EXCEPTION WHEN SQLSTATE 'PT409' OR insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
DO $test$ BEGIN
 IF (SELECT price FROM public.services WHERE id=current_setting('qa.financial_service_id')::uuid)<>90 THEN RAISE EXCEPTION 'financial_service_foreign_write_effect'; END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.services'::regclass) THEN RAISE EXCEPTION 'financial_service_rls_disabled'; END IF;

END $test$;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
DO $test$ BEGIN
 BEGIN
  IF EXISTS(SELECT 1 FROM public.services WHERE id=current_setting('qa.financial_service_id')::uuid) THEN RAISE EXCEPTION 'financial_service_anonymous_read'; END IF;
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.services(nutritionist_id,name,price) VALUES('10000000-0000-0000-0000-000000000971','Anonymous denied',1);
  RAISE EXCEPTION 'financial_service_anonymous_write';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
ROLLBACK;

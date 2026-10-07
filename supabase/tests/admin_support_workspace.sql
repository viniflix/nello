BEGIN;
DO $$ DECLARE op uuid:=gen_random_uuid(); auditor uuid:=gen_random_uuid();
BEGIN
 INSERT INTO auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data)
 SELECT id,'authenticated','authenticated',id||'@example.invalid',now(),'{"name":"Synthetic support","user_type":"nutritionist"}'::jsonb FROM unnest(ARRAY[op,auditor]) id;
 INSERT INTO private.admin_operators(user_id,role,grant_reason) VALUES(op,'operator','Synthetic support test'),(auditor,'auditor','Synthetic read only test');
 PERFORM set_config('qa.support_op',op::text,true);PERFORM set_config('qa.support_auditor',auditor::text,true);
 IF has_function_privilege('anon','public.admin_support_queue(text,integer)','execute') OR has_function_privilege('authenticated','public.support_receive(uuid,text,text,text,timestamptz,text,jsonb,boolean)','execute') THEN RAISE EXCEPTION 'support_grant_leak'; END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE op uuid:=current_setting('qa.support_op')::uuid; auditor uuid:=current_setting('qa.support_auditor')::uuid; c uuid; m uuid; n uuid:=gen_random_uuid(); r jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',op::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',op,'role','authenticated','aal','aal1')::text,true);
 BEGIN PERFORM public.admin_support_queue();RAISE EXCEPTION 'aal1_read_allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',op,'role','authenticated','aal','aal2')::text,true);
 r:=public.admin_support_create('Synthetic support case','qa@example.invalid',n);c:=(r->>'id')::uuid;
 IF (public.admin_support_create('Synthetic support case','qa@example.invalid',n)->>'id')::uuid<>c THEN RAISE EXCEPTION 'duplicate_case';END IF;
 BEGIN PERFORM public.admin_support_create('Changed payload','qa@example.invalid',n);RAISE EXCEPTION 'nonce_reused';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN PERFORM public.admin_support_compose(c,0,gen_random_uuid(),'Synthetic note','note');RAISE EXCEPTION 'stale_revision';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
 r:=public.admin_support_compose(c,1,gen_random_uuid(),'Internal synthetic content','note');
 IF public.admin_support_case(c)->'messages'->0->>'state'<>'internal' THEN RAISE EXCEPTION 'note_sent';END IF;
 PERFORM public.admin_support_update(c,2,gen_random_uuid(),'closed','bug','meal_plan','123','Synthetic closure does not prove bug fixed');
 PERFORM public.admin_support_update(c,3,gen_random_uuid(),'in_progress','bug','meal_plan','123','Synthetic reopening');
 IF public.admin_support_case(c)->'item'->>'reopen_count'<>'1' THEN RAISE EXCEPTION 'reopen_missing';END IF;
 r:=public.admin_support_compose(c,4,gen_random_uuid(),'Synthetic reviewed reply','outgoing');m:=(r->>'id')::uuid;
 BEGIN PERFORM public.admin_support_compose(c,5,gen_random_uuid(),'Second ambiguous reply','outgoing');RAISE EXCEPTION 'duplicate_pending_reply';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
 r:=public.admin_support_claim(m);PERFORM set_config('qa.support_lease',r->>'lease',true);
 BEGIN PERFORM public.admin_support_claim(m);RAISE EXCEPTION 'duplicate_send';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
 PERFORM set_config('qa.support_case',c::text,true);PERFORM set_config('qa.support_message',m::text,true);
 PERFORM set_config('request.jwt.claim.sub',auditor::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',auditor,'role','authenticated','aal','aal2')::text,true);
 IF public.admin_support_case(c)->>'can_write'<>'false' THEN RAISE EXCEPTION 'auditor_write';END IF;
 BEGIN PERFORM public.admin_support_compose(c,5,gen_random_uuid(),'Forbidden note','note');RAISE EXCEPTION 'auditor_note';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.admin_support_claim(m);RAISE EXCEPTION 'auditor_send';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
DO $$ DECLARE m uuid:=current_setting('qa.support_message')::uuid; provider uuid:=gen_random_uuid(); l uuid:=current_setting('qa.support_lease')::uuid; incoming uuid:=gen_random_uuid(); c uuid;
BEGIN
 -- Delivery callback can arrive before the sender's HTTP response.
 PERFORM public.support_callback('synthetic-delivered',provider,'email.delivered',now());
 PERFORM public.support_delivery_record(m,l,'sent',provider);
 IF (SELECT state FROM private.support_messages WHERE id=m)<>'delivered' THEN RAISE EXCEPTION 'orphan_delivery_lost';END IF;
 PERFORM public.support_callback('synthetic-sent',provider,'email.sent',now()-interval '1 second');
 IF (SELECT state FROM private.support_messages WHERE id=m)<>'delivered' THEN RAISE EXCEPTION 'delivery_regressed';END IF;
 c:=(public.support_receive(incoming,'unknown@example.invalid','Synthetic received','<script>not executable</script>',now(),'synthetic-message','[]',false)->>'id')::uuid;
 IF (public.support_receive(incoming,'unknown@example.invalid','Synthetic received','duplicate',now(),'synthetic-message','[]',false)->>'id')::uuid<>c THEN RAISE EXCEPTION 'duplicate_receive';END IF;
 IF (SELECT count(*) FROM private.support_messages WHERE provider_id=incoming)<>1 THEN RAISE EXCEPTION 'duplicate_message';END IF;
 IF (SELECT first_reply_at FROM private.support_cases WHERE id=current_setting('qa.support_case')::uuid) IS NULL THEN RAISE EXCEPTION 'human_reply_missing';END IF;
 UPDATE private.admin_operators SET revoked_at=now() WHERE user_id=current_setting('qa.support_op')::uuid;
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 PERFORM set_config('request.jwt.claim.sub',current_setting('qa.support_op'),true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.support_op'),'role','authenticated','aal','aal2')::text,true);
 BEGIN PERFORM public.admin_support_queue();RAISE EXCEPTION 'revoked_read';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
ROLLBACK;

BEGIN;
DO $$ DECLARE op uuid:=gen_random_uuid(); auditor uuid:=gen_random_uuid();
BEGIN
 INSERT INTO auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data)
 SELECT id,'authenticated','authenticated',id||'@example.invalid',now(),'{"name":"Synthetic intelligence","user_type":"nutritionist"}'::jsonb FROM unnest(ARRAY[op,auditor]) id;
 INSERT INTO private.admin_operators(user_id,role,grant_reason) VALUES(op,'operator','Synthetic intelligence test'),(auditor,'auditor','Synthetic read test');
 PERFORM set_config('qa.intelligence_op',op::text,true);PERFORM set_config('qa.intelligence_auditor',auditor::text,true);
 IF has_function_privilege('anon','public.admin_intelligence_overview(text,integer)','execute')
 OR has_table_privilege('authenticated','private.admin_intelligence_records','select') THEN RAISE EXCEPTION 'intelligence_grant_leak';END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE op uuid:=current_setting('qa.intelligence_op')::uuid; auditor uuid:=current_setting('qa.intelligence_auditor')::uuid;
 id uuid:=gen_random_uuid(); n uuid:=gen_random_uuid(); payload jsonb; r jsonb; overview jsonb; signal jsonb; revision_ bigint; episode_ bigint;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',op::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',op,'role','authenticated','aal','aal1')::text,true);
 BEGIN PERFORM public.admin_intelligence_overview();RAISE EXCEPTION 'aal1_read';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',op,'role','authenticated','aal','aal2')::text,true);
 payload:=jsonb_build_object('title','Synthetic decision','evidence','Synthetic observations only','action','Investigate the synthetic condition','expected','An observable synthetic result',
 'review_on',((now() AT TIME ZONE 'America/Fortaleza')::date-1)::text,'outcome','planned','result','');
 r:=public.admin_intelligence_save('decision',id,0,n,payload,'Synthetic creation with preserved evidence');
 IF (r->>'revision')::bigint<>1 OR (public.admin_intelligence_save('decision',id,0,n,payload,'Synthetic creation with preserved evidence')->>'id')::uuid<>id THEN RAISE EXCEPTION 'duplicate_save';END IF;
 BEGIN PERFORM public.admin_intelligence_save('decision',id,0,n,payload||'{"title":"Changed"}','Synthetic creation with preserved evidence');RAISE EXCEPTION 'nonce_reused';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN PERFORM public.admin_intelligence_save('decision',id,0,gen_random_uuid(),payload,'Synthetic stale revision');RAISE EXCEPTION 'stale_revision';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
 BEGIN PERFORM public.admin_intelligence_save('decision',gen_random_uuid(),0,gen_random_uuid(),payload||'{"review_on":"2026-02-30"}','Synthetic invalid date');RAISE EXCEPTION 'invalid_date_allowed';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN PERFORM public.admin_intelligence_save('decision',gen_random_uuid(),0,gen_random_uuid(),payload||'{"secret":"unexpected"}','Synthetic extra field');RAISE EXCEPTION 'extra_field_allowed';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN PERFORM public.admin_intelligence_save('decision',gen_random_uuid(),0,gen_random_uuid(),payload||'{"evidence":"Bearer synthetic-secret-sensitive"}','Synthetic credential sentinel');RAISE EXCEPTION 'credential_allowed';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 overview:=public.admin_intelligence_overview();
 SELECT value INTO signal FROM jsonb_array_elements(overview->'signals') WHERE value->>'key'='review_due';
 IF signal->>'active'<>'true' OR (signal->>'value')::bigint<1 THEN RAISE EXCEPTION 'review_due_missing';END IF;
 revision_:=(signal->>'revision')::bigint;episode_:=(signal->>'episode')::bigint;
 r:=public.admin_intelligence_mute('review_due',revision_,1,gen_random_uuid(),'Synthetic temporary internal silence');
 overview:=public.admin_intelligence_overview();
 SELECT value INTO signal FROM jsonb_array_elements(overview->'signals') WHERE value->>'key'='review_due';
 IF signal->>'muted_until' IS NULL OR (signal->>'revision')::bigint<>revision_+1 THEN RAISE EXCEPTION 'mute_missing';END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(overview->'signal_events') e WHERE e->>'signal_key'='review_due' AND e->>'kind'='mute' AND e->>'muted_until'=signal->>'muted_until') THEN RAISE EXCEPTION 'mute_duration_not_audited';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(overview->'signal_events') WHERE value ? 'actor_id') THEN RAISE EXCEPTION 'actor_exposed';END IF;
 IF (public.admin_intelligence_history(id)->>'total')::integer<>1 THEN RAISE EXCEPTION 'replay_history_duplicated';END IF;
 payload:=payload||'{"outcome":"inconclusive","result":"Insufficient evidence; do not infer improvement."}';
 PERFORM public.admin_intelligence_save('decision',id,1,gen_random_uuid(),payload,'Synthetic inconclusive review');
 IF (public.admin_intelligence_history(id)->>'total')::integer<>2 THEN RAISE EXCEPTION 'history_lost';END IF;

 -- New reads do not append condition events; resolution and reopening reset silence.
 overview:=public.admin_intelligence_overview();SELECT value INTO signal FROM jsonb_array_elements(overview->'signals') WHERE value->>'key'='review_due';
 IF signal->>'active'<>'false' OR signal->>'muted_until' IS NOT NULL THEN RAISE EXCEPTION 'resolved_signal_not_reset';END IF;
 payload:=payload||'{"outcome":"planned","result":""}';
 PERFORM public.admin_intelligence_save('decision',id,2,gen_random_uuid(),payload,'Synthetic reopened review');
 overview:=public.admin_intelligence_overview();SELECT value INTO signal FROM jsonb_array_elements(overview->'signals') WHERE value->>'key'='review_due';
 IF signal->>'active'<>'true' OR signal->>'muted_until' IS NOT NULL OR (signal->>'episode')::bigint<>episode_+1 THEN RAISE EXCEPTION 'reopen_missing';END IF;
 r:=overview->'signal_events';overview:=public.admin_intelligence_overview();IF overview->'signal_events'<>r THEN RAISE EXCEPTION 'repeated_alert_events';END IF;
 -- Real zero is permitted; unknown cost and limit are null, not fabricated zeros.
 r:=jsonb_build_object('provider','Supabase','resource','Synthetic storage','unit','bytes','used',0,'limit',NULL,'cost',NULL,'currency','BRL','source_note','Synthetic measured source',
 'period_start',(now() AT TIME ZONE 'America/Fortaleza')::date::text,'period_end',(now() AT TIME ZONE 'America/Fortaleza')::date::text,'measured_on',(now() AT TIME ZONE 'America/Fortaleza')::date::text);
 PERFORM public.admin_intelligence_save('capacity',gen_random_uuid(),0,gen_random_uuid(),r,'Synthetic zero and unknown measurement');
 BEGIN PERFORM public.admin_intelligence_save('capacity',gen_random_uuid(),0,gen_random_uuid(),r||'{"used":-1}','Synthetic invalid negative');RAISE EXCEPTION 'negative_capacity_allowed';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 r:=jsonb_build_object('title','Synthetic change','detail','Synthetic configuration context','module','infrastructure','change_kind','configuration','release','','occurred_at',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'));
 PERFORM public.admin_intelligence_save('change',gen_random_uuid(),0,gen_random_uuid(),r,'Synthetic manual change');
 BEGIN PERFORM public.admin_intelligence_save('change',gen_random_uuid(),0,gen_random_uuid(),r||'{"occurred_at":"2026-10-01T12:00:00"}','Synthetic timezone missing');RAISE EXCEPTION 'ambiguous_time_allowed';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 r:=jsonb_build_object('title','Synthetic feature','feature_key','synthetic_feature','module','other','stage','evaluation','scope','Synthetic users only','rationale','Synthetic evidence for lifecycle','review_on','2026-10-07');
 PERFORM public.admin_intelligence_save('feature',gen_random_uuid(),0,gen_random_uuid(),r,'Synthetic feature inventory');
 BEGIN PERFORM public.admin_intelligence_save('feature',gen_random_uuid(),0,gen_random_uuid(),r||'{"stage":"activate_accounts"}','Synthetic forbidden stage');RAISE EXCEPTION 'invalid_feature_stage';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 PERFORM set_config('qa.intelligence_id',id::text,true);
 PERFORM set_config('request.jwt.claim.sub',auditor::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',auditor,'role','authenticated','aal','aal2')::text,true);
 IF public.admin_intelligence_overview()->>'can_write'<>'false' THEN RAISE EXCEPTION 'auditor_capability';END IF;
 BEGIN PERFORM public.admin_intelligence_save('decision',id,2,gen_random_uuid(),payload,'Forbidden auditor update');RAISE EXCEPTION 'auditor_write';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.admin_intelligence_mute('review_due',1,1,gen_random_uuid(),'Forbidden auditor mute');RAISE EXCEPTION 'auditor_mute';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
DO $$ DECLARE op uuid:=current_setting('qa.intelligence_op')::uuid; id uuid:=current_setting('qa.intelligence_id')::uuid;
BEGIN
 UPDATE public.user_profiles SET is_active=false WHERE public.user_profiles.id=op;
 PERFORM set_config('request.jwt.claim.sub',op::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',op,'role','authenticated','aal','aal2')::text,true);
 BEGIN PERFORM public.admin_intelligence_overview();RAISE EXCEPTION 'inactive_read';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 UPDATE public.user_profiles SET is_active=true WHERE public.user_profiles.id=op;
 UPDATE private.admin_operators SET revoked_at=now() WHERE user_id=op;
 BEGIN PERFORM public.admin_intelligence_history(id);RAISE EXCEPTION 'revoked_read';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
ROLLBACK;

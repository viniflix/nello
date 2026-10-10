-- Synthetic actors, no hosted execution. Everything rolls back in a SQL clone.
begin;
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
('10000000-0000-0000-0000-000000000961','authenticated','authenticated','sec06-owner@example.invalid','{"name":"Synthetic SEC06 owner","user_type":"nutritionist"}'),
('10000000-0000-0000-0000-000000000962','authenticated','authenticated','sec06-other@example.invalid','{"name":"Synthetic SEC06 other","user_type":"nutritionist"}');
insert into private.admin_operators(user_id,role,grant_reason) values('10000000-0000-0000-0000-000000000961','owner','Synthetic security audit operator');
select set_config('qa.sec06_start',(select max(id)::text from private.security_audit_events),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000961',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000961","role":"authenticated","aal":"aal2"}',true);
do $test$
declare actor uuid:=auth.uid();nonce uuid:=gen_random_uuid();values_ jsonb;j jsonb;j2 jsonb;page jsonb;sid uuid;
begin
 values_:=jsonb_build_object('nutritionist_id',actor,'type','income','category','consulta','description','SECRET-FREE-TEXT-NOT-IN-AUDIT','amount',10.01,'transaction_date','2026-10-10','status','pending');
 j:=public.mutate_record_idempotently('financial_transactions',values_,null,null,nonce,actor);
 j2:=public.mutate_record_idempotently('financial_transactions',values_,null,null,nonce,actor);
 if j<>j2 then raise exception 'sec06_idempotency_result';end if;
 page:=public.financial_audit_history(null,100);
 if jsonb_array_length(page->'items')<>1 then raise exception 'sec06_retry_duplicate_event';end if;
 if page::text like '%SECRET-FREE-TEXT%' or (page->'items'->0->'after_state') ?| array['attachment_url','description','patient_id'] then raise exception 'sec06_payload_leak';end if;
 if page->'items'->0->>'actor_id'<>actor::text or page->'items'->0->>'origin'<>'authenticated' then raise exception 'sec06_actor';end if;
 begin perform public.mutate_record_idempotently('financial_transactions',values_,null,null,gen_random_uuid(),'10000000-0000-0000-0000-000000000962');raise exception 'sec06_spoof_actor';exception when insufficient_privilege then null;end;
 -- Direct UPDATE and DELETE must be covered as well as RPC paths.
 update public.financial_transactions set description='ANOTHER-SENSITIVE-VALUE',amount=11 where id=(j->>'id')::bigint;
 delete from public.financial_transactions where id=(j->>'id')::bigint;
 if jsonb_array_length(public.financial_audit_history(null,100)->'items')<>3 then raise exception 'sec06_direct_mutations_missing';end if;
 if public.financial_audit_history(null,100)::text like '%SENSITIVE-VALUE%' then raise exception 'sec06_update_payload_leak';end if;
 insert into public.services(nutritionist_id,name,price,duration_minutes) values(actor,'PRIVATE-SERVICE-NAME',50,30) returning id into sid;
 update public.services set active=false where id=sid;
 delete from public.services where id=sid;
 if jsonb_array_length(public.financial_audit_history(null,100)->'items')<>6 then raise exception 'sec06_service_lifecycle_missing';end if;
 if public.financial_audit_history(null,100)::text like '%PRIVATE-SERVICE-NAME%' then raise exception 'sec06_service_payload_leak';end if;
 page:=public.financial_audit_history(null,2);
 if jsonb_array_length(page->'items')<>2 or jsonb_array_length(public.financial_audit_history((page->'items'->1->>'id')::bigint,100)->'items')<>4 then raise exception 'sec06_cursor';end if;
 begin perform public.financial_audit_history(null,101);raise exception 'sec06_unbounded';exception when invalid_parameter_value then null;end;
 begin perform public.financial_audit_history(null,null);raise exception 'sec06_null_limit';exception when invalid_parameter_value then null;end;
 -- A later constraint failure must roll back the financial mutation AND event.
 begin
  perform public.mutate_record_idempotently('financial_transactions',values_,null,null,gen_random_uuid(),actor);
  raise check_violation using message='synthetic transaction rollback';
 exception when check_violation then null;end;
 if jsonb_array_length(public.financial_audit_history(null,100)->'items')<>6 then raise exception 'sec06_orphan_rollback_event';end if;
 if exists(select 1 from public.financial_transactions where nutritionist_id=actor) then raise exception 'sec06_partial_rollback';end if;
 -- A different tenant can neither read the ledger nor forge a write to it.
 perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000962',true);
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000962","role":"authenticated","aal":"aal2"}',true);
 if jsonb_array_length(public.financial_audit_history(null,100)->'items')<>0 then raise exception 'sec06_cross_tenant_read';end if;
 begin perform public.admin_security_activity();raise exception 'sec06_nonoperator_admin_read';exception when insufficient_privilege then null;end;
 begin execute 'select * from private.security_audit_events';raise exception 'sec06_direct_read';exception when insufficient_privilege then null;end;
 begin execute 'delete from private.security_audit_events';raise exception 'sec06_direct_delete';exception when insufficient_privilege then null;end;
 begin execute 'update private.security_audit_events set actor_id=null';raise exception 'sec06_direct_update';exception when insufficient_privilege then null;end;
 begin perform private.evaluate_security_alerts();raise exception 'sec06_client_evaluate';exception when insufficient_privilege then null;end;
end $test$;
reset role;

-- Native refund RPC, blocked paid deletion and scheduler/service origin.
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000961',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000961","role":"authenticated","aal":"aal2"}',true);
do $$declare tx bigint;before_count integer;begin
 before_count:=jsonb_array_length(public.financial_audit_history(null,100)->'items');
 insert into public.financial_transactions(nutritionist_id,type,description,amount,transaction_date,status) values(auth.uid(),'income','Synthetic refund',30,current_date,'paid') returning id into tx;
 begin delete from public.financial_transactions where id=tx;raise exception 'sec06_paid_delete_allowed';exception when raise_exception then if sqlerrm<>'FINANCIAL_USE_REFUND_FOR_PAID' then raise;end if;end;
 perform public.refund_financial_transaction(tx,current_date);
 if jsonb_array_length(public.financial_audit_history(null,100)->'items')<>before_count+2 then raise exception 'sec06_refund_or_rejected_delete_event';end if;
 if public.financial_audit_history(null,1)->'items'->0->'after_state'->>'status'<>'refunded' then raise exception 'sec06_refund_state_missing';end if;
end$$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into public.services(nutritionist_id,name,price) values('10000000-0000-0000-0000-000000000962','Synthetic service task',1);
do $$begin if not exists(select 1 from private.security_audit_events where resource_type='services' and origin='service_role' and actor_id is null) then raise exception 'sec06_service_origin';end if;end$$;
select set_config('request.jwt.claims','{}',true);

-- If recording fails, the data mutation must fail closed, never silently skip.
create function pg_temp.sec06_fail_audit() returns trigger language plpgsql as $$begin raise exception 'synthetic_audit_unavailable';end$$;
create trigger sec06_failure before insert on private.security_audit_events for each row execute function pg_temp.sec06_fail_audit();
do $$begin
 begin insert into public.services(nutritionist_id,name,price) values('10000000-0000-0000-0000-000000000961','Synthetic failure',1);raise exception 'sec06_audit_failure_ignored';
 exception when sqlstate 'PT503' then if sqlerrm<>'security_audit_unavailable' then raise;end if;end;
 if exists(select 1 from public.services where name='Synthetic failure') then raise exception 'sec06_write_without_audit';end if;
end$$;
drop trigger sec06_failure on private.security_audit_events;

-- Deliberately synthetic authoritative Auth entries; no email/IP/token is copied.
insert into auth.audit_log_entries(id,instance_id,payload,created_at) select gen_random_uuid(),'00000000-0000-0000-0000-000000000000',
 json_build_object('action','user_updated_password','actor_id','10000000-0000-0000-0000-000000000961','actor_username','DO-NOT-COPY','password','DO-NOT-COPY'),now() from generate_series(1,5);
insert into auth.audit_log_entries(id,instance_id,payload,created_at) select gen_random_uuid(),'00000000-0000-0000-0000-000000000000',
 json_build_object('action','verification_attempted','actor_id','10000000-0000-0000-0000-000000000961'),now() from generate_series(1,10);
insert into auth.audit_log_entries(id,instance_id,payload,created_at) values(gen_random_uuid(),'00000000-0000-0000-0000-000000000000',
 '{"action":"factor_unenrolled","actor_id":"10000000-0000-0000-0000-000000000961"}',now());
insert into auth.audit_log_entries(id,instance_id,payload,created_at) values(gen_random_uuid(),'00000000-0000-0000-0000-000000000000',
 '{"action":"factor_unenrolled","actor_id":"not-a-uuid"}',now());
insert into private.admin_access_events(operator_id,hour_bucket,outcome,attempts) values('10000000-0000-0000-0000-000000000961',date_trunc('hour',now()),'mfa_required',10);
select private.evaluate_security_alerts();
select private.evaluate_security_alerts();
do $$begin
 if (select count(*) from private.security_alerts where subject_id='10000000-0000-0000-0000-000000000961')<>5 then raise exception 'sec06_alert_rules_or_dedup';end if;
 if exists(select 1 from private.security_alerts where rule='password_change_volume' and occurrences<>5) then raise exception 'sec06_retry_inflated';end if;
 if (select last_evaluated_at from private.security_monitor_state) is null then raise exception 'sec06_checkpoint_missing';end if;
 if exists(select 1 from private.security_alerts where to_jsonb(security_alerts)::text like '%DO-NOT-COPY%') then raise exception 'sec06_alert_payload_leak';end if;
end$$;
-- An evaluation failure cannot acknowledge work it did not commit. Retry the
-- same authoritative records and prove recovery after an outage longer than 2h.
create function pg_temp.sec06_fail_alert() returns trigger language plpgsql as $$begin raise exception 'synthetic_alert_unavailable';end$$;
create trigger sec06_alert_failure before insert on private.security_alerts for each row execute function pg_temp.sec06_fail_alert();
do $$declare previous timestamptz;begin
 select last_evaluated_at into previous from private.security_monitor_state;
 begin perform private.evaluate_security_alerts();raise exception 'sec06_alert_failure_ignored';
 exception when raise_exception then if sqlerrm<>'synthetic_alert_unavailable' then raise;end if;end;
 if (select last_evaluated_at from private.security_monitor_state) is distinct from previous then raise exception 'sec06_failed_evaluation_advanced_cursor';end if;
end$$;
drop trigger sec06_alert_failure on private.security_alerts;
select private.evaluate_security_alerts();
update private.security_monitor_state set started_at=now()-interval '1 day',last_evaluated_at=now()-interval '5 hours';
insert into auth.audit_log_entries(id,instance_id,payload,created_at) select gen_random_uuid(),'00000000-0000-0000-0000-000000000000',
 json_build_object('action','user_updated_password','actor_id','10000000-0000-0000-0000-000000000962'),now()-interval '4 hours' from generate_series(1,4);
select private.evaluate_security_alerts();
do $$begin if exists(select 1 from private.security_alerts where subject_id='10000000-0000-0000-0000-000000000962') then raise exception 'sec06_alert_below_threshold';end if;end$$;
-- Late-arriving event in the evaluated previous hour remains eligible on retry.
update private.security_monitor_state set last_evaluated_at=now()-interval '5 hours';
insert into auth.audit_log_entries(id,instance_id,payload,created_at) values(gen_random_uuid(),'00000000-0000-0000-0000-000000000000',
 '{"action":"user_updated_password","actor_id":"10000000-0000-0000-0000-000000000962"}',now()-interval '4 hours');
select private.evaluate_security_alerts();
do $$begin if not exists(select 1 from private.security_alerts where subject_id='10000000-0000-0000-0000-000000000962' and occurrences=5) then raise exception 'sec06_outage_lost_auth_signal';end if;end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000961',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000961","role":"authenticated","aal":"aal2"}',true);
do $$declare j jsonb;begin
 j:=public.admin_security_activity(null,100);
 if jsonb_array_length(j->'alerts')<>6 or j->'monitor'->>'external_delivery_configured'<>'false' or j->'monitor'->>'failed_login_source_available'<>'false' then raise exception 'sec06_false_coverage_claim';end if;
 if exists(select 1 from jsonb_array_elements(j->'events') e where e->>'resource_type' in ('financial_transactions','services')) then raise exception 'sec06_admin_financial_exposure';end if;
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000961","role":"authenticated","aal":"aal1"}',true);
 begin perform public.admin_security_activity();raise exception 'sec06_aal1_read';exception when insufficient_privilege then null;end;
end$$;
reset role;
update public.user_profiles set is_active=false where id='10000000-0000-0000-0000-000000000961';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000961","role":"authenticated","aal":"aal2"}',true);
do $$begin
 begin perform public.admin_security_activity();raise exception 'sec06_inactive_read';exception when insufficient_privilege then null;end;
 begin perform public.financial_audit_history();raise exception 'sec06_inactive_financial_read';exception when insufficient_privilege then null;end;
end$$;
reset role;
do $$begin
 if has_table_privilege('service_role','private.security_audit_events','delete') or has_table_privilege('authenticated','private.security_alerts','insert')
 or has_function_privilege('anon','public.admin_security_activity(bigint,integer)','execute') then raise exception 'sec06_unsafe_acl';end if;
end$$;
rollback;

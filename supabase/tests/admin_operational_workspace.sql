begin;
do $$
declare op uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); internal uuid:=gen_random_uuid();
begin
 perform set_config('qa.admin_op',op::text,true); perform set_config('qa.admin_out',outsider::text,true);
 insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 (op,'authenticated','authenticated','admin-f1-'||op||'@example.invalid','{"name":"Synthetic operator","user_type":"nutritionist"}'),
 (outsider,'authenticated','authenticated','admin-f1-'||outsider||'@example.invalid','{"name":"Synthetic outsider","user_type":"patient"}'),
 (internal,'authenticated','authenticated','admin-f1-'||internal||'@example.invalid','{"name":"Synthetic internal","user_type":"patient"}');
 update public.user_profiles set is_simulation=true,simulation_owner_id=op where id=internal;
 insert into private.admin_operators(user_id,role,grant_reason) values(op,'owner','Rollback-only administrative contract test');
 insert into public.data_subject_requests(subject_id,request_type,status,due_at) values
 (outsider,'access','submitted',now()-interval '1 second'),(internal,'access','submitted',now()-interval '1 second');
 if has_function_privilege('anon','public.admin_operational_briefing()','execute') or has_table_privilege('authenticated','private.admin_incident_events','select') then raise exception 'unexpected_direct_access'; end if;
 perform set_config('qa.real_privacy_id', (select id::text from public.data_subject_requests where subject_id=outsider limit 1),true);
end; $$;
set local role authenticated;
do $$
declare op uuid:=current_setting('qa.admin_op')::uuid; outsider uuid:=current_setting('qa.admin_out')::uuid; b jsonb; t jsonb; q jsonb; before_count bigint;
begin
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated','aal','aal2')::text,true);
 begin perform public.admin_operational_briefing(); raise exception 'outsider_allowed'; exception when insufficient_privilege then null; end;
 begin perform public.admin_triage_incident('999900001',0,'investigating','Synthetic first investigation'); raise exception 'outsider_write'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',op::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',op,'role','authenticated','aal','aal1')::text,true);
 begin perform public.admin_operational_briefing(); raise exception 'aal1_allowed'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',op,'role','authenticated','aal','aal2')::text,true);
 b:=public.admin_operational_briefing();
 if b->>'schema_version'<>'1' or b->>'timezone'<>'America/Fortaleza' or b::text like '%Synthetic outsider%' or b::text like '%@example.invalid%' then raise exception 'briefing_contract'; end if;
 select value into q from jsonb_array_elements(b->'queues') where value->>'key'='privacy';
 before_count:=(q->>'count')::bigint;
 if (q->>'overdue')::bigint<1 then raise exception 'missing_overdue'; end if;
 t:=public.admin_triage_incident('999900001',0,'investigating','Synthetic first investigation');
 if t->>'revision'<>'1' then raise exception 'initial_revision'; end if;
 begin perform public.admin_triage_incident('999900001',0,'closed','Synthetic stale overwrite'); raise exception 'stale_overwrite'; exception when sqlstate 'PT409' then null; end;
 t:=public.admin_triage_incident('999900001',1,'monitoring','Synthetic review after correction');
 if t->>'revision'<>'2' or jsonb_array_length(public.admin_incident_state('999900001')->'events')<>2 then raise exception 'audit_history'; end if;
 begin perform public.admin_triage_incident('999900001',2,'deleted','Synthetic invalid state'); raise exception 'bad_state'; exception when invalid_parameter_value then null; end;
 begin perform public.admin_triage_incident('999900001',2,'closed','short'); raise exception 'short_reason'; exception when invalid_parameter_value then null; end;
 perform set_config('qa.before_privacy',before_count::text,true);
end; $$;
reset role;
update public.data_subject_requests set status='cancelled',cancelled_at=now() where id=current_setting('qa.real_privacy_id')::uuid;
update private.admin_operators set role='auditor' where user_id=current_setting('qa.admin_op')::uuid;
set local role authenticated;
do $$
declare b jsonb; q jsonb;
begin
 b:=public.admin_operational_briefing();
 select value into q from jsonb_array_elements(b->'queues') where value->>'key'='privacy';
 if (q->>'count')::bigint<>current_setting('qa.before_privacy')::bigint-1 then raise exception 'simulation_or_closed_count'; end if;
 if (public.admin_incident_state('999900001')->>'can_triage')::boolean then raise exception 'auditor_write_flag'; end if;
 begin perform public.admin_triage_incident('999900001',2,'closed','Synthetic auditor write'); raise exception 'auditor_write'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
update private.admin_operators set revoked_at=now() where user_id=current_setting('qa.admin_op')::uuid;
set local role authenticated;
do $$ begin
 begin perform public.admin_incident_state('999900001'); raise exception 'revoked_allowed'; exception when insufficient_privilege then null; end;
end; $$;
rollback;

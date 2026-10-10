-- Synthetic users and every administrative mutation roll back in a SQL clone.
begin;
do $$
declare operator_id uuid:=gen_random_uuid(); outsider_id uuid:=gen_random_uuid();
begin
 perform set_config('qa.sec04_operator',operator_id::text,true);
 perform set_config('qa.sec04_outsider',outsider_id::text,true);
 insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 (operator_id,'authenticated','authenticated','sec04-'||operator_id||'@example.invalid','{"name":"Synthetic SEC04 operator","user_type":"nutritionist"}'),
 (outsider_id,'authenticated','authenticated','sec04-'||outsider_id||'@example.invalid','{"name":"Synthetic SEC04 outsider","user_type":"nutritionist"}');
 insert into private.admin_operators(user_id,role,grant_reason) values(operator_id,'owner','Synthetic rollback-only administrative lifecycle test');
 update public.user_profiles set is_admin=true where id=outsider_id;
end $$;

create function pg_temp.sec04_denied() returns void language plpgsql as $$
declare statement text;
begin
 if public.check_is_admin() or public.is_admin() then raise exception 'sec04_unauthorized_admin_predicate';end if;
 foreach statement in array array[
  'select public.admin_operational_briefing()',
  'select public.admin_product_analytics(30)',
  'select public.admin_workflow_overview()',
  'select public.admin_incident_state(''999900004004'')',
  'select public.admin_triage_incident(''999900004004'',0,''investigating'',''Synthetic denied incident change'')',
  'select public.admin_list_people()',
  'select public.admin_security_overview()',
  'select public.admin_brand_migration_status()',
  'select public.admin_support_queue(null,1)',
  'select public.admin_intelligence_overview(''decision'',1)',
  'select public.admin_verification_queue(null,null,1)'
 ] loop
  begin execute statement;raise exception 'sec04_privileged_call_allowed: %',statement;
  exception when insufficient_privilege then null;end;
 end loop;
end $$;

set local role authenticated;
do $$
declare op uuid:=current_setting('qa.sec04_operator')::uuid; outsider uuid:=current_setting('qa.sec04_outsider')::uuid; status jsonb;
begin
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated','aal','aal2')::text,true);
 perform pg_temp.sec04_denied();
 perform set_config('request.jwt.claim.sub',op::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',op,'role','authenticated','aal','aal1')::text,true);
 perform pg_temp.sec04_denied();
 status:=public.admin_access_status();
 if status->>'authorized'<>'false' or status->>'eligible'<>'true' or status->>'mfa_required'<>'true' then raise exception 'sec04_mfa_enrollment_status';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',op,'role','authenticated')::text,true);
 perform pg_temp.sec04_denied();
 perform set_config('request.jwt.claims',jsonb_build_object('sub',op,'role','authenticated','aal','invalid')::text,true);
 perform pg_temp.sec04_denied();
 perform set_config('request.jwt.claims',jsonb_build_object('sub',op,'role','authenticated','aal','aal2')::text,true);
 if not public.check_is_admin() then raise exception 'sec04_active_aal2_rejected';end if;
 if public.admin_operational_briefing()->>'schema_version'<>'1' then raise exception 'sec04_briefing_lost';end if;
 if public.admin_product_analytics(30)->>'schema_version'<>'1' then raise exception 'sec04_analytics_lost';end if;
 if public.admin_triage_incident('999900004004',0,'investigating','Synthetic legitimate incident change')->>'revision'<>'1' then raise exception 'sec04_legitimate_write_lost';end if;
end $$;
reset role;
update public.user_profiles set is_active=false where id=current_setting('qa.sec04_operator')::uuid;
set local role authenticated;
do $$begin
 perform pg_temp.sec04_denied();
 begin perform public.admin_access_status();raise exception 'sec04_inactive_status_allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 if (select count(*) from private.admin_incident_events where issue_id='999900004004')<>1 then raise exception 'sec04_denied_mutation_created_event';end if;
end $$;
update public.user_profiles set is_active=true where id=current_setting('qa.sec04_operator')::uuid;
update private.admin_operators set role='auditor' where user_id=current_setting('qa.sec04_operator')::uuid;
set local role authenticated;
do $$begin
 if not public.check_is_admin() or public.admin_operational_briefing()->>'schema_version'<>'1' then raise exception 'sec04_auditor_read_lost';end if;
 begin perform public.admin_triage_incident('999900004004',1,'closed','Synthetic auditor write denied');raise exception 'sec04_auditor_write_allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
update private.admin_operators set revoked_at=now() where user_id=current_setting('qa.sec04_operator')::uuid;
set local role authenticated;
do $$begin perform pg_temp.sec04_denied();end $$;
reset role;
-- A separate synthetic patient identity has no professional verification
-- history. Preserve the operator's history while testing a missing profile.
do $$declare missing_id uuid:=gen_random_uuid();begin
 perform set_config('qa.sec04_missing',missing_id::text,true);
 insert into auth.users(id,aud,role,email,raw_user_meta_data)
 values(missing_id,'authenticated','authenticated','sec04-'||missing_id||'@example.invalid','{"name":"Synthetic missing profile","user_type":"patient"}');
 delete from public.user_profiles where id=missing_id;
 insert into private.admin_operators(user_id,role,grant_reason) values(missing_id,'owner','Synthetic rollback-only missing profile test');
end $$;
set local role authenticated;
do $$declare missing_id uuid:=current_setting('qa.sec04_missing')::uuid;begin
 perform set_config('request.jwt.claim.sub',missing_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',missing_id,'role','authenticated','aal','aal2')::text,true);
 perform pg_temp.sec04_denied();
end $$;
reset role;
rollback;

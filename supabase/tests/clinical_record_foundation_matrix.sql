begin;

-- Fixed C1 identities and episodes.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000042','authenticated','authenticated','former-c1@example.invalid','x',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000043','authenticated','authenticated','unrelated-c1@example.invalid','x',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000044','authenticated','authenticated','student-c1@example.invalid','x',now(),'{}','{"user_type":"nutritionist"}',now(),now());
-- Auth creates this profile first; configure the synthetic actor without disabling its trigger.
insert into public.user_profiles (id,name,user_type,is_admin,is_active) values
('10000000-0000-0000-0000-000000000042','Former C1','nutritionist',false,true),
('10000000-0000-0000-0000-000000000043','Unrelated C1','nutritionist',false,true),
('10000000-0000-0000-0000-000000000044','Student C1','nutritionist',false,true)
on conflict (id) do update set
  name=excluded.name,
  user_type=excluded.user_type,
  is_admin=excluded.is_admin,
  is_active=excluded.is_active;
insert into public.professional_verifications(user_id,professional_role,status,verification_method,valid_until,decision_reason) values
('10000000-0000-0000-0000-000000000042','nutritionist','approved','official_registry_manual',now()+interval '1 year','matrix'),
('10000000-0000-0000-0000-000000000043','nutritionist','approved','official_registry_manual',now()+interval '1 year','matrix'),
('10000000-0000-0000-0000-000000000044','student','approved','student_document_manual',now()+interval '1 year','matrix')
on conflict (user_id) do update set
  professional_role=excluded.professional_role,status=excluded.status,
  verification_method=excluded.verification_method,valid_until=excluded.valid_until,
  decision_reason=excluded.decision_reason;
insert into public.care_episodes(id,patient_id,nutritionist_id,status,started_at,ended_at,start_reason,end_reason,started_by,ended_by) values
('40000000-0000-0000-0000-000000000041','20000000-0000-0000-0000-000000000041','10000000-0000-0000-0000-000000000042','ended',now()-interval '1 year',now()-interval '6 months','started','ended','10000000-0000-0000-0000-000000000042','10000000-0000-0000-0000-000000000042'),
('40000000-0000-0000-0000-000000000043','20000000-0000-0000-0000-000000000041','10000000-0000-0000-0000-000000000041','active',now()-interval '1 month',null,'started',null,'10000000-0000-0000-0000-000000000041',null);
insert into public.clinical_records(id,patient_id,care_episode_id,nutritionist_id,author_id,record_type,status,visibility,content,template_code,template_version) values
('70000000-0000-0000-0000-000000000041','20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000041','10000000-0000-0000-0000-000000000042','10000000-0000-0000-0000-000000000042','clinical_evolution','signed','shared_with_patient','{"episode":"previous"}',(select template_code from public.clinical_evolution_template_versions order by template_code,version limit 1),(select version from public.clinical_evolution_template_versions order by template_code,version limit 1)),
('70000000-0000-0000-0000-000000000043','20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043','10000000-0000-0000-0000-000000000041','10000000-0000-0000-0000-000000000041','clinical_evolution','signed','shared_with_patient','{"episode":"current"}',(select template_code from public.clinical_evolution_template_versions order by template_code,version limit 1),(select version from public.clinical_evolution_template_versions order by template_code,version limit 1));
insert into public.clinical_records(id,patient_id,care_episode_id,nutritionist_id,author_id,record_type,status,visibility,content,template_code,template_version) values
('70000000-0000-0000-0000-000000000044','20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043','10000000-0000-0000-0000-000000000041','10000000-0000-0000-0000-000000000041','clinical_evolution','signed','professional_private','{"visibility":"private"}',(select template_code from public.clinical_evolution_template_versions order by template_code,version limit 1),(select version from public.clinical_evolution_template_versions order by template_code,version limit 1)),
('70000000-0000-0000-0000-000000000045','20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043','10000000-0000-0000-0000-000000000041','10000000-0000-0000-0000-000000000041','clinical_evolution','signed','share_later','{"visibility":"later"}',(select template_code from public.clinical_evolution_template_versions order by template_code,version limit 1),(select version from public.clinical_evolution_template_versions order by template_code,version limit 1));
insert into public.patient_episode_legal_guardians(id,patient_id,care_episode_id,author_id,name,relationship,is_primary) values
('60000000-0000-0000-0000-000000000041','20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000041','10000000-0000-0000-0000-000000000042','Previous guardian','mother',true),
('60000000-0000-0000-0000-000000000043','20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043','10000000-0000-0000-0000-000000000041','Current guardian','father',true);
insert into public.legal_guardian_events(legal_guardian_id,from_status,to_status,actor_id,reason) values
('60000000-0000-0000-0000-000000000041',null,'active','10000000-0000-0000-0000-000000000042','seed'),
('60000000-0000-0000-0000-000000000043',null,'active','10000000-0000-0000-0000-000000000041','seed');

-- Surface, SECURITY DEFINER/search_path, grants and direct-table privileges.
do $$
declare sig text; tbl text; priv text; rejected boolean;
begin
  foreach sig in array array[
    'get_patient_record_foundation(uuid)','update_patient_progressive_profile(uuid,jsonb,text)',
    'list_patient_legal_guardians(uuid,uuid)','upsert_patient_legal_guardian(uuid,uuid,jsonb)',
    'revoke_patient_legal_guardian(uuid,text)','create_clinical_record_draft(uuid,text,timestamp with time zone,text)'] loop
    if to_regprocedure('public.'||sig) is null then raise exception 'rpc_missing: %',sig; end if;
    if not exists(select 1 from pg_proc p where p.oid=to_regprocedure('public.'||sig) and p.prosecdef
      and p.proconfig=array['search_path=""']) then raise exception 'rpc_not_hardened: %',sig; end if;
    if has_function_privilege('public','public.'||sig,'execute') or has_function_privilege('anon','public.'||sig,'execute')
      or not has_function_privilege('authenticated','public.'||sig,'execute') then raise exception 'rpc_grant_failed: %',sig; end if;
  end loop;
  foreach sig in array array['can_read_care_episode(uuid)','can_read_legal_guardian_event(uuid)','can_write_active_care_episode(uuid)','resolve_active_care_episode(uuid)'] loop
    if has_function_privilege('public','private.'||sig,'execute') or has_function_privilege('anon','private.'||sig,'execute') then raise exception 'helper_public_or_anon_execute: %',sig; end if;
    if sig='resolve_active_care_episode(uuid)' and has_function_privilege('authenticated','private.'||sig,'execute') then raise exception 'resolver_exposed'; end if;
    if sig<>'resolve_active_care_episode(uuid)' and not has_function_privilege('authenticated','private.'||sig,'execute') then raise exception 'policy_helper_not_executable'; end if;
  end loop;
  foreach tbl in array array['clinical_record_types','clinical_records','clinical_record_events','patient_profile_events','patient_episode_legal_guardians','legal_guardian_events'] loop
    foreach priv in array array['insert','update','delete','truncate','references','trigger'] loop
      if has_table_privilege('authenticated','public.'||tbl,priv) or has_table_privilege('anon','public.'||tbl,priv) then raise exception 'direct_mutation_grant: %.%',tbl,priv; end if;
    end loop;
    if has_table_privilege('anon','public.'||tbl,'select') then raise exception 'anon_table_read: %',tbl; end if;
  end loop;
  if has_table_privilege('authenticated','public.patient_episode_legal_guardians','select') then raise exception 'guardian_sensitive_table_direct_read'; end if;
  set local role anon;
  rejected:=false; begin perform public.get_patient_record_foundation('20000000-0000-0000-0000-000000000041'); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'anon_rpc_call_succeeded'; end if;
  rejected:=false; begin perform public.update_patient_progressive_profile('20000000-0000-0000-0000-000000000041','{"phone":"x"}','patient'); exception when insufficient_privilege then rejected:=true; end; if not rejected then raise exception 'anon_update_succeeded'; end if;
  rejected:=false; begin perform public.list_patient_legal_guardians('20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043'); exception when insufficient_privilege then rejected:=true; end; if not rejected then raise exception 'anon_list_succeeded'; end if;
  rejected:=false; begin perform public.upsert_patient_legal_guardian('20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043','{}'); exception when insufficient_privilege then rejected:=true; end; if not rejected then raise exception 'anon_upsert_succeeded'; end if;
  rejected:=false; begin perform public.revoke_patient_legal_guardian('60000000-0000-0000-0000-000000000043','x'); exception when insufficient_privilege then rejected:=true; end; if not rejected then raise exception 'anon_revoke_succeeded'; end if;
  rejected:=false; begin perform public.create_clinical_record_draft('20000000-0000-0000-0000-000000000041','follow_up',now(),'professional_private'); exception when insufficient_privilege then rejected:=true; end; if not rejected then raise exception 'anon_draft_succeeded'; end if;
  reset role;
end $$;

-- Explicit 6 RPC x 8 actor matrix. expect_* columns are the executable contract.
create temporary table c1_actor_matrix(actor text,uid uuid,episode uuid,supervision text,
  expect_get boolean,expect_update boolean,expect_list boolean,expect_upsert boolean,expect_revoke boolean,expect_draft boolean) on commit drop;
insert into c1_actor_matrix values
('current','10000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043','none',true,true,true,true,true,true),
('previous','10000000-0000-0000-0000-000000000042','40000000-0000-0000-0000-000000000041','none',true,false,true,false,false,false),
('unrelated','10000000-0000-0000-0000-000000000043','40000000-0000-0000-0000-000000000043','none',false,false,false,false,false,false),
('patient','20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043','none',true,true,true,false,false,false),
('admin','30000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043','none',false,false,false,false,false,false),
('student_unsupervised','10000000-0000-0000-0000-000000000044','40000000-0000-0000-0000-000000000043','none',false,false,false,false,false,false),
('student_wrong_supervisor','10000000-0000-0000-0000-000000000044','40000000-0000-0000-0000-000000000043','wrong',false,false,false,false,false,false),
-- Current B4 contract: supervision does not transfer ownership of the supervisor's episode.
-- The positive student-owned episode lifecycle is exercised by clinical_evolution_system_matrix.
('student_supervised','10000000-0000-0000-0000-000000000044','40000000-0000-0000-0000-000000000043','matching',false,false,false,false,false,false);

do $$
declare a record; rejected boolean; got boolean; guardian uuid; result jsonb; keys text[]; before_count integer; after_count integer; event_count integer;
begin
 for a in select * from c1_actor_matrix loop
  delete from public.student_supervisions where student_id='10000000-0000-0000-0000-000000000044';
  if a.supervision='wrong' then insert into public.student_supervisions(student_id,supervisor_id,status,requested_at,responded_at,started_at)
    values(a.uid,'10000000-0000-0000-0000-000000000043','active',now(),now(),now());
  elsif a.supervision='matching' then insert into public.student_supervisions(student_id,supervisor_id,status,requested_at,responded_at,started_at)
    values(a.uid,'10000000-0000-0000-0000-000000000041','active',now(),now(),now()); end if;
  insert into public.patient_episode_legal_guardians(patient_id,care_episode_id,author_id,name,relationship,is_primary)
    values('20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043','10000000-0000-0000-0000-000000000041','Revocable '||a.actor,'other',false) returning id into guardian;
  set local role authenticated; perform set_config('request.jwt.claim.sub',a.uid::text,true);

  got:=true; begin result:=public.get_patient_record_foundation('20000000-0000-0000-0000-000000000041'); exception when insufficient_privilege then got:=false; end;
  if got<>a.expect_get then raise exception 'actor_rpc_mismatch: % get expected % got %',a.actor,a.expect_get,got; end if;
  if got then
    select array_agg(k order by k) into keys from jsonb_object_keys(result->'patient') k;
    if keys<>array['address','birth_date','civil_status','email','gender','id','name','occupation','phone'] then raise exception 'foundation_projection_not_positive'; end if;
    if result->>'viewed_episode_id' is distinct from a.episode::text or result->>'viewed_episode_status' is distinct from (case when a.actor='previous' then 'ended' else 'active' end) then raise exception 'viewed_episode_contract_failed: % %',a.actor,result; end if;
    if a.actor in ('current','student_supervised') and (result->>'writable_episode_id' is distinct from a.episode::text or result->>'can_write' is distinct from 'true') then raise exception 'writable_episode_contract_failed: % %',a.actor,result; end if;
    if a.actor in ('previous','patient') and (result->'writable_episode_id' is distinct from 'null'::jsonb or result->>'can_write' is distinct from 'false') then raise exception 'read_only_actor_received_write_contract: % %',a.actor,result; end if;
    if a.actor in ('current','student_supervised') and (not jsonb_path_exists(result,'$.records[*] ? (@.id == "70000000-0000-0000-0000-000000000044")')
      or not jsonb_path_exists(result,'$.records[*] ? (@.id == "70000000-0000-0000-0000-000000000045")')) then raise exception 'professional_visibility_projection_failed: %',a.actor; end if;
    if a.actor='previous' and jsonb_array_length(result->'records')<>1 then raise exception 'previous_read_other_episode'; end if;
    -- The patient projection intentionally omits internal episode identifiers.
    if a.actor='patient' and (jsonb_array_length(result->'records')<>2 or not jsonb_path_exists(result,'$.records[*] ? (@.id == "70000000-0000-0000-0000-000000000041")')
      or not jsonb_path_exists(result,'$.records[*] ? (@.id == "70000000-0000-0000-0000-000000000043")')) then raise exception 'patient_missing_own_records'; end if;
    if a.actor='patient' and exists(select 1 from jsonb_array_elements(result->'records') r where r ?| array['care_episode_id','author_id','nutritionist_id','canonical_hash']) then raise exception 'patient_internal_fields_leaked';end if;
    if a.actor='patient' and jsonb_path_exists(result,'$.records[*] ? (@.visibility != "shared_with_patient")') then raise exception 'patient_received_private_record'; end if;
  end if;
  select count(*) into event_count from public.legal_guardian_events;
  if (a.expect_get and event_count=0) or (not a.expect_get and event_count<>0) then raise exception 'actor_guardian_event_read_mismatch: % count %',a.actor,event_count; end if;
  if a.actor='patient' then
    got:=true; begin perform public.update_patient_progressive_profile('20000000-0000-0000-0000-000000000041',jsonb_build_object('phone','85'||a.actor),'patient'); exception when insufficient_privilege then got:=false; end;
  else
    rejected:=false; begin perform public.update_patient_progressive_profile('20000000-0000-0000-0000-000000000041',jsonb_build_object('phone','forged-'||a.actor),'patient'); exception when insufficient_privilege then rejected:=true; end;
    if not rejected then raise exception 'professional_forged_patient_source: %',a.actor; end if;
    got:=true; begin perform public.update_patient_progressive_profile('20000000-0000-0000-0000-000000000041',jsonb_build_object('phone','85'||a.actor),'nutritionist'); exception when insufficient_privilege then got:=false; end;
  end if;
  if got<>a.expect_update then raise exception 'actor_rpc_mismatch: % update expected % got %',a.actor,a.expect_update,got; end if;
  got:=true; begin perform public.list_patient_legal_guardians('20000000-0000-0000-0000-000000000041',a.episode); exception when insufficient_privilege then got:=false; end;
  if got<>a.expect_list then raise exception 'actor_rpc_mismatch: % list expected % got %',a.actor,a.expect_list,got; end if;
  reset role; select count(*) into before_count from public.legal_guardian_events; set local role authenticated; perform set_config('request.jwt.claim.sub',a.uid::text,true);
  got:=true; begin result:=public.upsert_patient_legal_guardian('20000000-0000-0000-0000-000000000041',a.episode,jsonb_build_object('name','New '||a.actor,'relationship','other','reason','matrix replacement')); exception when insufficient_privilege then got:=false; end;
  if got<>a.expect_upsert then raise exception 'actor_rpc_mismatch: % upsert expected % got %',a.actor,a.expect_upsert,got; end if;
  if got then reset role; select count(*) into after_count from public.legal_guardian_events; if after_count<>before_count+2 then raise exception 'guardian_create_replace_events_missing: %',a.actor; end if; set local role authenticated; perform set_config('request.jwt.claim.sub',a.uid::text,true); end if;
  reset role; select count(*) into before_count from public.legal_guardian_events; set local role authenticated; perform set_config('request.jwt.claim.sub',a.uid::text,true);
  got:=true; begin result:=public.revoke_patient_legal_guardian(guardian,'matrix revocation'); exception when insufficient_privilege then got:=false; end;
  if got<>a.expect_revoke then raise exception 'actor_rpc_mismatch: % revoke expected % got %',a.actor,a.expect_revoke,got; end if;
  if got then reset role; select count(*) into after_count from public.legal_guardian_events; if after_count<>before_count+1 or result->>'status'<>'revoked' then raise exception 'guardian_revoke_transition_missing: %',a.actor; end if; set local role authenticated; perform set_config('request.jwt.claim.sub',a.uid::text,true); end if;
  reset role; select count(*) into before_count from public.clinical_record_events; set local role authenticated; perform set_config('request.jwt.claim.sub',a.uid::text,true);
  got:=true; begin result:=public.create_clinical_record_draft('20000000-0000-0000-0000-000000000041','follow_up',now(),'professional_private'); exception when insufficient_privilege then got:=false; end;
  if got<>a.expect_draft then raise exception 'actor_rpc_mismatch: % draft expected % got %',a.actor,a.expect_draft,got; end if;
  if got then
    reset role; select count(*) into after_count from public.clinical_record_events;
    if after_count<>before_count+1 or result->>'care_episode_id'<>'40000000-0000-0000-0000-000000000043' or result->>'nutritionist_id'<>'10000000-0000-0000-0000-000000000041' then raise exception 'draft_effect_missing: %',a.actor; end if;
    if a.actor='student_supervised' and (result->>'student_id'<>a.uid::text or result->>'supervisor_id'<>'10000000-0000-0000-0000-000000000041') then raise exception 'student_draft_attribution_missing'; end if;
    set local role authenticated; perform set_config('request.jwt.claim.sub',a.uid::text,true);
  end if;
  reset role;
 end loop;
end $$;

-- Required negative invariants and immutable event trails.
do $$ declare rejected boolean; forbidden_field text; target_id uuid; result jsonb; begin
 set local role authenticated; perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000041',true);
 foreach forbidden_field in array array['weight','height','goal','observations','clinical_flags','nutritionist_id','user_type','is_admin','crn','unknown'] loop
  rejected:=false; begin perform public.update_patient_progressive_profile('20000000-0000-0000-0000-000000000041',jsonb_build_object(forbidden_field,'forbidden'),'nutritionist'); exception when invalid_parameter_value then rejected:=true; end;
  if not rejected then raise exception 'professional_field_accepted: %',forbidden_field; end if;
 end loop;
 rejected:=false; begin perform public.update_patient_progressive_profile('20000000-0000-0000-0000-000000000041','{"name":""}','nutritionist'); exception when check_violation then rejected:=true; end; if not rejected then raise exception 'empty_name_accepted'; end if;
 rejected:=false; begin perform public.upsert_patient_legal_guardian('20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043','{"name":"CPF","relationship":"other","cpf_last4":"1234"}'); exception when invalid_parameter_value then rejected:=true; end; if not rejected then raise exception 'cpf_accepted_without_hmac'; end if;
 reset role; update public.patient_episode_legal_guardians set valid_from=now()+interval '2 days' where care_episode_id='40000000-0000-0000-0000-000000000043' and status='active'; set local role authenticated; perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000041',true);
 result:=public.upsert_patient_legal_guardian('20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043','{"name":"Period","relationship":"mother","reason":"matrix period replacement","valid_from":"2026-07-12","valid_until":"2027-07-12","contact":{"phone":"85999999999","email":"guardian@example.invalid"},"consent":{"recorded":true,"version":"v1","recorded_at":"2026-07-12T10:00:00Z","evidence":"term-reference"}}');
 reset role;
 if exists(select 1 from public.patient_episode_legal_guardians g where g.care_episode_id='40000000-0000-0000-0000-000000000043' and g.status='replaced' and g.valid_until<g.valid_from) then raise exception 'future_guardian_replacement_period_invalid'; end if;
 if not exists(select 1 from public.legal_guardian_events e join public.patient_episode_legal_guardians g on g.id=e.legal_guardian_id where g.care_episode_id='40000000-0000-0000-0000-000000000043' and e.to_status='replaced' and (e.metadata->>'valid_until')::timestamptz>=g.valid_from) then raise exception 'future_guardian_replacement_event_metadata_invalid'; end if;
 if result->>'valid_from' not like '2026-07-12%' or result->>'valid_until' not like '2027-07-12%' or result#>>'{consent,recorded}'<>'true' then raise exception 'guardian_period_consent_not_persisted: %',result; end if;
 if not exists(select 1 from public.legal_guardian_events e where e.legal_guardian_id=(result->>'id')::uuid and e.metadata#>>'{consent,recorded}'='true') then raise exception 'guardian_period_consent_event_missing'; end if;
 if result#>>'{contact,email}'<>'guardian@example.invalid' or result#>>'{consent,version}'<>'v1' then raise exception 'guardian_contact_or_consent_evidence_missing'; end if;
 if exists(select 1 from public.legal_guardian_events e where e.legal_guardian_id=(result->>'id')::uuid and (e.metadata::text like '%guardian@example.invalid%' or e.metadata::text like '%term-reference%')) then raise exception 'guardian_event_leaked_contact_or_evidence'; end if;
 set local role authenticated; perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000041',true);
 rejected:=false; begin perform public.upsert_patient_legal_guardian('20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043','{"name":"Missing reason","relationship":"other"}'); exception when invalid_parameter_value then rejected:=true; end; if not rejected then raise exception 'replacement_without_reason_accepted'; end if;
 rejected:=false; begin perform public.revoke_patient_legal_guardian((result->>'id')::uuid,''); exception when invalid_parameter_value then rejected:=true; end; if not rejected then raise exception 'revocation_without_reason_accepted'; end if;
 rejected:=false; begin perform public.upsert_patient_legal_guardian('20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043','{"name":"Bad consent","relationship":"other","reason":"replace","consent":{"recorded":true}}'); exception when invalid_parameter_value then rejected:=true; end; if not rejected then raise exception 'incomplete_recorded_consent_accepted'; end if;
 rejected:=false; begin perform public.upsert_patient_legal_guardian('20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043','{"name":"Nested CPF","relationship":"other","reason":"replace","contact":{"cpf":"123"}}'); exception when invalid_parameter_value then rejected:=true; end; if not rejected then raise exception 'nested_cpf_accepted'; end if;
 rejected:=false; begin perform public.upsert_patient_legal_guardian('20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043','{"name":"Extra","relationship":"other","reason":"replace","contact":{"phone":"1","nickname":"x"}}'); exception when invalid_parameter_value then rejected:=true; end; if not rejected then raise exception 'guardian_extra_key_accepted'; end if;
 rejected:=false; begin perform public.upsert_patient_legal_guardian('20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043',jsonb_build_object('name','Oversized','relationship','other','reason','replace','contact',jsonb_build_object('phone',repeat('1',33)))); exception when invalid_parameter_value then rejected:=true; end; if not rejected then raise exception 'guardian_oversized_contact_accepted'; end if;
 result:=public.upsert_patient_legal_guardian('20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043','{"name":"No Dates","relationship":"mother","reason":"valid replacement"}');
 if result->>'valid_from' is null or result->'valid_until'<>'null'::jsonb then raise exception 'guardian_omitted_dates_default_failed: %',result; end if;
 target_id:=(result->>'id')::uuid;
 foreach result in array array[
   '{"name":{},"relationship":"mother","reason":"valid reason"}'::jsonb,
   '{"name":"Valid name","relationship":2,"reason":"valid reason"}'::jsonb,
   '{"name":"Valid name","relationship":"mother","reason":null}'::jsonb,
   '{"name":"Valid name","relationship":"mother","reason":{},"valid_from":"2026-07-12"}'::jsonb,
   '{"name":"Valid name","relationship":"mother","reason":"valid reason","valid_from":2}'::jsonb,
   '{"name":"Valid name","relationship":"mother","reason":"valid reason","valid_until":[]}'::jsonb,
   '{"name":"Valid name","relationship":"mother","reason":"valid reason","is_primary":"true"}'::jsonb,
   jsonb_build_object('name','A','relationship','mother','reason','valid reason'),
   jsonb_build_object('name',repeat('n',161),'relationship','mother','reason','valid reason'),
   jsonb_build_object('name','Valid name','relationship','x','reason','valid reason'),
   jsonb_build_object('name','Valid name','relationship',repeat('r',81),'reason','valid reason'),
   jsonb_build_object('name','Valid name','relationship','mother','reason','tiny'),
   jsonb_build_object('name','Valid name','relationship','mother','reason',repeat('r',501)),
   jsonb_build_object('name','Valid name','relationship','mother','reason','valid reason','contact',jsonb_build_object('phone',repeat('1',31))),
   jsonb_build_object('name','Valid name','relationship','mother','reason','valid reason','contact',jsonb_build_object('email','not-an-email')),
   jsonb_build_object('name','Valid name','relationship','mother','reason','valid reason','consent',jsonb_build_object('recorded',true,'version',repeat('v',81),'recorded_at','2026-07-12T10:00:00Z','evidence','ref')),
   jsonb_build_object('name','Valid name','relationship','mother','reason','valid reason','consent',jsonb_build_object('recorded',true,'version','v1','recorded_at','2026-07-12T10:00:00Z','evidence',repeat('e',501)))
 ] loop
   rejected:=false; begin perform public.upsert_patient_legal_guardian('20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043',result); exception when invalid_parameter_value then rejected:=true; when others then raise exception 'guardian_validation_leaked_generic_error: payload %, state %, message %',result,sqlstate,sqlerrm; end;
   if not rejected then raise exception 'guardian_invalid_boundary_accepted: %',result; end if;
 end loop;
 rejected:=false; begin perform public.revoke_patient_legal_guardian(target_id,'tiny'); exception when invalid_parameter_value then rejected:=true; end; if not rejected then raise exception 'short_revocation_reason_accepted'; end if;
 rejected:=false; begin perform public.revoke_patient_legal_guardian(target_id,repeat('r',501)); exception when invalid_parameter_value then rejected:=true; end; if not rejected then raise exception 'oversized_revocation_reason_accepted'; end if;
 set local role authenticated; perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000041',true);
 rejected:=false; begin perform public.upsert_patient_legal_guardian('20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000043','{"name":"Invalid","relationship":"other","reason":"invalid period","valid_from":"2027-07-12","valid_until":"2026-07-12"}'); exception when invalid_parameter_value then rejected:=true; end; if not rejected then raise exception 'invalid_guardian_period_accepted'; end if;
 rejected:=false; begin perform public.create_clinical_record_draft('20000000-0000-0000-0000-000000000041','follow_up',now()-interval '6 minutes','professional_private'); exception when invalid_parameter_value then rejected:=true; end; if not rejected then raise exception 'retrospective_without_reason'; end if;
 rejected:=false; begin perform public.upsert_patient_legal_guardian('20000000-0000-0000-0000-000000000041','40000000-0000-0000-0000-000000000041','{"name":"Old","relationship":"other","reason":"x"}'); exception when insufficient_privilege then rejected:=true; end; if not rejected then raise exception 'active_professional_wrote_previous_episode'; end if;
 rejected:=false; begin perform public.upsert_patient_legal_guardian('20000000-0000-0000-0000-000000000041','49999999-0000-0000-0000-000000000099','{"name":"Alien","relationship":"other","reason":"x"}'); exception when insufficient_privilege then rejected:=true; end; if not rejected then raise exception 'active_professional_wrote_unrelated_episode_uuid'; end if;
 reset role;
 select id into target_id from public.patient_profile_events limit 1; if target_id is null then raise exception 'profile_event_fixture_missing'; end if;
 rejected:=false; begin update public.patient_profile_events set new_value='null' where id=target_id; exception when raise_exception then rejected:=true; end; if not rejected then raise exception 'profile_event_update_allowed'; end if;
 rejected:=false; begin delete from public.patient_profile_events where id=target_id; exception when raise_exception then rejected:=true; end; if not rejected then raise exception 'profile_event_delete_allowed'; end if;
 select id into target_id from public.clinical_record_events limit 1; if target_id is null then raise exception 'record_event_fixture_missing'; end if;
 rejected:=false; begin update public.clinical_record_events set reason='x' where id=target_id; exception when raise_exception then rejected:=true; end; if not rejected then raise exception 'record_event_update_allowed'; end if;
 rejected:=false; begin delete from public.clinical_record_events where id=target_id; exception when raise_exception then rejected:=true; end; if not rejected then raise exception 'record_event_delete_allowed'; end if;
 select id into target_id from public.legal_guardian_events limit 1; if target_id is null then raise exception 'guardian_event_fixture_missing'; end if;
 rejected:=false; begin update public.legal_guardian_events set reason='x' where id=target_id; exception when raise_exception then rejected:=true; end; if not rejected then raise exception 'guardian_event_update_allowed'; end if;
 rejected:=false; begin delete from public.legal_guardian_events where id=target_id; exception when raise_exception then rejected:=true; end; if not rejected then raise exception 'guardian_event_delete_allowed'; end if;
 rejected:=false; begin update public.clinical_records set record_type='follow_up' where id='70000000-0000-0000-0000-000000000043'; exception when check_violation then if sqlerrm <> 'finalized_record_content_immutable' then raise; end if; rejected:=true; end; if not rejected then raise exception 'record_type_update_allowed'; end if;
 rejected:=false; begin delete from public.clinical_records where id='70000000-0000-0000-0000-000000000043'; exception when raise_exception then rejected:=true; end; if not rejected then raise exception 'clinical_record_hard_delete_allowed'; end if;
 select id into target_id from public.patient_episode_legal_guardians limit 1;
 rejected:=false; begin delete from public.patient_episode_legal_guardians where id=target_id; exception when raise_exception then rejected:=true; end; if not rejected then raise exception 'guardian_hard_delete_allowed'; end if;
end $$;

rollback;

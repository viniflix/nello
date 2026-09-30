begin;

-- C3 contract matrix. The runner applies B0-C2 first and owns the personas.

-- 1. Hardened, least-privilege RPC surface (first expected RED) -------------

do $$
declare
  v_sig constant text := 'public.list_patient_timeline(uuid,uuid,text,timestamp with time zone,text,integer)';
  v_definition text;
  v_result text;
  v_lifecycle_sig text;
begin
  if to_regprocedure(v_sig) is null then
    raise exception 'rpc_missing: %', v_sig;
  end if;

  select pg_get_functiondef(to_regprocedure(v_sig)),
         pg_get_function_result(to_regprocedure(v_sig))
    into v_definition,v_result;

  if not exists (
    select 1 from pg_proc p
    where p.oid=to_regprocedure(v_sig)
      and p.prosecdef
      and p.proconfig=array['search_path=""']
      and p.provolatile='s'
  ) then
    raise exception 'timeline_rpc_not_hardened_stable';
  end if;

  if has_function_privilege('public',v_sig,'execute')
    or has_function_privilege('anon',v_sig,'execute')
    or not has_function_privilege('authenticated',v_sig,'execute') then
    raise exception 'timeline_rpc_grant_failed';
  end if;

  if v_result <> 'TABLE(event_id text, source_id text, source_type text, category text, subtype text, title text, summary text, occurred_at timestamp with time zone, status text, is_legacy boolean)' then
    raise exception 'timeline_result_contract_changed: %',v_result;
  end if;

  if lower(v_definition) ~ '\m(content|notes|public_access_token|token_expires_at|daily_calories|daily_protein|daily_carbs|daily_fat|price|amount|charge|billing|snapshot|raw)\M' then
    raise exception 'timeline_definition_references_forbidden_payload';
  end if;

  foreach v_lifecycle_sig in array array[
    'public.create_clinical_evolution_draft(uuid,uuid,text,timestamp with time zone,text,text)',
    'public.sign_clinical_record(uuid)'
  ] loop
    if to_regprocedure(v_lifecycle_sig) is null or not exists(
      select 1 from pg_proc p
      where p.oid=to_regprocedure(v_lifecycle_sig)
        and p.prosecdef
        and p.proconfig=array['search_path=""']
    ) then
      raise exception 'post_c3_lifecycle_rpc_not_hardened: %',v_lifecycle_sig;
    end if;
    if has_function_privilege('public',v_lifecycle_sig,'execute')
      or has_function_privilege('anon',v_lifecycle_sig,'execute')
      or not has_function_privilege('authenticated',v_lifecycle_sig,'execute')
      or not has_function_privilege('service_role',v_lifecycle_sig,'execute') then
      raise exception 'post_c3_lifecycle_rpc_grant_failed: %',v_lifecycle_sig;
    end if;
  end loop;

  if not exists(
    select 1 from pg_proc p
    where p.oid=to_regprocedure('private.can_write_active_care_episode(uuid)')
      and p.provolatile='s'
      and p.prosecdef
      and p.proconfig=array['search_path=""']
  ) then
    raise exception 'readable_write_predicate_must_remain_stable';
  end if;

  select pg_get_functiondef(to_regprocedure('private.lock_and_can_write_active_care_episode(uuid)'))
    into v_definition;
  if not exists(
    select 1 from pg_proc p
    where p.oid=to_regprocedure('private.lock_and_can_write_active_care_episode(uuid)')
      and p.provolatile='v'
      and p.prosecdef
      and p.proconfig=array['search_path=""']
  ) or v_definition !~* 'care_episodes[\s\S]*for[[:space:]]+share'
    or v_definition !~* 'student_supervisions[\s\S]*for[[:space:]]+share'
    or v_definition !~* 'professional_verifications[\s\S]*for[[:space:]]+share' then
    raise exception 'write_gate_must_lock_episode_supervision_and_verification';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.clinical_records'::regclass
      and tgname='trg_clinical_records_write_lock'
      and not tgisinternal
  ) then
    raise exception 'clinical_record_write_lock_trigger_missing';
  end if;

  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000051',true);
  perform public.get_patient_record_foundation('20000000-0000-0000-0000-000000000051');
  perform set_config('request.jwt.claim.sub','',true);

  raise notice 'PASS: C3 RPC surface is hardened and minimal';
end $$;

-- 2. C2 lifecycle remains valid on the canonical B4 student episode --------

do $$
declare
  v_record jsonb;
  v_id uuid;
  v_revision bigint;
  v_event_count integer;
begin
  -- Preserve the ordinary verified-nutritionist branch.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000051',true);
  v_record:=public.create_clinical_evolution_draft(
    '20000000-0000-0000-0000-000000000051',
    '40000000-0000-0000-0000-000000000052',
    'nello_standard',now(),'professional_private',null
  );
  if v_record->>'nutritionist_id'<>'10000000-0000-0000-0000-000000000051'
    or v_record->>'author_id'<>'10000000-0000-0000-0000-000000000051'
    or v_record->>'student_id' is not null
    or v_record->>'supervisor_id' is not null then
    raise exception 'regular_nutritionist_authorship_changed: %',v_record;
  end if;
  reset role;

  -- Preserve test-drive creation/finalization, but never mint a professional
  -- signature for an unverified simulation owner.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000055',true);
  v_record:=public.create_clinical_evolution_draft(
    '20000000-0000-0000-0000-000000000056',
    '40000000-0000-0000-0000-000000000055',
    'nello_standard',now(),'professional_private',null
  );
  v_id:=(v_record->>'id')::uuid;
  v_record:=public.update_clinical_record_draft(
    v_id,'{"conduct":"Registro simulado"}'::jsonb,'professional_private',
    (v_record->>'revision')::bigint
  );
  v_record:=public.finalize_clinical_record(
    v_id,'{"conduct":"Registro simulado"}'::jsonb,(v_record->>'revision')::bigint,null
  );
  begin
    perform public.sign_clinical_record(v_id);
    raise exception 'unverified_simulation_owner_must_not_sign';
  exception when sqlstate '42501' then
    if sqlerrm not like '%verified_professional_required%' then raise; end if;
  end;
  reset role;

  -- A supervisor may review, finalize and sign, but cannot impersonate the
  -- student as the author of a new draft.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000051',true);
  begin
    perform public.create_clinical_evolution_draft(
      '20000000-0000-0000-0000-000000000052',
      '40000000-0000-0000-0000-000000000053',
      'nello_standard',now(),'professional_private',null
    );
    raise exception 'supervisor_must_not_create_as_student';
  exception when sqlstate '42501' then
    if sqlerrm not like '%student_required_to_create%' then raise; end if;
  end;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000054',true);
  v_record:=public.create_clinical_evolution_draft(
    '20000000-0000-0000-0000-000000000052',
    '40000000-0000-0000-0000-000000000053',
    'nello_standard',now(),'professional_private',null
  );
  v_id:=(v_record->>'id')::uuid;
  v_revision:=(v_record->>'revision')::bigint;
  if v_record->>'nutritionist_id'<>'10000000-0000-0000-0000-000000000054'
    or v_record->>'author_id'<>'10000000-0000-0000-0000-000000000054'
    or v_record->>'student_id'<>'10000000-0000-0000-0000-000000000054'
    or v_record->>'supervisor_id'<>'10000000-0000-0000-0000-000000000051' then
    raise exception 'canonical_student_authorship_not_persisted: %',v_record;
  end if;
  v_record:=public.update_clinical_record_draft(
    v_id,'{"conduct":"Evolução registrada pelo estudante"}'::jsonb,
    'professional_private',v_revision
  );
  v_revision:=(v_record->>'revision')::bigint;
  begin
    perform public.finalize_clinical_record(
      v_id,'{"conduct":"Evolução registrada pelo estudante"}'::jsonb,v_revision,null
    );
    raise exception 'student_must_not_finalize_canonical_episode';
  exception when sqlstate '42501' then
    if sqlerrm not like '%supervisor_required_to_finalize%' then raise; end if;
  end;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000051',true);
  v_record:=public.update_clinical_record_draft(
    v_id,'{"conduct":"Evolução revisada pelo supervisor"}'::jsonb,
    'professional_private',v_revision
  );
  v_record:=public.finalize_clinical_record(
    v_id,'{"conduct":"Evolução revisada pelo supervisor"}'::jsonb,
    (v_record->>'revision')::bigint,null
  );
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000054',true);
  begin
    perform public.sign_clinical_record(v_id);
    raise exception 'student_must_not_sign_after_supervisor_review';
  exception when sqlstate '42501' then
    if sqlerrm not like '%only_nutritionist_can_sign%' then raise; end if;
  end;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000051',true);
  v_record:=public.sign_clinical_record(v_id);
  if v_record->>'status'<>'signed' then
    raise exception 'canonical_student_evolution_must_be_signed_by_supervisor';
  end if;
  reset role; -- audit tables intentionally deny direct authenticated reads
  select count(*) into v_event_count
  from public.clinical_record_events e
  where e.clinical_record_id=v_id
    and e.from_status='finalized'
    and e.to_status='signed'
    and e.actor_id='10000000-0000-0000-0000-000000000051'
    and e.metadata->>'canonical_hash'=v_record->>'canonical_hash'
    and e.metadata->>'crn_number'='12345'
    and e.metadata->>'crn_region'='CRN-3';
  if v_event_count<>1 then
    raise exception 'supervisor_signature_audit_event_invalid: %',v_event_count;
  end if;
  set local role authenticated;
  begin
    perform public.sign_clinical_record(v_id);
    raise exception 'second_supervisor_signature_must_fail';
  exception when sqlstate '23514' then
    if sqlerrm not like '%only_finalized_records_can_be_signed%' then raise; end if;
  end;
  reset role;

  raise notice 'PASS: post-C3 C2 branches, authorship and signature audit are preserved';
end $$;

-- 3. Deterministic source fixtures ------------------------------------------

insert into public.clinical_records(
  id,patient_id,care_episode_id,nutritionist_id,author_id,record_type,status,
  visibility,encounter_at,recorded_at,content,template_code,template_version,
  canonical_hash,signed_at
) values
('51000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000052','10000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000051','clinical_evolution','signed','shared_with_patient','2026-07-14 10:00:00+00','2026-07-14 10:00:00+00','{"conduct":"SECRET_SHARED_CLINICAL_CONTENT"}','nello_standard',1,repeat('a',64),'2026-07-14 10:01:00+00'),
('51000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000052','10000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000051','clinical_evolution','finalized','professional_private','2026-07-14 09:00:00+00','2026-07-14 09:00:00+00','{"conduct":"SECRET_PRIVATE_CLINICAL_CONTENT"}','nello_standard',1,repeat('b',64),null),
('51000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000052','10000000-0000-0000-0000-000000000052','clinical_evolution','signed','shared_with_patient','2026-07-14 11:00:00+00','2026-07-14 11:00:00+00','{"conduct":"OTHER_EPISODE_SECRET"}','nello_standard',1,repeat('c',64),'2026-07-14 11:01:00+00'),
('51000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000052','40000000-0000-0000-0000-000000000053','10000000-0000-0000-0000-000000000054','10000000-0000-0000-0000-000000000054','clinical_evolution','signed','professional_private','2026-07-13 10:00:00+00','2026-07-13 10:00:00+00','{"conduct":"STUDENT_EPISODE_SECRET"}','nello_standard',1,repeat('d',64),'2026-07-13 10:01:00+00'),
('51000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000052','40000000-0000-0000-0000-000000000054','10000000-0000-0000-0000-000000000054','10000000-0000-0000-0000-000000000054','clinical_evolution','signed','professional_private','2026-05-13 10:00:00+00','2026-05-13 10:00:00+00','{"conduct":"ENDED_STUDENT_EPISODE_SECRET"}','nello_standard',1,repeat('e',64),'2026-05-13 10:01:00+00');

insert into public.anamnesis_records(
  id,patient_id,nutritionist_id,date,content,notes,status,created_at,updated_at,
  public_access_token,token_expires_at,filled_by,care_episode_id
) values
('52000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000051','2026-07-14','{"secret":"SECRET_ANAMNESIS_CONTENT"}','SECRET_ANAMNESIS_NOTES','validated','2026-07-14 08:00:00+00','2026-07-14 08:00:00+00','52000000-0000-0000-0000-000000000099','2026-07-15 08:00:00+00','nutritionist','40000000-0000-0000-0000-000000000052'),
('52000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000051','2026-07-14','{"secret":"SECRET_DRAFT_ANAMNESIS"}','SECRET_DRAFT_NOTES','draft','2026-07-14 07:00:00+00','2026-07-14 07:00:00+00',null,null,'nutritionist','40000000-0000-0000-0000-000000000052'),
('52000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000052','2026-07-14','{"secret":"OTHER_EPISODE_ANAMNESIS"}',null,'validated','2026-07-14 12:00:00+00','2026-07-14 12:00:00+00',null,null,'nutritionist','40000000-0000-0000-0000-000000000051');

insert into public.meal_plans(
  id,patient_id,nutritionist_id,name,description,is_active,is_draft,start_date,created_at,updated_at,
  daily_calories,daily_protein,daily_carbs,daily_fat,care_episode_id
) values
(530001,'20000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000051','Plano C3','SECRET_MEAL_PLAN_DESCRIPTION',true,false,null,null,'2026-07-14 06:00:00+00',999999,888888,777777,666666,'40000000-0000-0000-0000-000000000052'),
(530002,'20000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000051','Rascunho C3','SECRET_DRAFT_PLAN',true,true,'2026-07-14','2026-07-14 06:30:00+00','2026-07-14 06:30:00+00',1,2,3,4,'40000000-0000-0000-0000-000000000052'),
(530003,'20000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000052','Plano anterior','OTHER_EPISODE_PLAN',true,false,'2026-07-14','2026-07-14 13:00:00+00','2026-07-14 13:00:00+00',1,2,3,4,'40000000-0000-0000-0000-000000000051');

insert into public.appointments(
  id,nutritionist_id,patient_id,appointment_time,start_time,notes,status,duration,
  appointment_type,created_at,care_episode_id
) values
(540001,'10000000-0000-0000-0000-000000000051','20000000-0000-0000-0000-000000000051','2026-07-14 05:00:00+00','2026-07-14 05:00:00+00','SECRET_APPOINTMENT_NOTES','completed',60,'return','2026-07-01 05:00:00+00','40000000-0000-0000-0000-000000000052'),
(540002,'10000000-0000-0000-0000-000000000052','20000000-0000-0000-0000-000000000051','2026-07-14 14:00:00+00','2026-07-14 14:00:00+00','OTHER_EPISODE_APPOINTMENT','completed',60,'return','2026-07-01 05:00:00+00','40000000-0000-0000-0000-000000000051'),
(540003,'10000000-0000-0000-0000-000000000051','20000000-0000-0000-0000-000000000051','2026-07-14 10:00:00+00','2026-07-14 10:00:00+00','SAME_TIMESTAMP_APPOINTMENT','confirmed',45,'online','2026-07-01 05:00:00+00','40000000-0000-0000-0000-000000000052');

-- 4. Scope, exact episode and minimized projection --------------------------

do $$
declare
  v_clinical integer;
  v_operational integer;
  v_all integer;
  v_payload text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000051',true);

  select count(*) into v_clinical from public.list_patient_timeline(
    '20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000052','clinical',null,null,100
  );
  select count(*) into v_operational from public.list_patient_timeline(
    '20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000052','operational',null,null,100
  );
  select count(*) into v_all from public.list_patient_timeline(
    '20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000052','all',null,null,100
  );

  if v_clinical<>5 or v_operational<>3 or v_all<>8 then
    raise exception 'timeline_scope_counts_invalid: clinical %, operational %, all %',v_clinical,v_operational,v_all;
  end if;

  if exists(
    select 1 from public.list_patient_timeline(
      '20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000052','all',null,null,100
    ) where source_id in ('51000000-0000-0000-0000-000000000003','52000000-0000-0000-0000-000000000003','530003','540002')
  ) then
    raise exception 'timeline_leaked_other_episode';
  end if;

  if not exists(
    select 1 from public.list_patient_timeline(
      '20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000052','operational',null,null,100
    ) where source_id='530001' and occurred_at='1970-01-01 00:00:00+00'::timestamptz
  ) then
    raise exception 'timeline_missing_deterministic_legacy_date_fallback';
  end if;

  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb)::text into v_payload
  from public.list_patient_timeline(
    '20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000052','all',null,null,100
  ) t;
  if v_payload ~ '(SECRET_|999999|888888|777777|666666|52000000-0000-0000-0000-000000000099)' then
    raise exception 'timeline_projection_leaked_sensitive_payload: %',v_payload;
  end if;

  reset role;
  raise notice 'PASS: scopes, episode isolation and data minimization';
end $$;

-- 5. Patient projection excludes professional-private work -----------------

do $$
declare v_count integer; v_ids text[];
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000051',true);

  select count(*),array_agg(source_id order by source_id) into v_count,v_ids
  from public.list_patient_timeline(
    '20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000052','all',null,null,100
  );
  if v_count<>5 then
    raise exception 'patient_timeline_expected_5_visible_events_got_%',v_count;
  end if;
  if '51000000-0000-0000-0000-000000000002'=any(v_ids)
    or '52000000-0000-0000-0000-000000000002'=any(v_ids)
    or '530002'=any(v_ids) then
    raise exception 'patient_timeline_exposed_private_or_draft_work: %',v_ids;
  end if;
  if not ('51000000-0000-0000-0000-000000000001'=any(v_ids)) then
    raise exception 'patient_timeline_missing_shared_evolution';
  end if;

  reset role;
  raise notice 'PASS: patient sees shared projection without private notes';
end $$;

-- 6. Authorization derives only from the exact episode ---------------------

do $$
declare v_actor uuid; v_count integer;
begin
  if exists(
    select 1 from public.professional_verifications
    where user_id='10000000-0000-0000-0000-000000000055'
      and status='approved' and valid_until>now()
  ) then
    raise exception 'simulation_owner_fixture_must_remain_unverified';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000055',true);
  select count(*) into v_count from public.list_patient_timeline(
    '20000000-0000-0000-0000-000000000056','40000000-0000-0000-0000-000000000055','all',null,null,100
  );
  if v_count<>1 or not private.can_write_active_care_episode('40000000-0000-0000-0000-000000000055') then
    raise exception 'simulation_owner_must_read_and_write_own_episode';
  end if;
  reset role;

  -- An active supervision relationship alone must never grant access to every
  -- regular episode owned by the supervisor.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000054',true);
  begin
    perform * from public.list_patient_timeline(
      '20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000052','all',null,null,100
    );
    raise exception 'unassigned_student_should_not_read_supervisor_episode';
  exception when sqlstate '42501' then
    if sqlerrm not like '%timeline_forbidden%' then raise; end if;
  end;
  if private.can_write_active_care_episode('40000000-0000-0000-0000-000000000052') then
    raise exception 'unassigned_student_should_not_write_supervisor_episode';
  end if;

  select count(*) into v_count from public.list_patient_timeline(
    '20000000-0000-0000-0000-000000000052','40000000-0000-0000-0000-000000000053','all',null,null,100
  );
  if v_count<>2 or not private.can_write_active_care_episode('40000000-0000-0000-0000-000000000053') then
    raise exception 'assigned_student_must_read_and_write_own_episode';
  end if;
  select count(*) into v_count from public.list_patient_timeline(
    '20000000-0000-0000-0000-000000000052','40000000-0000-0000-0000-000000000054','all',null,null,100
  );
  if v_count<>1 or private.can_write_active_care_episode('40000000-0000-0000-0000-000000000054') then
    raise exception 'assigned_student_must_read_but_not_write_ended_episode';
  end if;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000051',true);
  select count(*) into v_count from public.list_patient_timeline(
    '20000000-0000-0000-0000-000000000052','40000000-0000-0000-0000-000000000053','all',null,null,100
  );
  if v_count<>2 or not private.can_write_active_care_episode('40000000-0000-0000-0000-000000000053') then
    raise exception 'persisted_supervisor_must_read_and_write_student_episode';
  end if;
  select count(*) into v_count from public.list_patient_timeline(
    '20000000-0000-0000-0000-000000000052','40000000-0000-0000-0000-000000000054','all',null,null,100
  );
  if v_count<>1 or private.can_write_active_care_episode('40000000-0000-0000-0000-000000000054') then
    raise exception 'persisted_supervisor_must_read_but_not_write_ended_episode';
  end if;
  reset role;

  update public.student_supervisions
  set status='ended',ended_at=now()
  where student_id='10000000-0000-0000-0000-000000000054'
    and supervisor_id='10000000-0000-0000-0000-000000000051'
    and status='active';

  foreach v_actor in array array[
    '10000000-0000-0000-0000-000000000054'::uuid,
    '10000000-0000-0000-0000-000000000051'::uuid
  ] loop
    set local role authenticated;
    perform set_config('request.jwt.claim.sub',v_actor::text,true);
    select count(*) into v_count from public.list_patient_timeline(
      '20000000-0000-0000-0000-000000000052','40000000-0000-0000-0000-000000000053','all',null,null,100
    );
    if v_count<>2 then
      raise exception 'historical_student_participant_must_keep_read_access: %',v_actor;
    end if;
    if private.can_write_active_care_episode('40000000-0000-0000-0000-000000000053') then
      raise exception 'ended_supervision_must_block_new_episode_writes: %',v_actor;
    end if;
    reset role;
  end loop;

  foreach v_actor in array array[
    '10000000-0000-0000-0000-000000000052'::uuid,
    '10000000-0000-0000-0000-000000000053'::uuid,
    '30000000-0000-0000-0000-000000000051'::uuid
  ] loop
    set local role authenticated;
    perform set_config('request.jwt.claim.sub',v_actor::text,true);
    begin
      perform * from public.list_patient_timeline(
        '20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000052','all',null,null,100
      );
      raise exception 'unauthorized_actor_should_not_read_timeline: %',v_actor;
    exception when sqlstate '42501' then
      if sqlerrm not like '%timeline_forbidden%' then raise; end if;
    end;
    reset role;
  end loop;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000052',true);
  select count(*) into v_count from public.list_patient_timeline(
    '20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000051','all',null,null,100
  );
  if v_count<>4 then
    raise exception 'former_professional_must_retain_own_episode_history_got_%',v_count;
  end if;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000051',true);
  begin
    perform * from public.list_patient_timeline(
      '20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000051','all',null,null,100
    );
    raise exception 'current_professional_should_not_read_previous_episode';
  exception when sqlstate '42501' then
    if sqlerrm not like '%timeline_forbidden%' then raise; end if;
  end;

  begin
    perform * from public.list_patient_timeline(
      '20000000-0000-0000-0000-000000000099','40000000-0000-0000-0000-000000000052','all',null,null,100
    );
    raise exception 'episode_patient_mismatch_should_fail';
  exception when sqlstate '42501' then
    if sqlerrm not like '%timeline_forbidden%' then raise; end if;
  end;
  reset role;

  raise notice 'PASS: former, unrelated and admin actors are episode-isolated';
end $$;

-- 7. Stable keyset cursor and limit+1 ---------------------------------------

do $$
declare
  v_page1 record;
  v_ids1 text[];
  v_ids2 text[];
  v_count integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000051',true);

  select count(*),array_agg(event_id order by occurred_at desc,event_id desc)
    into v_count,v_ids1
  from public.list_patient_timeline(
    '20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000052','all',null,null,1
  );
  if v_count<>2 then
    raise exception 'timeline_must_return_limit_plus_one_rows_got_%',v_count;
  end if;

  select * into v_page1 from public.list_patient_timeline(
    '20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000052','all',null,null,1
  ) order by occurred_at desc,event_id desc limit 1;

  select array_agg(event_id order by occurred_at desc,event_id desc) into v_ids2
  from public.list_patient_timeline(
    '20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000052','all',v_page1.occurred_at,v_page1.event_id,1
  );
  if v_page1.event_id=any(v_ids2) or v_ids1[2]<>v_ids2[1] then
    raise exception 'timeline_cursor_is_not_stable: page1 %, page2 %',v_ids1,v_ids2;
  end if;

  if not exists(
    select 1 from public.list_patient_timeline(
      '20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000052','all',null,null,100
    ) a join public.list_patient_timeline(
      '20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000052','all',null,null,100
    ) b on a.occurred_at=b.occurred_at and a.event_id<>b.event_id
  ) then
    raise exception 'same_timestamp_fixture_missing';
  end if;

  reset role;
  raise notice 'PASS: deterministic keyset cursor and limit+1 pagination';
end $$;

-- 8. Input validation -------------------------------------------------------

do $$
declare v_case text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000051',true);

  foreach v_case in array array['scope','limit_low','limit_high','partial_cursor'] loop
    begin
      if v_case='scope' then
        perform * from public.list_patient_timeline('20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000052','complete',null,null,10);
      elsif v_case='limit_low' then
        perform * from public.list_patient_timeline('20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000052','all',null,null,0);
      elsif v_case='limit_high' then
        perform * from public.list_patient_timeline('20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000052','all',null,null,101);
      else
        perform * from public.list_patient_timeline('20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000052','all',now(),null,10);
      end if;
      raise exception 'timeline_validation_should_fail: %',v_case;
    exception when sqlstate '22023' then
      null;
    end;
  end loop;
  reset role;

  set local role anon;
  begin
    perform * from public.list_patient_timeline('20000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000052','all',null,null,10);
    raise exception 'anonymous_timeline_should_fail';
  exception when sqlstate '42501' then
    null;
  end;
  reset role;

  raise notice 'PASS: scope, limit, cursor and authentication validation';
end $$;

do $$ begin
  raise notice '=== ALL C3 CONTRACT MATRIX TESTS PASSED ===';
end $$;

rollback;

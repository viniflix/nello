begin;

-- C4 contract matrix. The runner owns personas and applies B0-C4 before this file.
-- The first cycle is intentionally RED until the C4 migration exists.

-- 1. Schema and immutable-chain contract -----------------------------------

do $$
declare
  v_column text;
  v_constraint text;
begin
  if to_regclass('public.clinical_record_amendments') is null then
    raise exception 'clinical_record_amendments_missing';
  end if;

  foreach v_column in array array[
    'root_record_id', 'replaces_record_id', 'chain_version',
    'canonical_format_version'
  ] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='clinical_records'
        and column_name=v_column
    ) then
      raise exception 'clinical_records_column_missing: %', v_column;
    end if;
  end loop;

  foreach v_column in array array[
    'id','patient_id','care_episode_id','root_record_id','target_record_id',
    'replacement_record_id','amendment_type','status','reason','impact_snapshot',
    'impact_hash','actor_id','responsible_id','supervisor_id',
    'authentication_evidence','canonical_hash','abandonment_reason',
    'created_at','effective_at','abandoned_at'
  ] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='clinical_record_amendments'
        and column_name=v_column
    ) then
      raise exception 'clinical_record_amendments_column_missing: %', v_column;
    end if;
  end loop;

  foreach v_constraint in array array[
    'clinical_records_root_record_id_fkey',
    'clinical_records_replaces_record_id_fkey',
    'clinical_records_root_chain_version_key',
    'clinical_record_amendments_target_record_id_fkey'
  ] loop
    if not exists (
      select 1 from pg_constraint where conname=v_constraint
    ) then
      raise exception 'clinical_amendment_constraint_missing: %', v_constraint;
    end if;
  end loop;

  if not exists (
    select 1 from pg_index i
    join pg_class c on c.oid=i.indexrelid
    where c.relname='clinical_record_amendments_one_open_correction_idx'
      and i.indisunique and pg_get_expr(i.indpred,i.indrelid) ~* 'draft'
  ) then
    raise exception 'one_open_correction_partial_index_missing';
  end if;

  if not exists (
    select 1 from pg_index i
    join pg_class c on c.oid=i.indexrelid
    where c.relname='clinical_records_one_current_signed_idx'
      and i.indisunique and pg_get_expr(i.indpred,i.indrelid) ~* 'signed'
  ) then
    raise exception 'one_current_signed_partial_index_missing';
  end if;

  raise notice 'PASS: C4 schema and chain invariants exist';
end $$;

-- 2. Hardened RPC surface, RLS and grants ----------------------------------

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'list_clinical_record_version_chain(uuid)',
    'compare_clinical_record_versions(uuid,uuid)'
  ] loop
    if to_regprocedure('public.' || v_signature) is null then
      raise exception 'c4_rpc_missing: %', v_signature;
    end if;
    if not exists (
      select 1 from pg_proc p
      where p.oid=to_regprocedure('public.' || v_signature)
        and p.prosecdef and p.proconfig=array['search_path=""']
    ) then
      raise exception 'c4_rpc_not_hardened: %', v_signature;
    end if;
    if has_function_privilege('public','public.' || v_signature,'execute')
      or has_function_privilege('anon','public.' || v_signature,'execute')
      or not has_function_privilege('authenticated','public.' || v_signature,'execute') then
      raise exception 'c4_rpc_grant_failed: %', v_signature;
    end if;
  end loop;

  if not (select relrowsecurity from pg_class where oid='public.clinical_record_amendments'::regclass) then
    raise exception 'clinical_record_amendments_rls_disabled';
  end if;

  if has_table_privilege('authenticated','public.clinical_record_amendments','insert')
    or has_table_privilege('authenticated','public.clinical_record_amendments','update')
    or has_table_privilege('authenticated','public.clinical_record_amendments','delete') then
    raise exception 'authenticated_direct_amendment_write_allowed';
  end if;

  raise notice 'PASS: C4 RPC surface, RLS and grants are hardened';
end $$;

-- 3. Fixtures: active/ended episodes and signed records --------------------

insert into public.clinical_records(
  id,patient_id,care_episode_id,nutritionist_id,author_id,record_type,status,
  visibility,encounter_at,retrospective_reason,content,template_code,template_version,
  canonical_hash,signed_at
) values
(
  '70000000-0000-0000-0000-000000000061',
  '20000000-0000-0000-0000-000000000061',
  '40000000-0000-0000-0000-000000000061',
  '10000000-0000-0000-0000-000000000061',
  '10000000-0000-0000-0000-000000000061',
  'clinical_evolution','signed','shared_with_patient',now(),null,
  '{"context":"active signed fixture"}'::jsonb,'nello_standard',1,
  repeat('a',64),now()-interval '1 day'
),
(
  '70000000-0000-0000-0000-000000000062',
  '20000000-0000-0000-0000-000000000061',
  '40000000-0000-0000-0000-000000000062',
  '10000000-0000-0000-0000-000000000062',
  '10000000-0000-0000-0000-000000000062',
  'clinical_evolution','signed','professional_private',now()-interval '8 months',
  'Registro histórico do episódio encerrado.',
  '{"context":"ended signed fixture"}'::jsonb,'nello_standard',1,
  repeat('b',64),now()-interval '8 months'
),
(
  '70000000-0000-0000-0000-000000000063',
  '20000000-0000-0000-0000-000000000061',
  '40000000-0000-0000-0000-000000000061',
  '10000000-0000-0000-0000-000000000061',
  '10000000-0000-0000-0000-000000000061',
  'clinical_evolution','signed','professional_private',now(),null,
  '{"context":"abandonment fixture"}'::jsonb,'nello_standard',1,
  repeat('c',64),now()-interval '1 hour'
),
(
  '70000000-0000-0000-0000-000000000064',
  '20000000-0000-0000-0000-000000000061',
  '40000000-0000-0000-0000-000000000061',
  '10000000-0000-0000-0000-000000000061',
  '10000000-0000-0000-0000-000000000061',
  'clinical_evolution','signed','shared_with_patient',now(),null,
  '{"context":"shared invalidation fixture"}'::jsonb,'nello_standard',1,
  repeat('d',64),now()-interval '30 minutes'
),
(
  '70000000-0000-0000-0000-000000000065',
  '20000000-0000-0000-0000-000000000061',
  '40000000-0000-0000-0000-000000000062',
  '10000000-0000-0000-0000-000000000062',
  '10000000-0000-0000-0000-000000000062',
  'clinical_evolution','signed','professional_private',now()-interval '7 months',
  'Registro privado histórico do episódio encerrado.',
  '{"context":"private invalidation fixture"}'::jsonb,'nello_standard',1,
  repeat('e',64),now()-interval '7 months'
),
(
  '70000000-0000-0000-0000-000000000067',
  '20000000-0000-0000-0000-000000000061',
  '40000000-0000-0000-0000-000000000061',
  '10000000-0000-0000-0000-000000000061',
  '10000000-0000-0000-0000-000000000061',
  'clinical_evolution','signed','shared_with_patient',now()-interval '3 hours',null,
  '{"context":"draft correction visibility fixture"}'::jsonb,'nello_standard',1,
  repeat('7',64),now()-interval '3 hours'
),
(
  '70000000-0000-0000-0000-000000000068',
  '20000000-0000-0000-0000-000000000061',
  '40000000-0000-0000-0000-000000000061',
  '10000000-0000-0000-0000-000000000061',
  '10000000-0000-0000-0000-000000000061',
  'clinical_evolution','signed','shared_with_patient',now()-interval '4 hours',null,
  '{"context":"finalized correction visibility fixture"}'::jsonb,'nello_standard',1,
  repeat('8',64),now()-interval '4 hours'
),
(
  '70000000-0000-0000-0000-000000000069',
  '20000000-0000-0000-0000-000000000061',
  '40000000-0000-0000-0000-000000000061',
  '10000000-0000-0000-0000-000000000061',
  '10000000-0000-0000-0000-000000000061',
  'clinical_evolution','signed','shared_with_patient',now()-interval '5 hours',null,
  '{"context":"abandoned correction visibility fixture"}'::jsonb,'nello_standard',1,
  repeat('9',64),now()-interval '5 hours'
);

insert into public.clinical_records(
  id,patient_id,care_episode_id,nutritionist_id,author_id,student_id,supervisor_id,
  record_type,status,visibility,encounter_at,content,template_code,template_version,
  canonical_hash,signed_at
) values (
  '70000000-0000-0000-0000-000000000066',
  '20000000-0000-0000-0000-000000000061',
  '40000000-0000-0000-0000-000000000061',
  '10000000-0000-0000-0000-000000000061',
  '10000000-0000-0000-0000-000000000064',
  '10000000-0000-0000-0000-000000000064',
  '10000000-0000-0000-0000-000000000061',
  'clinical_evolution','signed','professional_private',now(),
  '{"context":"student authored and supervisor signed fixture"}'::jsonb,
  'nello_standard',1,repeat('f',64),now()-interval '20 minutes'
);

insert into public.clinical_record_events(
  clinical_record_id,from_status,to_status,actor_id,metadata,created_at
) values
('70000000-0000-0000-0000-000000000061','finalized','signed','10000000-0000-0000-0000-000000000061','{"auth_level":"aal1"}'::jsonb,now()-interval '1 day'),
('70000000-0000-0000-0000-000000000062','finalized','signed','10000000-0000-0000-0000-000000000062','{"auth_level":"aal1"}'::jsonb,now()-interval '8 months'),
('70000000-0000-0000-0000-000000000063','finalized','signed','10000000-0000-0000-0000-000000000061','{"auth_level":"aal1"}'::jsonb,now()-interval '1 hour'),
('70000000-0000-0000-0000-000000000064','finalized','signed','10000000-0000-0000-0000-000000000061','{"auth_level":"aal1"}'::jsonb,now()-interval '30 minutes'),
('70000000-0000-0000-0000-000000000065','finalized','signed','10000000-0000-0000-0000-000000000062','{"auth_level":"aal1"}'::jsonb,now()-interval '7 months'),
('70000000-0000-0000-0000-000000000067','finalized','signed','10000000-0000-0000-0000-000000000061','{"auth_level":"aal1"}'::jsonb,now()-interval '3 hours'),
('70000000-0000-0000-0000-000000000068','finalized','signed','10000000-0000-0000-0000-000000000061','{"auth_level":"aal1"}'::jsonb,now()-interval '4 hours'),
('70000000-0000-0000-0000-000000000069','finalized','signed','10000000-0000-0000-0000-000000000061','{"auth_level":"aal1"}'::jsonb,now()-interval '5 hours');
insert into public.clinical_record_events(
  clinical_record_id,from_status,to_status,actor_id,metadata,created_at
) values (
  '70000000-0000-0000-0000-000000000066','finalized','signed',
  '10000000-0000-0000-0000-000000000061','{"auth_level":"aal1"}'::jsonb,
  now()-interval '20 minutes'
);

do $$
begin
  if exists (
    select 1 from public.clinical_records
    where root_record_id is distinct from id
      or chain_version<>1 or canonical_format_version<>1
  ) then
    raise exception 'legacy_record_chain_backfill_failed';
  end if;
  raise notice 'PASS: existing signed records keep canonical format 1';
end $$;

do $$
declare v_rejected boolean;
begin
  v_rejected:=false;
  begin
    insert into public.clinical_records(
      id,patient_id,care_episode_id,nutritionist_id,author_id,record_type,status,
      visibility,encounter_at,content,root_record_id,replaces_record_id,
      chain_version,canonical_format_version
    ) values (
      '70000000-0000-0000-0000-000000000079',
      '20000000-0000-0000-0000-000000000061',
      '40000000-0000-0000-0000-000000000061',
      '10000000-0000-0000-0000-000000000061',
      '10000000-0000-0000-0000-000000000061',
      'follow_up','draft','shared_with_patient',now(),'{}'::jsonb,
      '70000000-0000-0000-0000-000000000061',
      '70000000-0000-0000-0000-000000000061',3,2
    );
  exception when check_violation then
    v_rejected:=true;
  end;
  if not v_rejected then raise exception 'chain_version_gap_allowed'; end if;

  v_rejected:=false;
  begin
    update public.clinical_records
    set root_record_id='70000000-0000-0000-0000-000000000062'
    where id='70000000-0000-0000-0000-000000000061';
  exception when check_violation then
    v_rejected:=true;
  end;
  if not v_rejected then raise exception 'signed_chain_identity_mutation_allowed'; end if;

  raise notice 'PASS: chain gaps and identity mutation are rejected';
end $$;

do $$
declare
  v_count integer;
  v_comparison jsonb;
  v_rejected boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000061',true);
  select count(*) into v_count
  from public.list_clinical_record_version_chain(
    '70000000-0000-0000-0000-000000000061'
  );
  if v_count<>1 then raise exception 'signer_chain_projection_failed: %',v_count; end if;
  v_comparison:=public.compare_clinical_record_versions(
    '70000000-0000-0000-0000-000000000061',
    '70000000-0000-0000-0000-000000000061'
  );
  if v_comparison->>'root_record_id'<>'70000000-0000-0000-0000-000000000061'
    or v_comparison#>>'{sections,0,change_type}'<>'unchanged' then
    raise exception 'same_version_comparison_failed: %',v_comparison;
  end if;

  perform set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000061',true);
  select count(*) into v_count
  from public.list_clinical_record_version_chain(
    '70000000-0000-0000-0000-000000000061'
  );
  if v_count<>1 then raise exception 'patient_shared_chain_projection_failed: %',v_count; end if;
  v_rejected:=false;
  begin
    perform public.list_clinical_record_version_chain(
      '70000000-0000-0000-0000-000000000062'
    );
  exception when no_data_found then
    v_rejected:=true;
  end;
  if not v_rejected then raise exception 'patient_private_chain_exposed'; end if;

  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000063',true);
  v_rejected:=false;
  begin
    perform public.list_clinical_record_version_chain(
      '70000000-0000-0000-0000-000000000061'
    );
  exception when no_data_found then
    v_rejected:=true;
  end;
  reset role;
  if not v_rejected then raise exception 'unrelated_professional_chain_exposed'; end if;

  raise notice 'PASS: chain and comparison projections honor role visibility';
end $$;

-- 4. Authorization before mutation -----------------------------------------

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'get_clinical_record_amendment_impact(uuid)',
    'start_clinical_record_correction(uuid,text,jsonb)',
    'abandon_clinical_record_correction(uuid,text)'
  ] loop
    if to_regprocedure('public.' || v_signature) is null then
      raise exception 'correction_rpc_missing: %',v_signature;
    end if;
    if not exists (
      select 1 from pg_proc p
      where p.oid=to_regprocedure('public.' || v_signature)
        and p.prosecdef and p.proconfig=array['search_path=""']
    ) then
      raise exception 'correction_rpc_not_hardened: %',v_signature;
    end if;
    if has_function_privilege('public','public.' || v_signature,'execute')
      or has_function_privilege('anon','public.' || v_signature,'execute')
      or not has_function_privilege('authenticated','public.' || v_signature,'execute') then
      raise exception 'correction_rpc_grant_failed: %',v_signature;
    end if;
  end loop;
end $$;

do $$
declare
  v_actor uuid;
  v_rejected boolean;
begin
  foreach v_actor in array array[
    '10000000-0000-0000-0000-000000000063'::uuid,
    '20000000-0000-0000-0000-000000000061'::uuid,
    '30000000-0000-0000-0000-000000000061'::uuid
  ] loop
    set local role authenticated;
    perform set_config('request.jwt.claim.sub',v_actor::text,true);
    v_rejected:=false;
    begin
      perform public.start_clinical_record_correction(
        '70000000-0000-0000-0000-000000000061',
        'Correção formal que não pode ser iniciada por este ator.',
        '{"impact_hash":"unauthorized","confirmed":true}'::jsonb
      );
    exception when insufficient_privilege then
      v_rejected:=true;
    end;
    reset role;
    if not v_rejected then
      raise exception 'unauthorized_correction_allowed: %',v_actor;
    end if;
  end loop;
  raise notice 'PASS: patient, admin and unrelated professional cannot amend';
end $$;

-- 5. Signer can inspect impact and start one linear correction --------------

create temp table c4_runtime(
  scenario text primary key,
  target_id uuid not null,
  replacement_id uuid not null,
  amendment_id uuid not null,
  original_snapshot jsonb not null
) on commit drop;

do $$
declare
  v_impact jsonb;
  v_result jsonb;
  v_original jsonb;
begin
  select jsonb_build_object(
    'content',content,'author_id',author_id,'signed_at',signed_at,
    'canonical_hash',canonical_hash
  ) into v_original
  from public.clinical_records
  where id='70000000-0000-0000-0000-000000000061';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000061',true);
  v_impact:=public.get_clinical_record_amendment_impact(
    '70000000-0000-0000-0000-000000000061'
  );
  v_result:=public.start_clinical_record_correction(
    '70000000-0000-0000-0000-000000000061',
    'Ajuste factual identificado após revisão do registro assinado.',
    jsonb_build_object('impact_hash',v_impact->>'impact_hash','confirmed',true)
  );
  reset role;

  if v_result->>'amendment_status'<>'draft'
    or v_result->>'record_status'<>'draft'
    or (v_result->>'chain_version')::integer<>2 then
    raise exception 'correction_draft_contract_failed: %',v_result;
  end if;

  if v_original is distinct from (
    select jsonb_build_object(
      'content',content,'author_id',author_id,'signed_at',signed_at,
      'canonical_hash',canonical_hash
    ) from public.clinical_records
    where id='70000000-0000-0000-0000-000000000061'
  ) then
    raise exception 'signed_original_mutated_when_correction_started';
  end if;

  insert into c4_runtime(scenario,target_id,replacement_id,amendment_id,original_snapshot)
  values(
    'active',
    '70000000-0000-0000-0000-000000000061',
    (v_result->>'replacement_record_id')::uuid,
    (v_result->>'amendment_id')::uuid,
    v_original
  );

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000061',true);
  begin
    perform public.start_clinical_record_correction(
      '70000000-0000-0000-0000-000000000061',
      'Segunda correção concorrente que deve ser rejeitada pelo servidor.',
      jsonb_build_object('impact_hash',v_impact->>'impact_hash','confirmed',true)
    );
    raise exception 'second_open_correction_should_fail';
  exception when sqlstate 'PT409' then
    null;
  end;
  reset role;

  raise notice 'PASS: signer starts one correction without mutating original';
end $$;

-- 6. Active correction finalizes and signs atomically -----------------------

do $$
declare
  v_runtime c4_runtime%rowtype;
  v_updated jsonb;
  v_finalized jsonb;
  v_signed jsonb;
  v_current_original jsonb;
begin
  select * into v_runtime from c4_runtime where scenario='active';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000061',true);
  v_updated:=public.update_clinical_record_draft(
    v_runtime.replacement_id,
    '{"context":"Conteúdo factual corrigido e revisado.","conduct":"Conduta revisada pelo nutricionista responsável."}'::jsonb,
    'shared_with_patient',1
  );
  v_finalized:=public.finalize_clinical_record(
    v_runtime.replacement_id,
    '{"context":"Conteúdo factual corrigido e revisado.","conduct":"Conduta revisada pelo nutricionista responsável."}'::jsonb,
    (v_updated->>'revision')::bigint,null
  );
  v_signed:=public.sign_clinical_record(v_runtime.replacement_id);
  reset role;

  if v_finalized->>'status'<>'finalized' or v_signed->>'status'<>'signed' then
    raise exception 'correction_lifecycle_failed: %, %',v_finalized,v_signed;
  end if;
  if not exists (
    select 1 from public.clinical_records
    where id=v_runtime.target_id and status='corrected'
  ) or not exists (
    select 1 from public.clinical_record_amendments
    where id=v_runtime.amendment_id and status='effective'
      and canonical_hash ~ '^[0-9a-f]{64}$'
  ) or not exists (
    select 1 from public.clinical_records
    where id=v_runtime.replacement_id and status='signed'
      and canonical_format_version=2 and canonical_hash ~ '^[0-9a-f]{64}$'
  ) then
    raise exception 'atomic_correction_activation_failed';
  end if;

  select jsonb_build_object(
    'content',content,'author_id',author_id,'signed_at',signed_at,
    'canonical_hash',canonical_hash
  ) into v_current_original
  from public.clinical_records where id=v_runtime.target_id;
  if v_current_original is distinct from v_runtime.original_snapshot then
    raise exception 'signed_original_bytes_changed_after_correction';
  end if;
  if (select count(*) from public.clinical_records
      where root_record_id=v_runtime.target_id and status='signed')<>1 then
    raise exception 'correction_chain_current_version_count_failed';
  end if;
  if (select count(*) from public.notifications n
      where n.user_id='20000000-0000-0000-0000-000000000061'
        and n.type='clinical_record_corrected'
        and n.content->>'amendment_id'=v_runtime.amendment_id::text)<>1 then
    raise exception 'shared_correction_notification_not_idempotent';
  end if;
  if not exists (
    select 1 from public.activity_log l
    where l.event_name='clinical_record.corrected'
      and l.payload->>'amendment_id'=v_runtime.amendment_id::text
      and not (l.payload ? 'reason')
  ) then raise exception 'minimized_correction_activity_missing'; end if;

  raise notice 'PASS: active correction signs atomically with format 2';
end $$;

-- 7. Original signer can correct an ended episode ---------------------------

do $$
declare
  v_impact jsonb;
  v_started jsonb;
  v_updated jsonb;
  v_signed jsonb;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000062',true);
  v_impact:=public.get_clinical_record_amendment_impact(
    '70000000-0000-0000-0000-000000000062'
  );
  v_started:=public.start_clinical_record_correction(
    '70000000-0000-0000-0000-000000000062',
    'Correção necessária após revisão do episódio já encerrado.',
    jsonb_build_object('impact_hash',v_impact->>'impact_hash','confirmed',true)
  );
  v_updated:=public.update_clinical_record_draft(
    (v_started->>'replacement_record_id')::uuid,
    '{"context":"Correção do registro histórico encerrado.","conduct":"Conduta histórica revisada pelo signatário."}'::jsonb,
    'professional_private',1
  );
  perform public.finalize_clinical_record(
    (v_started->>'replacement_record_id')::uuid,
    '{"context":"Correção do registro histórico encerrado.","conduct":"Conduta histórica revisada pelo signatário."}'::jsonb,
    (v_updated->>'revision')::bigint,
    'Registro histórico do episódio encerrado.'
  );
  v_signed:=public.sign_clinical_record((v_started->>'replacement_record_id')::uuid);
  reset role;
  if v_signed->>'status'<>'signed'
    or (select status from public.care_episodes
        where id='40000000-0000-0000-0000-000000000062')<>'ended' then
    raise exception 'ended_episode_correction_failed: %',v_signed;
  end if;
  raise notice 'PASS: ended episode remains ended after signer correction';
end $$;

-- 8. Abandonment is terminal without replacing the current version ----------

do $$
declare
  v_impact jsonb;
  v_started jsonb;
  v_abandoned jsonb;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000061',true);
  v_impact:=public.get_clinical_record_amendment_impact(
    '70000000-0000-0000-0000-000000000063'
  );
  v_started:=public.start_clinical_record_correction(
    '70000000-0000-0000-0000-000000000063',
    'Rascunho corretivo aberto para validar abandono auditável.',
    jsonb_build_object('impact_hash',v_impact->>'impact_hash','confirmed',true)
  );
  v_abandoned:=public.abandon_clinical_record_correction(
    (v_started->>'amendment_id')::uuid,
    'Revisão confirmou que a versão assinada original está correta.'
  );
  reset role;
  if v_abandoned->>'status'<>'abandoned'
    or (select status from public.clinical_records
        where id='70000000-0000-0000-0000-000000000063')<>'signed'
    or (select status from public.clinical_records
        where id=(v_started->>'replacement_record_id')::uuid)<>'invalidated' then
    raise exception 'correction_abandonment_failed: %',v_abandoned;
  end if;
  raise notice 'PASS: abandoned correction preserves original current version';
end $$;

-- 9. Ordinary C2 records continue using canonical format 1 ------------------

do $$
declare
  v_draft jsonb;
  v_finalized jsonb;
  v_signed jsonb;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000061',true);
  v_draft:=public.create_clinical_evolution_draft(
    '20000000-0000-0000-0000-000000000061',
    '40000000-0000-0000-0000-000000000061',
    'nello_standard',now(),'professional_private',null
  );
  v_finalized:=public.finalize_clinical_record(
    (v_draft->>'id')::uuid,
    '{"conduct":"Conduta clínica comum sem ato corretivo."}'::jsonb,
    (v_draft->>'revision')::bigint,null
  );
  v_signed:=public.sign_clinical_record((v_draft->>'id')::uuid);
  reset role;
  if v_finalized->>'status'<>'finalized' or v_signed->>'status'<>'signed'
    or (v_signed->>'canonical_format_version')::integer<>1 then
    raise exception 'ordinary_c2_format_1_regression: %, %',v_finalized,v_signed;
  end if;
  raise notice 'PASS: ordinary C2 lifecycle remains on canonical format 1';
end $$;

-- 10. Invalidation surface, reauthentication and notification ---------------

do $$
declare v_signature text:='invalidate_clinical_record(uuid,text,jsonb)';
begin
  if to_regprocedure('public.' || v_signature) is null then
    raise exception 'invalidate_record_rpc_missing';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid=to_regprocedure('public.' || v_signature)
      and p.prosecdef and p.proconfig=array['search_path=""']
  ) then raise exception 'invalidate_record_rpc_not_hardened'; end if;
  if has_function_privilege('public','public.' || v_signature,'execute')
    or has_function_privilege('anon','public.' || v_signature,'execute')
    or not has_function_privilege('authenticated','public.' || v_signature,'execute') then
    raise exception 'invalidate_record_rpc_grant_failed';
  end if;
end $$;

do $$
declare v_rejected boolean:=false;
begin
  begin
    update public.clinical_records set status='invalidated'
    where id='70000000-0000-0000-0000-000000000064';
  exception when check_violation then
    v_rejected:=true;
  end;
  if not v_rejected then raise exception 'direct_signed_invalidation_allowed'; end if;
  raise notice 'PASS: signed status transition requires controlled C4 context';
end $$;

do $$
declare
  v_impact jsonb;
  v_actor uuid;
  v_rejected boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000061',true);
  v_impact:=public.get_clinical_record_amendment_impact(
    '70000000-0000-0000-0000-000000000064'
  );
  foreach v_actor in array array[
    '20000000-0000-0000-0000-000000000061'::uuid,
    '30000000-0000-0000-0000-000000000061'::uuid,
    '10000000-0000-0000-0000-000000000063'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub',v_actor::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object(
      'sub',v_actor,'auth_time',extract(epoch from now())::bigint,
      'aal','aal1','session_id','unauthorized-' || v_actor::text,
      'amr',jsonb_build_array(jsonb_build_object('method','password'))
    )::text,true);
    v_rejected:=false;
    begin
      perform public.invalidate_clinical_record(
        '70000000-0000-0000-0000-000000000064',
        'Tentativa de invalidação por ator sem autorização clínica.',
        jsonb_build_object('impact_hash',v_impact->>'impact_hash','confirmed',true)
      );
    exception when insufficient_privilege then
      v_rejected:=true;
    end;
    if not v_rejected then
      raise exception 'unauthorized_invalidation_allowed_for_%',v_actor;
    end if;
  end loop;
  reset role;
  raise notice 'PASS: patient, admin and unrelated professional cannot invalidate';
end $$;

do $$
declare
  v_impact jsonb;
  v_result jsonb;
  v_rejected boolean;
  v_auth_time bigint:=extract(epoch from now())::bigint;
  v_amendment_id uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000061',true);
  v_impact:=public.get_clinical_record_amendment_impact(
    '70000000-0000-0000-0000-000000000064'
  );

  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub','10000000-0000-0000-0000-000000000061',
    'auth_time',v_auth_time-601,'aal','aal1','session_id','stale-session-c4',
    'amr',jsonb_build_array(jsonb_build_object('method','password'))
  )::text,true);
  v_rejected:=false;
  begin
    perform public.invalidate_clinical_record(
      '70000000-0000-0000-0000-000000000064',
      'Invalidação com sessão antiga que deve ser rejeitada.',
      jsonb_build_object('impact_hash',v_impact->>'impact_hash','confirmed',true)
    );
  exception when invalid_authorization_specification then
    v_rejected:=true;
  end;
  if not v_rejected then raise exception 'stale_reauthentication_allowed'; end if;

  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub','10000000-0000-0000-0000-000000000061',
    'auth_time',v_auth_time,'aal','aal1','session_id','fresh-session-c4',
    'amr',jsonb_build_array(jsonb_build_object('method','password'))
  )::text,true);
  v_result:=public.invalidate_clinical_record(
    '70000000-0000-0000-0000-000000000064',
    'Registro invalidado após confirmação de inconsistência material.',
    jsonb_build_object('impact_hash',v_impact->>'impact_hash','confirmed',true)
  );
  reset role;

  v_amendment_id:=(v_result->>'amendment_id')::uuid;
  if v_result->>'status'<>'effective'
    or (select status from public.clinical_records
        where id='70000000-0000-0000-0000-000000000064')<>'invalidated' then
    raise exception 'shared_invalidation_failed: %',v_result;
  end if;
  if not exists (
    select 1 from public.clinical_record_amendments a
    where a.id=v_amendment_id and a.status='effective'
      and a.authentication_evidence ? 'auth_time'
      and a.authentication_evidence ? 'session_fingerprint'
      and not (a.authentication_evidence ? 'session_id')
  ) then raise exception 'minimized_reauthentication_evidence_missing'; end if;
  if (select count(*) from public.notifications n
      where n.user_id='20000000-0000-0000-0000-000000000061'
        and n.type='clinical_record_invalidated'
        and n.content->>'amendment_id'=v_amendment_id::text)<>1 then
    raise exception 'shared_invalidation_notification_not_idempotent';
  end if;
  if exists (
    select 1 from public.notifications n
    where n.content->>'amendment_id'=v_amendment_id::text
      and (n.content ? 'reason' or n.content ? 'clinical_content')
  ) then raise exception 'clinical_content_leaked_to_notification'; end if;
  if not exists (
    select 1 from public.activity_log l
    where l.event_name='clinical_record.invalidated'
      and l.payload->>'amendment_id'=v_amendment_id::text
      and not (l.payload ? 'reason')
  ) then raise exception 'minimized_invalidation_activity_missing'; end if;
  raise notice 'PASS: fresh reauthentication invalidates shared record once';
end $$;

do $$
declare
  v_impact jsonb;
  v_result jsonb;
  v_auth_time bigint:=extract(epoch from now())::bigint;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000062',true);
  v_impact:=public.get_clinical_record_amendment_impact(
    '70000000-0000-0000-0000-000000000065'
  );
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub','10000000-0000-0000-0000-000000000062',
    'auth_time',v_auth_time,'aal','aal1','session_id','fresh-ended-c4',
    'amr',jsonb_build_array(jsonb_build_object('method','password'))
  )::text,true);
  v_result:=public.invalidate_clinical_record(
    '70000000-0000-0000-0000-000000000065',
    'Registro privado histórico invalidado pelo signatário responsável.',
    jsonb_build_object('impact_hash',v_impact->>'impact_hash','confirmed',true)
  );
  reset role;
  if v_result->>'status'<>'effective'
    or (select status from public.care_episodes
        where id='40000000-0000-0000-0000-000000000062')<>'ended' then
    raise exception 'private_ended_invalidation_failed: %',v_result;
  end if;
  if exists (
    select 1 from public.notifications n
    where n.content->>'amendment_id'=v_result->>'amendment_id'
  ) then raise exception 'private_invalidation_notified_patient'; end if;
  raise notice 'PASS: ended private invalidation creates no patient notice';
end $$;

do $$
declare
  v_impact jsonb;
  v_result jsonb;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000061',true);
  v_impact:=public.get_clinical_record_amendment_impact(
    '70000000-0000-0000-0000-000000000066'
  );
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub','10000000-0000-0000-0000-000000000061',
    'auth_time',extract(epoch from now())::bigint,'aal','aal1',
    'session_id','fresh-supervisor-c4',
    'amr',jsonb_build_array(jsonb_build_object('method','password'))
  )::text,true);
  v_result:=public.invalidate_clinical_record(
    '70000000-0000-0000-0000-000000000066',
    'Supervisor signatário invalida registro oficial preparado por estudante.',
    jsonb_build_object('impact_hash',v_impact->>'impact_hash','confirmed',true)
  );
  reset role;
  if v_result->>'record_status'<>'invalidated' then
    raise exception 'supervisor_signed_student_invalidation_failed: %',v_result;
  end if;
  raise notice 'PASS: signing supervisor can invalidate student-authored record';
end $$;

-- 11. Patient authorization and minimized projection -----------------------

do $$
declare
  v_impact jsonb;
  v_started jsonb;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000061',true);

  v_impact:=public.get_clinical_record_amendment_impact('70000000-0000-0000-0000-000000000067');
  perform public.start_clinical_record_correction(
    '70000000-0000-0000-0000-000000000067',
    'Correção em rascunho que jamais pode ser projetada para o paciente.',
    jsonb_build_object('impact_hash',v_impact->>'impact_hash','confirmed',true)
  );

  v_impact:=public.get_clinical_record_amendment_impact('70000000-0000-0000-0000-000000000068');
  v_started:=public.start_clinical_record_correction(
    '70000000-0000-0000-0000-000000000068',
    'Correção finalizada ainda não assinada e não oficial para o paciente.',
    jsonb_build_object('impact_hash',v_impact->>'impact_hash','confirmed',true)
  );
  perform public.finalize_clinical_record(
    (v_started->>'replacement_record_id')::uuid,
    '{"context":"Replacement finalized but unsigned.","conduct":"Pending professional signature before becoming official."}'::jsonb,
    1,'Correção referente ao atendimento registrado anteriormente.'
  );

  v_impact:=public.get_clinical_record_amendment_impact('70000000-0000-0000-0000-000000000069');
  v_started:=public.start_clinical_record_correction(
    '70000000-0000-0000-0000-000000000069',
    'Correção que será abandonada e preservada somente para auditoria interna.',
    jsonb_build_object('impact_hash',v_impact->>'impact_hash','confirmed',true)
  );
  perform public.abandon_clinical_record_correction(
    (v_started->>'amendment_id')::uuid,
    'Correção abandonada após revisão profissional do conteúdo proposto.'
  );
  reset role;
  raise notice 'PASS: patient projection visibility fixtures prepared';
end $$;

do $$
declare
  v_foundation jsonb;
  v_chain jsonb;
  v_episode_records jsonb;
  v_comparison jsonb;
  v_patient_timeline jsonb;
  v_professional_timeline jsonb;
  v_item jsonb;
  v_record_id uuid;
  v_replacement_id uuid;
  v_draft_replacement_id uuid;
  v_finalized_replacement_id uuid;
  v_abandoned_replacement_id uuid;
  v_count integer;
begin
  if has_table_privilege('authenticated','public.clinical_records','select')
    or has_table_privilege('authenticated','public.clinical_record_events','select') then
    raise exception 'patient_can_bypass_minimized_rpc_projection';
  end if;
  if not has_table_privilege('service_role','public.clinical_records','select')
    or not has_table_privilege('service_role','public.clinical_record_events','select') then
    raise exception 'service_role_clinical_read_privilege_regressed';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.clinical_records'::regclass)
    or not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='clinical_records'
        and policyname='clinical_records_participant_select'
        and qual ~ 'can_read_clinical_record'
    ) then raise exception 'clinical_record_patient_rls_regressed'; end if;

  if to_regprocedure('private.is_patient_visible_clinical_record(uuid)') is null
    or to_regprocedure('private.project_patient_clinical_record(public.clinical_records)') is null then
    raise exception 'patient_clinical_security_helpers_missing';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid=to_regprocedure('private.is_patient_visible_clinical_record(uuid)')
      and p.prosecdef and p.proconfig=array['search_path=""']
  ) or has_function_privilege('authenticated','private.is_patient_visible_clinical_record(uuid)','execute') then
    raise exception 'patient_visibility_helper_not_hardened';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid=to_regprocedure('private.project_patient_clinical_record(public.clinical_records)')
      and p.prosecdef and p.proconfig=array['search_path=""']
  ) or has_function_privilege('authenticated','private.project_patient_clinical_record(public.clinical_records)','execute') then
    raise exception 'patient_projection_helper_not_hardened';
  end if;
  if has_function_privilege('anon','public.get_patient_record_foundation(uuid)','execute')
    or not has_function_privilege('authenticated','public.get_patient_record_foundation(uuid)','execute')
    or has_function_privilege('anon','public.list_clinical_records_by_episode(uuid,uuid,text)','execute')
    or not has_function_privilege('authenticated','public.list_clinical_records_by_episode(uuid,uuid,text)','execute') then
    raise exception 'patient_projection_rpc_grants_regressed';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid=to_regprocedure('public.list_patient_timeline(uuid,uuid,text,timestamptz,text,integer)')
      and p.prosecdef and p.proconfig=array['search_path=""']
  ) or has_function_privilege('anon','public.list_patient_timeline(uuid,uuid,text,timestamptz,text,integer)','execute')
    or not has_function_privilege('authenticated','public.list_patient_timeline(uuid,uuid,text,timestamptz,text,integer)','execute') then
    raise exception 'patient_timeline_rpc_not_hardened';
  end if;

  if not exists (
    select 1 from pg_index i join pg_class c on c.oid=i.indexrelid
    where c.relname='clinical_record_amendments_replacement_record_id_key' and i.indisunique
  ) or not exists (
    select 1 from pg_index i join pg_class c on c.oid=i.indexrelid
    where c.relname='clinical_record_amendments_one_effective_target_idx'
      and i.indisunique and pg_get_expr(i.indpred,i.indrelid) ~* 'effective'
  ) then
    raise exception 'patient_amendment_lookup_indexes_missing';
  end if;
  if not exists (
    select 1 from pg_index i join pg_class c on c.oid=i.indexrelid
    where c.relname='clinical_records_patient_root_version_idx'
      and pg_get_indexdef(i.indexrelid) ~* '\(patient_id, root_record_id, chain_version DESC\)'
  ) then raise exception 'patient_foundation_distinct_index_missing'; end if;

  select replacement_record_id into v_replacement_id
  from public.clinical_record_amendments
  where target_record_id='70000000-0000-0000-0000-000000000061'
    and status='effective' and amendment_type='correction';
  select replacement_record_id into v_draft_replacement_id
  from public.clinical_record_amendments
  where target_record_id='70000000-0000-0000-0000-000000000067';
  select replacement_record_id into v_finalized_replacement_id
  from public.clinical_record_amendments
  where target_record_id='70000000-0000-0000-0000-000000000068';
  select replacement_record_id into v_abandoned_replacement_id
  from public.clinical_record_amendments
  where target_record_id='70000000-0000-0000-0000-000000000069';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000061',true);
  v_foundation:=public.get_patient_record_foundation('20000000-0000-0000-0000-000000000061');

  if exists (
    select 1 from jsonb_array_elements(v_foundation->'records') item
    where item->>'status' in ('draft','finalized')
      or item ?| array['canonical_hash','author_id','nutritionist_id','student_id','supervisor_id','responsible_id','authentication_evidence','root_record_id','replaces_record_id']
  ) then raise exception 'patient_foundation_exposes_unofficial_or_internal_record'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_foundation->'records') item
    where item->>'professional_display_name'<>'Nutricionista Atual C4'
  ) then raise exception 'patient_foundation_signer_name_missing'; end if;

  select jsonb_agg(item) into v_episode_records
  from public.list_clinical_records_by_episode(
    '20000000-0000-0000-0000-000000000061',
    '40000000-0000-0000-0000-000000000061',null
  ) item;
  if exists (
    select 1 from jsonb_array_elements(v_episode_records) item
    where item->>'status' in ('draft','finalized')
      or item ?| array['canonical_hash','author_id','nutritionist_id','responsible_id','authentication_evidence']
  ) then raise exception 'patient_episode_list_projection_not_minimized'; end if;

  select jsonb_agg(to_jsonb(t)) into v_patient_timeline
  from public.list_patient_timeline(
    '20000000-0000-0000-0000-000000000061',
    '40000000-0000-0000-0000-000000000061','clinical',null,null,100
  ) t;
  if exists (
    select 1 from jsonb_array_elements(v_patient_timeline) item
    where item->>'source_type'='clinical_record'
      and (
        item->>'status' in ('draft','finalized')
        or item->>'source_id' in (
          v_draft_replacement_id::text,
          v_finalized_replacement_id::text,
          v_abandoned_replacement_id::text
        )
      )
  ) then raise exception 'patient_timeline_exposes_unofficial_clinical_record'; end if;
  if not exists (
    select 1 from jsonb_array_elements(v_patient_timeline) item
    where item->>'source_id'='70000000-0000-0000-0000-000000000061'
      and item->>'status'='corrected'
      and item->>'summary'='Uma versão corrigida por profissional permanece preservada no histórico.'
  ) or not exists (
    select 1 from jsonb_array_elements(v_patient_timeline) item
    where item->>'source_id'='70000000-0000-0000-0000-000000000064'
      and item->>'status'='invalidated'
      and item->>'summary'='Invalidado pelo profissional responsável; preservado no histórico e fora da orientação vigente.'
  ) then raise exception 'patient_timeline_effective_amendment_semantics_missing: %',v_patient_timeline; end if;

  foreach v_record_id in array array[
    '70000000-0000-0000-0000-000000000067'::uuid,
    '70000000-0000-0000-0000-000000000068'::uuid,
    '70000000-0000-0000-0000-000000000069'::uuid
  ] loop
    select count(*) into v_count from public.list_clinical_record_version_chain(v_record_id);
    if v_count<>1 then raise exception 'patient_unofficial_replacement_exposed_for_%: %',v_record_id,v_count; end if;
  end loop;

  select jsonb_agg(item) into v_chain
  from public.list_clinical_record_version_chain('70000000-0000-0000-0000-000000000061') item;
  if jsonb_array_length(v_chain)<>2
    or not exists (
      select 1 from jsonb_array_elements(v_chain) item
      where item->>'status'='corrected'
        and item#>>'{amendment,type}'='correction'
        and item#>>'{amendment,status}'='effective'
        and nullif(item#>>'{amendment,reason}','') is not null
        and nullif(item#>>'{amendment,effective_at}','') is not null
    ) then raise exception 'patient_effective_correction_projection_failed: %',v_chain; end if;

  v_comparison:=public.compare_clinical_record_versions(
    '70000000-0000-0000-0000-000000000061',v_replacement_id
  );
  if v_comparison ? 'root_record_id'
    or v_comparison->'left' ?| array['canonical_hash','author_id','nutritionist_id','responsible_id']
    or v_comparison->'right' ?| array['canonical_hash','author_id','nutritionist_id','responsible_id'] then
    raise exception 'patient_comparison_projection_not_minimized';
  end if;

  select jsonb_agg(item) into v_chain
  from public.list_clinical_record_version_chain('70000000-0000-0000-0000-000000000064') item;
  if jsonb_array_length(v_chain)<>1
    or v_chain#>>'{0,status}'<>'invalidated'
    or v_chain#>>'{0,amendment,type}'<>'invalidation'
    or v_chain#>>'{0,amendment,status}'<>'effective' then
    raise exception 'patient_effective_invalidation_projection_failed: %',v_chain;
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_chain) item
    where item ?| array['canonical_hash','author_id','nutritionist_id','student_id','supervisor_id','responsible_id','authentication_evidence','root_record_id','replaces_record_id']
      or item->'amendment' ?| array['id','target_record_id','replacement_record_id','responsible_id','authentication_evidence','abandonment_reason']
  ) then raise exception 'patient_chain_projection_not_minimized'; end if;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000061',true);
  select jsonb_agg(to_jsonb(t)) into v_professional_timeline
  from public.list_patient_timeline(
    '20000000-0000-0000-0000-000000000061',
    '40000000-0000-0000-0000-000000000061','clinical',null,null,100
  ) t;
  select item into v_item
  from public.list_clinical_record_version_chain('70000000-0000-0000-0000-000000000061') item
  limit 1;
  reset role;
  if not (v_item ? 'canonical_hash') or not (v_item ? 'author_id') then
    raise exception 'professional_full_chain_projection_regressed';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_professional_timeline) item
    where item->>'source_id'=v_draft_replacement_id::text and item->>'status'='draft'
  ) or not exists (
    select 1 from jsonb_array_elements(v_professional_timeline) item
    where item->>'source_id'=v_finalized_replacement_id::text and item->>'status'='finalized'
  ) or not exists (
    select 1 from jsonb_array_elements(v_professional_timeline) item
    where item->>'source_id'=v_abandoned_replacement_id::text and item->>'status'='invalidated'
  ) then raise exception 'professional_timeline_behavior_regressed'; end if;

  raise notice 'PASS: patient sees only official minimized clinical versions';
end $$;

rollback;

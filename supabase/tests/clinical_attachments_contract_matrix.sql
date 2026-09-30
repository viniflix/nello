begin;

-- C5 contract matrix. It is intentionally RED before the C5 migration exists.
-- Later stages extend this file with personas, lifecycle and Storage isolation.

do $$
declare v_column text;
begin
  if to_regclass('public.clinical_attachments') is null then
    raise exception 'clinical_attachments_missing';
  end if;
  if to_regclass('public.clinical_attachment_events') is null then
    raise exception 'clinical_attachment_events_missing';
  end if;

  foreach v_column in array array[
    'id','patient_id','care_episode_id','clinical_record_id','root_attachment_id',
    'version','replaces_attachment_id','category_code','description','clinical_date',
    'source','author_id','reviewed_by','reviewed_at','storage_bucket','storage_path',
    'original_filename','mime_type','size_bytes','sha256','status','visibility',
    'created_at','updated_at','invalidated_at','invalidation_reason'
  ] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='clinical_attachments'
        and column_name=v_column
    ) then
      raise exception 'clinical_attachments_column_missing: %',v_column;
    end if;
  end loop;

  foreach v_column in array array[
    'id','clinical_attachment_id','patient_id','care_episode_id','actor_id',
    'actor_role','action','from_status','to_status','from_visibility',
    'to_visibility','reason','metadata','created_at'
  ] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='clinical_attachment_events'
        and column_name=v_column
    ) then
      raise exception 'clinical_attachment_events_column_missing: %',v_column;
    end if;
  end loop;

  if not (select relrowsecurity from pg_class where oid='public.clinical_attachments'::regclass)
    or not (select relrowsecurity from pg_class where oid='public.clinical_attachment_events'::regclass) then
    raise exception 'clinical_attachment_rls_disabled';
  end if;

  if has_table_privilege('authenticated','public.clinical_attachments','insert')
    or has_table_privilege('authenticated','public.clinical_attachments','update')
    or has_table_privilege('authenticated','public.clinical_attachments','delete')
    or has_table_privilege('authenticated','public.clinical_attachment_events','insert')
    or has_table_privilege('authenticated','public.clinical_attachment_events','update')
    or has_table_privilege('authenticated','public.clinical_attachment_events','delete') then
    raise exception 'authenticated_direct_clinical_attachment_mutation_allowed';
  end if;

  raise notice 'PASS: C5 tables, columns, RLS and direct-write boundary exist';
end $$;

do $$
declare
  v_attachment_id uuid := '50000000-0000-0000-0000-000000000081';
  v_event_id uuid;
begin
  if (select array_agg(code order by code) from public.clinical_attachment_categories) <> array[
    'clinical_image','consent','external_prescription','laboratory_exam',
    'other','patient_document','referral','report'
  ]::text[] then
    raise exception 'clinical_attachment_categories_contract_failed';
  end if;

  insert into public.clinical_attachments(
    id,patient_id,care_episode_id,category_code,description,source,author_id,
    storage_path,original_filename,mime_type,size_bytes,sha256,status,visibility
  ) values (
    v_attachment_id,
    '20000000-0000-0000-0000-000000000081',
    '40000000-0000-0000-0000-000000000081',
    'laboratory_exam','Exame de contrato C5','nutritionist',
    '10000000-0000-0000-0000-000000000081',
    '20000000-0000-0000-0000-000000000081/40000000-0000-0000-0000-000000000081/50000000-0000-0000-0000-000000000081',
    'exame.pdf','application/pdf',1024,repeat('a',64),'uploading','professional_private'
  );

  if not exists (
    select 1 from public.clinical_attachments
    where id=v_attachment_id and root_attachment_id=id and version=1
  ) then
    raise exception 'clinical_attachment_root_initialization_failed';
  end if;

  select id into v_event_id from public.clinical_attachment_events
  where clinical_attachment_id=v_attachment_id and action='created';
  if v_event_id is null then raise exception 'clinical_attachment_create_event_missing'; end if;

  begin
    update public.clinical_attachments
    set clinical_record_id='70000000-0000-0000-0000-000000000082'
    where id=v_attachment_id;
    raise exception 'clinical_attachment_record_episode_mismatch_allowed';
  exception when foreign_key_violation then null;
  end;

  begin
    update public.clinical_attachment_events set reason='tamper' where id=v_event_id;
    raise exception 'clinical_attachment_event_update_allowed';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'clinical_attachment_events_are_immutable' then raise; end if;
  end;

  begin
    delete from public.clinical_attachments where id=v_attachment_id;
    raise exception 'clinical_attachment_hard_delete_allowed';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'clinical_attachments_do_not_support_hard_delete' then raise; end if;
  end;

  update public.clinical_attachments set status='active' where id=v_attachment_id;
  if not exists (
    select 1 from public.clinical_attachment_events
    where clinical_attachment_id=v_attachment_id and action='status_changed'
      and from_status='uploading' and to_status='active'
  ) then raise exception 'clinical_attachment_status_event_missing'; end if;

  begin
    update public.clinical_attachments set status='uploading' where id=v_attachment_id;
    raise exception 'clinical_attachment_invalid_transition_allowed';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'clinical_attachment_invalid_status_transition' then raise; end if;
  end;

  begin
    update public.clinical_attachments set storage_path='tampered/path' where id=v_attachment_id;
    raise exception 'clinical_attachment_active_content_mutation_allowed';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'clinical_attachment_content_is_immutable' then raise; end if;
  end;

  begin
    insert into public.clinical_attachments(
      patient_id,care_episode_id,category_code,source,author_id,storage_path,
      original_filename,mime_type,size_bytes,sha256,status,visibility
    ) values (
      '20000000-0000-0000-0000-000000000081','40000000-0000-0000-0000-000000000081',
      'other','nutritionist','10000000-0000-0000-0000-000000000081','other/no-description',
      'outro.pdf','application/pdf',10,repeat('b',64),'uploading','professional_private'
    );
    raise exception 'clinical_attachment_other_without_description_allowed';
  exception when check_violation then null;
  end;

  begin
    insert into public.clinical_attachments(
      patient_id,care_episode_id,category_code,description,source,author_id,storage_path,
      original_filename,mime_type,size_bytes,sha256,status,visibility
    ) values (
      '20000000-0000-0000-0000-000000000082','40000000-0000-0000-0000-000000000081',
      'report','Paciente incoerente','nutritionist','10000000-0000-0000-0000-000000000081',
      'invalid/episode-patient','laudo.pdf','application/pdf',10,repeat('c',64),
      'uploading','professional_private'
    );
    raise exception 'clinical_attachment_episode_patient_mismatch_allowed';
  exception when foreign_key_violation then null;
  end;

  raise notice 'PASS: C5 integrity, immutability and append-only ledger work';
end $$;

\if :{?stage2_only}
  \echo 'PASS: C5 stage 2 scope complete; future RPC and Storage contracts intentionally deferred.'
\else

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'create_clinical_attachment_upload_intent(uuid,uuid,uuid,text,text,date,text,text,bigint)',
    'confirm_clinical_attachment_upload(uuid,text,bigint,text)',
    'fail_clinical_attachment_upload(uuid,text)'
  ] loop
    if to_regprocedure('public.' || v_signature) is null then
      raise exception 'c5_upload_rpc_missing: %',v_signature;
    end if;
    if not exists (
      select 1 from pg_proc p
      where p.oid=to_regprocedure('public.' || v_signature)
        and p.prosecdef and p.proconfig=array['search_path=""']
    ) then
      raise exception 'c5_upload_rpc_not_hardened: %',v_signature;
    end if;
    if has_function_privilege('public','public.' || v_signature,'execute')
      or has_function_privilege('anon','public.' || v_signature,'execute')
      or not has_function_privilege('authenticated','public.' || v_signature,'execute') then
      raise exception 'c5_upload_rpc_grant_failed: %',v_signature;
    end if;
  end loop;

  v_signature := 'expire_clinical_attachment_uploads(integer)';
  if to_regprocedure('public.' || v_signature) is null then
    raise exception 'c5_upload_rpc_missing: %',v_signature;
  end if;
  if not exists (
    select 1 from pg_proc p where p.oid=to_regprocedure('public.' || v_signature)
      and p.prosecdef and p.proconfig=array['search_path=""']
  ) or has_function_privilege('public','public.' || v_signature,'execute')
    or has_function_privilege('anon','public.' || v_signature,'execute')
    or has_function_privilege('authenticated','public.' || v_signature,'execute')
    or not has_function_privilege('service_role','public.' || v_signature,'execute') then
    raise exception 'c5_upload_expiry_rpc_boundary_failed';
  end if;

  foreach v_signature in array array['upload_expires_at','upload_confirmed_at'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='clinical_attachments' and column_name=v_signature
    ) then raise exception 'clinical_attachment_upload_column_missing: %',v_signature; end if;
  end loop;

  raise notice 'PASS: C5 upload RPC surface is explicit and hardened';
end $$;

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id='clinical-attachments' and public=false and file_size_limit=15728640
  ) then
    raise exception 'private_clinical_attachments_bucket_missing_or_unbounded';
  end if;

  if exists (
    select 1 from storage.buckets
    where id='clinical-attachments'
      and not (
        allowed_mime_types @> array['application/pdf','image/jpeg','image/png','image/webp']::text[]
        and cardinality(allowed_mime_types)=4
      )
  ) then
    raise exception 'clinical_attachment_bucket_mime_contract_failed';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='clinical_attachments_insert_reserved_intent' and cmd='INSERT'
      and roles=array['authenticated']::name[]
  ) then raise exception 'clinical_attachment_storage_insert_policy_missing'; end if;

  if exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname like 'clinical_attachments_%'
      and (
        cmd in ('UPDATE','DELETE','ALL')
        or (cmd='SELECT' and policyname<>'clinical_attachments_select_authorized')
      )
  ) then raise exception 'clinical_attachment_storage_broad_policy_detected'; end if;

  if exists(
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='clinical_attachments_select_authorized'
      and (cmd<>'SELECT' or roles<>array['authenticated']::name[])
  ) then raise exception 'clinical_attachment_storage_select_policy_invalid'; end if;

  raise notice 'PASS: C5 private bucket and minimal Storage boundary exist';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000081',true);
select set_config(
  'c5.professional_intent',
  public.create_clinical_attachment_upload_intent(
    '20000000-0000-0000-0000-000000000081','40000000-0000-0000-0000-000000000081',null,
    'laboratory_exam','Hemograma de controle',current_date,'hemograma.pdf','application/pdf',1024
  )::text,true
);

do $$
begin
  begin
    insert into storage.objects(bucket_id,name,owner_id,metadata)
    values('clinical-attachments','forged/path',auth.uid()::text,'{"size":1024,"mimetype":"application/pdf"}');
    raise exception 'forged_clinical_attachment_path_allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

insert into storage.objects(bucket_id,name,owner_id,metadata)
values(
  'clinical-attachments',current_setting('c5.professional_intent')::jsonb->>'storage_path',
  auth.uid()::text,'{"size":1024,"mimetype":"application/pdf"}'
);

do $$
declare v_count integer;
begin
  select count(*) into v_count from storage.objects
  where bucket_id='clinical-attachments';
  if v_count<>0 then raise exception 'clinical_attachment_storage_direct_read_allowed'; end if;

  update storage.objects set metadata='{"size":1,"mimetype":"image/png"}'
  where bucket_id='clinical-attachments'
    and name=current_setting('c5.professional_intent')::jsonb->>'storage_path';
  get diagnostics v_count=row_count;
  if v_count<>0 then raise exception 'clinical_attachment_storage_update_allowed'; end if;

  begin
    delete from storage.objects where bucket_id='clinical-attachments'
    and name=current_setting('c5.professional_intent')::jsonb->>'storage_path';
  get diagnostics v_count=row_count;
  if v_count<>0 then raise exception 'clinical_attachment_storage_delete_allowed'; end if;
  exception when insufficient_privilege then null; -- current Storage protects direct SQL deletion before RLS
  end;

  begin
    insert into storage.objects(bucket_id,name,owner_id,metadata)
    values(
      'clinical-attachments',current_setting('c5.professional_intent')::jsonb->>'storage_path',
      auth.uid()::text,'{"size":1024,"mimetype":"application/pdf"}'
    );
    raise exception 'clinical_attachment_storage_overwrite_allowed';
  exception when unique_violation then null;
  end;
end $$;

select set_config(
  'c5.professional_confirm',
  public.confirm_clinical_attachment_upload(
    (current_setting('c5.professional_intent')::jsonb->>'attachment_id')::uuid,
    repeat('1',64),1024,'application/pdf'
  )::text,true
);

do $$
begin
  begin
    perform public.confirm_clinical_attachment_upload(
      (current_setting('c5.professional_intent')::jsonb->>'attachment_id')::uuid,
      repeat('1',64),1024,'application/pdf'
    );
    raise exception 'duplicate_upload_confirmation_allowed';
  exception when sqlstate 'P0001' then
    if sqlerrm<>'upload_already_finalized' then raise; end if;
  end;
end $$;

select set_config(
  'c5.mismatch_intent',
  public.create_clinical_attachment_upload_intent(
    '20000000-0000-0000-0000-000000000081','40000000-0000-0000-0000-000000000081',null,
    'report','Relatorio para validar metadados',current_date,'relatorio.pdf','application/pdf',2048
  )::text,true
);
insert into storage.objects(bucket_id,name,owner_id,metadata)
values(
  'clinical-attachments',current_setting('c5.mismatch_intent')::jsonb->>'storage_path',
  auth.uid()::text,'{"size":2048,"mimetype":"application/pdf"}'
);

do $$
begin
  begin
    perform public.confirm_clinical_attachment_upload(
      (current_setting('c5.mismatch_intent')::jsonb->>'attachment_id')::uuid,
      repeat('2',64),null,'application/pdf'
    );
    raise exception 'null_upload_size_allowed';
  exception when sqlstate 'P0001' then
    if sqlerrm<>'upload_metadata_mismatch' then raise; end if;
  end;
end $$;

do $$
begin
  begin
    perform public.confirm_clinical_attachment_upload(
      (current_setting('c5.mismatch_intent')::jsonb->>'attachment_id')::uuid,
      repeat('2',64),999,'application/pdf'
    );
    raise exception 'upload_metadata_mismatch_allowed';
  exception when sqlstate 'P0001' then
    if sqlerrm<>'upload_metadata_mismatch' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000081',true);
do $$
begin
  begin
    perform public.confirm_clinical_attachment_upload(
      (current_setting('c5.mismatch_intent')::jsonb->>'attachment_id')::uuid,
      repeat('2',64),2048,'application/pdf'
    );
    raise exception 'cross_actor_upload_confirmation_allowed';
  exception when insufficient_privilege then
    if sqlerrm<>'upload_confirmation_forbidden' then raise; end if;
  end;
end $$;

select set_config(
  'c5.patient_intent',
  public.create_clinical_attachment_upload_intent(
    '20000000-0000-0000-0000-000000000081','40000000-0000-0000-0000-000000000081',null,
    'patient_document','Documento enviado pelo paciente',current_date,'documento.png','image/png',512
  )::text,true
);
insert into storage.objects(bucket_id,name,owner_id,metadata)
values(
  'clinical-attachments',current_setting('c5.patient_intent')::jsonb->>'storage_path',
  auth.uid()::text,'{"size":512,"mimetype":"image/png"}'
);
select set_config(
  'c5.patient_confirm',
  public.confirm_clinical_attachment_upload(
    (current_setting('c5.patient_intent')::jsonb->>'attachment_id')::uuid,
    repeat('3',64),512,'image/png'
  )::text,true
);

do $$
begin
  begin
    perform public.create_clinical_attachment_upload_intent(
      '20000000-0000-0000-0000-000000000082','40000000-0000-0000-0000-000000000082',null,
      'patient_document','Tentativa cruzada',current_date,'outro.pdf','application/pdf',100
    );
    raise exception 'patient_cross_episode_upload_allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000083',true);
select set_config(
  'c5.student_intent',
  public.create_clinical_attachment_upload_intent(
    '20000000-0000-0000-0000-000000000083','40000000-0000-0000-0000-000000000083',null,
    'clinical_image','Imagem enviada pelo estudante',current_date,'imagem.webp','image/webp',700
  )::text,true
);
insert into storage.objects(bucket_id,name,owner_id,metadata)
values(
  'clinical-attachments',current_setting('c5.student_intent')::jsonb->>'storage_path',
  auth.uid()::text,'{"size":700,"mimetype":"image/webp"}'
);
select set_config(
  'c5.student_confirm',
  public.confirm_clinical_attachment_upload(
    (current_setting('c5.student_intent')::jsonb->>'attachment_id')::uuid,
    repeat('4',64),700,'image/webp'
  )::text,true
);

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000081',true);
select set_config(
  'c5.supervisor_intent',
  public.create_clinical_attachment_upload_intent(
    '20000000-0000-0000-0000-000000000083','40000000-0000-0000-0000-000000000083',null,
    'referral','Documento criado pelo supervisor',current_date,'encaminhamento.pdf','application/pdf',300
  )::text,true
);
select public.fail_clinical_attachment_upload(
  (current_setting('c5.supervisor_intent')::jsonb->>'attachment_id')::uuid,'supervisor_cancelled_upload'
);
select set_config(
  'c5.ended_episode_intent',
  public.create_clinical_attachment_upload_intent(
    '20000000-0000-0000-0000-000000000083','40000000-0000-0000-0000-000000000083',null,
    'report','Confirmacao apos encerramento',current_date,'encerrado.pdf','application/pdf',350
  )::text,true
);
insert into storage.objects(bucket_id,name,owner_id,metadata)
values(
  'clinical-attachments',current_setting('c5.ended_episode_intent')::jsonb->>'storage_path',
  auth.uid()::text,'{"size":350,"mimetype":"application/pdf"}'
);

reset role;

do $$
declare
  v_professional uuid := (current_setting('c5.professional_intent')::jsonb->>'attachment_id')::uuid;
  v_patient uuid := (current_setting('c5.patient_intent')::jsonb->>'attachment_id')::uuid;
  v_mismatch uuid := (current_setting('c5.mismatch_intent')::jsonb->>'attachment_id')::uuid;
  v_student uuid := (current_setting('c5.student_intent')::jsonb->>'attachment_id')::uuid;
  v_supervisor uuid := (current_setting('c5.supervisor_intent')::jsonb->>'attachment_id')::uuid;
begin
  if current_setting('c5.professional_confirm')::jsonb->>'status'<>'active'
    or not exists(select 1 from public.clinical_attachments where id=v_professional and status='active' and upload_confirmed_at is not null)
  then raise exception 'professional_upload_confirmation_failed'; end if;

  if current_setting('c5.patient_confirm')::jsonb->>'status'<>'pending_review'
    or not exists(select 1 from public.clinical_attachments where id=v_patient and status='pending_review' and visibility='professional_private')
  then raise exception 'patient_upload_triage_state_failed'; end if;

  if not exists(select 1 from public.clinical_attachments where id=v_mismatch and status='uploading') then
    raise exception 'failed_confirmation_changed_upload_state';
  end if;

  if current_setting('c5.student_confirm')::jsonb->>'status'<>'active'
    or not exists(
      select 1 from public.clinical_attachments
      where id=v_student and source='student' and author_id='10000000-0000-0000-0000-000000000083'
        and status='active'
    ) then raise exception 'student_supervised_upload_failed'; end if;

  if not exists(
    select 1 from public.clinical_attachments
    where id=v_supervisor and source='nutritionist'
      and author_id='10000000-0000-0000-0000-000000000081' and status='upload_failed'
  ) then raise exception 'supervisor_upload_authorization_failed'; end if;

  if exists(
    select 1 from public.clinical_attachment_events
    where clinical_attachment_id in (v_professional,v_patient)
      and metadata ?| array['content','description','filename','original_filename','signed_url','storage_path','sha256']
  ) then raise exception 'sensitive_upload_metadata_leaked_to_ledger'; end if;

  raise notice 'PASS: C5 professional, patient, student and supervisor uploads are isolated and auditable';
end $$;

update public.care_episodes
set status='ended',ended_at=now(),ended_by='10000000-0000-0000-0000-000000000081',
  end_reason='matrix_stage3_reauthorization'
where id='40000000-0000-0000-0000-000000000083';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000081',true);
do $$
begin
  begin
    perform public.confirm_clinical_attachment_upload(
      (current_setting('c5.ended_episode_intent')::jsonb->>'attachment_id')::uuid,
      repeat('6',64),350,'application/pdf'
    );
    raise exception 'ended_episode_upload_confirmation_allowed';
  exception when insufficient_privilege then
    if sqlerrm<>'upload_confirmation_forbidden' then raise; end if;
  end;
end $$;
reset role;
do $$
begin
  if not exists(
    select 1 from public.clinical_attachments
    where id=(current_setting('c5.ended_episode_intent')::jsonb->>'attachment_id')::uuid
      and status='uploading' and upload_confirmed_at is null
  ) then raise exception 'ended_episode_failed_confirmation_changed_state'; end if;
  raise notice 'PASS: C5 confirmation reauthorizes the active episode';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000081',true);
select public.fail_clinical_attachment_upload(
  (current_setting('c5.mismatch_intent')::jsonb->>'attachment_id')::uuid,'client_upload_failed'
);
reset role;

insert into public.clinical_attachments(
  patient_id,care_episode_id,category_code,description,source,author_id,storage_path,
  original_filename,mime_type,size_bytes,status,visibility,created_at,updated_at,upload_expires_at
) values (
  '20000000-0000-0000-0000-000000000081','40000000-0000-0000-0000-000000000081',
  'report','Intencao expirada C5','nutritionist','10000000-0000-0000-0000-000000000081',
  'expired-intent-c5','expirado.pdf','application/pdf',100,'uploading','professional_private',
  now()-interval '2 minutes',now()-interval '2 minutes',now()-interval '1 minute'
);
set local role service_role;
select public.expire_clinical_attachment_uploads(100);
reset role;

do $$
begin
  if not exists(select 1 from public.clinical_attachments where storage_path='expired-intent-c5' and status='upload_failed')
    or not exists(
      select 1 from public.clinical_attachments
      where id=(current_setting('c5.mismatch_intent')::jsonb->>'attachment_id')::uuid and status='upload_failed'
    ) then raise exception 'upload_failure_or_expiration_state_failed'; end if;
  raise notice 'PASS: C5 upload failure and expiration preserve metadata and ledger';
end $$;

\if :{?stage3_only}
  \echo 'PASS: C5 stage 3 scope complete; read URLs and clinical lifecycle intentionally deferred.'
\else

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'list_clinical_attachments_by_episode(uuid,uuid,text,text)',
    'list_patient_clinical_attachments(uuid)',
    'create_clinical_attachment_signed_url(uuid)'
  ] loop
    if to_regprocedure('public.' || v_signature) is null then
      raise exception 'c5_read_rpc_missing: %',v_signature;
    end if;
    if not exists (
      select 1 from pg_proc p
      where p.oid=to_regprocedure('public.' || v_signature)
        and p.prosecdef and p.proconfig=array['search_path=""']
    ) then
      raise exception 'c5_read_rpc_not_hardened: %',v_signature;
    end if;
    if has_function_privilege('public','public.' || v_signature,'execute')
      or has_function_privilege('anon','public.' || v_signature,'execute')
      or not has_function_privilege('authenticated','public.' || v_signature,'execute') then
      raise exception 'c5_read_rpc_grant_failed: %',v_signature;
    end if;
  end loop;

  raise notice 'PASS: C5 read RPC surface is explicit and hardened';
end $$;

insert into public.clinical_attachments(
  id,patient_id,care_episode_id,category_code,description,clinical_date,source,author_id,
  storage_path,original_filename,mime_type,size_bytes,sha256,status,visibility,
  upload_confirmed_at
) values
(
  '50000000-0000-0000-0000-000000000101','20000000-0000-0000-0000-000000000082',
  '40000000-0000-0000-0000-000000000082','laboratory_exam','Atual compartilhado',current_date,
  'nutritionist','10000000-0000-0000-0000-000000000081','50000000-0000-0000-0000-000000000101',
  'atual-compartilhado.pdf','application/pdf',101,repeat('1',64),'active','shared_with_patient',now()
),(
  '50000000-0000-0000-0000-000000000102','20000000-0000-0000-0000-000000000082',
  '40000000-0000-0000-0000-000000000082','report','Atual privado',current_date,
  'nutritionist','10000000-0000-0000-0000-000000000081','50000000-0000-0000-0000-000000000102',
  'atual-privado.pdf','application/pdf',102,repeat('2',64),'active','professional_private',now()
),(
  '50000000-0000-0000-0000-000000000103','20000000-0000-0000-0000-000000000082',
  '40000000-0000-0000-0000-000000000082','patient_document','Atual pendente',current_date,
  'patient','20000000-0000-0000-0000-000000000082','50000000-0000-0000-0000-000000000103',
  'atual-pendente.pdf','application/pdf',103,repeat('3',64),'pending_review','professional_private',now()
),(
  '50000000-0000-0000-0000-000000000104','20000000-0000-0000-0000-000000000082',
  '40000000-0000-0000-0000-000000000084','report','Historico compartilhado',current_date-200,
  'nutritionist','10000000-0000-0000-0000-000000000084','50000000-0000-0000-0000-000000000104',
  'historico-compartilhado.pdf','application/pdf',104,repeat('4',64),'active','shared_with_patient',now()
),(
  '50000000-0000-0000-0000-000000000105','20000000-0000-0000-0000-000000000082',
  '40000000-0000-0000-0000-000000000084','report','Historico privado',current_date-200,
  'nutritionist','10000000-0000-0000-0000-000000000084','50000000-0000-0000-0000-000000000105',
  'historico-privado.pdf','application/pdf',105,repeat('5',64),'active','professional_private',now()
),(
  '50000000-0000-0000-0000-000000000106','20000000-0000-0000-0000-000000000082',
  '40000000-0000-0000-0000-000000000082','report','Atual em quarentena',current_date,
  'nutritionist','10000000-0000-0000-0000-000000000081','50000000-0000-0000-0000-000000000106',
  'atual-quarentena.pdf','application/pdf',106,repeat('6',64),'quarantined','professional_private',now()
);

with generated as (
  select gen_random_uuid() id,g from generate_series(1,51) g
)
insert into public.clinical_attachments(
  id,patient_id,care_episode_id,category_code,description,source,author_id,storage_path,
  original_filename,mime_type,size_bytes,sha256,status,visibility,upload_confirmed_at,
  created_at,updated_at
)
select id,'20000000-0000-0000-0000-000000000082','40000000-0000-0000-0000-000000000082',
  'report','Pagina C5 '||g,'nutritionist','10000000-0000-0000-0000-000000000081',id::text,
  'pagina-'||g||'.pdf','application/pdf',200+g,repeat('7',64),'active','professional_private',now(),
  now()-make_interval(secs=>g),now()-make_interval(secs=>g)
from generated;

insert into storage.objects(bucket_id,name,owner_id,metadata)
select 'clinical-attachments',a.storage_path,a.author_id::text,
  jsonb_build_object('size',a.size_bytes,'mimetype',a.mime_type)
from public.clinical_attachments a
where a.id in (
  '50000000-0000-0000-0000-000000000101','50000000-0000-0000-0000-000000000102',
  '50000000-0000-0000-0000-000000000103','50000000-0000-0000-0000-000000000104',
  '50000000-0000-0000-0000-000000000105','50000000-0000-0000-0000-000000000106'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000081',true);
select set_config('c5.prof_page_1',public.list_clinical_attachments_by_episode(
  '20000000-0000-0000-0000-000000000082','40000000-0000-0000-0000-000000000082',null,null
)::text,true);
select set_config('c5.prof_page_2',public.list_clinical_attachments_by_episode(
  '20000000-0000-0000-0000-000000000082','40000000-0000-0000-0000-000000000082',null,
  current_setting('c5.prof_page_1')::jsonb->>'next_cursor'
)::text,true);
select set_config('c5.prof_pending',public.list_clinical_attachments_by_episode(
  '20000000-0000-0000-0000-000000000082','40000000-0000-0000-0000-000000000082','pending_review',null
)::text,true);
do $$ begin
  perform public.list_clinical_attachments_by_episode(
    '20000000-0000-0000-0000-000000000082','40000000-0000-0000-0000-000000000084',null,null
  );
  raise exception 'new_nutritionist_read_old_episode_allowed';
exception when insufficient_privilege then
  if sqlerrm<>'attachment_list_forbidden' then raise; end if;
end $$;
reset role;

do $$
declare v_first jsonb:=current_setting('c5.prof_page_1')::jsonb;
declare v_second jsonb:=current_setting('c5.prof_page_2')::jsonb;
begin
  if jsonb_array_length(v_first->'items')<>50 or not (v_first->>'has_more')::boolean
    or v_first->>'next_cursor' is null then raise exception 'professional_first_page_failed'; end if;
  if jsonb_array_length(v_second->'items')<>5 or (v_second->>'has_more')::boolean
    or v_second->>'next_cursor' is not null then raise exception 'professional_second_page_failed'; end if;
  if exists(
    select 1 from jsonb_array_elements(v_first->'items') a
    join jsonb_array_elements(v_second->'items') b on a->>'id'=b->>'id'
  ) then raise exception 'attachment_pagination_overlap'; end if;
  if jsonb_array_length((current_setting('c5.prof_pending')::jsonb)->'items')<>1 then
    raise exception 'professional_status_filter_failed';
  end if;
  if (v_first->'items'->0) ? 'storage_path' then
    raise exception 'professional_list_leaked_storage_path';
  end if;
  raise notice 'PASS: professional list is episode-scoped, filtered and keyset-paginated';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000084',true);
select set_config('c5.former_list',public.list_clinical_attachments_by_episode(
  '20000000-0000-0000-0000-000000000082','40000000-0000-0000-0000-000000000084',null,null
)::text,true);
do $$ begin
  perform public.list_clinical_attachments_by_episode(
    '20000000-0000-0000-0000-000000000082','40000000-0000-0000-0000-000000000082',null,null
  );
  raise exception 'former_nutritionist_read_current_episode_allowed';
exception when insufficient_privilege then
  if sqlerrm<>'attachment_list_forbidden' then raise; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000085',true);
do $$ begin
  perform public.list_clinical_attachments_by_episode(
    '20000000-0000-0000-0000-000000000082','40000000-0000-0000-0000-000000000082',null,null
  );
  raise exception 'unrelated_nutritionist_read_allowed';
exception when insufficient_privilege then
  if sqlerrm<>'attachment_list_forbidden' then raise; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000081',true);
do $$ begin
  perform public.list_clinical_attachments_by_episode(
    '20000000-0000-0000-0000-000000000082','40000000-0000-0000-0000-000000000082',null,null
  );
  raise exception 'admin_clinical_attachment_list_allowed';
exception when insufficient_privilege then
  if sqlerrm<>'attachment_list_forbidden' then raise; end if;
end $$;
do $$ begin
  perform public.create_clinical_attachment_signed_url('50000000-0000-0000-0000-000000000101');
  raise exception 'admin_clinical_attachment_url_allowed';
exception when insufficient_privilege then
  if sqlerrm<>'attachment_open_forbidden' then raise; end if;
end $$;
reset role;

do $$ begin
  if jsonb_array_length((current_setting('c5.former_list')::jsonb)->'items')<>2 then
    raise exception 'former_nutritionist_history_missing';
  end if;
  raise notice 'PASS: former professional keeps only own ended episode; new, unrelated and admin actors are isolated';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000083',true);
select set_config('c5.student_history',public.list_clinical_attachments_by_episode(
  '20000000-0000-0000-0000-000000000083','40000000-0000-0000-0000-000000000083',null,null
)::text,true);
select public.create_clinical_attachment_signed_url(
  (current_setting('c5.student_intent')::jsonb->>'attachment_id')::uuid
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000081',true);
select set_config('c5.supervisor_history',public.list_clinical_attachments_by_episode(
  '20000000-0000-0000-0000-000000000083','40000000-0000-0000-0000-000000000083',null,null
)::text,true);
select public.create_clinical_attachment_signed_url(
  (current_setting('c5.student_intent')::jsonb->>'attachment_id')::uuid
);
reset role;

do $$ begin
  if jsonb_array_length((current_setting('c5.student_history')::jsonb)->'items')<1
    or jsonb_array_length((current_setting('c5.supervisor_history')::jsonb)->'items')<1 then
    raise exception 'student_or_supervisor_history_missing';
  end if;
  raise notice 'PASS: assigned student and supervisor retain read access to their ended episode';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000082',true);
select set_config('c5.patient_current',public.list_patient_clinical_attachments(
  '40000000-0000-0000-0000-000000000082'
)::text,true);
select set_config('c5.patient_old',public.list_patient_clinical_attachments(
  '40000000-0000-0000-0000-000000000084'
)::text,true);
do $$ begin
  perform public.list_patient_clinical_attachments('40000000-0000-0000-0000-000000000081');
  raise exception 'patient_cross_episode_read_allowed';
exception when insufficient_privilege then
  if sqlerrm<>'patient_attachment_list_forbidden' then raise; end if;
end $$;
select set_config('c5.patient_url',public.create_clinical_attachment_signed_url(
  '50000000-0000-0000-0000-000000000101'
)::text,true);
select set_config('c5.patient_old_url',public.create_clinical_attachment_signed_url(
  '50000000-0000-0000-0000-000000000104'
)::text,true);
do $$ begin
  perform public.create_clinical_attachment_signed_url('50000000-0000-0000-0000-000000000102');
  raise exception 'patient_private_url_allowed';
exception when insufficient_privilege then
  if sqlerrm<>'attachment_open_forbidden' then raise; end if;
end $$;
select set_config('c5.patient_storage_current',(select count(*) from storage.objects
  where name in ('50000000-0000-0000-0000-000000000101','50000000-0000-0000-0000-000000000102','50000000-0000-0000-0000-000000000103'))::text,true);
select set_config('c5.patient_storage_old',(select count(*) from storage.objects
  where name in ('50000000-0000-0000-0000-000000000104','50000000-0000-0000-0000-000000000105'))::text,true);
reset role;

do $$
declare v_current jsonb:=current_setting('c5.patient_current')::jsonb;
declare v_old jsonb:=current_setting('c5.patient_old')::jsonb;
declare v_item jsonb;
begin
  if jsonb_array_length(v_current->'items')<>1 or jsonb_array_length(v_old->'items')<>1 then
    raise exception 'patient_shared_projection_count_failed';
  end if;
  v_item:=v_current->'items'->0;
  if v_item ?| array['patient_id','care_episode_id','clinical_record_id','root_attachment_id',
    'author_id','reviewed_by','storage_bucket','storage_path','sha256','invalidation_reason'] then
    raise exception 'patient_projection_leaked_internal_metadata';
  end if;
  if current_setting('c5.patient_storage_current')::integer<>1
    or current_setting('c5.patient_storage_old')::integer<>1 then
    raise exception 'patient_storage_policy_projection_failed';
  end if;
  raise notice 'PASS: patient sees only own active shared documents with minimized projection, including history';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000081',true);
select set_config('c5.prof_url',public.create_clinical_attachment_signed_url(
  '50000000-0000-0000-0000-000000000102'
)::text,true);
do $$ begin
  perform public.create_clinical_attachment_signed_url('50000000-0000-0000-0000-000000000104');
  raise exception 'new_nutritionist_old_url_allowed';
exception when insufficient_privilege then
  if sqlerrm<>'attachment_open_forbidden' then raise; end if;
end $$;
do $$ begin
  perform public.create_clinical_attachment_signed_url('50000000-0000-0000-0000-000000000106');
  raise exception 'quarantined_attachment_url_allowed';
exception when insufficient_privilege then
  if sqlerrm<>'attachment_open_forbidden' then raise; end if;
end $$;
select set_config('c5.prof_storage',(select count(*) from storage.objects where name in (
  '50000000-0000-0000-0000-000000000101','50000000-0000-0000-0000-000000000102',
  '50000000-0000-0000-0000-000000000103','50000000-0000-0000-0000-000000000104',
  '50000000-0000-0000-0000-000000000105','50000000-0000-0000-0000-000000000106'
))::text,true);
reset role;

do $$
declare v_descriptor jsonb:=current_setting('c5.prof_url')::jsonb;
begin
  if (v_descriptor->>'expires_in')::integer<>300
    or (v_descriptor->>'authorization_expires_at')::timestamptz not between now()+interval '4 minutes 50 seconds' and now()+interval '5 minutes 10 seconds'
    or v_descriptor ? 'signed_url'
    or v_descriptor->>'storage_path'<>'50000000-0000-0000-0000-000000000102' then
    raise exception 'short_lived_download_authorization_failed';
  end if;
  if current_setting('c5.prof_storage')::integer<>3 then
    raise exception 'professional_storage_policy_scope_failed';
  end if;
  raise notice 'PASS: every open is reauthorized for 300 seconds and Storage enforces the same scope';
end $$;

\if :{?stage4_only}
  \echo 'PASS: C5 stage 4 scope complete; clinical lifecycle intentionally deferred.'
\else

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'review_patient_clinical_attachment(uuid,text,text,text,date,uuid)',
    'change_clinical_attachment_visibility(uuid,text,text)',
    'invalidate_clinical_attachment(uuid,text)'
  ] loop
    if to_regprocedure('public.' || v_signature) is null then
      raise exception 'c5_lifecycle_rpc_missing: %',v_signature;
    end if;
    if not exists (
      select 1 from pg_proc p
      where p.oid=to_regprocedure('public.' || v_signature)
        and p.prosecdef and p.proconfig=array['search_path=""']
    ) then
      raise exception 'c5_lifecycle_rpc_not_hardened: %',v_signature;
    end if;
    if has_function_privilege('public','public.' || v_signature,'execute')
      or has_function_privilege('anon','public.' || v_signature,'execute')
      or not has_function_privilege('authenticated','public.' || v_signature,'execute') then
      raise exception 'c5_lifecycle_rpc_grant_failed: %',v_signature;
    end if;
  end loop;

  raise notice 'PASS: C5 lifecycle RPC surface is explicit and hardened';
end $$;

\endif
\endif
\endif

rollback;

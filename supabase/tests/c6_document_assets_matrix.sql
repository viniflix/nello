begin;
-- The Edge worker is the trusted confirmer. This isolated fixture simulates its
-- service-role boundary without granting the retired client RPC to anyone.
create function pg_temp.qa_verified_asset_confirmation(p_id uuid,p_sha text,p_size bigint,p_mime text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous_role text:=current_setting('request.jwt.claim.role',true); result jsonb;
begin
 -- Only the disposable SQL fixture fabricates an already verified worker result.
 if current_database() !~ '^nello_qa_wave02_[0-9]+$' then raise exception 'isolated_fixture_required'; end if;
 insert into private.storage_upload_reservations(bucket_id,object_path,actor_id,tenant_id,quota_key,mime_type,expected_size,verified_size,sha256,source_sha256,status,verified_at)
 select u.storage_bucket,u.storage_path,u.professional_id,u.professional_id,u.professional_id::text,u.mime_type,u.size_bytes,p_size,p_sha,p_sha,'confirmed',now()
 from public.document_asset_uploads u where u.id=p_id and u.professional_id=auth.uid()
 on conflict(bucket_id,object_path) do nothing;
 perform set_config('request.jwt.claim.role','service_role',true);
 result:=public.confirm_document_asset_upload_verified(p_id,auth.uid(),p_sha,p_size,p_mime);
 perform set_config('request.jwt.claim.role',coalesce(previous_role,'authenticated'),true);
 return result;
end$$;


do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'create_document_asset_upload_intent(text,text,text,bigint,integer)',
    'fail_document_asset_upload(uuid,text)',
    'get_my_document_asset_preview(text)'
  ] loop
    if not exists (
      select 1 from pg_proc p where p.oid = to_regprocedure('public.' || v_signature)
        and p.prosecdef and p.proconfig = array['search_path=""']
    ) then raise exception 'c6_asset_rpc_not_hardened:%', v_signature; end if;
    if has_function_privilege('public', 'public.' || v_signature, 'execute')
       or has_function_privilege('anon', 'public.' || v_signature, 'execute')
       or not has_function_privilege('authenticated', 'public.' || v_signature, 'execute') then
      raise exception 'c6_asset_rpc_grant_drift:%', v_signature;
    end if;
  end loop;
  if has_function_privilege('authenticated','public.confirm_document_asset_upload(uuid,text,bigint,text)','execute')
     or has_function_privilege('anon','public.confirm_document_asset_upload_verified(uuid,uuid,text,bigint,text)','execute')
     or has_function_privilege('authenticated','public.confirm_document_asset_upload_verified(uuid,uuid,text,bigint,text)','execute')
     or not has_function_privilege('service_role','public.confirm_document_asset_upload_verified(uuid,uuid,text,bigint,text)','execute') then
    raise exception 'trusted_asset_confirmation_boundary_drift';
  end if;
  if has_function_privilege('authenticated', 'public.expire_document_asset_uploads(integer)', 'execute')
     or has_function_privilege('anon', 'public.expire_document_asset_uploads(integer)', 'execute') then
    raise exception 'c6_asset_expiration_exposed';
  end if;
  perform pg_temp.assert_client_rpc_surface();
  if (select public from storage.buckets where id='document-assets') is distinct from false then
    raise exception 'c6_asset_bucket_not_private';
  end if;
  if has_table_privilege('authenticated','public.document_asset_uploads','select')
     or has_table_privilege('authenticated','public.document_asset_uploads','insert')
     or has_table_privilege('authenticated','public.document_asset_uploads','update')
     or has_table_privilege('authenticated','public.document_asset_uploads','delete') then
    raise exception 'c6_asset_upload_table_exposed';
  end if;
end;
$$;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','92000000-0000-0000-0000-000000000001','authenticated','authenticated','c6-assets-owner@example.invalid','x',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','92000000-0000-0000-0000-000000000002','authenticated','authenticated','c6-assets-other@example.invalid','x',now(),'{}','{"user_type":"nutritionist"}',now(),now());
-- Auth creates this profile first; configure the synthetic actor without disabling its trigger.
insert into public.user_profiles (id,name,user_type,is_admin,is_active,email) values
('92000000-0000-0000-0000-000000000001','Assets Owner C6','nutritionist',false,true,'c6-assets-owner@example.invalid'),
('92000000-0000-0000-0000-000000000002','Assets Other C6','nutritionist',false,true,'c6-assets-other@example.invalid')
on conflict (id) do update set
  name=excluded.name,
  user_type=excluded.user_type,
  is_admin=excluded.is_admin,
  is_active=excluded.is_active,
  email=excluded.email;
update public.professional_verifications set crn_region='CRN-3',crn_number='C6-A1',normalized_crn='CRN3C6A1'
where user_id='92000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000001',true);
select public.save_my_document_identity(
  '{"professional_name":"Profissional de Ativos C6"}'::jsonb,0,'identidade para ativos'
);

do $$
begin
  begin
    perform public.create_document_asset_upload_intent('logo','logo.svg','image/svg+xml',1000,1);
    raise exception 'c6_asset_svg_accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_document_asset_upload_intent('visual_signature','assinatura.png','image/png',3000000,1);
    raise exception 'c6_asset_oversized_signature_accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

create temporary table c6_asset_ids(kind text primary key,id uuid,path text);
with intent as (
  select public.create_document_asset_upload_intent('logo','logo.png','image/png',1024,1) payload
)
insert into c6_asset_ids values('first',(select (payload->>'upload_id')::uuid from intent),(select payload->>'storage_path' from intent));
reset role;

insert into storage.objects(id,bucket_id,name,owner_id,metadata) select
  gen_random_uuid(),'document-assets',path,'92000000-0000-0000-0000-000000000001',
  '{"size":"1024","mimetype":"image/png"}'::jsonb from c6_asset_ids where kind='first';

set local role authenticated;
select set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000002',true);
do $$
begin
  begin
    perform pg_temp.qa_verified_asset_confirmation(
      (select id from c6_asset_ids where kind='first'),repeat('a',64),1024,'image/png'
    );
    raise exception 'c6_asset_cross_owner_confirmation_accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000001',true);
select pg_temp.qa_verified_asset_confirmation(
  (select id from c6_asset_ids where kind='first'),repeat('a',64),1024,'image/png'
);

do $$
declare v_preview jsonb; v_identity jsonb;
begin
  v_preview:=public.get_my_document_asset_preview('logo');
  v_identity:=public.get_my_document_identity();
  if (v_preview->>'available')::boolean is not true
     or v_preview->>'storage_path'<>(select path from c6_asset_ids where kind='first')
     or (v_identity->>'version')::integer<>2
     or (v_identity->'assets'->>'has_logo')::boolean is not true then
    raise exception 'c6_asset_first_confirmation_failed:%,%',v_preview,v_identity;
  end if;
  begin
    perform pg_temp.qa_verified_asset_confirmation(
      (select id from c6_asset_ids where kind='first'),repeat('a',64),1024,'image/png'
    );
    raise exception 'c6_asset_double_confirmation_accepted';
  exception when check_violation then null;
  end;
end;
$$;

with intent as (
  select 'race_a' kind,public.create_document_asset_upload_intent('logo','a.webp','image/webp',2048,2) payload
  union all
  select 'race_b',public.create_document_asset_upload_intent('logo','b.webp','image/webp',2048,2)
)
insert into c6_asset_ids select kind,(payload->>'upload_id')::uuid,payload->>'storage_path' from intent;
reset role;
insert into storage.objects(id,bucket_id,name,owner_id,metadata)
select gen_random_uuid(),'document-assets',path,'92000000-0000-0000-0000-000000000001',
  '{"size":"2048","mimetype":"image/webp"}'::jsonb from c6_asset_ids where kind like 'race_%';

set local role authenticated;
select set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000001',true);
select pg_temp.qa_verified_asset_confirmation(
  (select id from c6_asset_ids where kind='race_a'),repeat('b',64),2048,'image/webp'
);
do $$
begin
  begin
    perform pg_temp.qa_verified_asset_confirmation(
      (select id from c6_asset_ids where kind='race_b'),repeat('c',64),2048,'image/webp'
    );
    raise exception 'c6_asset_stale_parallel_intent_accepted';
  exception when sqlstate 'PT409' then null;
  end;
end;
$$;

do $$
declare v_intent jsonb;
begin
  v_intent:=public.create_document_asset_upload_intent('stamp','carimbo.jpeg','image/jpeg',500,3);
  insert into c6_asset_ids values('failed',(v_intent->>'upload_id')::uuid,v_intent->>'storage_path');
  perform public.fail_document_asset_upload((v_intent->>'upload_id')::uuid,'client_upload_failed');
end;
$$;

do $$
declare v_visible integer;
begin
  select count(*) into v_visible from storage.objects where bucket_id='document-assets';
  if v_visible<>1 then raise exception 'c6_asset_storage_read_scope_failed:%',v_visible; end if;
end;
$$;
reset role;

do $$
begin
  if (select status from public.document_asset_uploads where id=(select id from c6_asset_ids where kind='first'))<>'confirmed'
     or (select status from public.document_asset_uploads where id=(select id from c6_asset_ids where kind='race_a'))<>'confirmed'
     or (select status from public.document_asset_uploads where id=(select id from c6_asset_ids where kind='race_b'))<>'uploading'
     or (select status from public.document_asset_uploads where id=(select id from c6_asset_ids where kind='failed'))<>'failed' then
    raise exception 'c6_asset_lifecycle_state_failed';
  end if;
  if (select count(*) from public.professional_document_identities
      where professional_id='92000000-0000-0000-0000-000000000001')<>3 then
    raise exception 'c6_asset_identity_version_count_failed';
  end if;
end;
$$;

rollback;

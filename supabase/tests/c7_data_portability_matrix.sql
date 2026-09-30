begin;

do $$
begin
  if has_function_privilege('anon', 'public.build_my_data_export_snapshot()', 'execute') then
    raise exception 'anonymous_export_execute_granted';
  end if;
  if not has_function_privilege('authenticated', 'public.build_my_data_export_snapshot()', 'execute') then
    raise exception 'authenticated_export_execute_missing';
  end if;
  if has_function_privilege('authenticated', 'private.export_subject_rows(regclass,name,uuid,text[])', 'execute') then
    raise exception 'private_export_helper_exposed';
  end if;
end;
$$;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','95000000-0000-0000-0000-000000000001','authenticated','authenticated','c7-patient@nello.test','x',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','95000000-0000-0000-0000-000000000002','authenticated','authenticated','c7-pro@nello.test','x',now(),'{}','{}',now(),now());

insert into public.user_profiles(id,name,user_type,is_active,email,invite_code,patient_invite_code) values
('95000000-0000-0000-0000-000000000001','Paciente C7','patient',true,'c7-patient@nello.test','SECRET-INVITE','SECRET-PATIENT'),
('95000000-0000-0000-0000-000000000002','Nutricionista C7','nutritionist',true,'c7-pro@nello.test',null,null);

insert into public.notifications(user_id,type,content,is_read,title,message,link_url)
values('95000000-0000-0000-0000-000000000001','test','{"text":"C7"}'::jsonb,false,'C7','Teste','/private/token');

set local role authenticated;
select set_config('request.jwt.claim.sub','95000000-0000-0000-0000-000000000001',true);
do $$
declare v_export jsonb;
begin
  v_export := public.build_my_data_export_snapshot();
  if v_export->>'schema_version' <> 'nello-portability-1' then raise exception 'schema_version_missing'; end if;
  if v_export->'subject'->>'name' <> 'Paciente C7' then raise exception 'wrong_export_subject'; end if;
  if v_export->'subject' ? 'invite_code' or v_export->'subject' ? 'patient_invite_code' then raise exception 'invite_secret_leaked'; end if;
  if v_export->'categories'->'notifications'->0 ? 'link_url' then raise exception 'notification_link_leaked'; end if;
end;
$$;

select set_config('request.jwt.claim.sub','95000000-0000-0000-0000-000000000002',true);
do $$ begin
  begin perform public.build_my_data_export_snapshot(); raise exception 'professional_export_accepted';
  exception when insufficient_privilege then null; end;
end $$;

do $$ begin
  begin perform public.authorize_my_data_export_attachment('95000000-0000-0000-0000-000000000099'); raise exception 'unknown_attachment_authorized';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
do $$
begin
  if (select count(*) from public.activity_log where event_name='patient_data_export_generated' and patient_id='95000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'export_audit_event_missing';
  end if;
end;
$$;

rollback;

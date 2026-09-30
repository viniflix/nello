begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','96000000-0000-0000-0000-000000000001','authenticated','authenticated','c8-patient@example.invalid','x',now(),'{}','{"user_type":"patient"}',now(),now()),
('00000000-0000-0000-0000-000000000000','96000000-0000-0000-0000-000000000002','authenticated','authenticated','c8-other@example.invalid','x',now(),'{}','{"user_type":"patient"}',now(),now()),
('00000000-0000-0000-0000-000000000000','96000000-0000-0000-0000-000000000003','authenticated','authenticated','c8-admin@example.invalid','x',now(),'{}','{"user_type":"patient"}',now(),now());
-- Auth creates this profile first; configure the synthetic actor without disabling its trigger.
insert into public.user_profiles (id,name,user_type,is_admin,is_active,email) values
('96000000-0000-0000-0000-000000000001','Paciente C8','patient',false,true,'c8-patient@example.invalid'),
('96000000-0000-0000-0000-000000000002','Outro C8','patient',false,true,'c8-other@example.invalid'),
('96000000-0000-0000-0000-000000000003','Admin C8','admin',true,true,'c8-admin@example.invalid')
on conflict (id) do update set
  name=excluded.name,
  user_type=excluded.user_type,
  is_admin=excluded.is_admin,
  is_active=excluded.is_active,
  email=excluded.email;

insert into private.admin_operators(user_id,grant_reason) values('96000000-0000-0000-0000-000000000003','synthetic QA');
create temporary table c8_ids(request_id uuid,revision bigint);
grant select,insert,update on c8_ids to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000001',true);
with created as(select public.create_my_data_subject_request('deletion','Quero revisar os dados não clínicos') payload)
insert into c8_ids select (payload->>'id')::uuid,1 from created;
do $$begin
 begin perform public.create_my_data_subject_request('deletion',null);raise exception 'duplicate_active_request_accepted';
 exception when unique_violation then null;end;
 if(select count(*)from public.list_my_data_subject_requests())<>1 then raise exception 'patient_request_projection_failed';end if;
 begin perform count(*)from public.data_subject_requests;raise exception 'direct_request_table_read_accepted';
 exception when insufficient_privilege then null;end;
end$$;

select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000002',true);
do $$begin begin perform public.cancel_my_data_subject_request((select request_id from c8_ids));raise exception 'cross_subject_cancel_accepted';exception when insufficient_privilege then null;end;end$$;

select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','96000000-0000-0000-0000-000000000003','role','authenticated','aal','aal2')::text,true);
-- Both membership and MFA are required; a legacy profile flag is insufficient.
select set_config('request.jwt.claims',jsonb_build_object('sub','96000000-0000-0000-0000-000000000003','role','authenticated','aal','aal1')::text,true);
do $$begin begin perform public.list_data_subject_requests('submitted');raise exception 'aal1_admin_accepted';exception when insufficient_privilege then null;end;end$$;
select set_config('request.jwt.claims',jsonb_build_object('sub','96000000-0000-0000-0000-000000000003','role','authenticated','aal','aal2')::text,true);
reset role;
update private.admin_operators set revoked_at=now() where user_id='96000000-0000-0000-0000-000000000003';
set local role authenticated;
do $$begin begin perform public.list_data_subject_requests('submitted');raise exception 'revoked_profile_admin_accepted';exception when insufficient_privilege then null;end;end$$;
reset role;
update private.admin_operators set revoked_at=null where user_id='96000000-0000-0000-0000-000000000003';
set local role authenticated;
do $$begin if(select count(*)from public.list_data_subject_requests('submitted'))<>1 then raise exception 'admin_queue_missing_request';end if;end$$;
with transitioned as(select public.update_data_subject_request((select request_id from c8_ids),1,'triaged','Triagem administrativa iniciada',null,null,true) payload)
update c8_ids set revision=(select(payload->>'revision')::bigint from transitioned);
do $$begin
 begin perform public.update_data_subject_request((select request_id from c8_ids),1,'in_progress','Revisão concorrente indevida',null,null,true);raise exception 'stale_revision_accepted';
 exception when serialization_failure then null;end;
end$$;
with transitioned as(select public.update_data_subject_request((select request_id from c8_ids),(select revision from c8_ids),'in_progress','Análise dos dados e bases legais','retain_legal_obligation','Obrigação legal de guarda do prontuário',true) payload)
update c8_ids set revision=(select(payload->>'revision')::bigint from transitioned);
with transitioned as(select public.update_data_subject_request((select request_id from c8_ids),(select revision from c8_ids),'fulfilled','Dados não clínicos avaliados; prontuário preservado pela obrigação de guarda.','retain_legal_obligation','Obrigação legal de guarda do prontuário',true) payload)
update c8_ids set revision=(select(payload->>'revision')::bigint from transitioned);
reset role;

do $$begin
 if(select status from public.data_subject_requests where id=(select request_id from c8_ids))<>'fulfilled' then raise exception 'request_not_fulfilled';end if;
 if(select count(*)from public.data_subject_request_events where request_id=(select request_id from c8_ids))<>4 then raise exception 'immutable_event_trail_incomplete';end if;
 if not exists(select 1 from public.notifications where user_id='96000000-0000-0000-0000-000000000001' and type='privacy_request_update')then raise exception 'patient_notification_missing';end if;
 begin update public.data_subject_request_events set reason='mutated'where request_id=(select request_id from c8_ids);raise exception 'event_mutation_accepted';
 exception when check_violation then null;end;
end$$;
rollback;

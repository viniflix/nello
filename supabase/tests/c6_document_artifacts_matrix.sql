begin;
do $$begin
 perform pg_temp.assert_client_rpc_surface();
 perform pg_temp.assert_client_rpc_surface();
 if has_table_privilege('authenticated','public.document_artifacts','select')or has_table_privilege('anon','public.document_artifacts','select') then raise exception 'c6_artifact_table_exposed';end if;
end$$;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','94000000-0000-0000-0000-000000000001','authenticated','authenticated','c6-art-pro@example.invalid','x',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','94000000-0000-0000-0000-000000000002','authenticated','authenticated','c6-art-student@example.invalid','x',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','94000000-0000-0000-0000-000000000003','authenticated','authenticated','c6-art-patient@example.invalid','x',now(),'{}','{"user_type":"patient"}',now(),now()),
('00000000-0000-0000-0000-000000000000','94000000-0000-0000-0000-000000000004','authenticated','authenticated','c6-art-other@example.invalid','x',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','94000000-0000-0000-0000-000000000005','authenticated','authenticated','c6-art-admin@example.invalid','x',now(),'{}','{"user_type":"patient"}',now(),now());
-- Auth creates this profile first; configure the synthetic actor without disabling its trigger.
insert into public.user_profiles (id,name,user_type,is_admin,is_active,email) values
('94000000-0000-0000-0000-000000000001','Responsável C6','nutritionist',false,true,'c6-art-pro@example.invalid'),
('94000000-0000-0000-0000-000000000002','Estudante C6','nutritionist',false,true,'c6-art-student@example.invalid'),
('94000000-0000-0000-0000-000000000003','Paciente Sigiloso C6','patient',false,true,'c6-art-patient@example.invalid'),
('94000000-0000-0000-0000-000000000004','Alheio C6','nutritionist',false,true,'c6-art-other@example.invalid'),
('94000000-0000-0000-0000-000000000005','Admin C6','admin',true,true,'c6-art-admin@example.invalid')
on conflict (id) do update set
  name=excluded.name,
  user_type=excluded.user_type,
  is_admin=excluded.is_admin,
  is_active=excluded.is_active,
  email=excluded.email;
update public.professional_verifications set crn_region='CRN-3',crn_number='C6-D1',normalized_crn='CRN3C6D1' where user_id='94000000-0000-0000-0000-000000000001';
update public.professional_verifications set professional_role='student',status='approved',verification_method='student_document_manual',institution_name='Universidade',current_semester=5,crn_region=null,crn_number=null,normalized_crn=null,valid_until=now()+interval '6 months' where user_id='94000000-0000-0000-0000-000000000002';
insert into public.care_episodes(id,patient_id,nutritionist_id,status,started_at,start_reason,started_by)values('94000000-0000-0000-0000-000000000010','94000000-0000-0000-0000-000000000003','94000000-0000-0000-0000-000000000001','active',now(),'qa','94000000-0000-0000-0000-000000000001');
insert into public.student_supervisions(student_id,supervisor_id,status,requested_at,responded_at,started_at)
values('94000000-0000-0000-0000-000000000002','94000000-0000-0000-0000-000000000001','active',now(),now(),now());
update public.care_episodes set nutritionist_id='94000000-0000-0000-0000-000000000002',student_id='94000000-0000-0000-0000-000000000002',supervisor_id='94000000-0000-0000-0000-000000000001'
where id='94000000-0000-0000-0000-000000000010';
insert into public.professional_document_identities(professional_id,verification_id,version,status,professional_name,primary_color,accent_color,crn_region,crn_number,normalized_crn,created_by)
select p.id,v.id,1,'active',p.name,'#4F8A3C','#7DAF69',v.crn_region,v.crn_number,v.normalized_crn,p.id from public.user_profiles p join public.professional_verifications v on v.user_id=p.id where p.id='94000000-0000-0000-0000-000000000001';
insert into public.clinical_records(id,patient_id,care_episode_id,nutritionist_id,author_id,student_id,supervisor_id,record_type,status,visibility,content,canonical_hash,signed_at)
values('94000000-0000-0000-0000-000000000020','94000000-0000-0000-0000-000000000003','94000000-0000-0000-0000-000000000010','94000000-0000-0000-0000-000000000002','94000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000002','94000000-0000-0000-0000-000000000001','follow_up','signed','shared_with_patient','{"summary":"Evolução confirmada"}',repeat('d',64),now());
insert into public.clinical_records(id,patient_id,care_episode_id,nutritionist_id,author_id,student_id,supervisor_id,record_type,status,visibility,content,canonical_hash,signed_at)
values('94000000-0000-0000-0000-000000000021','94000000-0000-0000-0000-000000000003','94000000-0000-0000-0000-000000000010','94000000-0000-0000-0000-000000000002','94000000-0000-0000-0000-000000000002','94000000-0000-0000-0000-000000000002','94000000-0000-0000-0000-000000000001','follow_up','signed','professional_private','{"summary":"Preparada sob supervisão"}',repeat('e',64),now());

create temporary table c6_artifact_id(id uuid,code uuid,hash text);
grant select,insert,update on c6_artifact_id to authenticated;
grant select on c6_artifact_id to anon;
set local role authenticated;select set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000001',true);
with x as(select public.create_document_artifact_from_clinical_record('94000000-0000-0000-0000-000000000020','shared_with_patient') p)
insert into c6_artifact_id(id)select(p->>'artifact_id')::uuid from x;
select public.update_document_artifact_draft((select id from c6_artifact_id),'{"title":"EVOLUÇÃO CLÍNICA","content":{"summary":"Evolução confirmada e revisada"}}',1);
do $$begin begin perform public.update_document_artifact_draft((select id from c6_artifact_id),'{}',1);raise exception 'stale accepted';exception when sqlstate 'PT409' then null;end;end$$;
select public.finalize_document_artifact((select id from c6_artifact_id),2);
reset role;update c6_artifact_id set hash=(select canonical_sha256 from public.document_artifacts where id=c6_artifact_id.id);
do $$begin begin update public.document_artifacts set canonical_payload='{}' where id=(select id from c6_artifact_id);raise exception 'frozen accepted';exception when raise_exception then if sqlerrm<>'document_artifact_canonical_fields_are_frozen'then raise;end if;end;end$$;

set local role authenticated;select set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000002',true);
do $$begin begin perform public.sign_document_artifact((select id from c6_artifact_id));raise exception 'student signed';exception when insufficient_privilege then null;end;end$$;
select set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000001',true);
with x as(select public.sign_document_artifact((select id from c6_artifact_id))p)update c6_artifact_id set code=(select(p->>'authenticity_code')::uuid from x);
reset role;set local role anon;
do $$declare v jsonb;begin v:=public.verify_document_authenticity((select code from c6_artifact_id));if(v->>'found')::boolean is not true or v::text ilike '%Paciente Sigiloso%' or v?'patient'then raise exception 'public authenticity leaked:%',v;end if;end$$;
reset role;set local role authenticated;select set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000003',true);select public.get_document_artifact((select id from c6_artifact_id));
select set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000004',true);do $$begin begin perform public.get_document_artifact((select id from c6_artifact_id));raise exception 'other read';exception when insufficient_privilege then null;end;end$$;
select set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000005',true);do $$begin begin perform public.get_document_artifact((select id from c6_artifact_id));raise exception 'admin read';exception when insufficient_privilege then null;end;end$$;
select set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000001',true);select public.invalidate_document_artifact((select id from c6_artifact_id),'Correção clínica necessária');reset role;
do $$begin if(select canonical_sha256 from public.document_artifacts where id=(select id from c6_artifact_id))<>(select hash from c6_artifact_id)then raise exception 'hash changed';end if;if(select status from public.document_artifacts where id=(select id from c6_artifact_id))<>'invalidated'then raise exception 'invalidation failed';end if;end$$;

-- Student prepares and freezes a private document; only the responsible supervisor signs.
create temporary table c6_student_artifact(id uuid,revision bigint);
grant select,insert,update on c6_student_artifact to authenticated;
set local role authenticated;select set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000002',true);
with x as(select public.create_document_artifact_from_clinical_record('94000000-0000-0000-0000-000000000021','professional_private') p)
insert into c6_student_artifact(id,revision)select(p->>'artifact_id')::uuid,(p->>'revision')::bigint from x;
with x as(select public.finalize_document_artifact((select id from c6_student_artifact),(select revision from c6_student_artifact)) p)
update c6_student_artifact set revision=(select(p->>'revision')::bigint from x);
do $$begin begin perform public.sign_document_artifact((select id from c6_student_artifact));raise exception 'student signed supervised artifact';exception when insufficient_privilege then null;end;end$$;
select set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000001',true);
select public.sign_document_artifact((select id from c6_student_artifact));
reset role;
do $$begin
 if (select status from public.document_artifacts where id=(select id from c6_student_artifact))<>'signed' then raise exception 'supervised document not signed';end if;
 if (select preparer_id from public.document_artifacts where id=(select id from c6_student_artifact))<>'94000000-0000-0000-0000-000000000002' then raise exception 'student preparer attribution lost';end if;
 if (select supervisor_id from public.document_artifacts where id=(select id from c6_student_artifact))<>'94000000-0000-0000-0000-000000000001' then raise exception 'supervisor attribution lost';end if;
end$$;
delete from private.document_authenticity_rate_limits;
set local role anon;
do $$declare v_result jsonb;begin
 for i in 1..30 loop
   v_result:=public.verify_document_authenticity('94000000-0000-0000-0000-000000000099');
   if coalesce((v_result->>'rate_limited')::boolean,false) then raise exception 'rate limit started too early at %',i;end if;
 end loop;
 v_result:=public.verify_document_authenticity('94000000-0000-0000-0000-000000000099');
 if coalesce((v_result->>'rate_limited')::boolean,false) is not true then raise exception 'anonymous authenticity rate limit missing';end if;
end$$;
reset role;
rollback;

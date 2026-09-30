begin;

do $$begin
 if has_table_privilege('anon','public.growth_records','select')
    or has_table_privilege('anon','public.meal_plans','select')
    or has_table_privilege('anon','public.diet_templates','select') then
   raise exception 'anonymous clinical data privileges remain';
 end if;
 if has_table_privilege('authenticated','public.lab_results','update')
    or has_table_privilege('authenticated','public.growth_records','delete')
    or has_table_privilege('authenticated','public.energy_expenditure_calculations','update') then
   raise exception 'direct clinical history mutation remains';
 end if;
 if not exists(select 1 from pg_indexes where schemaname='public' and indexname='document_artifacts_one_live_source_idx') then
   raise exception 'live document source uniqueness missing';
 end if;
end$$;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)values
('00000000-0000-0000-0000-000000000000','98000000-0000-0000-0000-000000000001','authenticated','authenticated','hard-pro@example.invalid','x',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','98000000-0000-0000-0000-000000000002','authenticated','authenticated','hard-p1@example.invalid','x',now(),'{}','{"user_type":"patient"}',now(),now()),
('00000000-0000-0000-0000-000000000000','98000000-0000-0000-0000-000000000003','authenticated','authenticated','hard-p2@example.invalid','x',now(),'{}','{"user_type":"patient"}',now(),now()),
('00000000-0000-0000-0000-000000000000','98000000-0000-0000-0000-000000000004','authenticated','authenticated','hard-admin@example.invalid','x',now(),'{}','{"user_type":"patient"}',now(),now());
-- Auth creates this profile first; configure the synthetic actor without disabling its trigger.
insert into public.user_profiles (id,name,user_type,is_admin,is_active,email,nutritionist_id) values
('98000000-0000-0000-0000-000000000001','Profissional Hardening','nutritionist',false,true,'hard-pro@example.invalid',null),
('98000000-0000-0000-0000-000000000002','Paciente Um','patient',false,true,'hard-p1@example.invalid','98000000-0000-0000-0000-000000000001'),
('98000000-0000-0000-0000-000000000003','Paciente Dois','patient',false,true,'hard-p2@example.invalid','98000000-0000-0000-0000-000000000001'),
('98000000-0000-0000-0000-000000000004','Admin Hardening','admin',true,true,'hard-admin@example.invalid',null)
on conflict (id) do update set
  name=excluded.name,
  user_type=excluded.user_type,
  is_admin=excluded.is_admin,
  is_active=excluded.is_active,
  email=excluded.email,
  nutritionist_id=excluded.nutritionist_id;
update public.professional_verifications set status='approved',professional_role='nutritionist',crn_region='CRN-3',crn_number='H-1',normalized_crn='CRN3H1',valid_until=now()+interval'1 year'
where user_id='98000000-0000-0000-0000-000000000001';
insert into public.care_episodes(id,patient_id,nutritionist_id,status,start_reason,started_by)values
('98000000-0000-0000-0000-000000000010','98000000-0000-0000-0000-000000000002','98000000-0000-0000-0000-000000000001','active','hardening','98000000-0000-0000-0000-000000000001'),
('98000000-0000-0000-0000-000000000011','98000000-0000-0000-0000-000000000003','98000000-0000-0000-0000-000000000001','active','hardening','98000000-0000-0000-0000-000000000001');
insert into public.professional_document_identities(
 professional_id,verification_id,version,status,professional_name,primary_color,accent_color,
 crn_region,crn_number,normalized_crn,logo_storage_path,created_by
)select p.id,v.id,1,'active',p.name,'#406733','#7DAF69',v.crn_region,v.crn_number,v.normalized_crn,
 '98000000-0000-0000-0000-000000000001/logo/old',p.id
from public.user_profiles p join public.professional_verifications v on v.user_id=p.id
where p.id='98000000-0000-0000-0000-000000000001';
insert into public.clinical_records(id,patient_id,care_episode_id,nutritionist_id,author_id,record_type,status,visibility,content,canonical_hash,signed_at)values
('98000000-0000-0000-0000-000000000020','98000000-0000-0000-0000-000000000002','98000000-0000-0000-0000-000000000010','98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-000000000001','follow_up','signed','shared_with_patient','{"summary":"Paciente um"}',repeat('a',64),now()),
('98000000-0000-0000-0000-000000000021','98000000-0000-0000-0000-000000000003','98000000-0000-0000-0000-000000000011','98000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-000000000001','follow_up','signed','shared_with_patient','{"summary":"Paciente dois"}',repeat('b',64),now());
insert into public.reference_foods(id,name,source,source_id,"group",portion_size,base_unit,calories,protein,carbs,fat,fiber,is_active)
values('98000000-0000-0000-0000-000000000030','Alimento Hardening','TBCA','HARD','QA',100,'g',100,5,15,2,3,true);

insert into private.admin_operators(user_id,grant_reason) values('98000000-0000-0000-0000-000000000004','synthetic QA');
create temporary table hard_ids(artifact uuid,lab bigint,lab_revision bigint,plan bigint,meal bigint,food bigint,privacy uuid,privacy_revision bigint);
grant select,insert,update on hard_ids to authenticated;
insert into hard_ids default values;

set local role authenticated;
select set_config('request.jwt.claim.sub','98000000-0000-0000-0000-000000000001',true);

with x as(select public.create_document_artifact_from_clinical_record('98000000-0000-0000-0000-000000000020','shared_with_patient')p)
update hard_ids set artifact=(select(p->>'artifact_id')::uuid from x);
select public.finalize_document_artifact((select artifact from hard_ids),1);
select public.sign_document_artifact((select artifact from hard_ids));
do $$begin
 begin perform public.create_document_artifact_from_clinical_record(
   '98000000-0000-0000-0000-000000000021','shared_with_patient',(select artifact from hard_ids),'Substituição cruzada maliciosa'
 );raise exception 'cross-patient document replacement accepted';
 exception when invalid_parameter_value then null;end;
end$$;

-- The legitimate same-source replacement remains atomic and signable, while
-- duplicate initial documents cannot coexist for the same clinical source.
do $$declare replacement uuid; result jsonb; predecessor uuid;begin
 predecessor:=(select artifact from hard_ids);
 begin perform public.create_document_artifact_from_clinical_record(
   '98000000-0000-0000-0000-000000000020','shared_with_patient');
   raise exception 'duplicate live clinical source accepted';
 exception when unique_violation then null;end;
 result:=public.create_document_artifact_from_clinical_record(
   '98000000-0000-0000-0000-000000000020','shared_with_patient',predecessor,'Nova emissão conferida pelo responsável');
 replacement:=(result->>'artifact_id')::uuid;
 perform public.finalize_document_artifact(replacement,1);
 perform public.sign_document_artifact(replacement);
 reset role; -- Inspect protected audit/history as the isolated fixture administrator.
 if (select status from public.document_artifacts where id=predecessor) is distinct from 'superseded'
    or (select status from public.document_artifacts where id=replacement) is distinct from 'signed' then
   raise exception 'legitimate document replacement did not preserve lifecycle';end if;
 update hard_ids set artifact=replacement;
 set local role authenticated;
end$$;

-- Invalidating the predecessor during a pending replacement must neither strand
-- the successor nor resurrect the invalidated document.
do $$declare predecessor uuid; replacement uuid; result jsonb;begin
 predecessor:=(select artifact from hard_ids);
 result:=public.create_document_artifact_from_clinical_record(
   '98000000-0000-0000-0000-000000000020','shared_with_patient',predecessor,'Nova emissão com revisão de invalidação');
 replacement:=(result->>'artifact_id')::uuid;
 perform public.finalize_document_artifact(replacement,1);
 perform public.invalidate_document_artifact(predecessor,'Documento anterior invalidado durante revisão');
 perform public.sign_document_artifact(replacement);
 reset role; -- Inspect protected audit/history as the isolated fixture administrator.
 if (select status from public.document_artifacts where id=predecessor) is distinct from 'invalidated'
    or (select status from public.document_artifacts where id=replacement) is distinct from 'signed'
    or not exists(select 1 from public.document_artifact_events where artifact_id=predecessor
      and event_type='replacement_signed' and from_status='invalidated' and to_status='invalidated') then
   raise exception 'pending replacement recovery or historical status failed';end if;
 update hard_ids set artifact=replacement;
 set local role authenticated;
end$$;

do $$begin
 begin perform public.create_lab_result_record(jsonb_build_object(
   'patient_id','98000000-0000-0000-0000-000000000002','test_name','Glicemia','test_value','90','test_date',current_date,'interpretation_confirmed',true
 ));raise exception 'implicit laboratory confirmation accepted';
 exception when check_violation then null;end;
 begin perform public.create_lab_result_record(jsonb_build_object(
   'patient_id','98000000-0000-0000-0000-000000000002','test_name','Glicemia','test_value','90','test_date',current_date,'reference_min',100,'reference_max',50
 ));raise exception 'inverted laboratory reference accepted';
 exception when invalid_parameter_value then null;end;
end$$;
with x as(select public.create_lab_result_record(jsonb_build_object(
 'patient_id','98000000-0000-0000-0000-000000000002','test_name','Glicemia','test_value','90','test_unit','mg/dL',
 'reference_min',70,'reference_max',99,'test_date',current_date
))p) update hard_ids set lab=(select(p->>'id')::bigint from x);
with x as(select public.revise_lab_result_record((select lab from hard_ids),'{"test_value":"91"}','Correção conferida no documento original')p)
update hard_ids set lab_revision=(select(p->>'id')::bigint from x);
do $$begin
 begin perform public.revise_lab_result_record((select lab from hard_ids),'{"test_value":"92"}','Tentativa sobre versão histórica antiga');
   raise exception 'old laboratory revision resurrected';exception when insufficient_privilege then null;end;
end$$;
select public.invalidate_lab_result_record((select lab_revision from hard_ids),'Registro duplicado confirmado em auditoria');
do $$declare v jsonb;begin v:=public.invalidate_lab_result_record((select lab_revision from hard_ids),'Repetição idempotente confirmada em auditoria');
 if coalesce((v->>'already_invalidated')::boolean,false)is not true then raise exception 'lab invalidation not idempotent';end if;end$$;

do $$begin
 begin insert into public.energy_expenditure_calculations(
   patient_id,nutritionist_id,care_episode_id,weight,height,age,gender,protocol,protocol_code,protocol_version,input_snapshot,output_snapshot,confirmed_by,confirmed_at
 )values('98000000-0000-0000-0000-000000000002',auth.uid(),'98000000-0000-0000-0000-000000000010',70,170,30,'M','bmi','anthropometry.bmi_adult',1,'{}','{}',auth.uid(),now());
 raise exception 'cross-domain energy protocol accepted';exception when check_violation then null;end;
end$$;

with x as(
 insert into public.meal_plans(patient_id,nutritionist_id,care_episode_id,name,start_date,is_active,is_draft,plan_mode,prescription_status)
 values('98000000-0000-0000-0000-000000000002',auth.uid(),'98000000-0000-0000-0000-000000000010','Plano Hardening',current_date,true,true,'hybrid','draft')returning id
)update hard_ids set plan=(select id from x);
with x as(
 insert into public.meal_plan_meals(meal_plan_id,name,meal_type,meal_time,order_index)
 values((select plan from hard_ids),'Almoço','lunch','12:00',0)returning id
)update hard_ids set meal=(select id from x);
with x as(
 insert into public.meal_plan_foods(meal_plan_meal_id,food_id,quantity,unit,order_index,calories,protein,carbs,fat,food_snapshot,measure_snapshot)
 values((select meal from hard_ids),'98000000-0000-0000-0000-000000000030',100,'gram',0,100,5,15,2,'{"name":"FORJADO"}','{"kind":"FORJADO"}')returning id
)update hard_ids set food=(select id from x);
do $$begin
 if(select food_snapshot->>'name' from public.meal_plan_foods where id=(select food from hard_ids))='FORJADO'
   or(select measure_snapshot->>'kind' from public.meal_plan_foods where id=(select food from hard_ids))='FORJADO' then
   raise exception 'client-controlled nutrition snapshot persisted';
 end if;
end$$;
do $$begin
 begin perform public.upsert_full_meal_plan((select plan from hard_ids),
   jsonb_build_object('name','Plano sem refeições','is_draft',false),'[]'::jsonb);
   raise exception 'empty finalized plan accepted';exception when invalid_parameter_value then null;end;
end$$;
select public.upsert_full_meal_plan((select plan from hard_ids),
 jsonb_build_object('name','Plano Final','is_draft',false,'active_days',jsonb_build_array('monday'),'plan_mode','hybrid','change_reason','Plano confirmado no teste adversarial'),
 jsonb_build_array(jsonb_build_object('name','Almoço','meal_type','lunch','meal_time','12:00','foods',jsonb_build_array(jsonb_build_object(
   'food_id','98000000-0000-0000-0000-000000000030','quantity',100,'unit','gram','calories',100,'protein',5,'carbs',15,'fat',2
 )))));
do $$begin
 if(select source_snapshot->>'protocol_code' from public.meal_plans where id=(select plan from hard_ids))<>'meal_plan.cfn_record' then
   raise exception 'wrong meal-plan protocol source persisted';
 end if;
end$$;
select public.archive_meal_plan((select plan from hard_ids),'Plano encerrado pelo teste adversarial');
do $$begin
 begin update public.meal_plan_foods set quantity=101 where meal_plan_meal_id in(select id from public.meal_plan_meals where meal_plan_id=(select plan from hard_ids));
   raise exception 'archived plan child mutated';exception when check_violation then null;end;
 begin perform public.upsert_full_meal_plan((select plan from hard_ids),jsonb_build_object('name','Ressuscitado','is_draft',true),'[]');
   raise exception 'archived plan resurrected';exception when insufficient_privilege then null;end;
end$$;

select set_config('request.jwt.claim.sub','98000000-0000-0000-0000-000000000002',true);
with x as(select public.create_my_data_subject_request('deletion','Solicitação adversarial de privacidade')p)
update hard_ids set privacy=(select(p->>'id')::uuid from x),privacy_revision=1;
select set_config('request.jwt.claim.sub','98000000-0000-0000-0000-000000000004',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','98000000-0000-0000-0000-000000000004','role','authenticated','aal','aal2')::text,true);
with x as(select public.update_data_subject_request((select privacy from hard_ids),1,'triaged','Triagem administrativa do teste',null,null,true)p)
update hard_ids set privacy_revision=(select(p->>'revision')::bigint from x);
do $$begin
 begin perform public.update_data_subject_request((select privacy from hard_ids),(select privacy_revision from hard_ids),'fulfilled','Encerramento sem base legal indevido','retain_legal_obligation',null,true);
   raise exception 'privacy request closed without legal basis';exception when invalid_parameter_value then null;end;
 begin perform public.update_data_subject_request((select privacy from hard_ids),(select privacy_revision from hard_ids),'fulfilled','Encerramento sem retenção indevido',null,'Obrigação legal avaliada pelo controlador',true);
   raise exception 'deletion request closed without retention decision';exception when invalid_parameter_value then null;end;
end$$;

select set_config('request.jwt.claim.sub','98000000-0000-0000-0000-000000000002',true);
do $$declare v jsonb;begin
 if not private.can_read_document_asset_object('document-assets','98000000-0000-0000-0000-000000000001/logo/old') then
   raise exception 'patient cannot read historical signed document asset';
 end if;
 v:=public.build_my_data_export_snapshot();
 if v::text like '%logo_storage_path%' or v::text like '%signature_evidence%' then raise exception 'privacy export leaked document internals';end if;
 if jsonb_typeof(v#>'{categories,privacy_requests}')<>'array' then raise exception 'privacy requests missing from export';end if;
end$$;

reset role;
rollback;

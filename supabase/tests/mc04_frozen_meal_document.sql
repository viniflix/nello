begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)values
('00000000-0000-0000-0000-000000000000','98000000-0000-0000-0000-000000000001','authenticated','authenticated','d-pro@example.invalid','x',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','98000000-0000-0000-0000-000000000002','authenticated','authenticated','d-patient@example.invalid','x',now(),'{}','{"user_type":"patient"}',now(),now()),
('00000000-0000-0000-0000-000000000000','98000000-0000-0000-0000-000000000003','authenticated','authenticated','d-other@example.invalid','x',now(),'{}','{"user_type":"nutritionist"}',now(),now());
-- Auth creates this profile first; configure the synthetic actor without disabling its trigger.
insert into public.user_profiles (id,name,user_type,is_active,email) values
('98000000-0000-0000-0000-000000000001','Nutricionista D','nutritionist',true,'d-pro@example.invalid'),
('98000000-0000-0000-0000-000000000002','Paciente D','patient',true,'d-patient@example.invalid'),
('98000000-0000-0000-0000-000000000003','Outro D','nutritionist',true,'d-other@example.invalid')
on conflict (id) do update set
  name=excluded.name,
  user_type=excluded.user_type,
  is_active=excluded.is_active,
  email=excluded.email;
update public.professional_verifications set status='approved',professional_role='nutritionist',crn_region='CRN-3',crn_number='D-1',normalized_crn='CRN3D1',valid_until=now()+interval'1 year'where user_id='98000000-0000-0000-0000-000000000001';
insert into public.care_episodes(id,patient_id,nutritionist_id,status,started_at,start_reason,started_by)values('98000000-0000-0000-0000-000000000010','98000000-0000-0000-0000-000000000002','98000000-0000-0000-0000-000000000001','active',now(),'qa-d','98000000-0000-0000-0000-000000000001');
-- Mantém o fixture compatível com as políticas legadas ainda vigentes durante a
-- migração para care_episodes. A matriz valida as duas representações do vínculo.
update public.user_profiles
set nutritionist_id='98000000-0000-0000-0000-000000000001'
where id='98000000-0000-0000-0000-000000000002';
insert into public.professional_document_identities(professional_id,verification_id,version,status,professional_name,primary_color,accent_color,crn_region,crn_number,normalized_crn,created_by)select p.id,v.id,1,'active',p.name,'#406733','#7DAF69',v.crn_region,v.crn_number,v.normalized_crn,p.id from public.user_profiles p join public.professional_verifications v on v.user_id=p.id where p.id='98000000-0000-0000-0000-000000000001';
insert into public.reference_foods(id,name,source,source_id,"group",portion_size,base_unit,calories,protein,carbs,fat,fiber,is_active)
values('98000000-0000-0000-0000-000000000020','Alimento QA D','TBCA','QA-D','Alimentos de QA',100,'g',120,5,20,2,0,true);


insert into public.food_measures(id,reference_food_id,label,weight_in_grams)
values('98000000-0000-0000-0000-000000000021','98000000-0000-0000-0000-000000000020','Colher congelada',15);
create temporary table mc_ids(plan bigint,meal bigint,food bigint,artifact uuid,canonical_hash text,canonical_payload jsonb);
grant select,insert,update on mc_ids to authenticated;
insert into mc_ids default values;
set local role authenticated;
select set_config('request.jwt.claim.sub','98000000-0000-0000-0000-000000000001',true);
with x as(insert into public.meal_plans(patient_id,nutritionist_id,care_episode_id,name,start_date,is_active,is_draft,prescription_status,daily_calories,daily_protein,daily_carbs,daily_fat)
values('98000000-0000-0000-0000-000000000002',auth.uid(),'98000000-0000-0000-0000-000000000010','Plano congelado QA',current_date,true,false,'finalized',36,1.5,6,.6) returning id)
update mc_ids set plan=(select id from x);
with x as(insert into public.meal_plan_meals(meal_plan_id,name,meal_type,meal_time,order_index,include_in_totals,notes)
select plan,'Refeição congelada','breakfast','08:00',0,true,'Orientação da refeição' from mc_ids returning id)
update mc_ids set meal=(select id from x);
with x as(insert into public.meal_plan_foods(meal_plan_meal_id,food_id,quantity,unit,calories,protein,carbs,fat,notes,patient_description)
select meal,'98000000-0000-0000-0000-000000000020',2,'98000000-0000-0000-0000-000000000021',36,1.5,6,.6,'Orientação do alimento','Descrição prescrita' from mc_ids returning id)
update mc_ids set food=(select id from x);
insert into public.meal_plan_food_substitutions(meal_plan_food_id,substitute_food_id,quantity,unit,notes)
select food,'98000000-0000-0000-0000-000000000020',50,'gram','Orientação da opção' from mc_ids;
insert into public.meal_plan_meals(meal_plan_id,name,meal_type,meal_time,order_index,include_in_totals)
select plan,'Alternativa congelada','dinner','20:00',1,false from mc_ids;
with x as(select public.create_document_artifact_from_meal_plan((select plan from mc_ids),'shared_with_patient') value)
update mc_ids set artifact=(select(value->>'artifact_id')::uuid from x);
reset role;
do $$declare content jsonb;begin
select draft_payload into content from public.document_artifacts where id=(select artifact from mc_ids);
if content->'meals'->0->'foods'->0->'measure_snapshot'->>'label'<>'Colher congelada'
or content->'meals'->0->'foods'->0->>'notes'<>'Orientação do alimento'
or content->'meals'->0->'foods'->0->'food_snapshot'->>'fiber'<>'0'
or content->'meals'->0->'foods'->0->'substitutes'->0->>'quantity'<>'50'
or content->'meals'->0->'foods'->0->'substitutes'->0->>'notes'<>'Orientação da opção'
or content->'meals'->1->>'include_in_totals'<>'false'
then raise exception 'Frozen prescription capture incomplete';end if;
end$$;
set local role authenticated;
do $$begin
begin perform public.create_document_artifact_from_meal_plan((select plan from mc_ids));raise exception 'Duplicate document allowed';exception when unique_violation then null;end;
end$$;
select public.finalize_document_artifact((select artifact from mc_ids),1);
select public.sign_document_artifact((select artifact from mc_ids));
update mc_ids set canonical_hash=(public.get_document_artifact(artifact)->>'sha256'),canonical_payload=(public.get_document_artifact(artifact)->'canonical_payload');
update public.meal_plan_foods set quantity=3,notes='Orientação posterior' where id=(select food from mc_ids);
reset role;
update public.reference_foods set name='Nome posterior',fiber=9 where id='98000000-0000-0000-0000-000000000020';
update public.food_measures set label='Medida posterior',weight_in_grams=25 where id='98000000-0000-0000-0000-000000000021';
set local role authenticated;
do $$declare document jsonb;begin
document:=public.get_document_artifact((select artifact from mc_ids));
if document->>'sha256'<>(select canonical_hash from mc_ids) or document->'canonical_payload'<>(select canonical_payload from mc_ids)
then raise exception 'Signed history changed with current prescription/catalog';end if;
end$$;
select set_config('request.jwt.claim.sub','98000000-0000-0000-0000-000000000003',true);
do $$begin
begin perform public.get_document_artifact((select artifact from mc_ids));raise exception 'Foreign document read allowed';exception when insufficient_privilege then null;end;
begin perform public.create_document_artifact_from_meal_plan((select plan from mc_ids));raise exception 'Foreign capture allowed';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','98000000-0000-0000-0000-000000000002',true);
do $$begin if public.get_document_artifact((select artifact from mc_ids))->>'status'<>'signed' then raise exception 'Authorized patient cannot read signed shared document';end if;end$$;
reset role;
rollback;

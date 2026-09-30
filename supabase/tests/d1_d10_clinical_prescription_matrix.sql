begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)values
('00000000-0000-0000-0000-000000000000','97000000-0000-0000-0000-000000000001','authenticated','authenticated','d-pro@example.invalid','x',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','97000000-0000-0000-0000-000000000002','authenticated','authenticated','d-patient@example.invalid','x',now(),'{}','{"user_type":"patient"}',now(),now()),
('00000000-0000-0000-0000-000000000000','97000000-0000-0000-0000-000000000003','authenticated','authenticated','d-other@example.invalid','x',now(),'{}','{"user_type":"nutritionist"}',now(),now());
-- Auth creates this profile first; configure the synthetic actor without disabling its trigger.
insert into public.user_profiles (id,name,user_type,is_active,email) values
('97000000-0000-0000-0000-000000000001','Nutricionista D','nutritionist',true,'d-pro@example.invalid'),
('97000000-0000-0000-0000-000000000002','Paciente D','patient',true,'d-patient@example.invalid'),
('97000000-0000-0000-0000-000000000003','Outro D','nutritionist',true,'d-other@example.invalid')
on conflict (id) do update set
  name=excluded.name,
  user_type=excluded.user_type,
  is_active=excluded.is_active,
  email=excluded.email;
update public.professional_verifications set status='approved',professional_role='nutritionist',crn_region='CRN-3',crn_number='D-1',normalized_crn='CRN3D1',valid_until=now()+interval'1 year'where user_id='97000000-0000-0000-0000-000000000001';
insert into public.care_episodes(id,patient_id,nutritionist_id,status,started_at,start_reason,started_by)values('97000000-0000-0000-0000-000000000010','97000000-0000-0000-0000-000000000002','97000000-0000-0000-0000-000000000001','active',now(),'qa-d','97000000-0000-0000-0000-000000000001');
-- Mantém o fixture compatível com as políticas legadas ainda vigentes durante a
-- migração para care_episodes. A matriz valida as duas representações do vínculo.
update public.user_profiles
set nutritionist_id='97000000-0000-0000-0000-000000000001'
where id='97000000-0000-0000-0000-000000000002';
insert into public.professional_document_identities(professional_id,verification_id,version,status,professional_name,primary_color,accent_color,crn_region,crn_number,normalized_crn,created_by)select p.id,v.id,1,'active',p.name,'#406733','#7DAF69',v.crn_region,v.crn_number,v.normalized_crn,p.id from public.user_profiles p join public.professional_verifications v on v.user_id=p.id where p.id='97000000-0000-0000-0000-000000000001';
insert into public.reference_foods(id,name,source,source_id,"group",portion_size,base_unit,calories,protein,carbs,fat,fiber,is_active)
values('97000000-0000-0000-0000-000000000020','Alimento QA D','TBCA','QA-D','Alimentos de QA',100,'g',120,5,20,2,3,true);

create temporary table d_ids(anthro bigint,lab bigint,lab_revision bigint,energy bigint,template uuid,plan bigint,artifact uuid);
grant select,insert,update on d_ids to authenticated;
insert into d_ids default values;
set local role authenticated;select set_config('request.jwt.claim.sub','97000000-0000-0000-0000-000000000001',true);

do $$begin if(select count(*)from public.list_clinical_protocol_catalog(null))<12 then raise exception 'D1 catalog incomplete';end if;end$$;
select public.accept_clinical_protocol('energy.mifflin_st_jeor',1,'accepted','Aprovado para uso com julgamento clínico individual');
select public.accept_clinical_protocol('energy.mifflin_st_jeor',1,'restricted','Restrito após nova avaliação profissional de QA');
do $$begin if(select value->'professional_decision'->>'decision'from public.list_clinical_protocol_catalog('energy')value where value->>'code'='energy.mifflin_st_jeor')<>'restricted'then raise exception 'D2 current professional decision projection failed';end if;end$$;

with x as(insert into public.growth_records(patient_id,care_episode_id,record_date,weight,height,created_by_user_id,protocol_code,protocol_version,source_snapshot,confirmed_by,confirmed_at)values('97000000-0000-0000-0000-000000000002','97000000-0000-0000-0000-000000000010',current_date,70,170,auth.uid(),'anthropometry.bmi_adult',1,'{"method":"measured"}',auth.uid(),now())returning id)update d_ids set anthro=(select id from x);
with x as(select public.revise_anthropometry_record((select anthro from d_ids),'{"weight":70.5}'::jsonb,'Correção conferida na ficha de avaliação de QA')p)update d_ids set anthro=(select(p->>'id')::bigint from x);
do $$begin if(select revision_number from public.growth_records where id=(select anthro from d_ids))<>2 then raise exception 'D3 anthropometry revision missing';end if;end$$;
select public.invalidate_anthropometry_record((select anthro from d_ids),'Medida inválida confirmada em QA');
do $$begin begin delete from public.growth_records where id=(select anthro from d_ids);raise exception 'D3 hard delete accepted';exception when check_violation or insufficient_privilege then null;end;end$$;

with x as(select public.create_lab_result_record(jsonb_build_object('patient_id','97000000-0000-0000-0000-000000000002','test_name','Glicemia','test_value','92','test_unit','mg/dL','reference_min',70,'reference_max',99,'status','normal','test_date',current_date,'reference_snapshot',jsonb_build_object('origin','laboratory_report')))p)update d_ids set lab=(select(p->>'id')::bigint from x);
select public.confirm_lab_result_interpretation((select lab from d_ids),'Faixa e unidade conferidas no laudo original de QA');
do $$begin if(select interpretation_status from public.lab_results where id=(select lab from d_ids))<>'confirmed'then raise exception 'D5 professional interpretation confirmation missing';end if;end$$;
with x as(select public.revise_lab_result_record((select lab from d_ids),jsonb_build_object('test_value','93','status','normal','test_date',current_date),'Correção do valor conforme laudo original')p)update d_ids set lab_revision=(select(p->>'id')::bigint from x);
select public.invalidate_lab_result_record((select lab_revision from d_ids),'Resultado duplicado no laudo de QA');
do $$begin if(select is_latest_revision from public.lab_results where id=(select lab from d_ids))then raise exception 'D5 old lab remained latest';end if;begin delete from public.lab_results where id=(select lab from d_ids);raise exception 'D5 hard delete accepted';exception when check_violation or insufficient_privilege then null;end;end$$;

with x as(insert into public.energy_expenditure_calculations(patient_id,nutritionist_id,care_episode_id,weight,height,age,gender,protocol,activity_level,tmb,get,tmb_protocol,tmb_result,activity_factor,get_result,final_planned_kcal,protocol_code,protocol_version,input_snapshot,output_snapshot,confirmed_by,confirmed_at)values('97000000-0000-0000-0000-000000000002',auth.uid(),'97000000-0000-0000-0000-000000000010',70,170,30,'M','mifflin',1.55,1600,2480,'mifflin',1600,1.55,2480,2200,'energy.mifflin_st_jeor',1,'{"weight_kg":70}','{"planned_kcal":2200}',auth.uid(),now())returning id)update d_ids set energy=(select id from x);
do $$begin begin update public.energy_expenditure_calculations set final_planned_kcal=2100 where id=(select energy from d_ids);raise exception 'D4 mutation accepted';exception when check_violation or insufficient_privilege then null;end;begin delete from public.energy_expenditure_calculations where id=(select energy from d_ids);raise exception 'D4 hard delete accepted';exception when check_violation or insufficient_privilege then null;end;end$$;

do $$declare v_food uuid;v_template uuid;begin select id into v_food from public.foods where calories>0 limit 1;if v_food is null then raise exception 'D9 food fixture missing';end if;v_template:=public.create_diet_template(auth.uid(),'Template D completo','Cópia profunda',array['qa'],jsonb_build_array(jsonb_build_object('name','Almoço','time','12:00','order_index',0,'foods',jsonb_build_array(jsonb_build_object('food_id',v_food,'quantity',100,'unit','g','order_index',0)))));update d_ids set template=v_template;perform public.update_diet_template(v_template,auth.uid(),'Template D versionado','Segunda versão',array['qa','v2'],jsonb_build_array(jsonb_build_object('name','Almoço','time','12:00','order_index',0,'foods',jsonb_build_array(jsonb_build_object('food_id',v_food,'quantity',120,'unit','g','order_index',0)))));end$$;
do $$begin if(select count(*)from public.list_diet_template_versions((select template from d_ids)))<>2 then raise exception 'D9 immutable template versions missing';end if;begin perform count(*)from public.diet_template_versions;raise exception 'D9 direct template history read accepted';exception when insufficient_privilege then null;end;end$$;
with x as(select public.clone_diet_template_to_patient((select template from d_ids),'97000000-0000-0000-0000-000000000002',auth.uid(),'Plano D')id)update d_ids set plan=(select id from x);
do $$begin if not exists(select 1 from public.meal_plan_foods f join public.meal_plan_meals m on m.id=f.meal_plan_meal_id where m.meal_plan_id=(select plan from d_ids)and f.quantity=120 and f.food_snapshot<>'{}')then raise exception 'D6/D9 deep copy or nutrition snapshot missing';end if;end$$;
do $$declare v_food uuid;begin select id into v_food from public.foods where calories>0 limit 1;perform public.upsert_full_meal_plan((select plan from d_ids),jsonb_build_object('name','Plano D versionado','description','Prescrição de QA','start_date',current_date,'end_date',null,'is_active',true,'is_draft',false,'active_days',jsonb_build_array('monday','wednesday','friday'),'plan_mode','hybrid','change_reason','Ajuste clínico confirmado em QA'),jsonb_build_array(jsonb_build_object('name','Almoço','meal_type','lunch','meal_time','12:00','order_index',0,'total_calories',144,'total_protein',6,'total_carbs',24,'total_fat',2.4,'foods',jsonb_build_array(jsonb_build_object('food_id',v_food,'quantity',120,'unit','g','calories',144,'protein',6,'carbs',24,'fat',2.4,'order_index',0)))));end$$;
do $$begin if(select count(*)from public.meal_plan_versions where meal_plan_id=(select plan from d_ids))<>2 then raise exception 'D8 atomic baseline/current versions missing';end if;if(select plan_mode from public.meal_plans where id=(select plan from d_ids))<>'hybrid'or(select active_days from public.meal_plans where id=(select plan from d_ids))<>jsonb_build_array('monday','wednesday','friday')then raise exception 'D6 plan strategy was not persisted';end if;end$$;
select set_config('request.jwt.claim.sub','97000000-0000-0000-0000-000000000003',true);
do $$begin begin perform public.upsert_full_meal_plan((select plan from d_ids),'{}'::jsonb,'[]'::jsonb);raise exception 'D8 cross-professional write accepted';exception when insufficient_privilege then null;end;end$$;
select set_config('request.jwt.claim.sub','97000000-0000-0000-0000-000000000001',true);
update public.meal_plans set is_draft=false,prescription_status='finalized',daily_calories=2200,daily_protein=120,daily_carbs=280,daily_fat=65 where id=(select plan from d_ids);
with x as(select public.create_document_artifact_from_meal_plan((select plan from d_ids),'shared_with_patient')p)update d_ids set artifact=(select(p->>'artifact_id')::uuid from x);
select public.finalize_document_artifact((select artifact from d_ids),1);select public.sign_document_artifact((select artifact from d_ids));
do $$declare v_document jsonb;begin v_document:=public.get_document_artifact((select artifact from d_ids));if v_document->>'source_key'<>(select plan::text from d_ids)or v_document->'canonical_payload'->'content'->>'title'<>'PLANO ALIMENTAR'then raise exception 'D10 canonical meal plan document failed';end if;end$$;
select public.archive_meal_plan((select plan from d_ids),'Plano encerrado após emissão de QA');
delete from public.meal_plans where id=(select plan from d_ids);
do $$begin if not exists(select 1 from public.meal_plans where id=(select plan from d_ids))then raise exception 'D8 hard delete accepted';end if;begin update public.meal_plan_versions set change_reason='x';raise exception 'D8 version mutation accepted';exception when check_violation or insufficient_privilege then null;end;end$$;
reset role;
do $$begin if(select count(*)from public.clinical_protocol_acceptances where protocol_code='energy.mifflin_st_jeor'and nutritionist_id='97000000-0000-0000-0000-000000000001')<>2 then raise exception 'D2 immutable decision history missing';end if;end$$;
do $$begin if not exists(select 1 from public.clinical_calculation_snapshots where source_entity='energy_expenditure_calculations'and source_id=(select energy::text from d_ids))then raise exception 'D4 calculation snapshot missing';end if;if not exists(select 1 from public.clinical_calculation_snapshots where source_entity='growth_records'and protocol_code='anthropometry.bmi_adult')then raise exception 'D3 calculation snapshot missing';end if;if not exists(select 1 from public.clinical_calculation_snapshots where source_entity='lab_results'and protocol_code='laboratory.manual_reference')then raise exception 'D5 interpretation snapshot missing';end if;end$$;
rollback;

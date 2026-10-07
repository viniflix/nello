begin;
-- Fixed independent cohort: ten mature professionals, four activations, two returns.
create temp table product_fixture(id uuid primary key,n integer) on commit drop;
do $$ declare actor uuid; op uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); i integer;
begin
 perform set_config('qa.product_op',op::text,true);
 insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data)
 values(op,'authenticated','authenticated',op||'@example.invalid',now()-interval '20 days','{"name":"Synthetic owner","user_type":"nutritionist"}'),
 (p,'authenticated','authenticated',p||'@example.invalid',now()-interval '20 days','{"name":"Synthetic patient","user_type":"patient"}');
 perform set_config('qa.product_patient',p::text,true);
 insert into private.admin_operators(user_id,role,grant_reason) values(op,'owner','Synthetic rollback-only analytics fixture');
 insert into private.admin_operators(user_id,role,grant_reason)
 select id,'auditor','Synthetic rollback-only population isolation' from public.user_profiles where id not in(op,p)
 on conflict(user_id) do nothing;
 update private.admin_metric_definition set capture_started_at=now()-interval '40 days';
 for i in 1..12 loop
  actor:=gen_random_uuid(); insert into product_fixture values(actor,i);
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data)
   values(actor,'authenticated','authenticated',actor||'@example.invalid',now()-case when i=11 then interval '2 days' else interval '20 days' end,'{"name":"Synthetic professional","user_type":"nutritionist"}');
  if i=12 then insert into private.admin_operators(user_id,role,grant_reason,revoked_at)
   values(actor,'auditor','Synthetic revoked internal account',now()); end if;
  if i<=4 or i=12 then
   insert into private.admin_work_events(actor_id,kind,source_key,occurred_at)
   values(actor,'plan_published','cohort:'||actor,now()-interval '16 days');
  end if;
  if i<=2 then insert into private.admin_work_events(actor_id,kind,source_key,occurred_at)
   values(actor,'appointment_saved','return:'||actor,now()-interval '8 days'); end if;
 end loop;
 insert into private.auth_legal_receipts(user_id,version,purpose,allowed,source,recorded_at)
 select id,'2026-10-01.2','analytics',true,'preferences',case when n=3 then now()-interval '181 days' when n=4 then now()+interval '1 day' else now() end
 from product_fixture where n between 1 and 4;
 insert into private.auth_legal_receipts(user_id,version,purpose,allowed,source)
 select id,'2026-10-01.2','analytics',false,'preferences' from product_fixture where n=2;
 if has_function_privilege('anon','public.admin_product_analytics(integer)','execute')
 or has_table_privilege('authenticated','private.admin_work_events','select')
 or has_function_privilege('authenticated','private.admin_capture_work_receipt()','execute')
 then raise exception 'product_direct_access'; end if;
end $$;
set local role authenticated;
do $$ declare j jsonb; op uuid:=current_setting('qa.product_op')::uuid;
begin
 perform set_config('request.jwt.claim.sub',current_setting('qa.product_patient'),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.product_patient'),'aal','aal2','role','authenticated')::text,true);
 begin perform public.admin_product_analytics();raise exception 'patient_allowed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',op::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',op,'aal','aal1','role','authenticated')::text,true);
 begin perform public.admin_product_analytics();raise exception 'aal1_allowed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',op,'aal','aal2','role','authenticated')::text,true);
 j:=public.admin_product_analytics(30);
 if j->'activation'->>'eligible'<>'10' or j->'activation'->>'activated'<>'4' or j->'activation'->>'recent'<>'1'
 or j->'return'->>'eligible'<>'4' or j->'return'->>'returned'<>'2'
 or (j->'activation'->>'median_hours')::numeric<>96 or (j->'activation'->>'p90_hours')::numeric<>96
 or j->>'professional_population'<>'11' or j::text like '%@example.invalid%' or j::text like '%Synthetic professional%'
 or j->'consent'->>'allowed'<>'1' or j->'consent'->>'not_allowed_or_unknown'<>'10'
 then raise exception 'independent_cohort_oracle:%',j;end if;
 begin perform public.admin_product_analytics(31);raise exception 'invalid_window_allowed';exception when invalid_parameter_value then null;end;
 begin perform public.admin_product_analytics(null);raise exception 'null_window_allowed';exception when invalid_parameter_value then null;end;
end $$;
reset role;
do $$ declare actor uuid; nonce uuid:=gen_random_uuid(); before_ bigint;
plan_id bigint; episode uuid; source_id text; patient uuid:=current_setting('qa.product_patient')::uuid;
begin
 select id into actor from product_fixture where n=1;
 select count(*) into before_ from private.admin_work_events;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 -- Missing source rows and a receipt belonging to another actor are not confirmed work.
 insert into private.mutation_receipts(actor,nonce,operation,fingerprint,result_ids)
 values(actor,nonce,'record:energy_expenditure_calculations','synthetic',array['-999999']),
 (current_setting('qa.product_patient')::uuid,gen_random_uuid(),'clinical:appointment','synthetic',array['-999999']);
 if (select count(*) from private.admin_work_events)<>before_ then raise exception 'receipt_without_owned_source';end if;
 insert into private.admin_work_events(actor_id,kind,source_key,occurred_at)
 values(actor,'appointment_saved','return:'||actor,now()) on conflict(kind,source_key) do nothing;
 if (select count(*) from private.admin_work_events)<>before_ then raise exception 'duplicate_operation';end if;
 select id into actor from product_fixture where n=5;
 update public.user_profiles set nutritionist_id=actor where id=current_setting('qa.product_patient')::uuid;
 insert into public.nutritionist_patients(nutritionist_id,patient_id,status) values(actor,current_setting('qa.product_patient')::uuid,'active');
 select id into episode from public.care_episodes where nutritionist_id=actor and patient_id=current_setting('qa.product_patient')::uuid and status='active';
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.meal_plans(nutritionist_id,patient_id,name,is_active,is_draft,is_template,start_date)
 values(actor,current_setting('qa.product_patient')::uuid,'Synthetic draft',false,true,false,current_date) returning id into plan_id;
 if exists(select 1 from private.admin_work_events where actor_id=actor)then raise exception 'draft_counted_as_publication';end if;
 update public.meal_plans set is_active=true,is_draft=false,prescription_status='finalized',confirmed_at=now(),confirmed_by=actor where id=plan_id;
 if (select count(*) from private.admin_work_events where actor_id=actor and kind='plan_published')<>1 then raise exception 'publication_not_captured';end if;
 perform set_config('TimeZone','America/Fortaleza',true);
 update public.meal_plans set is_active=true where id=plan_id;
 if (select count(*) from private.admin_work_events where actor_id=actor and kind='plan_published')<>1 then raise exception 'timezone_duplicate';end if;
 perform set_config('TimeZone','UTC',true);
 -- Every supported receipt must resolve to a real row owned by its authenticated actor.
 insert into public.appointments(patient_id,nutritionist_id,appointment_time,start_time,status,care_episode_id)
 values(patient,actor,now(),now(),'scheduled',episode) returning id::text into source_id;
 insert into private.mutation_receipts(actor,nonce,operation,fingerprint,result_ids)
 values(actor,gen_random_uuid(),'clinical:appointment','synthetic',array[source_id]);
 insert into public.growth_records(patient_id,record_date,weight,height,created_by_user_id,care_episode_id)
 values(patient,current_date,70,170,actor,episode) returning id::text into source_id;
 insert into private.mutation_receipts(actor,nonce,operation,fingerprint,result_ids)
 values(actor,gen_random_uuid(),'record:growth_records','synthetic',array[source_id]);
 insert into public.energy_expenditure_calculations(patient_id,nutritionist_id,care_episode_id,weight,height,age,gender,protocol_code,protocol_version,input_snapshot,output_snapshot,confirmed_by,confirmed_at)
 values(patient,actor,episode,70,170,30,'M','energy.mifflin_st_jeor',1,'{"weight_kg":70}','{"planned_kcal":2200}',actor,now()) returning id::text into source_id;
 insert into private.mutation_receipts(actor,nonce,operation,fingerprint,result_ids)
 values(actor,gen_random_uuid(),'record:energy_expenditure_calculations','synthetic',array[source_id]);
 if (select count(distinct kind) from private.admin_work_events where actor_id=actor)<>4 then raise exception 'owned_receipts_not_captured';end if;
 perform set_config('request.jwt.claim.sub',patient::text,true);
 insert into public.meals(patient_id,care_episode_id,meal_type,meal_date,meal_time,total_calories,total_protein,total_carbs,total_fat)
 values(patient,episode,'lunch',current_date,'12:00',100,5,10,3) returning id::text into source_id;
 insert into private.mutation_receipts(actor,nonce,operation,fingerprint,result_ids)
 values(patient,gen_random_uuid(),'clinical:diary_meal','synthetic',array[source_id]);
 if not exists(select 1 from private.admin_work_events where actor_id=patient and episode_id=episode and kind='patient_diary') then raise exception 'patient_receipt_not_captured';end if;
 perform set_config('request.jwt.claim.sub',current_setting('qa.product_op'),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.product_op'),'aal','aal2','role','authenticated')::text,true);
 if public.admin_product_analytics(30)->>'both_sides_episodes'<>'1' then raise exception 'both_actor_correlation';end if;
 update public.care_episodes set created_at=now()-interval '9 days' where id=episode;
 update private.admin_work_events set occurred_at=now()-interval '8 days' where episode_id=episode and kind='plan_published';
 update private.admin_work_events set occurred_at=now()-interval '7 days' where episode_id=episode and kind='patient_diary';
 if public.admin_product_analytics(30)->'patient_journey'->>'eligible_episodes'<>'1'
 or public.admin_product_analytics(30)->'patient_journey'->>'published_episodes'<>'1'
 or public.admin_product_analytics(30)->'patient_journey'->>'diary_eligible'<>'1'
 or public.admin_product_analytics(30)->'patient_journey'->>'diary_used'<>'1' then raise exception 'patient_funnel_oracle';end if;
 insert into private.admin_work_events(actor_id,kind,source_key,occurred_at)
 values(actor,'appointment_saved','expired',now()-interval '181 days');
 perform private.admin_purge_work_events();
 if exists(select 1 from private.admin_work_events where source_key='expired')then raise exception 'retention_not_applied';end if;
 -- Exact seven-day upper boundary is excluded; recent and incomplete windows are separate.
 update private.admin_work_events set occurred_at=now()-interval '13 days' where actor_id=(select id from product_fixture where n=1) and kind='plan_published';
 update private.admin_operators set role='auditor' where user_id=current_setting('qa.product_op')::uuid;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.product_op'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.product_op'),'aal','aal2','role','authenticated')::text,true);
do $$ declare j jsonb;begin
 j:=public.admin_product_analytics(90);
 if j->'activation'->>'activated'<>'3' then raise exception 'seven_day_boundary';end if;
end $$;
reset role;
update private.admin_operators set revoked_at=now() where user_id=current_setting('qa.product_op')::uuid;
set local role authenticated;
do $$begin
 begin perform public.admin_product_analytics();raise exception 'revoked_allowed';exception when insufficient_privilege then null;end;
end $$;
rollback;

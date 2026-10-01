-- Synthetic transfer, NULL ownership and audit-target regression scenarios.
begin;
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
('10000000-0000-0000-0000-000000000601','authenticated','authenticated','post06-n1@example.invalid','{"user_type":"nutritionist","name":"QA A"}'),
('10000000-0000-0000-0000-000000000602','authenticated','authenticated','post06-n2@example.invalid','{"user_type":"nutritionist","name":"QA B"}'),
('20000000-0000-0000-0000-000000000601','authenticated','authenticated','post06-p1@example.invalid','{"user_type":"patient","name":"QA transfer"}'),
('20000000-0000-0000-0000-000000000602','authenticated','authenticated','post06-p2@example.invalid','{"user_type":"patient","name":"QA unlinked"}');
update public.professional_verifications set status='approved',professional_role='nutritionist',verification_method='approved_by_migration',valid_until=now()+interval '1 year'
 where user_id in ('10000000-0000-0000-0000-000000000601','10000000-0000-0000-0000-000000000602');
insert into public.nutritionist_patients(nutritionist_id,patient_id,status) values
('10000000-0000-0000-0000-000000000601','20000000-0000-0000-0000-000000000601','active');
update public.user_profiles set nutritionist_id='10000000-0000-0000-0000-000000000601' where id='20000000-0000-0000-0000-000000000601';
create temporary table qa_ids(k text primary key,id text);
insert into qa_ids select 'old_episode',id::text from public.care_episodes where patient_id='20000000-0000-0000-0000-000000000601' and status='active';
insert into public.growth_records(patient_id,weight,height,record_date) values('20000000-0000-0000-0000-000000000601',65,170,current_date);
insert into public.meals(patient_id,meal_type,meal_date,meal_time,total_calories,total_protein,total_carbs,total_fat) values
('20000000-0000-0000-0000-000000000601','lunch',current_date,'12:00',100,5,10,3),
('20000000-0000-0000-0000-000000000602','lunch',current_date,'12:00',100,5,10,3);
insert into qa_ids select 'old_meal',id::text from public.meals where patient_id='20000000-0000-0000-0000-000000000601';
insert into qa_ids select 'unlinked_meal',id::text from public.meals where patient_id='20000000-0000-0000-0000-000000000602';
insert into public.appointments(patient_id,nutritionist_id,appointment_time,start_time,status,notes) values
('20000000-0000-0000-0000-000000000601','10000000-0000-0000-0000-000000000601',now(),now(),'scheduled','PRIVATE_OLD_EPISODE');
insert into public.prescriptions(patient_id,nutritionist_id,calories,protein,carbs,fat,start_date,end_date) values
('20000000-0000-0000-0000-000000000601','10000000-0000-0000-0000-000000000601',1800,80,200,50,current_date,current_date+7);
grant select on qa_ids to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000601',true);
do $test$ begin
 if (select count(*) from public.get_comprehensive_activity_feed_optimized(auth.uid(),30))<2 then raise exception 'legitimate_feed_denied';end if;
 perform public.log_activity_event('qa.clinical',p_patient_id:='20000000-0000-0000-0000-000000000601');
 perform public.log_meal_action_secure((select id from qa_ids where k='old_meal'),'update','{}');
 begin perform public.log_meal_action_secure((select id from qa_ids where k='unlinked_meal'),'update','{}');raise exception 'null_ownership_allowed';exception when insufficient_privilege then null;end;
 begin perform public.log_activity_event('qa.forged',p_patient_id:='20000000-0000-0000-0000-000000000602');raise exception 'foreign_activity_allowed';exception when insufficient_privilege then null;end;
 begin perform public.log_activity_event('qa.forged',p_nutritionist_id:='10000000-0000-0000-0000-000000000602');raise exception 'foreign_provider_event_allowed';exception when insufficient_privilege then null;end;
end $test$;
select public.end_care_episode('20000000-0000-0000-0000-000000000601','qa_transfer');
reset role;
insert into public.nutritionist_patients(nutritionist_id,patient_id,status) values
('10000000-0000-0000-0000-000000000602','20000000-0000-0000-0000-000000000601','active');
update public.user_profiles set nutritionist_id='10000000-0000-0000-0000-000000000602' where id='20000000-0000-0000-0000-000000000601';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000602',true);
do $test$ declare r record;begin
 if exists(select 1 from public.get_comprehensive_activity_feed_optimized(auth.uid(),30)) then raise exception 'transferred_history_leaked';end if;
 select * into strict r from public.get_patients_pending_data_optimized(auth.uid());
 if r.has_anthropometry or r.has_prescription then raise exception 'old_episode_presence_leaked';end if;
 select * into strict r from public.get_patients_low_adherence_optimized(auth.uid(),7);
 if r.last_meal_date is not null then raise exception 'old_meal_time_leaked';end if;
 if public.get_daily_adherence(auth.uid())<>0 then raise exception 'old_adherence_leaked';end if;
 begin perform public.log_meal_action_secure((select id from qa_ids where k='old_meal'),'update','{}');raise exception 'old_episode_audit_write_allowed';exception when insufficient_privilege then null;end;
 begin perform public.log_activity_event('qa.forged',p_patient_id:='20000000-0000-0000-0000-000000000601',p_nutritionist_id:='10000000-0000-0000-0000-000000000601');raise exception 'old_provider_event_spoof_allowed';exception when insufficient_privilege then null;end;
 perform public.log_activity_event('qa.current',p_patient_id:='20000000-0000-0000-0000-000000000601');
end $test$;
reset role;
insert into public.growth_records(patient_id,weight,height,record_date) values('20000000-0000-0000-0000-000000000601',66,170,current_date);
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000602',true);
do $test$ begin
 if (select count(*) from public.get_comprehensive_activity_feed_optimized(auth.uid(),30))<>1 then raise exception 'new_episode_feed_invalid';end if;
end $test$;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000601',true);
select public.log_meal_action_secure((select id from qa_ids where k='old_meal'),'update','{}');
reset role;
do $test$ begin
 if exists(select 1 from public.meal_audit_log where meal_id=(select id::bigint from qa_ids where k='old_meal') and care_episode_id is distinct from (select id::uuid from qa_ids where k='old_episode')) then raise exception 'audit_reassigned_to_new_episode';end if;
 if (select count(*) from public.growth_records where patient_id='20000000-0000-0000-0000-000000000601')<>2 then raise exception 'historical_data_lost';end if;
end $test$;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000601',true);
do $test$ begin
 if not private.can_read_care_episode((select id::uuid from qa_ids where k='old_episode')) then raise exception 'original_participant_history_denied';end if;
 begin perform public.log_meal_action_secure((select id from qa_ids where k='old_meal'),'update','{}');raise exception 'ended_professional_audit_allowed';exception when insufficient_privilege then null;end;
end $test$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000602',true);
select public.log_meal_action_secure((select id from qa_ids where k='unlinked_meal'),'update','{}');
select public.log_activity_event('qa.own_unlinked',p_patient_id:=auth.uid());
reset role;
insert into public.nutritionist_patients(nutritionist_id,patient_id,status) values
('10000000-0000-0000-0000-000000000602','20000000-0000-0000-0000-000000000602','active');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000602',true);
select public.log_meal_action_secure((select id from qa_ids where k='unlinked_meal'),'update','{}');
reset role;
do $test$ begin
 if exists(select 1 from public.meal_audit_log where meal_id=(select id::bigint from qa_ids where k='unlinked_meal') and care_episode_id is not null) then raise exception 'private_legacy_audit_reassigned';end if;
end $test$;
insert into public.growth_records(patient_id,weight,height,record_date) select '20000000-0000-0000-0000-000000000601',66,170,current_date from generate_series(1,110);
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000602',true);
do $test$ begin
 if (select count(*) from public.get_comprehensive_activity_feed_optimized(auth.uid(),2147483647))<>100 then raise exception 'feed_limit_unbounded';end if;
end $test$;
reset role;
update public.user_profiles set is_active=false where id='10000000-0000-0000-0000-000000000602';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000602',true);
do $test$ begin
 begin perform public.log_activity_event('qa.inactive');raise exception 'inactive_audit_allowed';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.list_nutritionist_care_patients()) then raise exception 'inactive_patient_list_leaked';end if;
end $test$;
reset role;
rollback;

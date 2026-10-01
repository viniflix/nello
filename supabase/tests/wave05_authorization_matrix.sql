-- Synthetic identities only; the runner provides a disposable database clone.
begin;
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
('10000000-0000-0000-0000-000000000501','authenticated','authenticated','wave5-n1@example.invalid','{"name":"QA N1","user_type":"nutritionist"}'),
('10000000-0000-0000-0000-000000000502','authenticated','authenticated','wave5-n2@example.invalid','{"name":"QA N2","user_type":"nutritionist"}'),
('20000000-0000-0000-0000-000000000501','authenticated','authenticated','wave5-p1@example.invalid','{"name":"QA P1","user_type":"patient"}'),
('20000000-0000-0000-0000-000000000502','authenticated','authenticated','wave5-p2@example.invalid','{"name":"QA P2","user_type":"patient"}');
update public.user_profiles set nutritionist_id='10000000-0000-0000-0000-000000000501' where id='20000000-0000-0000-0000-000000000501';
update public.user_profiles set nutritionist_id='10000000-0000-0000-0000-000000000502' where id='20000000-0000-0000-0000-000000000502';
insert into public.nutritionist_patients(nutritionist_id,patient_id,status) values
('10000000-0000-0000-0000-000000000501','20000000-0000-0000-0000-000000000501','active'),
('10000000-0000-0000-0000-000000000502','20000000-0000-0000-0000-000000000502','active');
insert into public.notifications(user_id,type,content) values
('20000000-0000-0000-0000-000000000501','test','{}'),('20000000-0000-0000-0000-000000000502','test','{}');

set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000501',true);
do $test$ declare c integer;k text;begin
 foreach k in array array['is_active','is_admin','user_type','nutritionist_id','simulation_owner_id','is_simulation','patient_invite_code','invite_code','id'] loop
  if has_column_privilege('authenticated','public.user_profiles',k,'UPDATE') then raise exception 'protected_profile_column:%',k;end if;
 end loop;
 begin update public.user_profiles set is_active=false where id=auth.uid();raise exception 'self_deactivation_allowed';exception when insufficient_privilege then null;end;
 begin update public.user_profiles set clinical_flags='{"forged":true}' where id=auth.uid();raise exception 'self_clinical_flags_allowed';exception when insufficient_privilege then null;end;
 update public.user_profiles set name='QA P1 updated',weight=65,height=170 where id=auth.uid();
 if exists(select 1 from public.growth_records where patient_id=auth.uid()) then raise exception 'implicit_unvalidated_assessment';end if;
 insert into public.chats(from_id,to_id,message) values(auth.uid(),'10000000-0000-0000-0000-000000000501','synthetic valid');
 begin insert into public.chats(from_id,to_id,message) values('10000000-0000-0000-0000-000000000501',auth.uid(),'forged sender');raise exception 'forged_chat_sender_allowed';exception when insufficient_privilege then null;end;
 begin insert into public.chats(from_id,to_id,message) values(auth.uid(),'10000000-0000-0000-0000-000000000502','cross clinic');raise exception 'cross_clinic_chat_allowed';exception when insufficient_privilege then null;end;
 begin perform public.get_chat_recipient_profile('20000000-0000-0000-0000-000000000502');raise exception 'foreign_recipient_profile_leaked';exception when insufficient_privilege then null;end;
 begin perform public.get_nutritionist_conversations('10000000-0000-0000-0000-000000000502');raise exception 'foreign_conversations_leaked';exception when insufficient_privilege then null;end;
 update public.notifications set is_read=true where user_id='20000000-0000-0000-0000-000000000502';get diagnostics c=row_count;if c<>0 then raise exception 'foreign_notification_changed';end if;
 update public.notifications set is_read=true where user_id=auth.uid();get diagnostics c=row_count;if c<1 then raise exception 'own_notification_denied';end if;
 begin perform public.log_meal_action('20000000-0000-0000-0000-000000000502',-1,'synthetic');raise exception 'foreign_meal_audit_allowed';exception when insufficient_privilege then null;end;
 begin perform public.soft_delete_meal(-1);raise exception 'unowned_meal_delete_allowed';exception when insufficient_privilege then null;end;
 begin perform public.clone_meal_template_to_plan(gen_random_uuid(),-1,'lunch');raise exception 'unowned_plan_template_write_allowed';exception when insufficient_privilege then null;end;
 begin perform public.log_operational_event('qa','test',p_nutritionist_id:='10000000-0000-0000-0000-000000000502');raise exception 'foreign_operational_identity_allowed';exception when insufficient_privilege then null;end;
 begin insert into public.notifications(user_id,type,content) values(auth.uid(),'forged','{}');raise exception 'notification_forgery_allowed';exception when insufficient_privilege then null;end;
end $test$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000501',true);
do $test$ declare c integer;begin
 update public.user_profiles set clinical_flags='{"synthetic":true}' where id='20000000-0000-0000-0000-000000000501';get diagnostics c=row_count;if c<>1 then raise exception 'provider_profile_update_denied';end if;
 update public.user_profiles set phone='QA' where id='20000000-0000-0000-0000-000000000502';get diagnostics c=row_count;if c<>0 then raise exception 'cross_profile_update_allowed';end if;
 if (select count(*) from public.get_patients_for_new_chat(auth.uid()))<>1 then raise exception 'own_patient_chat_list_denied';end if;
end $test$;
reset role;
update public.nutritionist_patients set status='ended' where patient_id='20000000-0000-0000-0000-000000000501';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000501',true);
do $test$ begin
 begin insert into public.chats(from_id,to_id,message) values(auth.uid(),'10000000-0000-0000-0000-000000000501','ended link');raise exception 'ended_chat_write_allowed';exception when insufficient_privilege then null;end;
 if (select count(*) from public.chats where from_id=auth.uid())<>1 then raise exception 'historical_chat_lost';end if;
end $test$;
reset role;
update public.user_profiles set is_active=false where id='20000000-0000-0000-0000-000000000501';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000501',true);
do $test$ begin
 if exists(select 1 from public.chats) or exists(select 1 from public.notifications) then raise exception 'inactive_actor_reads_allowed';end if;
 if private.can_read_care_episode((select id from public.care_episodes where patient_id=auth.uid() limit 1)) then raise exception 'inactive_clinical_read_allowed';end if;
 begin perform public.check_and_grant_achievements(auth.uid());raise exception 'inactive_definer_rpc_allowed';exception when insufficient_privilege then null;end;
 begin update public.user_profiles set name='disabled' where id=auth.uid();raise exception 'inactive_profile_write_allowed';exception when insufficient_privilege then null;end;
end $test$;
reset role;
do $test$ begin
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prorettype='trigger'::regtype and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))) then raise exception 'trigger_rpc_grants_exposed';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity and c.relname not in ('user_profiles','chats','notifications') and exists(select 1 from pg_policy pol where pol.polrelid=c.oid and pol.polpermissive and pol.polroles && array[0::oid,(select oid from pg_roles where rolname='authenticated')]) and not exists(select 1 from pg_policies p where p.schemaname=n.nspname and p.tablename=c.relname and p.policyname='wave05_active_actor' and p.permissive='RESTRICTIVE')) then raise exception 'active_actor_policy_coverage_gap';end if;
 if not exists(select 1 from private.profile_authorization_events where actor_id='20000000-0000-0000-0000-000000000501' and 'name'=any(changed_fields)) then raise exception 'profile_audit_missing';end if;
 if has_table_privilege('authenticated','private.profile_authorization_events','SELECT') or has_table_privilege('anon','private.profile_authorization_events','SELECT') then raise exception 'private_profile_audit_exposed';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname not in ('storage_object_readable','reserve_storage_upload','claim_storage_upload','attach_anamnesis_file','detach_anamnesis_file','get_anamnesis_by_token','submit_anamnesis_by_token','verify_document_authenticity','get_invite_details','search_foods','get_food_stats','get_grams_from_measure','convert_custom_measure_to_grams','normalize_food_search','auth_uid','auth_role','auth_setting','get_user_id','is_nutritionist','is_patient') and has_function_privilege('anon',p.oid,'EXECUTE')) then raise exception 'anonymous_function_allowlist_gap';end if;
end $test$;
rollback;

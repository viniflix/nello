-- Synthetic identities; only the guarded disposable PostgreSQL clone runs this.
begin;
do $guard$ begin
 if current_database() !~ '^nello_qa_wave02_[0-9]+$' or current_user <> 'supabase_admin' then
  raise exception 'anamnesis_lifecycle_requires_isolated_clone';
 end if;
end $guard$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('10000000-0000-0000-0000-000000000901','authenticated','authenticated','sec01-professional@example.invalid','{"user_type":"nutritionist","name":"Synthetic"}'),
 ('10000000-0000-0000-0000-000000000902','authenticated','authenticated','sec01-other@example.invalid','{"user_type":"nutritionist","name":"Synthetic"}'),
 ('20000000-0000-0000-0000-000000000901','authenticated','authenticated','sec01-patient@example.invalid','{"user_type":"patient","name":"Synthetic"}');
insert into public.care_episodes(id,patient_id,nutritionist_id,status) values
 ('40000000-0000-0000-0000-000000000901','20000000-0000-0000-0000-000000000901','10000000-0000-0000-0000-000000000901','active');
update public.user_profiles set nutritionist_id='10000000-0000-0000-0000-000000000901' where id='20000000-0000-0000-0000-000000000901';
insert into public.anamnesis_records(id,patient_id,nutritionist_id,care_episode_id,content,status,template_snapshot,public_access_token,token_expires_at,filled_by) values
 ('80000000-0000-0000-0000-000000000901','20000000-0000-0000-0000-000000000901','10000000-0000-0000-0000-000000000901','40000000-0000-0000-0000-000000000901','{}','draft',
 '{"sections":[{"fields":[{"id":"symptom","label":"Synthetic","clinical_flag_key":"sec01_flag"},{"id":"upload","type":"file","label":"Synthetic file"}]}]}','90000000-0000-0000-0000-000000000901',now()+interval '1 hour','patient');

create function pg_temp.sec01_attempt(label text,statement text,allowed boolean) returns void language plpgsql as $test$
declare actual boolean:=true;
begin
 begin execute statement; exception when insufficient_privilege then actual:=false; end;
 if actual is distinct from allowed then raise exception 'sec01:%:expected_%:actual_%',label,allowed,actual; end if;
 raise notice 'PASS sec01 %',label;
end $test$;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000901',true);
do $active$ declare result jsonb;begin
 result:=public.generate_anamnesis_link('80000000-0000-0000-0000-000000000901',auth.uid(),7);
 perform set_config('qa.sec01_token',result->>'token',true);
 if result->>'success'<>'true' then raise exception 'sec01_active_link_failed';end if;
end $active$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $active$ begin
 if public.get_anamnesis_by_token(current_setting('qa.sec01_token')::uuid) ? 'error' then raise exception 'sec01_active_public_read_failed';end if;
 perform public.submit_anamnesis_by_token(current_setting('qa.sec01_token')::uuid,'{"symptom":"draft"}','draft',false,null,null);
end $active$;
reset role;

-- Represent two files already verified before revocation; no real file content.
select set_config('qa.sec01_path','public/'||current_setting('qa.sec01_token')||'/80000000-0000-0000-0000-000000000901/90000000-0000-0000-0000-000000000931.pdf',true);
select set_config('qa.sec01_path2','public/'||current_setting('qa.sec01_token')||'/80000000-0000-0000-0000-000000000901/90000000-0000-0000-0000-000000000932.pdf',true);
insert into private.storage_upload_reservations(bucket_id,object_path,tenant_id,patient_id,care_episode_id,quota_key,mime_type,expected_size,verified_size,sha256,source_sha256,status,verified_at)
select 'anamnesis-attachments',path,'10000000-0000-0000-0000-000000000901','20000000-0000-0000-0000-000000000901','40000000-0000-0000-0000-000000000901','sec01','application/pdf',32,32,repeat('a',64),repeat('b',64),'confirmed',now()
from (values(current_setting('qa.sec01_path')),(current_setting('qa.sec01_path2'))) paths(path);
insert into storage.objects(bucket_id,name,metadata)
select 'anamnesis-attachments',path,'{"size":32,"mimetype":"application/pdf"}' from (values(current_setting('qa.sec01_path')),(current_setting('qa.sec01_path2'))) paths(path);
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $file$ declare attachments jsonb;begin
 attachments:=public.attach_anamnesis_file('80000000-0000-0000-0000-000000000901',current_setting('qa.sec01_token')::uuid,current_setting('qa.sec01_path'),'upload','Synthetic file','synthetic.pdf');
 perform set_config('qa.sec01_attachment',attachments->0->>'id',true);
end $file$;
reset role;

-- Call the actual participant-end operation, retaining its notifications/history.
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000901',true);
select private.end_care_episode('20000000-0000-0000-0000-000000000901','synthetic security regression');
create temporary table sec01_before as select to_jsonb(r) as record,
 (select clinical_flags from public.user_profiles where id=r.patient_id) as flags,
 (select count(*) from public.notifications) as notifications
 from public.anamnesis_records r where id='80000000-0000-0000-0000-000000000901';

set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $closed$ declare expected boolean:=coalesce(current_setting('qa.sec01_baseline',true),'')='1';begin
 if (public.get_anamnesis_by_token(current_setting('qa.sec01_token')::uuid) ? 'error') is distinct from not expected then raise exception 'sec01_revoked_public_read';end if;
 perform pg_temp.sec01_attempt('ended token draft',format('select public.submit_anamnesis_by_token(%L::uuid,%L::jsonb,%L,false,null,null)',current_setting('qa.sec01_token'),'{"symptom":"forged"}','draft'),expected);
 -- Lifecycle path validation may reject attachment before the table trigger.
 begin
  perform public.attach_anamnesis_file('80000000-0000-0000-0000-000000000901',current_setting('qa.sec01_token')::uuid,current_setting('qa.sec01_path2'),'upload','Synthetic file','synthetic2.pdf');
  if not expected then raise exception 'sec01_ended_attachment_allowed';end if;
 exception when insufficient_privilege or invalid_parameter_value then if expected then raise;end if;end;
 perform pg_temp.sec01_attempt('ended token detach',format('select public.detach_anamnesis_file(%L::uuid,%L::uuid,%L::uuid)','80000000-0000-0000-0000-000000000901',current_setting('qa.sec01_token'),current_setting('qa.sec01_attachment')),expected);
 perform pg_temp.sec01_attempt('ended token completion and flags',format('select public.submit_anamnesis_by_token(%L::uuid,%L::jsonb,%L,true,null,null)',current_setting('qa.sec01_token'),'{"symptom":"forged"}','submitted'),expected);
end $closed$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000901',true);
do $closed$ declare expected boolean:=coalesce(current_setting('qa.sec01_baseline',true),'')='1';begin
 perform pg_temp.sec01_attempt('ended owner reissues link','select public.generate_anamnesis_link(''80000000-0000-0000-0000-000000000901'',auth.uid(),7)',expected);
 perform pg_temp.sec01_attempt('ended direct owner update','update public.anamnesis_records set content=''{}'' where id=''80000000-0000-0000-0000-000000000901''',expected);
 if not exists(select 1 from public.anamnesis_records where id='80000000-0000-0000-0000-000000000901') then raise exception 'sec01_historical_read_lost';end if;
 if not private.can_access_anamnesis_attachment_object(current_setting('qa.sec01_path'),false) then raise exception 'sec01_historical_attachment_read_lost';end if;
end $closed$;
reset role;

do $persist$ begin
 perform set_config('request.jwt.claim.sub','',true);
 if coalesce(current_setting('qa.sec01_baseline',true),'')<>'1' and private.can_access_anamnesis_attachment_object(current_setting('qa.sec01_path'),false) then raise exception 'sec01_revoked_public_file_read';end if;
 if coalesce(current_setting('qa.sec01_baseline',true),'')<>'1' and exists(
  select 1 from sec01_before b cross join public.anamnesis_records r where r.id='80000000-0000-0000-0000-000000000901'
  and (b.record is distinct from to_jsonb(r) or b.flags is distinct from (select clinical_flags from public.user_profiles where id=r.patient_id)
   or b.notifications is distinct from (select count(*) from public.notifications))) then raise exception 'sec01_denial_mutated_state';end if;
end $persist$;

-- New active care must never revive a capability bound to the old episode.
insert into public.care_episodes(id,patient_id,nutritionist_id,status) values
 ('40000000-0000-0000-0000-000000000902','20000000-0000-0000-0000-000000000901','10000000-0000-0000-0000-000000000902','active');
update public.user_profiles set nutritionist_id='10000000-0000-0000-0000-000000000902' where id='20000000-0000-0000-0000-000000000901';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000901',true);
do $relink$ begin
 perform pg_temp.sec01_attempt('old episode cannot move into new episode','update public.anamnesis_records set care_episode_id=''40000000-0000-0000-0000-000000000902'',nutritionist_id=''10000000-0000-0000-0000-000000000902'' where id=''80000000-0000-0000-0000-000000000901''',false);
end $relink$;
reset role;

insert into public.anamnesis_records(id,patient_id,nutritionist_id,care_episode_id,content,status,template_snapshot,public_access_token,token_expires_at,filled_by) values
 ('80000000-0000-0000-0000-000000000902','20000000-0000-0000-0000-000000000901','10000000-0000-0000-0000-000000000902','40000000-0000-0000-0000-000000000902','{}','in_progress',
 '{"sections":[{"fields":[{"id":"symptom","label":"Synthetic","clinical_flag_key":"sec01_flag"}]}]}','90000000-0000-0000-0000-000000000902',now()+interval '1 hour','patient');
-- An active episode alone must not bypass deactivation of either participant.
do $inactive$ declare participant uuid;begin
 if coalesce(current_setting('qa.sec01_baseline',true),'')<>'1' then
  foreach participant in array array['10000000-0000-0000-0000-000000000902'::uuid,'20000000-0000-0000-0000-000000000901'::uuid] loop
   update public.user_profiles set is_active=false where id=participant;
   execute 'set local role anon';
   perform set_config('request.jwt.claim.sub','',true);
   if not (public.get_anamnesis_by_token('90000000-0000-0000-0000-000000000902') ? 'error') then raise exception 'sec01_inactive_public_read';end if;
   perform pg_temp.sec01_attempt('inactive participant token write','select public.submit_anamnesis_by_token(''90000000-0000-0000-0000-000000000902'',''{}'',''draft'',false,null,null)',false);
   execute 'reset role';
   update public.user_profiles set is_active=true where id=participant;
  end loop;
 end if;
end $inactive$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $legitimate$ declare revision timestamptz;nonce uuid:='90000000-0000-0000-0000-000000000911';result jsonb;begin
 revision:=(public.get_anamnesis_draft_revision('90000000-0000-0000-0000-000000000902')->>'updated_at')::timestamptz;
 revision:=(public.save_anamnesis_draft_revision('90000000-0000-0000-0000-000000000902','{"symptom":"legitimate"}',false,revision)->>'updated_at')::timestamptz;
 begin
  perform public.complete_anamnesis_revision('90000000-0000-0000-0000-000000000902','{"symptom":"legitimate"}',false,revision,nonce);
  raise exception 'sec01_consent_bypass';
 exception when others then if sqlerrm<>'LGPD_CONSENT_REQUIRED' then raise;end if;end;
 result:=public.complete_anamnesis_revision('90000000-0000-0000-0000-000000000902','{"symptom":"legitimate"}',true,revision,nonce);
 if result->>'success'<>'true' then raise exception 'sec01_active_completion_failed';end if;
 result:=public.complete_anamnesis_revision('90000000-0000-0000-0000-000000000902','{"symptom":"legitimate"}',true,revision,nonce);
 if result->>'success'<>'true' then raise exception 'sec01_receipt_retry_failed';end if;
 begin
  perform public.submit_anamnesis_by_token('90000000-0000-0000-0000-000000000902','{}','draft',false,null,null);
  raise exception 'sec01_consumed_token_replayed';
 exception when others then if sqlerrm<>'TOKEN_INVALID_OR_EXPIRED' then raise;end if;end;
end $legitimate$;
reset role;
do $flags$ begin
 if (select clinical_flags#>>'{sec01_flag,value}' from public.user_profiles where id='20000000-0000-0000-0000-000000000901')<>'legitimate' then raise exception 'sec01_active_flags_lost';end if;
 if coalesce(current_setting('qa.sec01_baseline',true),'')<>'1' then
  if private.anamnesis_episode_active('40000000-0000-0000-0000-000000000902','20000000-0000-0000-0000-000000000901','10000000-0000-0000-0000-000000000901') then raise exception 'sec01_incompatible_episode_accepted';end if;
 end if;
end $flags$;
rollback;

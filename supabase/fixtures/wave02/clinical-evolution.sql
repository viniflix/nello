-- Synthetic fixtures extracted from the reviewed QA harness; current Auth triggers remain enabled.
-- Never run against production or a database containing accounts.
do $$ begin
if current_database() !~ '^nello_qa_wave02_[0-9]+$' or current_user <> 'supabase_admin'
then raise exception 'wave02_fixture_requires_isolated_matrix_database'; end if;
if exists(select 1 from auth.users) or exists(select 1 from public.user_profiles)
then raise exception 'wave02_fixture_requires_empty_accounts'; end if;
end $$;
-- alpha seed
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000041','authenticated','authenticated','alpha-c1@example.invalid','not-used',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000041','authenticated','authenticated','patient-c1@example.invalid','not-used',now(),'{}','{"user_type":"patient"}',now(),now()),
('00000000-0000-0000-0000-000000000000','30000000-0000-0000-0000-000000000041','authenticated','authenticated','admin-c1@example.invalid','not-used',now(),'{}','{"user_type":"patient"}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000042','authenticated','authenticated','former-c1@example.invalid','not-used',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000043','authenticated','authenticated','unrelated-c1@example.invalid','not-used',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000044','authenticated','authenticated','student-c1@example.invalid','not-used',now(),'{}','{"user_type":"nutritionist"}',now(),now());
insert into public.user_profiles(id,name,user_type,is_admin,is_active) values
('10000000-0000-0000-0000-000000000041','Nutricionista Atual C1','nutritionist',false,true),
('20000000-0000-0000-0000-000000000041','Paciente C1','patient',false,true),
('30000000-0000-0000-0000-000000000041','Admin C1','patient',true,true),
('10000000-0000-0000-0000-000000000042','Former C1','nutritionist',false,true),
('10000000-0000-0000-0000-000000000043','Unrelated C1','nutritionist',false,true),
('10000000-0000-0000-0000-000000000044','Student C1','nutritionist',false,true)
on conflict (id) do update set
  name=excluded.name,
  user_type=excluded.user_type,
  is_admin=excluded.is_admin,
  is_active=excluded.is_active;
-- C2 persona seed
insert into public.professional_verifications(
  user_id,professional_role,status,verification_method,crn_number,crn_region,
  valid_until,reviewed_at,decision_reason
) values
('10000000-0000-0000-0000-000000000041','nutritionist','approved','official_registry_manual','900041','CRN-3',now()+interval '1 year',now(),'matrix'),
('10000000-0000-0000-0000-000000000042','nutritionist','approved','official_registry_manual','900042','CRN-3',now()+interval '1 year',now(),'matrix'),
('10000000-0000-0000-0000-000000000043','nutritionist','approved','official_registry_manual','900043','CRN-3',now()+interval '1 year',now(),'matrix'),
('10000000-0000-0000-0000-000000000044','student','approved','student_document_manual',null,null,now()+interval '1 year',now(),'matrix')
on conflict (user_id) do update set
  professional_role = excluded.professional_role,
  status = excluded.status,
  verification_method = excluded.verification_method,
  crn_number = excluded.crn_number,
  crn_region = excluded.crn_region,
  normalized_crn = null,
  valid_until = excluded.valid_until,
  reviewed_at = excluded.reviewed_at,
  decision_reason = excluded.decision_reason;

insert into public.care_episodes(
  id,patient_id,nutritionist_id,status,started_at,ended_at,start_reason,end_reason,started_by,ended_by
) values
('40000000-0000-0000-0000-000000000041','20000000-0000-0000-0000-000000000041','10000000-0000-0000-0000-000000000042','ended',now()-interval '1 year',now()-interval '6 months','started','ended','10000000-0000-0000-0000-000000000042','10000000-0000-0000-0000-000000000042'),
('40000000-0000-0000-0000-000000000043','20000000-0000-0000-0000-000000000041','10000000-0000-0000-0000-000000000041','active',now()-interval '1 month',null,'started',null,'10000000-0000-0000-0000-000000000041',null);

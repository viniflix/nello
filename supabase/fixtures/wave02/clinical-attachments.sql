-- Synthetic fixtures extracted from the reviewed QA harness; current Auth triggers remain enabled.
-- Never run against production or a database containing accounts.
do $$ begin
if current_database() !~ '^nello_qa_wave02_[0-9]+$' or current_user <> 'supabase_admin'
then raise exception 'wave02_fixture_requires_isolated_matrix_database'; end if;
if exists(select 1 from auth.users) or exists(select 1 from public.user_profiles)
then raise exception 'wave02_fixture_requires_empty_accounts'; end if;
end $$;
-- C5 personas seed
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000081','authenticated','authenticated','nutritionist-c5@example.invalid','not-used',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000083','authenticated','authenticated','student-c5@example.invalid','not-used',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000084','authenticated','authenticated','former-nutritionist-c5@example.invalid','not-used',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000085','authenticated','authenticated','unrelated-nutritionist-c5@example.invalid','not-used',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','30000000-0000-0000-0000-000000000081','authenticated','authenticated','admin-c5@example.invalid','not-used',now(),'{}','{"user_type":"patient"}',now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000081','authenticated','authenticated','patient-c5@example.invalid','not-used',now(),'{}','{"user_type":"patient"}',now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000082','authenticated','authenticated','other-patient-c5@example.invalid','not-used',now(),'{}','{"user_type":"patient"}',now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000083','authenticated','authenticated','student-patient-c5@example.invalid','not-used',now(),'{}','{"user_type":"patient"}',now(),now());
insert into public.user_profiles(id,name,user_type,is_admin,is_active) values
('10000000-0000-0000-0000-000000000081','Nutricionista C5','nutritionist',false,true),
('10000000-0000-0000-0000-000000000083','Estudante C5','nutritionist',false,true),
('10000000-0000-0000-0000-000000000084','Ex Nutricionista C5','nutritionist',false,true),
('10000000-0000-0000-0000-000000000085','Nutricionista Sem Vinculo C5','nutritionist',false,true),
('30000000-0000-0000-0000-000000000081','Administrador C5','patient',true,true),
('20000000-0000-0000-0000-000000000081','Paciente C5','patient',false,true),
('20000000-0000-0000-0000-000000000082','Outro Paciente C5','patient',false,true),
('20000000-0000-0000-0000-000000000083','Paciente do Estudante C5','patient',false,true)
on conflict (id) do update set
  name=excluded.name,
  user_type=excluded.user_type,
  is_admin=excluded.is_admin,
  is_active=excluded.is_active;
-- C5 episode seed
insert into public.professional_verifications(
  user_id,professional_role,status,verification_method,crn_number,crn_region,
  valid_until,reviewed_at,decision_reason
) values (
  '10000000-0000-0000-0000-000000000081','nutritionist','approved',
  'official_registry_manual','12345','CRN-3',now()+interval '1 year',now(),'matrix'
) ,(
  '10000000-0000-0000-0000-000000000083','student','approved',
  'student_document_manual',null,null,now()+interval '6 months',now(),'matrix'
) ,(
  '10000000-0000-0000-0000-000000000084','nutritionist','approved',
  'official_registry_manual','54321','CRN-3',now()+interval '1 year',now(),'matrix'
) ,(
  '10000000-0000-0000-0000-000000000085','nutritionist','approved',
  'official_registry_manual','67890','CRN-3',now()+interval '1 year',now(),'matrix'
) on conflict (user_id) do update set
  professional_role=excluded.professional_role,status=excluded.status,
  verification_method=excluded.verification_method,crn_number=excluded.crn_number,
  crn_region=excluded.crn_region,normalized_crn=null,valid_until=excluded.valid_until,
  reviewed_at=excluded.reviewed_at,decision_reason=excluded.decision_reason;
insert into public.student_supervisions(
  student_id,supervisor_id,status,requested_at,responded_at,started_at
) values (
  '10000000-0000-0000-0000-000000000083','10000000-0000-0000-0000-000000000081',
  'active',now(),now(),now()
);
insert into public.care_episodes(
  id,patient_id,nutritionist_id,status,started_at,start_reason,started_by,
  ended_at,end_reason,ended_by
) values
(
  '40000000-0000-0000-0000-000000000081','20000000-0000-0000-0000-000000000081',
  '10000000-0000-0000-0000-000000000081','active',now(),'matrix',
  '10000000-0000-0000-0000-000000000081',null,null,null
),(
  '40000000-0000-0000-0000-000000000082','20000000-0000-0000-0000-000000000082',
  '10000000-0000-0000-0000-000000000081','active',now(),'matrix-other',
  '10000000-0000-0000-0000-000000000081',null,null,null
),(
  '40000000-0000-0000-0000-000000000083','20000000-0000-0000-0000-000000000083',
  '10000000-0000-0000-0000-000000000083','active',now(),'matrix-student',
  '10000000-0000-0000-0000-000000000083',null,null,null
),(
  '40000000-0000-0000-0000-000000000084','20000000-0000-0000-0000-000000000082',
  '10000000-0000-0000-0000-000000000084','ended',now()-interval '1 year','matrix-former',
  '10000000-0000-0000-0000-000000000084',now()-interval '6 months',
  'matrix-ended','10000000-0000-0000-0000-000000000084'
);
insert into public.clinical_records(
  id,patient_id,care_episode_id,nutritionist_id,author_id,record_type,status,content
) values (
  '70000000-0000-0000-0000-000000000082','20000000-0000-0000-0000-000000000082',
  '40000000-0000-0000-0000-000000000082','10000000-0000-0000-0000-000000000081',
  '10000000-0000-0000-0000-000000000081','initial_assessment','draft','{}'::jsonb
);

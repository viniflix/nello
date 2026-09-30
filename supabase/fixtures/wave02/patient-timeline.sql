-- Synthetic fixtures extracted from the reviewed QA harness; current Auth triggers remain enabled.
-- Never run against production or a database containing accounts.
do $$ begin
if current_database() !~ '^nello_qa_wave02_[0-9]+$' or current_user <> 'supabase_admin'
then raise exception 'wave02_fixture_requires_isolated_matrix_database'; end if;
if exists(select 1 from auth.users) or exists(select 1 from public.user_profiles)
then raise exception 'wave02_fixture_requires_empty_accounts'; end if;
end $$;
-- timeline personas seed
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000051','authenticated','authenticated','current-c3@example.invalid','not-used',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000052','authenticated','authenticated','former-c3@example.invalid','not-used',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000053','authenticated','authenticated','unrelated-c3@example.invalid','not-used',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000054','authenticated','authenticated','student-c3@example.invalid','not-used',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000055','authenticated','authenticated','simulation-owner-c3@example.invalid','not-used',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000051','authenticated','authenticated','patient-c3@example.invalid','not-used',now(),'{}','{"user_type":"patient"}',now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000052','authenticated','authenticated','student-patient-c3@example.invalid','not-used',now(),'{}','{"user_type":"patient"}',now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000056','authenticated','authenticated','simulation-patient-c3@example.invalid','not-used',now(),'{}','{"user_type":"patient"}',now(),now()),
('00000000-0000-0000-0000-000000000000','30000000-0000-0000-0000-000000000051','authenticated','authenticated','admin-c3@example.invalid','not-used',now(),'{}','{"user_type":"patient"}',now(),now());
insert into public.user_profiles(id,name,user_type,is_admin,is_active) values
('10000000-0000-0000-0000-000000000051','Nutricionista Atual C3','nutritionist',false,true),
('10000000-0000-0000-0000-000000000052','Nutricionista Anterior C3','nutritionist',false,true),
('10000000-0000-0000-0000-000000000053','Nutricionista Alheio C3','nutritionist',false,true),
('10000000-0000-0000-0000-000000000054','Estudante C3','nutritionist',false,true),
('10000000-0000-0000-0000-000000000055','Proprietario de Simulacao C3','nutritionist',false,true),
('20000000-0000-0000-0000-000000000051','Paciente C3','patient',false,true),
('20000000-0000-0000-0000-000000000052','Paciente do Estudante C3','patient',false,true),
('20000000-0000-0000-0000-000000000056','Paciente Simulado C3','patient',false,true),
('30000000-0000-0000-0000-000000000051','Administrador C3','patient',true,true)
on conflict (id) do update set
  name=excluded.name,
  user_type=excluded.user_type,
  is_admin=excluded.is_admin,
  is_active=excluded.is_active;
-- episode and verification seed
insert into public.professional_verifications(
  user_id,professional_role,status,verification_method,crn_number,crn_region,
  valid_until,reviewed_at,decision_reason
) values
('10000000-0000-0000-0000-000000000051','nutritionist','approved','official_registry_manual','900051','CRN-3',now()+interval '1 year',now(),'matrix'),
('10000000-0000-0000-0000-000000000052','nutritionist','approved','official_registry_manual','900052','CRN-3',now()+interval '1 year',now(),'matrix'),
('10000000-0000-0000-0000-000000000053','nutritionist','approved','official_registry_manual','900053','CRN-3',now()+interval '1 year',now(),'matrix'),
('10000000-0000-0000-0000-000000000054','student','approved','student_document_manual',null,null,now()+interval '1 year',now(),'matrix')
on conflict (user_id) do update set
  professional_role=excluded.professional_role,status=excluded.status,
  verification_method=excluded.verification_method,crn_number=excluded.crn_number,
  crn_region=excluded.crn_region,valid_until=excluded.valid_until,
  reviewed_at=excluded.reviewed_at,decision_reason=excluded.decision_reason;

insert into public.student_supervisions(
  student_id,supervisor_id,status,requested_at,responded_at,started_at
) values (
  '10000000-0000-0000-0000-000000000054','10000000-0000-0000-0000-000000000051',
  'active',now(),now(),now()
);

update public.user_profiles
set is_simulation=true,simulation_owner_id='10000000-0000-0000-0000-000000000055'
where id='20000000-0000-0000-0000-000000000056';

update public.professional_verifications
set status='rejected',valid_until=now()-interval '1 day',reviewed_at=now(),decision_reason='simulation fixture'
where user_id='10000000-0000-0000-0000-000000000055';

insert into public.care_episodes(
  id,patient_id,nutritionist_id,status,started_at,ended_at,start_reason,end_reason,started_by,ended_by
) values
('40000000-0000-0000-0000-000000000051','20000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000052','ended',now()-interval '1 year',now()-interval '6 months','started','ended','10000000-0000-0000-0000-000000000052','10000000-0000-0000-0000-000000000052'),
('40000000-0000-0000-0000-000000000052','20000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000051','active',now()-interval '1 month',null,'started',null,'10000000-0000-0000-0000-000000000051',null),
('40000000-0000-0000-0000-000000000053','20000000-0000-0000-0000-000000000052','10000000-0000-0000-0000-000000000054','active',now()-interval '1 week',null,'student_started',null,'10000000-0000-0000-0000-000000000054',null),
('40000000-0000-0000-0000-000000000054','20000000-0000-0000-0000-000000000052','10000000-0000-0000-0000-000000000054','ended',now()-interval '3 months',now()-interval '2 months','student_started','ended','10000000-0000-0000-0000-000000000054','10000000-0000-0000-0000-000000000054'),
('40000000-0000-0000-0000-000000000055','20000000-0000-0000-0000-000000000056','10000000-0000-0000-0000-000000000055','active',now()-interval '1 day',null,'simulation',null,'10000000-0000-0000-0000-000000000055',null);

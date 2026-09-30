-- Synthetic fixtures extracted from the reviewed QA harness; current Auth triggers remain enabled.
-- Never run against production or a database containing accounts.
do $$ begin
if current_database() !~ '^nello_qa_wave02_[0-9]+$' or current_user <> 'supabase_admin'
then raise exception 'wave02_fixture_requires_isolated_matrix_database'; end if;
if exists(select 1 from auth.users) or exists(select 1 from public.user_profiles)
then raise exception 'wave02_fixture_requires_empty_accounts'; end if;
end $$;
-- C4 personas seed
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000061','authenticated','authenticated','current-c4@example.invalid','not-used',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000062','authenticated','authenticated','former-c4@example.invalid','not-used',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000063','authenticated','authenticated','unrelated-c4@example.invalid','not-used',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000064','authenticated','authenticated','student-c4@example.invalid','not-used',now(),'{}','{"user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000061','authenticated','authenticated','patient-c4@example.invalid','not-used',now(),'{}','{"user_type":"patient"}',now(),now()),
('00000000-0000-0000-0000-000000000000','30000000-0000-0000-0000-000000000061','authenticated','authenticated','admin-c4@example.invalid','not-used',now(),'{}','{"user_type":"patient"}',now(),now());

insert into public.user_profiles(id,name,user_type,is_admin,is_active) values
('10000000-0000-0000-0000-000000000061','Nutricionista Atual C4','nutritionist',false,true),
('10000000-0000-0000-0000-000000000062','Nutricionista Anterior C4','nutritionist',false,true),
('10000000-0000-0000-0000-000000000063','Nutricionista Alheio C4','nutritionist',false,true),
('10000000-0000-0000-0000-000000000064','Estudante C4','nutritionist',false,true),
('20000000-0000-0000-0000-000000000061','Paciente C4','patient',false,true),
('30000000-0000-0000-0000-000000000061','Administrador C4','patient',true,true)
on conflict (id) do update set
  name=excluded.name,
  user_type=excluded.user_type,
  is_admin=excluded.is_admin,
  is_active=excluded.is_active;
-- C4 capability and episode seed
insert into public.professional_verifications(
  user_id,professional_role,status,verification_method,crn_number,crn_region,
  valid_until,reviewed_at,decision_reason
) values
('10000000-0000-0000-0000-000000000061','nutritionist','approved','official_registry_manual','12345','CRN-3',now()+interval '1 year',now(),'matrix'),
('10000000-0000-0000-0000-000000000062','nutritionist','approved','official_registry_manual','22345','CRN-3',now()+interval '1 year',now(),'matrix'),
('10000000-0000-0000-0000-000000000063','nutritionist','approved','official_registry_manual','32345','CRN-3',now()+interval '1 year',now(),'matrix'),
('10000000-0000-0000-0000-000000000064','student','approved','student_document_manual',null,null,now()+interval '1 year',now(),'matrix')
on conflict (user_id) do update set
  professional_role=excluded.professional_role,
  status=excluded.status,
  verification_method=excluded.verification_method,
  crn_number=excluded.crn_number,
  crn_region=excluded.crn_region,
  normalized_crn=null,
  valid_until=excluded.valid_until,
  reviewed_at=excluded.reviewed_at,
  decision_reason=excluded.decision_reason;

insert into public.student_supervisions(
  student_id,supervisor_id,status,requested_at,responded_at,started_at
) values (
  '10000000-0000-0000-0000-000000000064','10000000-0000-0000-0000-000000000061',
  'active',now(),now(),now()
);

insert into public.care_episodes(
  id,patient_id,nutritionist_id,status,started_at,ended_at,start_reason,end_reason,started_by,ended_by
) values
('40000000-0000-0000-0000-000000000061','20000000-0000-0000-0000-000000000061','10000000-0000-0000-0000-000000000061','active',now()-interval '1 month',null,'started',null,'10000000-0000-0000-0000-000000000061',null),
('40000000-0000-0000-0000-000000000062','20000000-0000-0000-0000-000000000061','10000000-0000-0000-0000-000000000062','ended',now()-interval '1 year',now()-interval '6 months','started','ended','10000000-0000-0000-0000-000000000062','10000000-0000-0000-0000-000000000062');

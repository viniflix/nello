-- Four synthetic accounts registered through the current, enabled Auth trigger.
do $$ begin
  if current_database() !~ '^nello_qa_wave02_[0-9]+$' or current_user <> 'supabase_admin'
    then raise exception 'wave02_fixture_requires_isolated_matrix_database'; end if;
  if exists(select 1 from auth.users) or exists(select 1 from public.user_profiles)
    then raise exception 'wave02_fixture_requires_empty_accounts'; end if;
end $$;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000091',
 'authenticated','authenticated','diet-professional-one@example.invalid','not-used',now(),'{}',
 '{"name":"QA Professional One","user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000092',
 'authenticated','authenticated','diet-professional-two@example.invalid','not-used',now(),'{}',
 '{"name":"QA Professional Two","user_type":"nutritionist"}',now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000091',
 'authenticated','authenticated','diet-patient-one@example.invalid','not-used',now(),'{}',
 '{"name":"QA Patient One","user_type":"patient"}',now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000092',
 'authenticated','authenticated','diet-patient-two@example.invalid','not-used',now(),'{}',
 '{"name":"QA Patient Two","user_type":"patient"}',now(),now());

insert into public.nutritionist_patients(nutritionist_id,patient_id,status) values
('10000000-0000-0000-0000-000000000091','20000000-0000-0000-0000-000000000091','active'),
('10000000-0000-0000-0000-000000000092','20000000-0000-0000-0000-000000000092','active');

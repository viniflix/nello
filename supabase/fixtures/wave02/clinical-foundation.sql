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
('00000000-0000-0000-0000-000000000000','30000000-0000-0000-0000-000000000041','authenticated','authenticated','admin-c1@example.invalid','not-used',now(),'{}','{"user_type":"patient"}',now(),now());
insert into public.user_profiles(id,name,user_type,is_admin,is_active) values
('10000000-0000-0000-0000-000000000041','Nutricionista Atual C1','nutritionist',false,true),
('20000000-0000-0000-0000-000000000041','Paciente C1','patient',false,true),
('30000000-0000-0000-0000-000000000041','Admin C1','patient',true,true)
on conflict (id) do update set
  name=excluded.name,
  user_type=excluded.user_type,
  is_admin=excluded.is_admin,
  is_active=excluded.is_active;

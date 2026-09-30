-- Onda B3: encerramento unilateral, notificação e retomada.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000031', 'authenticated', 'authenticated', 'nutritionist-b3@example.invalid', 'not-used', now(), '{}', '{"user_type":"nutritionist"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000031', 'authenticated', 'authenticated', 'patient-b3@example.invalid', 'not-used', now(), '{}', '{"user_type":"patient"}', now(), now());

-- Auth creates this profile first; configure the synthetic actor without disabling its trigger.
insert into public.user_profiles (id, name, user_type, nutritionist_id, is_active) values
('10000000-0000-0000-0000-000000000031', 'Nutricionista B3', 'nutritionist', null, true),
  ('20000000-0000-0000-0000-000000000031', 'Paciente B3', 'patient', '10000000-0000-0000-0000-000000000031', true)
on conflict (id) do update set
  name=excluded.name,
  user_type=excluded.user_type,
  nutritionist_id=excluded.nutritionist_id,
  is_active=excluded.is_active;

insert into public.professional_verifications (
  user_id, professional_role, status, verification_method, valid_until, decision_reason
) values (
  '10000000-0000-0000-0000-000000000031', 'nutritionist', 'approved',
  'qa_fixture', now() + interval '1 year', 'qa_fixture'
) on conflict (user_id) do update set
  professional_role=excluded.professional_role,status=excluded.status,
  verification_method=excluded.verification_method,valid_until=excluded.valid_until,
  decision_reason=excluded.decision_reason;

insert into public.nutritionist_patients (nutritionist_id, patient_id, status)
values ('10000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000031', 'active');

-- Current active-link trigger creates exactly one episode; do not seed a second.

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000031', true);
do $$ begin
  if (public.get_my_care_relationship()->>'status') <> 'active' then
    raise exception 'Paciente não encontrou o vínculo ativo';
  end if;
end $$;

select public.end_care_episode('20000000-0000-0000-0000-000000000031', 'qa_patient_unlinked');

do $$ begin
  if (public.get_my_care_relationship()->>'status') <> 'ended' then
    raise exception 'Encerramento unilateral não ficou visível ao paciente';
  end if;
end $$;

reset role;
do $$ begin
  if (select count(*) from public.notifications where user_id='10000000-0000-0000-0000-000000000031' and type='care_episode_ended') <> 1 then
    raise exception 'Nutricionista não recebeu notificação';
  end if;
  if not exists (
    select 1 from public.care_episodes
    where patient_id='20000000-0000-0000-0000-000000000031'
      and status='ended'
      and patient_snapshot->>'name'='Paciente B3'
  ) then
    raise exception 'Snapshot mínimo não foi preservado';
  end if;
end $$;

-- Novo convite ao mesmo profissional: aprovação abre um novo episódio.
update public.nutritionist_patients
set status='pending'
where nutritionist_id='10000000-0000-0000-0000-000000000031'
  and patient_id='20000000-0000-0000-0000-000000000031';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000031', true);
select public.approve_patient_link('20000000-0000-0000-0000-000000000031');

do $$
declare
  v_patient jsonb;
begin
  select value into v_patient from public.list_nutritionist_care_patients() value limit 1;
  if v_patient->>'care_status' <> 'active' then
    raise exception 'Retomada não abriu episódio ativo';
  end if;
  if (v_patient->>'episode_count')::int <> 2 then
    raise exception 'Histórico anterior não foi preservado na retomada';
  end if;
end $$;

reset role;
do $$ begin
  if (select count(*) from public.care_episodes where patient_id='20000000-0000-0000-0000-000000000031') <> 2 then
    raise exception 'Retomada não manteve os dois episódios';
  end if;
  if (select count(*) from public.care_episodes where patient_id='20000000-0000-0000-0000-000000000031' and status='active') <> 1 then
    raise exception 'Retomada violou a unicidade ativa';
  end if;
end $$;

-- Conta nova não verificada não pode sequer criar solicitação real.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000032', 'authenticated', 'authenticated', 'unverified-b4@example.invalid', 'not-used', now(), '{}', '{"user_type":"nutritionist"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000033', 'authenticated', 'authenticated', 'student-b4@example.invalid', 'not-used', now(), '{}', '{"user_type":"nutritionist"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000032', 'authenticated', 'authenticated', 'real-patient-b4@example.invalid', 'not-used', now(), '{}', '{"user_type":"patient"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000033', 'authenticated', 'authenticated', 'simulation-b4@example.invalid', 'not-used', now(), '{}', '{"user_type":"patient"}', now(), now());

-- Auth creates this profile first; configure the synthetic actor without disabling its trigger.
insert into public.user_profiles (id, name, user_type, is_active) values
('10000000-0000-0000-0000-000000000032', 'Nutricionista Não Verificada', 'nutritionist', true),
  ('10000000-0000-0000-0000-000000000033', 'Estudante B4', 'nutritionist', true),
  ('20000000-0000-0000-0000-000000000032', 'Paciente Real B4', 'patient', true),
  ('20000000-0000-0000-0000-000000000033', 'Paciente Simulado B4', 'patient', true)
on conflict (id) do update set
  name=excluded.name,
  user_type=excluded.user_type,
  is_active=excluded.is_active;

-- Registration currently auto-approves testers. Explicitly construct the denied
-- persona so these assertions continue exercising the unverified contract.
update public.professional_verifications
set status='not_submitted',valid_until=null,reviewed_at=null,decision_reason=null
where user_id='10000000-0000-0000-0000-000000000032';

insert into public.professional_verifications (
  user_id, professional_role, status, verification_method, institution_name,
  current_semester, expected_graduation_at, valid_until, decision_reason
) values (
  '10000000-0000-0000-0000-000000000033', 'student', 'approved',
  'student_document_manual', 'Universidade QA', 5, current_date + 500,
  now() + interval '6 months', 'qa_fixture'
) on conflict (user_id) do update set
  professional_role=excluded.professional_role,status=excluded.status,
  verification_method=excluded.verification_method,institution_name=excluded.institution_name,
  current_semester=excluded.current_semester,expected_graduation_at=excluded.expected_graduation_at,
  valid_until=excluded.valid_until,decision_reason=excluded.decision_reason;

do $$
begin
  begin
    insert into public.nutritionist_patients(nutritionist_id,patient_id,status)
    values('10000000-0000-0000-0000-000000000032','20000000-0000-0000-0000-000000000032','pending');
    raise exception 'Conta não verificada criou vínculo real pendente';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.nutritionist_patients(nutritionist_id,patient_id,status)
    values('10000000-0000-0000-0000-000000000033','20000000-0000-0000-0000-000000000032','pending');
    raise exception 'Estudante sem supervisor criou vínculo real pendente';
  exception when insufficient_privilege then null;
  end;
end $$;

update public.user_profiles
set is_simulation=true, simulation_owner_id='10000000-0000-0000-0000-000000000032'
where id='20000000-0000-0000-0000-000000000033';

insert into public.nutritionist_patients(nutritionist_id,patient_id,status)
values('10000000-0000-0000-0000-000000000032','20000000-0000-0000-0000-000000000033','pending');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000032', true);
select public.approve_patient_link('20000000-0000-0000-0000-000000000033');
reset role;

do $$
begin
  if not exists (
    select 1 from public.care_episodes
    where patient_id='20000000-0000-0000-0000-000000000033'
      and nutritionist_id='10000000-0000-0000-0000-000000000032'
      and is_simulation=true
  ) then
    raise exception 'Paciente fictício não gerou episódio de simulação';
  end if;
end $$;

rollback;

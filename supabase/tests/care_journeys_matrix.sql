-- Onda B3: encerramento unilateral, notificação e retomada.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000031', 'authenticated', 'authenticated', 'nutritionist-b3@nello.test', 'not-used', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000031', 'authenticated', 'authenticated', 'patient-b3@nello.test', 'not-used', now(), '{}', '{}', now(), now());

insert into public.user_profiles (id, name, user_type, nutritionist_id, is_active) values
  ('10000000-0000-0000-0000-000000000031', 'Nutricionista B3', 'nutritionist', null, true),
  ('20000000-0000-0000-0000-000000000031', 'Paciente B3', 'patient', '10000000-0000-0000-0000-000000000031', true);

insert into public.professional_verifications (
  user_id, professional_role, status, verification_method, valid_until, decision_reason
) values (
  '10000000-0000-0000-0000-000000000031', 'nutritionist', 'approved',
  'qa_fixture', now() + interval '1 year', 'qa_fixture'
);

insert into public.nutritionist_patients (nutritionist_id, patient_id, status)
values ('10000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000031', 'active');

insert into public.care_episodes (patient_id, nutritionist_id, status, start_reason, started_by)
values ('20000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000031', 'active', 'qa', '10000000-0000-0000-0000-000000000031');

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
  confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000032', 'authenticated', 'authenticated', 'unverified-b4@nello.test', 'not-used', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000033', 'authenticated', 'authenticated', 'student-b4@nello.test', 'not-used', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000032', 'authenticated', 'authenticated', 'real-patient-b4@nello.test', 'not-used', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000033', 'authenticated', 'authenticated', 'simulation-b4@nello.test', 'not-used', now(), '{}', '{}', now(), now());

insert into public.user_profiles (id, name, user_type, is_active) values
  ('10000000-0000-0000-0000-000000000032', 'Nutricionista Não Verificada', 'nutritionist', true),
  ('10000000-0000-0000-0000-000000000033', 'Estudante B4', 'nutritionist', true),
  ('20000000-0000-0000-0000-000000000032', 'Paciente Real B4', 'patient', true),
  ('20000000-0000-0000-0000-000000000033', 'Paciente Simulado B4', 'patient', true);

insert into public.professional_verifications (
  user_id, professional_role, status, verification_method, institution_name,
  current_semester, expected_graduation_at, valid_until, decision_reason
) values (
  '10000000-0000-0000-0000-000000000033', 'student', 'approved',
  'student_document_manual', 'Universidade QA', 5, current_date + 500,
  now() + interval '6 months', 'qa_fixture'
);

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

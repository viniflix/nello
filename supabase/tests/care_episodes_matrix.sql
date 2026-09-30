-- Onda B1: transições de episódio em banco local descartável.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'owner-b1@nello.test', 'not-used', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'other-b1@nello.test', 'not-used', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'patient-b1@nello.test', 'not-used', now(), '{}', '{}', now(), now());

insert into public.user_profiles (id, name, user_type) values
  ('10000000-0000-0000-0000-000000000011', 'Nutricionista Proprietária B1', 'nutritionist'),
  ('10000000-0000-0000-0000-000000000012', 'Nutricionista Nova B1', 'nutritionist'),
  ('20000000-0000-0000-0000-000000000011', 'Paciente B1', 'patient');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000011', true);
select public.start_care_episode('20000000-0000-0000-0000-000000000011', 'qa_started');

do $$
begin
  if (select count(*) from public.care_episodes where patient_id = '20000000-0000-0000-0000-000000000011' and status = 'active') <> 1 then
    raise exception 'A criação não produziu exatamente um episódio ativo';
  end if;
  if (select count(*) from public.activity_log where event_name = 'care_episode.started' and patient_id = '20000000-0000-0000-0000-000000000011') <> 1 then
    raise exception 'Início não foi auditado';
  end if;
end $$;

-- Repetir a operação é idempotente para o mesmo nutricionista.
select public.start_care_episode('20000000-0000-0000-0000-000000000011', 'qa_started');

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000012', true);
do $$
begin
  begin
    perform public.start_care_episode('20000000-0000-0000-0000-000000000011', 'attempt_cross_access');
    raise exception 'Outro nutricionista conseguiu iniciar um segundo episódio ativo';
  exception when unique_violation then null;
  end;
end $$;

-- O participante paciente pode encerrar unilateralmente; o evento deve ser auditado e notificado.
reset role;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000011', true);
select public.end_care_episode('20000000-0000-0000-0000-000000000011', 'qa_patient_unlinked');

reset role;
do $$
begin
  if exists (select 1 from public.care_episodes where patient_id = '20000000-0000-0000-0000-000000000011' and status = 'active') then
    raise exception 'Encerramento deixou episódio ativo';
  end if;
  if (select count(*) from public.activity_log where event_name = 'care_episode.ended' and patient_id = '20000000-0000-0000-0000-000000000011') <> 1 then
    raise exception 'Encerramento não foi auditado';
  end if;
  if (select count(*) from public.notifications where user_id = '10000000-0000-0000-0000-000000000011' and type = 'care_episode_ended') <> 1 then
    raise exception 'Nutricionista não foi notificado do encerramento';
  end if;
end $$;

-- Um novo nutricionista pode iniciar um episódio limpo após o encerramento.
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000012', true);
select public.start_care_episode('20000000-0000-0000-0000-000000000011', 'qa_new_professional');

set local role authenticated;
do $$
begin
  if (select count(*) from public.care_episodes where patient_id = '20000000-0000-0000-0000-000000000011') <> 1 then
    raise exception 'RLS deixou novo nutricionista ver episódio anterior';
  end if;
  if (select count(*) from public.care_episodes where patient_id = '20000000-0000-0000-0000-000000000011' and status = 'active') <> 1 then
    raise exception 'Novo atendimento não ficou ativo';
  end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000011', true);
do $$
begin
  begin
    perform public.end_care_episode('20000000-0000-0000-0000-000000000011', 'must_not_be_callable_before_b2');
    raise exception 'RPC de transição ficou disponível antes da B2';
  exception when insufficient_privilege then null;
  end;
end $$;

do $$
begin
  if (select count(*) from public.care_episodes where patient_id = '20000000-0000-0000-0000-000000000011') <> 1 then
    raise exception 'Profissional original perdeu acesso ao seu histórico';
  end if;
end $$;

rollback;

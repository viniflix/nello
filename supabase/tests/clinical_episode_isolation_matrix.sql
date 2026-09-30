-- Onda B2: isolamento clínico entre episódios e profissionais.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000021', 'authenticated', 'authenticated', 'old-b2@example.invalid', 'not-used', now(), '{}', '{"user_type":"nutritionist"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000022', 'authenticated', 'authenticated', 'current-b2@example.invalid', 'not-used', now(), '{}', '{"user_type":"nutritionist"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000023', 'authenticated', 'authenticated', 'unrelated-b2@example.invalid', 'not-used', now(), '{}', '{"user_type":"nutritionist"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000021', 'authenticated', 'authenticated', 'patient-b2@example.invalid', 'not-used', now(), '{}', '{"user_type":"patient"}', now(), now());

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000022', 'authenticated', 'authenticated', 'standalone-b2@example.invalid', 'not-used', now(), '{}', '{"user_type":"patient"}', now(), now());

-- Auth creates this profile first; configure the synthetic actor without disabling its trigger.
insert into public.user_profiles (id, name, user_type, nutritionist_id) values
('10000000-0000-0000-0000-000000000021', 'Nutricionista Anterior B2', 'nutritionist', null),
  ('10000000-0000-0000-0000-000000000022', 'Nutricionista Atual B2', 'nutritionist', null),
  ('10000000-0000-0000-0000-000000000023', 'Nutricionista Alheio B2', 'nutritionist', null),
  ('20000000-0000-0000-0000-000000000021', 'Paciente B2', 'patient', '10000000-0000-0000-0000-000000000022')
on conflict (id) do update set
  name=excluded.name,
  user_type=excluded.user_type,
  nutritionist_id=excluded.nutritionist_id;

-- Auth creates this profile first; configure the synthetic actor without disabling its trigger.
insert into public.user_profiles (id, name, user_type, nutritionist_id) values
('20000000-0000-0000-0000-000000000022', 'Paciente Sem Vínculo B2', 'patient', null)
on conflict (id) do update set
  name=excluded.name,
  user_type=excluded.user_type,
  nutritionist_id=excluded.nutritionist_id;

insert into public.care_episodes (
  id, patient_id, nutritionist_id, status, started_at, ended_at, start_reason, end_reason
) values
  ('30000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000021', 'ended', now() - interval '1 year', now() - interval '6 months', 'qa', 'qa'),
  ('30000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000022', 'active', now(), null, 'qa', null);

insert into public.nutritionist_patients (nutritionist_id, patient_id, status) values
  ('10000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000021', 'ended'),
  ('10000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000021', 'active');

insert into public.glycemia_records (
  patient_id, nutritionist_id, care_episode_id, date, value, condition
) values
  ('20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000021', now() - interval '8 months', 100, 'fasting');

-- Frontend legado não informa care_episode_id: o trigger deve preencher o episódio ativo.
insert into public.glycemia_records (
  patient_id, nutritionist_id, date, value, condition
) values
  ('20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000022', now(), 110, 'fasting');

-- O próprio paciente pode enviar sem nutritionist_id; ambos devem ser derivados.
insert into public.glycemia_records (
  patient_id, date, value, condition
) values
  ('20000000-0000-0000-0000-000000000021', now(), 115, 'post_prandial');

insert into public.growth_records (
  patient_id, care_episode_id, record_date, weight, height
) values
  ('20000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000021', current_date - 200, 70, 170),
  ('20000000-0000-0000-0000-000000000021', null, current_date, 72, 170);

insert into public.growth_records (patient_id, record_date, weight, height)
values ('20000000-0000-0000-0000-000000000022', current_date, 60, 165);

do $$ begin
  if (select count(*) from public.glycemia_records where care_episode_id is null or nutritionist_id is null) <> 0 then
    raise exception 'Trigger deixou registro clínico sem episódio ou profissional';
  end if;
  begin
    insert into public.glycemia_records (patient_id, nutritionist_id, care_episode_id, date, value, condition)
    values ('20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000022', '30000000-0000-0000-0000-000000000021', now(), 120, 'fasting');
    raise exception 'Trigger aceitou episódio de outro profissional';
  exception when check_violation then null;
  end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000021', true);
do $$ begin
  if (select count(*) from public.glycemia_records) <> 1 then
    raise exception 'Profissional anterior não viu exatamente seu histórico';
  end if;
  if (select count(*) from public.growth_records) <> 1 then
    raise exception 'Profissional anterior acessou antropometria de outro episódio';
  end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000022', true);
do $$ begin
  if (select count(*) from public.glycemia_records) <> 2 then
    raise exception 'Profissional atual viu histórico alheio ou perdeu o episódio atual';
  end if;
  if (select count(*) from public.growth_records) <> 1 then
    raise exception 'Profissional atual acessou antropometria de outro episódio';
  end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000023', true);
do $$ begin
  if (select count(*) from public.glycemia_records) <> 0 then
    raise exception 'Profissional alheio acessou dados clínicos';
  end if;
  if (select count(*) from public.growth_records) <> 0 then
    raise exception 'Profissional alheio acessou antropometria';
  end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000021', true);
do $$ begin
  if (select count(*) from public.glycemia_records) <> 3 then
    raise exception 'Paciente não acessou seu histórico completo';
  end if;
  if (select count(*) from public.growth_records) <> 2 then
    raise exception 'Paciente não acessou seu histórico antropométrico completo';
  end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000022', true);
do $$ begin
  if (select count(*) from public.growth_records) <> 1 then
    raise exception 'Paciente sem vínculo perdeu seu dado privado';
  end if;
  if exists (select 1 from public.growth_records where care_episode_id is not null) then
    raise exception 'Dado privado foi associado a episódio inexistente';
  end if;
end $$;

rollback;

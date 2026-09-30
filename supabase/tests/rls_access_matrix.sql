-- Matriz RLS do Nello. Executar somente contra baseline local descartável.
begin;

insert into public.user_profiles (id, name, user_type) values
  ('10000000-0000-0000-0000-000000000001', 'Nutricionista Proprietária QA', 'nutritionist'),
  ('10000000-0000-0000-0000-000000000002', 'Nutricionista Alheia QA', 'nutritionist'),
  ('20000000-0000-0000-0000-000000000001', 'Paciente QA', 'patient'),
  ('20000000-0000-0000-0000-000000000002', 'Paciente Alheio QA', 'patient') on conflict(id) do update set name=excluded.name,user_type=excluded.user_type;

insert into public.nutritionist_patients (nutritionist_id, patient_id, status) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'active'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'active');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
do $$ begin
  if (select count(*) from public.nutritionist_patients where patient_id='20000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'Proprietária não acessou seu vínculo ativo';
  end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
do $$ begin
  if (select count(*) from public.nutritionist_patients where patient_id='20000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'Nutricionista alheia acessou vínculo de terceiros';
  end if;
  begin
    insert into public.nutritionist_patients (nutritionist_id, patient_id, status)
    values ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'active');
    raise exception 'Segundo vínculo ativo foi aceito';
  exception when unique_violation then null;
  end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
do $$ begin
  if (select count(*) from public.nutritionist_patients) <> 1 then
    raise exception 'Paciente acessou vínculo que não é seu';
  end if;
end $$;

reset role;
set local role anon;
do $$ begin
  if (select count(*) from public.nutritionist_patients) <> 0 then
    raise exception 'Anon acessou vínculos';
  end if;
end $$;

rollback;

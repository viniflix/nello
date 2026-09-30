-- Onda B4 / Task 1: fundação de identidade profissional e migração alpha.
begin;

do $$
begin
  if not exists (
    select 1
    from public.professional_verifications
    where user_id = '10000000-0000-0000-0000-000000000041'
      and professional_role = 'nutritionist'
      and status = 'approved'
      and verification_method = 'approved_by_migration'
      and valid_until > now()
  ) then
    raise exception 'Conta profissional alpha não foi aprovada pela migração';
  end if;

  if exists (
    select 1 from public.professional_verifications
    where user_id = '20000000-0000-0000-0000-000000000041'
  ) then
    raise exception 'Paciente recebeu verificação profissional indevida';
  end if;

  if not exists (
    select 1 from public.verification_events e
    join public.professional_verifications v on v.id = e.verification_id
    where v.user_id = '10000000-0000-0000-0000-000000000041'
      and e.to_status = 'approved'
      and e.reason = 'alpha_continuity_migration'
  ) then
    raise exception 'A aprovação alpha não gerou evento auditável';
  end if;

  if not private.has_current_clinical_capacity('10000000-0000-0000-0000-000000000041') then
    raise exception 'Conta alpha aprovada não recebeu capacidade clínica';
  end if;

  if private.has_current_clinical_capacity('10000000-0000-0000-0000-000000000042') then
    raise exception 'Conta nova não submetida recebeu capacidade clínica';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000041', true);

do $$
declare
  v_state jsonb;
begin
  select public.get_my_professional_verification() into v_state;
  if v_state->>'status' <> 'approved' or v_state->>'verification_method' <> 'approved_by_migration' then
    raise exception 'Profissional não consegue consultar o próprio estado aprovado: %', v_state;
  end if;

  if (select count(*) from public.professional_verifications) <> 1 then
    raise exception 'Profissional acessou verificação de outra conta';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000042', true);

do $$
declare
  v_state jsonb;
begin
  select public.get_my_professional_verification() into v_state;
  if v_state->>'status' <> 'not_submitted' then
    raise exception 'Conta nova deveria iniciar sem submissão: %', v_state;
  end if;

  if exists (select 1 from public.professional_verifications) then
    raise exception 'Conta nova acessou verificação alheia';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000041', true);
select set_config('request.jwt.claims',jsonb_build_object('sub','30000000-0000-0000-0000-000000000041','role','authenticated','aal','aal2')::text,true);

do $$
begin
  if (select count(*) from public.professional_verifications) <> 1 then
    raise exception 'Admin não acessou a fila profissional completa';
  end if;
end;
$$;

reset role;

-- Workflow: submissão, complementação, reenvio, aprovação, duplicidade e suspensão.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000042', true);

select public.submit_professional_verification(jsonb_build_object(
  'professional_role', 'nutritionist',
  'crn_region', '3',
  'crn_number', '12345'
));

do $$
begin
  if (public.get_my_professional_verification()->>'status') <> 'pending' then
    raise exception 'Submissão profissional não entrou em análise';
  end if;

  begin
    perform public.review_professional_verification(
      (public.get_my_professional_verification()->>'id')::uuid,
      'approved', 'self approval', 'https://cfn.org.br', now() + interval '1 year'
    );
    raise exception 'Profissional aprovou a própria verificação';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000041', true);
select set_config('request.jwt.claims',jsonb_build_object('sub','30000000-0000-0000-0000-000000000041','role','authenticated','aal','aal2')::text,true);

select public.request_verification_information(
  (select id from public.professional_verifications where user_id='10000000-0000-0000-0000-000000000042'),
  'Confirme o número do registro.'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000042', true);

select public.submit_professional_verification(jsonb_build_object(
  'professional_role', 'nutritionist',
  'crn_region', '3',
  'crn_number', '12345'
));

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000041', true);
select set_config('request.jwt.claims',jsonb_build_object('sub','30000000-0000-0000-0000-000000000041','role','authenticated','aal','aal2')::text,true);

select public.review_professional_verification(
  (select id from public.professional_verifications where user_id='10000000-0000-0000-0000-000000000042'),
  'approved', 'Registro ativo na consulta oficial', 'https://cfn.org.br', now() + interval '1 year'
);

reset role;
do $$
begin
  if not private.has_current_clinical_capacity('10000000-0000-0000-0000-000000000042') then
    raise exception 'Nutricionista aprovado não recebeu capacidade clínica';
  end if;
  if (select count(*) from public.verification_events e join public.professional_verifications v on v.id=e.verification_id where v.user_id='10000000-0000-0000-0000-000000000042') <> (select n+4 from b4_initial_events) then
    raise exception 'Workflow não preservou os quatro eventos esperados';
  end if;
end;
$$;

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000043','authenticated','authenticated','duplicate-b4@example.invalid','not-used',now(),'{}','{}',now(),now());
insert into public.user_profiles (id,name,user_type,is_admin,is_active)
values ('10000000-0000-0000-0000-000000000043','Nutricionista Duplicada B4','nutritionist',false,true) on conflict(id) do update set name=excluded.name,user_type=excluded.user_type,is_admin=excluded.is_admin,is_active=excluded.is_active;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000043', true);
select public.submit_professional_verification(jsonb_build_object(
  'professional_role', 'nutritionist',
  'crn_region', 'CRN-3',
  'crn_number', '12.345'
));

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000041', true);
select set_config('request.jwt.claims',jsonb_build_object('sub','30000000-0000-0000-0000-000000000041','role','authenticated','aal','aal2')::text,true);

do $$
begin
  begin
    perform public.review_professional_verification(
      (select id from public.professional_verifications where user_id='10000000-0000-0000-0000-000000000043'),
      'approved', 'Tentativa duplicada', 'https://cfn.org.br', now() + interval '1 year'
    );
    raise exception 'Mesmo CRN aprovou duas contas';
  exception
    when unique_violation then null;
  end;
end;
$$;

select public.suspend_professional_verification(
  (select id from public.professional_verifications where user_id='10000000-0000-0000-0000-000000000042'),
  'Revisão de segurança em andamento.'
);

reset role;
do $$
begin
  if private.has_current_clinical_capacity('10000000-0000-0000-0000-000000000042') then
    raise exception 'Conta suspensa manteve capacidade clínica';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000041', true);
select set_config('request.jwt.claims',jsonb_build_object('sub','30000000-0000-0000-0000-000000000041','role','authenticated','aal','aal2')::text,true);
do $$
begin
  if (select count(*) from public.list_professional_verifications('suspended', 'nutritionist')) <> 1 then
    raise exception 'Fila administrativa não encontrou a suspensão';
  end if;
end;
$$;

reset role;

-- Supervisão estudantil: solicitação, aceite, encerramento e rejeição.
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000044','authenticated','authenticated','student-supervision@example.invalid','not-used',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000045','authenticated','authenticated','supervisor@example.invalid','not-used',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000046','authenticated','authenticated','document-review@example.invalid','not-used',now(),'{}','{"user_type":"nutritionist"}',now(),now());
insert into public.user_profiles(id,name,user_type,is_admin,is_active) values
('10000000-0000-0000-0000-000000000044','Estudante Supervisionado','nutritionist',false,true),
('10000000-0000-0000-0000-000000000045','Nutricionista Supervisor','nutritionist',false,true),
('10000000-0000-0000-0000-000000000046','Profissional com Documento','nutritionist',false,true) on conflict(id) do update set name=excluded.name,user_type=excluded.user_type,is_admin=excluded.is_admin,is_active=excluded.is_active;
insert into public.professional_verifications(user_id,professional_role,status,verification_method,institution_name,current_semester,expected_graduation_at,valid_until,decision_reason) values
('10000000-0000-0000-0000-000000000044','student','approved','student_document_manual','Universidade QA',5,current_date+500,now()+interval '6 months','qa_fixture'),
('10000000-0000-0000-0000-000000000045','nutritionist','approved','official_registry_manual',null,null,null,now()+interval '1 year','qa_fixture'),
('10000000-0000-0000-0000-000000000046','nutritionist','pending','self_report',null,null,null,null,null) on conflict(user_id) do update set professional_role=excluded.professional_role,status=excluded.status,verification_method=excluded.verification_method,institution_name=excluded.institution_name,current_semester=excluded.current_semester,expected_graduation_at=excluded.expected_graduation_at,valid_until=excluded.valid_until,decision_reason=excluded.decision_reason;
insert into public.verification_documents(verification_id,owner_id,document_type,storage_path,content_sha256)
select id,user_id,'professional_card','verification-private/qa-document.pdf','qa-sha256'
from public.professional_verifications where user_id='10000000-0000-0000-0000-000000000046';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000044', true);
select public.request_student_supervision('10000000-0000-0000-0000-000000000045');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000045', true);
select public.respond_student_supervision(
  (select id from public.student_supervisions where student_id='10000000-0000-0000-0000-000000000044' and status='pending'),
  'active', 'Supervisão aceita para QA.'
);
reset role;

do $$ begin
  if not private.has_current_clinical_capacity('10000000-0000-0000-0000-000000000044') then
    raise exception 'Estudante aprovado com supervisor ativo não recebeu capacidade clínica';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000044', true);
select public.end_student_supervision(
  (select id from public.student_supervisions where student_id='10000000-0000-0000-0000-000000000044' and status='active'),
  'Ciclo de supervisão encerrado.'
);
select public.request_student_supervision('10000000-0000-0000-0000-000000000045');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000045', true);
select public.respond_student_supervision(
  (select id from public.student_supervisions where student_id='10000000-0000-0000-0000-000000000044' and status='pending'),
  'rejected', 'Nova supervisão recusada.'
);
reset role;

do $$ begin
  if private.has_current_clinical_capacity('10000000-0000-0000-0000-000000000044') then
    raise exception 'Estudante manteve capacidade após término da supervisão';
  end if;
  if (select count(*) from public.student_supervision_events where student_id='10000000-0000-0000-0000-000000000044') <> 5 then
    raise exception 'Transições de supervisão não foram totalmente auditadas';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000041', true);
select set_config('request.jwt.claims',jsonb_build_object('sub','30000000-0000-0000-0000-000000000041','role','authenticated','aal','aal2')::text,true);
select public.review_professional_verification(
  (select id from public.professional_verifications where user_id='10000000-0000-0000-0000-000000000046'),
  'rejected','Documento incompatível com os dados enviados.',null,null
);
reset role;

do $$ begin
  if not exists (
    select 1 from public.verification_documents
    where owner_id='10000000-0000-0000-0000-000000000046'
      and retention_status='scheduled_for_deletion'
      and scheduled_deletion_at between now()+interval '29 days' and now()+interval '31 days'
  ) then
    raise exception 'Documento analisado não recebeu expurgo em 30 dias';
  end if;
end $$;

do $$
begin
  begin
    update public.verification_events set reason = 'tampered';
    raise exception 'Evento de verificação aceitou alteração';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'verification_events_are_immutable' then raise; end if;
  end;

  begin
    delete from public.verification_events;
    raise exception 'Evento de verificação aceitou exclusão';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'verification_events_are_immutable' then raise; end if;
  end;
end;
$$;

rollback;

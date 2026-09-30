-- C2: Clinical evolution system — templates, draft lifecycle, finalization and internal signature.
-- Depends on: 20260712140000_create_clinical_record_foundation.sql
--             20260712150000_harden_clinical_record_foundation.sql

-- 1. Evolution templates -------------------------------------------------------

create or replace function private.validate_evolution_template_sections(p_sections jsonb)
returns boolean language sql immutable set search_path='' as $$
  select jsonb_typeof(p_sections)='array'
    and jsonb_array_length(p_sections) between 1 and 20
    and not exists (
      select 1
      from jsonb_array_elements(p_sections) as section(value)
      where jsonb_typeof(section.value)<>'object'
        or jsonb_typeof(section.value->'key') is distinct from 'string'
        or (section.value->>'key') !~ '^[a-z][a-z0-9_]{0,49}$'
        or jsonb_typeof(section.value->'label') is distinct from 'string'
        or length(btrim(section.value->>'label')) not between 2 and 100
        or (
          section.value ? 'hint' and section.value->'hint' <> 'null'::jsonb
          and (
            jsonb_typeof(section.value->'hint') is distinct from 'string'
            or length(section.value->>'hint') > 300
          )
        )
        or jsonb_typeof(section.value->'required') is distinct from 'boolean'
        or exists (
          select 1 from jsonb_object_keys(section.value) as key_name
          where key_name not in ('key','label','hint','required')
        )
    )
    and (
      select count(*)=count(distinct section.value->>'key')
      from jsonb_array_elements(p_sections) as section(value)
    )
$$;

revoke all on function private.validate_evolution_template_sections(jsonb)
from public,anon,authenticated;
grant execute on function private.validate_evolution_template_sections(jsonb)
to service_role;

create table public.clinical_evolution_templates (
  code text primary key constraint evolution_templates_code_check check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null constraint evolution_templates_name_check check (length(btrim(name)) between 2 and 200),
  description text constraint evolution_templates_description_check check (description is null or length(btrim(description)) between 2 and 1000),
  category text not null default 'system' constraint evolution_templates_category_check check (category in ('system','private')),
  owner_id uuid references public.user_profiles(id) on delete restrict,
  sections jsonb not null constraint evolution_templates_sections_check
    check (private.validate_evolution_template_sections(sections)),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evolution_templates_owner_check check (
    (category='system' and owner_id is null) or (category='private' and owner_id is not null)
  )
);

create table public.clinical_evolution_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_code text not null references public.clinical_evolution_templates(code) on delete restrict,
  version integer not null default 1,
  sections_snapshot jsonb not null constraint evolution_template_versions_sections_check
    check (private.validate_evolution_template_sections(sections_snapshot)),
  created_by uuid references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint evolution_template_versions_unique unique (template_code, version)
);

create table public.clinical_evolution_template_events (
  id uuid primary key default gen_random_uuid(),
  template_code text not null references public.clinical_evolution_templates(code) on delete restrict,
  version integer,
  action text not null constraint evolution_template_events_action_check
    check (action in ('created','versioned','archived')),
  actor_id uuid not null references public.user_profiles(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb constraint evolution_template_events_metadata_check
    check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  constraint evolution_template_events_version_fk
    foreign key (template_code,version)
    references public.clinical_evolution_template_versions(template_code,version) on delete restrict
);

-- Immutable template snapshots and audit events.
create or replace function private.reject_evolution_template_immutable_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception using errcode='23514',message=tg_table_name || '_immutable';
end $$;

revoke all on function private.reject_evolution_template_immutable_mutation()
from public,anon,authenticated;

create trigger trg_evolution_template_versions_immutable before update or delete
  on public.clinical_evolution_template_versions for each row
  execute function private.reject_evolution_template_immutable_mutation();
create trigger trg_evolution_template_events_immutable before update or delete
  on public.clinical_evolution_template_events for each row
  execute function private.reject_evolution_template_immutable_mutation();

alter table public.clinical_records
  alter column template_version type integer
  using nullif(template_version,'')::integer,
  add column revision bigint not null default 1,
  add constraint clinical_records_template_version_fk
    foreign key (template_code,template_version)
    references public.clinical_evolution_template_versions(template_code,version) on delete restrict,
  add constraint clinical_records_template_pair_check
    check ((template_code is null) = (template_version is null)),
  add constraint clinical_records_evolution_template_required_check
    check (record_type<>'clinical_evolution' or template_code is not null),
  add constraint clinical_records_canonical_hash_format_check
    check (canonical_hash is null or canonical_hash ~ '^[0-9a-f]{64}$');

-- RLS
alter table public.clinical_evolution_templates enable row level security;
alter table public.clinical_evolution_template_versions enable row level security;
alter table public.clinical_evolution_template_events enable row level security;

revoke all on table public.clinical_evolution_templates, public.clinical_evolution_template_versions,
  public.clinical_evolution_template_events from public,anon,authenticated;
grant select on public.clinical_evolution_templates, public.clinical_evolution_template_versions,
  public.clinical_evolution_template_events to authenticated,service_role;
grant all on public.clinical_evolution_templates, public.clinical_evolution_template_versions,
  public.clinical_evolution_template_events to service_role;

create policy evolution_templates_authenticated_select on public.clinical_evolution_templates for select to authenticated
using ((category='system' and is_active) or (category='private' and owner_id=(select auth.uid())));

create policy evolution_template_versions_authenticated_select on public.clinical_evolution_template_versions for select to authenticated
using (exists(select 1 from public.clinical_evolution_templates t where t.code=template_code
  and ((t.category='system' and t.is_active) or (t.category='private' and t.owner_id=(select auth.uid())))));

create policy evolution_template_events_owner_select on public.clinical_evolution_template_events
for select to authenticated using (exists(
  select 1 from public.clinical_evolution_templates t
  where t.code=template_code and t.owner_id=(select auth.uid())
));

-- 2. Seed system templates ----------------------------------------------------

insert into public.clinical_evolution_templates(code,name,description,category,sections) values
  ('nello_standard','Padrão Nello','Evolução clínica completa com seções estruturadas do Nello','system',
    '[{"key":"context","label":"Contexto","hint":"Motivo da consulta, queixa principal e contexto clínico","required":false},
      {"key":"subjective","label":"Relato Subjetivo","hint":"O que o paciente relata: sintomas, sensações, percepções e mudanças","required":false},
      {"key":"objective","label":"Dados Objetivos","hint":"Medidas, exames, antropometria e dados mensuráveis observados","required":false},
      {"key":"assessment","label":"Avaliação e Diagnóstico Nutricional","hint":"Análise integrada dos dados subjetivos e objetivos","required":false},
      {"key":"evolution","label":"Evolução","hint":"Comparação com consultas anteriores e progresso observado","required":false},
      {"key":"adherence","label":"Adesão e Dificuldades","hint":"Nível de adesão ao plano, barreiras e facilitadores","required":false},
      {"key":"conduct","label":"Conduta","hint":"Prescrição, ajustes no plano, orientações e encaminhamentos","required":true},
      {"key":"goals","label":"Metas","hint":"Objetivos pactuados para o próximo período","required":false},
      {"key":"follow_up","label":"Plano de Acompanhamento","hint":"Retorno, check-ins, exames solicitados e próximos passos","required":false},
      {"key":"alerts","label":"Pendências e Alertas","hint":"Itens que exigem atenção, acompanhamento ou ação futura","required":false},
      {"key":"sources","label":"Fontes e Referências","hint":"Protocolos, artigos, diretrizes ou materiais consultados","required":false}]'::jsonb),

  ('soap','SOAP','Registro clínico no formato SOAP (Subjetivo, Objetivo, Avaliação, Plano)','system',
    '[{"key":"subjective","label":"Subjetivo (S)","hint":"Queixas, sintomas e relato do paciente","required":false},
      {"key":"objective","label":"Objetivo (O)","hint":"Dados mensuráveis, exames e observações clínicas","required":false},
      {"key":"assessment","label":"Avaliação (A)","hint":"Diagnóstico nutricional e análise integrada","required":false},
      {"key":"plan","label":"Plano (P)","hint":"Conduta, prescrição, orientações e encaminhamentos","required":true}]'::jsonb),

  ('first_consultation','Primeira Consulta','Avaliação inicial completa com anamnese resumida e planejamento','system',
    '[{"key":"chief_complaint","label":"Queixa Principal","hint":"Motivo da consulta e expectativas do paciente","required":true},
      {"key":"clinical_history","label":"Histórico Clínico","hint":"Doenças, cirurgias, medicamentos, alergias e antecedentes familiares","required":false},
      {"key":"dietary_history","label":"Histórico Alimentar","hint":"Hábitos alimentares, rotina, preferências e aversões","required":false},
      {"key":"lifestyle","label":"Estilo de Vida","hint":"Atividade física, sono, estresse, hidratação e hábitos","required":false},
      {"key":"objective","label":"Dados Objetivos","hint":"Antropometria, exames e avaliação física","required":false},
      {"key":"assessment","label":"Avaliação Nutricional","hint":"Diagnóstico nutricional e classificação","required":false},
      {"key":"conduct","label":"Conduta e Prescrição","hint":"Plano alimentar, orientações iniciais e encaminhamentos","required":true},
      {"key":"goals","label":"Metas Iniciais","hint":"Objetivos de curto e médio prazo pactuados","required":false},
      {"key":"follow_up","label":"Plano de Acompanhamento","hint":"Retorno, check-ins e próximos passos","required":false}]'::jsonb),

  ('follow_up_return','Retorno','Evolução de consulta de retorno com comparação de progresso','system',
    '[{"key":"context","label":"Contexto do Retorno","hint":"Intervalo desde a última consulta e motivo do retorno","required":false},
      {"key":"subjective","label":"Relato do Paciente","hint":"Como se sentiu no período, dificuldades e percepções","required":false},
      {"key":"adherence","label":"Adesão ao Plano","hint":"Avaliação de adesão, barreiras e facilitadores","required":false},
      {"key":"objective","label":"Dados Objetivos","hint":"Novas medidas, exames e comparação com consulta anterior","required":false},
      {"key":"evolution","label":"Evolução Comparada","hint":"Progresso em relação às metas e dados anteriores","required":false},
      {"key":"conduct","label":"Ajustes na Conduta","hint":"Modificações no plano alimentar e novas orientações","required":true},
      {"key":"goals","label":"Novas Metas","hint":"Objetivos revisados para o próximo período","required":false},
      {"key":"follow_up","label":"Próximo Retorno","hint":"Agendamento e orientações até a próxima consulta","required":false}]'::jsonb),

  ('intercurrence_note','Intercorrência','Registro rápido de intercorrência ou contato clínico','system',
    '[{"key":"context","label":"Contexto","hint":"Circunstância e urgência do contato ou intercorrência","required":true},
      {"key":"description","label":"Descrição","hint":"Detalhamento do ocorrido, sintomas e observações","required":true},
      {"key":"conduct","label":"Conduta Imediata","hint":"Orientações dadas, encaminhamentos e medidas tomadas","required":true},
      {"key":"follow_up","label":"Acompanhamento","hint":"Próximos passos e monitoramento necessário","required":false}]'::jsonb),

  ('nutrition_guidance','Orientação Nutricional','Registro de orientação educativa ou aconselhamento nutricional','system',
    '[{"key":"topic","label":"Tema da Orientação","hint":"Assunto principal da orientação nutricional","required":true},
      {"key":"content","label":"Conteúdo","hint":"Informações compartilhadas, explicações e recomendações","required":true},
      {"key":"materials","label":"Materiais Entregues","hint":"Documentos, guias ou recursos compartilhados com o paciente","required":false},
      {"key":"patient_understanding","label":"Compreensão do Paciente","hint":"Avaliação de entendimento e dúvidas esclarecidas","required":false}]'::jsonb),

  ('multidisciplinary_comm','Comunicação Multiprofissional','Registro de comunicação com outros profissionais de saúde','system',
    '[{"key":"professional","label":"Profissional Contatado","hint":"Nome, especialidade e CRM/CRN do profissional","required":true},
      {"key":"reason","label":"Motivo do Contato","hint":"Razão da comunicação e questões levantadas","required":true},
      {"key":"discussion","label":"Discussão","hint":"Resumo da conversa e informações trocadas","required":true},
      {"key":"agreed_actions","label":"Ações Acordadas","hint":"Decisões conjuntas e responsabilidades definidas","required":false},
      {"key":"follow_up","label":"Seguimento","hint":"Próximos contatos e acompanhamento conjunto","required":false}]'::jsonb),

  ('referral_note','Encaminhamento','Registro de encaminhamento a outro profissional ou serviço','system',
    '[{"key":"referred_to","label":"Encaminhado Para","hint":"Profissional, especialidade ou serviço de destino","required":true},
      {"key":"reason","label":"Motivo do Encaminhamento","hint":"Razão clínica e contexto nutricional relevante","required":true},
      {"key":"clinical_summary","label":"Resumo Clínico","hint":"Informações relevantes para o profissional de destino","required":true},
      {"key":"request","label":"Solicitação","hint":"O que se espera do atendimento ou avaliação","required":false}]'::jsonb)

on conflict (code) do nothing;

-- Seed initial versions for system templates
insert into public.clinical_evolution_template_versions(template_code,version,sections_snapshot)
select t.code, 1, t.sections from public.clinical_evolution_templates t where t.category='system'
on conflict (template_code,version) do nothing;

-- 3. Indexes ------------------------------------------------------------------

create index evolution_templates_category_active_idx on public.clinical_evolution_templates(category,is_active);
create index evolution_template_versions_code_version_idx on public.clinical_evolution_template_versions(template_code,version desc);
create index evolution_template_events_code_created_idx
  on public.clinical_evolution_template_events(template_code,created_at desc);

-- 4. Atomic creation and private template lifecycle ---------------------------

create or replace function private.project_clinical_evolution_record(
  p_record public.clinical_records
) returns jsonb
language sql stable security invoker set search_path='' as $$
  select to_jsonb(p_record) || jsonb_build_object(
    'template_sections_snapshot',(
      select v.sections_snapshot
      from public.clinical_evolution_template_versions v
      where v.template_code=p_record.template_code
        and v.version=p_record.template_version
    )
  )
$$;

revoke all on function private.project_clinical_evolution_record(public.clinical_records)
from public,anon,authenticated;

-- Preserve C1's generic constructor for the remaining record types, but force
-- evolutions through the atomic C2 contract that freezes a template snapshot.
create or replace function public.create_clinical_record_draft(
  p_patient_id uuid,p_record_type text,p_encounter_at timestamptz,p_visibility text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_episode uuid; v_nutritionist uuid;
  v_student uuid; v_supervisor uuid; v_id uuid;
begin
  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if p_record_type='clinical_evolution' then
    raise exception using errcode='22023',message='specialized_evolution_draft_required'; end if;
  if p_encounter_at<now()-interval '5 minutes' then
    raise exception using errcode='22023',message='retrospective_reason_required'; end if;
  if not exists(
    select 1 from public.clinical_record_types t where t.code=p_record_type and t.is_active
  ) then raise exception using errcode='22023',message='active_record_type_required'; end if;
  v_episode:=private.resolve_active_care_episode(p_patient_id);
  select nutritionist_id into v_nutritionist from public.care_episodes
  where id=v_episode for update;
  if exists(
    select 1 from public.professional_verifications
    where user_id=v_actor and professional_role='student'
      and status='approved' and valid_until>now()
  ) then
    v_student:=v_actor;
    select s.supervisor_id into v_supervisor from public.student_supervisions s
    where s.student_id=v_actor and s.status='active' and s.supervisor_id=v_nutritionist
    order by s.started_at desc nulls last,s.id limit 1;
    if v_supervisor is null then
      raise exception using errcode='42501',message='active_supervisor_required'; end if;
  elsif v_actor<>v_nutritionist then
    raise exception using errcode='42501',message='professional_capacity_required';
  end if;
  insert into public.clinical_records(
    patient_id,care_episode_id,nutritionist_id,author_id,student_id,supervisor_id,
    record_type,visibility,encounter_at
  ) values (
    p_patient_id,v_episode,v_nutritionist,v_actor,v_student,v_supervisor,
    p_record_type,p_visibility,p_encounter_at
  ) returning id into v_id;
  insert into public.clinical_record_events(
    clinical_record_id,from_status,to_status,actor_id
  ) values(v_id,null,'draft',v_actor);
  return (select to_jsonb(r) from public.clinical_records r where r.id=v_id);
end $$;

create or replace function public.create_clinical_evolution_draft(
  p_patient_id uuid,
  p_episode_id uuid,
  p_template_code text,
  p_encounter_at timestamptz,
  p_visibility text,
  p_retrospective_reason text default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_episode public.care_episodes%rowtype;
  v_template public.clinical_evolution_templates%rowtype;
  v_template_version integer;
  v_student uuid;
  v_supervisor uuid;
  v_reason text;
  v_id uuid;
begin
  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if p_patient_id is null or p_episode_id is null or p_encounter_at is null then
    raise exception using errcode='22023',message='patient_episode_and_encounter_required';
  end if;
  if p_visibility not in ('professional_private','shared_with_patient','share_later') then
    raise exception using errcode='22023',message='invalid_visibility';
  end if;

  select e.* into v_episode from public.care_episodes e
  where e.id=p_episode_id and e.patient_id=p_patient_id for update;
  if not found or v_episode.status<>'active'
    or not private.can_write_active_care_episode(p_episode_id) then
    raise exception using errcode='42501',message='episode_write_forbidden';
  end if;

  select t.* into v_template from public.clinical_evolution_templates t
  where t.code=p_template_code and t.is_active
    and (t.category='system' or t.owner_id=v_actor)
  for share;
  if not found then
    raise exception using errcode='22023',message='active_template_required';
  end if;
  select max(v.version) into v_template_version
  from public.clinical_evolution_template_versions v
  where v.template_code=v_template.code;
  if v_template_version is null then
    raise exception using errcode='22023',message='active_template_required';
  end if;

  if p_encounter_at < now()-interval '5 minutes' then
    v_reason:=btrim(coalesce(p_retrospective_reason,''));
    if length(v_reason) not between 10 and 500 then
      raise exception using errcode='22023',message='retrospective_reason_required';
    end if;
  else
    v_reason:=null;
  end if;

  if v_actor=v_episode.nutritionist_id then
    if not exists (
      select 1 from public.professional_verifications pv
      where pv.user_id=v_actor and pv.professional_role='nutritionist'
        and pv.status='approved' and pv.valid_until>now()
    ) then
      raise exception using errcode='42501',message='professional_capacity_required';
    end if;
  else
    select s.supervisor_id into v_supervisor
    from public.professional_verifications pv
    join public.student_supervisions s on s.student_id=pv.user_id
    join public.professional_verifications supervisor_pv
      on supervisor_pv.user_id=s.supervisor_id
      and supervisor_pv.professional_role='nutritionist'
      and supervisor_pv.status='approved'
      and supervisor_pv.valid_until>now()
    where pv.user_id=v_actor and pv.professional_role='student'
      and pv.status='approved' and pv.valid_until>now()
      and s.status='active' and s.supervisor_id=v_episode.nutritionist_id
    order by s.started_at desc nulls last,s.id limit 1;
    if v_supervisor is null then
      raise exception using errcode='42501',message='active_supervisor_required';
    end if;
    v_student:=v_actor;
  end if;

  insert into public.clinical_records(
    patient_id,care_episode_id,nutritionist_id,author_id,student_id,supervisor_id,
    record_type,visibility,encounter_at,retrospective_reason,template_code,
    template_version,revision
  ) values (
    p_patient_id,p_episode_id,v_episode.nutritionist_id,v_actor,v_student,v_supervisor,
    'clinical_evolution',p_visibility,p_encounter_at,v_reason,p_template_code,
    v_template_version,1
  ) returning id into v_id;

  insert into public.clinical_record_events(
    clinical_record_id,from_status,to_status,actor_id,metadata
  ) values (
    v_id,null,'draft',v_actor,
    jsonb_build_object('action','created','template_code',p_template_code,
      'template_version',v_template_version)
  );

  return (
    select private.project_clinical_evolution_record(r)
    from public.clinical_records r where r.id=v_id
  );
end $$;

create or replace function public.clone_evolution_template(
  p_source_code text,p_name text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_source public.clinical_evolution_templates%rowtype;
  v_sections jsonb;
  v_code text;
begin
  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if length(btrim(coalesce(p_name,''))) not between 2 and 200 then
    raise exception using errcode='22023',message='invalid_template_name';
  end if;

  select t.* into v_source from public.clinical_evolution_templates t
  where t.code=p_source_code and t.is_active
    and (t.category='system' or t.owner_id=v_actor);
  if not found then
    raise exception using errcode='42501',message='source_template_forbidden';
  end if;
  select v.sections_snapshot into v_sections
  from public.clinical_evolution_template_versions v
  where v.template_code=v_source.code order by v.version desc limit 1;

  v_code:='private_' || substring(replace(v_actor::text,'-','') from 1 for 8)
    || '_' || replace(gen_random_uuid()::text,'-','');
  insert into public.clinical_evolution_templates(
    code,name,description,category,owner_id,sections
  ) values (
    v_code,btrim(p_name),v_source.description,'private',v_actor,v_sections
  );
  insert into public.clinical_evolution_template_versions(
    template_code,version,sections_snapshot,created_by
  ) values (v_code,1,v_sections,v_actor);
  insert into public.clinical_evolution_template_events(
    template_code,version,action,actor_id,metadata
  ) values (v_code,1,'created',v_actor,jsonb_build_object('source_code',v_source.code));

  return (select to_jsonb(t) || jsonb_build_object('current_version',1)
    from public.clinical_evolution_templates t where t.code=v_code);
end $$;

create or replace function public.version_private_evolution_template(
  p_template_code text,p_sections jsonb
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_template public.clinical_evolution_templates%rowtype;
  v_version integer;
begin
  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  select t.* into v_template from public.clinical_evolution_templates t
  where t.code=p_template_code for update;
  if not found or v_template.category<>'private' or v_template.owner_id<>v_actor then
    raise exception using errcode='42501',message='private_template_owner_required';
  end if;
  if not v_template.is_active then
    raise exception using errcode='23514',message='private_template_archived';
  end if;
  if private.validate_evolution_template_sections(p_sections) is not true then
    raise exception using errcode='22023',message='invalid_template_sections';
  end if;

  select coalesce(max(v.version),0)+1 into v_version
  from public.clinical_evolution_template_versions v
  where v.template_code=p_template_code;
  insert into public.clinical_evolution_template_versions(
    template_code,version,sections_snapshot,created_by
  ) values (p_template_code,v_version,p_sections,v_actor);
  update public.clinical_evolution_templates
  set sections=p_sections,updated_at=now() where code=p_template_code;
  insert into public.clinical_evolution_template_events(
    template_code,version,action,actor_id
  ) values (p_template_code,v_version,'versioned',v_actor);

  return jsonb_build_object('code',p_template_code,'version',v_version,
    'sections_snapshot',p_sections);
end $$;

create or replace function public.archive_private_evolution_template(
  p_template_code text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_template public.clinical_evolution_templates%rowtype;
  v_version integer;
begin
  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  select t.* into v_template from public.clinical_evolution_templates t
  where t.code=p_template_code for update;
  if not found or v_template.category<>'private' or v_template.owner_id<>v_actor then
    raise exception using errcode='42501',message='private_template_owner_required';
  end if;
  if not v_template.is_active then
    raise exception using errcode='23514',message='private_template_already_archived';
  end if;
  select max(v.version) into v_version
  from public.clinical_evolution_template_versions v where v.template_code=p_template_code;
  update public.clinical_evolution_templates
  set is_active=false,updated_at=now() where code=p_template_code;
  insert into public.clinical_evolution_template_events(
    template_code,version,action,actor_id
  ) values (p_template_code,v_version,'archived',v_actor);
  return (select to_jsonb(t) from public.clinical_evolution_templates t
    where t.code=p_template_code);
end $$;

-- 5. Draft lifecycle RPCs -----------------------------------------------------

-- Prevent content/record_type mutation on non-draft records
create or replace function private.prevent_finalized_content_mutation() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if new.status is distinct from old.status and not (
    (old.status='draft' and new.status='finalized') or
    (old.status='finalized' and new.status='signed') or
    (old.status in ('finalized','signed') and new.status='corrected') or
    (old.status in ('draft','finalized','signed','corrected') and new.status='invalidated')
  ) then
    raise exception using errcode='23514',message='invalid_clinical_record_status_transition';
  end if;
  if old.status <> 'draft' and (
    new.patient_id is distinct from old.patient_id or
    new.care_episode_id is distinct from old.care_episode_id or
    new.nutritionist_id is distinct from old.nutritionist_id or
    new.author_id is distinct from old.author_id or
    new.student_id is distinct from old.student_id or
    new.supervisor_id is distinct from old.supervisor_id or
    new.content is distinct from old.content or
    new.record_type is distinct from old.record_type or
    new.template_code is distinct from old.template_code or
    new.template_version is distinct from old.template_version or
    new.encounter_at is distinct from old.encounter_at or
    new.visibility is distinct from old.visibility or
    new.retrospective_reason is distinct from old.retrospective_reason or
    new.canonical_hash is distinct from old.canonical_hash or
    (
      new.signed_at is distinct from old.signed_at and not (
        old.status='finalized' and new.status='signed'
        and old.signed_at is null and new.signed_at is not null
      )
    )
  ) then
    raise exception 'finalized_record_content_immutable'
      using errcode='23514',
      hint='Clinical records cannot be modified after finalization. Use correction or invalidation.';
  end if;
  return new;
end $$;

revoke all on function private.prevent_finalized_content_mutation() from public,anon,authenticated;

create trigger trg_clinical_records_prevent_finalized_mutation before update on public.clinical_records
for each row execute function private.prevent_finalized_content_mutation();

-- Clinical text is meaningful only when something remains after removing markup,
-- non-breaking-space entities and Unicode whitespace used by rich-text editors.
create or replace function private.has_meaningful_clinical_text(p_value text)
returns boolean language sql immutable set search_path='' as $$
  select length(
    regexp_replace(
      translate(
        regexp_replace(
          regexp_replace(coalesce(p_value,''), '<[^>]*>', '', 'g'),
          '&(?:nbsp|#160|#x0*a0);', '', 'gi'
        ),
        chr(160) || chr(5760) || chr(8192) || chr(8193) || chr(8194) ||
        chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199) ||
        chr(8200) || chr(8201) || chr(8202) || chr(8203) || chr(8232) ||
        chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279),
        repeat(' ', 21)
      ),
      '[[:space:]]+', '', 'g'
    )
  ) > 0
$$;

create or replace function private.validate_clinical_record_content(
  p_content jsonb, p_sections_snapshot jsonb, p_require_meaningful boolean
) returns integer
language plpgsql immutable set search_path='' as $$
declare v_filled_sections integer;
begin
  if jsonb_typeof(p_content) is distinct from 'object' then
    raise exception using errcode='22023',message='content_object_required';
  end if;
  if jsonb_typeof(p_sections_snapshot) is distinct from 'array' then
    raise exception using errcode='23514',message='template_snapshot_required';
  end if;
  if exists(
    select 1 from jsonb_each(p_content) item
    where not exists(
      select 1 from jsonb_array_elements(p_sections_snapshot) section
      where section->>'key'=item.key
    )
  ) then
    raise exception using errcode='22023',message='unknown_template_section';
  end if;
  if exists(select 1 from jsonb_each(p_content) item where jsonb_typeof(item.value)<>'string') then
    raise exception using errcode='22023',message='section_content_string_required';
  end if;
  if exists(select 1 from jsonb_each_text(p_content) item where length(item.value)>50000) then
    raise exception using errcode='22023',message='section_content_too_large';
  end if;
  if octet_length(p_content::text)>512000 then
    raise exception using errcode='22023',message='content_payload_too_large';
  end if;

  select count(*) into v_filled_sections
  from jsonb_each_text(p_content) item
  where private.has_meaningful_clinical_text(item.value);

  if p_require_meaningful and v_filled_sections=0 then
    raise exception using errcode='22023',message='content_minimum_required';
  end if;
  if p_require_meaningful and exists(
    select 1 from jsonb_array_elements(p_sections_snapshot) section
    where (section->>'required')::boolean
      and not private.has_meaningful_clinical_text(p_content->>(section->>'key'))
  ) then
    raise exception using errcode='22023',message='required_template_section_empty';
  end if;
  return v_filled_sections;
end $$;

revoke all on function private.has_meaningful_clinical_text(text),
  private.validate_clinical_record_content(jsonb,jsonb,boolean)
from public,anon,authenticated;

-- Update draft content (autosave)
create or replace function public.update_clinical_record_draft(
  p_record_id uuid, p_content jsonb, p_visibility text default null,
  p_expected_revision bigint default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_record public.clinical_records%rowtype;
  v_updated public.clinical_records%rowtype; v_template_sections jsonb;
  v_episode_status text;
begin
  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if p_expected_revision is null or p_expected_revision<1 then
    raise exception using errcode='22023',message='expected_revision_required'; end if;
  if p_visibility is not null and p_visibility not in ('professional_private','shared_with_patient','share_later') then
    raise exception using errcode='22023',message='invalid_visibility'; end if;

  select * into v_record from public.clinical_records where id=p_record_id;
  if not found then raise exception using errcode='P0002',message='record_not_found'; end if;
  if v_record.status <> 'draft' then raise exception using errcode='23514',message='only_draft_records_can_be_edited'; end if;
  select e.status into v_episode_status from public.care_episodes e
  where e.id=v_record.care_episode_id for share;
  if v_episode_status is distinct from 'active'
    or not private.can_write_active_care_episode(v_record.care_episode_id) then
    raise exception using errcode='42501',message='episode_write_forbidden'; end if;
  -- Author or supervisor can edit
  if v_actor <> v_record.author_id and v_actor <> coalesce(v_record.supervisor_id,v_record.nutritionist_id) then
    raise exception using errcode='42501',message='draft_edit_forbidden'; end if;

  select tv.sections_snapshot into v_template_sections
  from public.clinical_evolution_template_versions tv
  where tv.template_code=v_record.template_code and tv.version=v_record.template_version;
  perform private.validate_clinical_record_content(p_content,v_template_sections,false);

  update public.clinical_records set
    content = p_content,
    visibility = coalesce(p_visibility, visibility),
    revision = revision+1,
    updated_at = now()
  where id = p_record_id and status='draft' and revision=p_expected_revision
  returning * into v_updated;
  if not found then
    raise exception using errcode='40001',message='draft_revision_conflict';
  end if;

  insert into public.clinical_record_events(clinical_record_id,from_status,to_status,actor_id,metadata)
  values(p_record_id,'draft','draft',v_actor,jsonb_build_object('action','autosave','content_keys',
    (select coalesce(jsonb_agg(k order by k),'[]') from jsonb_object_keys(p_content) k)));

  return private.project_clinical_evolution_record(v_updated);
end $$;

-- Finalize a draft
create or replace function public.finalize_clinical_record(
  p_record_id uuid, p_content jsonb, p_expected_revision bigint default null,
  p_retrospective_reason text default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_record public.clinical_records%rowtype;
  v_updated public.clinical_records%rowtype; v_hash text; v_filled_sections integer;
  v_template_sections jsonb; v_reason text; v_canonical jsonb; v_episode_status text;
begin
  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if p_expected_revision is null or p_expected_revision<1 then
    raise exception using errcode='22023',message='expected_revision_required'; end if;

  select * into v_record from public.clinical_records where id=p_record_id;
  if not found then raise exception using errcode='P0002',message='record_not_found'; end if;
  if v_record.status <> 'draft' then raise exception using errcode='23514',message='only_draft_records_can_be_finalized'; end if;
  select e.status into v_episode_status from public.care_episodes e
  where e.id=v_record.care_episode_id for share;
  if v_episode_status is distinct from 'active'
    or not private.can_write_active_care_episode(v_record.care_episode_id) then
    raise exception using errcode='42501',message='episode_write_forbidden'; end if;
  if v_record.student_id is not null then
    if v_actor<>v_record.supervisor_id then
      raise exception using errcode='42501',message='supervisor_required_to_finalize'; end if;
  elsif v_actor<>v_record.author_id or v_actor<>v_record.nutritionist_id then
    raise exception using errcode='42501',message='finalize_forbidden';
  end if;

  select tv.sections_snapshot into v_template_sections
  from public.clinical_evolution_template_versions tv
  where tv.template_code=v_record.template_code and tv.version=v_record.template_version;
  v_filled_sections := private.validate_clinical_record_content(p_content,v_template_sections,true);

  v_reason:=nullif(btrim(coalesce(p_retrospective_reason,v_record.retrospective_reason,'')),'');
  if v_record.encounter_at < v_record.created_at - interval '5 minutes'
    and (v_reason is null or length(v_reason) not between 10 and 500) then
    raise exception using errcode='22023',message='retrospective_reason_required'; end if;
  if v_reason is not null and length(v_reason)>500 then
    raise exception using errcode='22023',message='retrospective_reason_required';
  end if;

  v_canonical:=jsonb_build_object(
    'record_id',v_record.id,'patient_id',v_record.patient_id,
    'care_episode_id',v_record.care_episode_id,'nutritionist_id',v_record.nutritionist_id,
    'author_id',v_record.author_id,'student_id',v_record.student_id,
    'supervisor_id',v_record.supervisor_id,'record_type',v_record.record_type,
    'template_code',v_record.template_code,'template_version',v_record.template_version,
    'encounter_at',v_record.encounter_at,'visibility',v_record.visibility,
    'content',p_content,'retrospective_reason',v_reason
  );
  v_hash:=encode(extensions.digest(convert_to(v_canonical::text,'UTF8'),'sha256'),'hex');

  update public.clinical_records set
    content = p_content,
    status = 'finalized',
    canonical_hash = v_hash,
    retrospective_reason = v_reason,
    revision = revision+1,
    updated_at = now()
  where id=p_record_id and status='draft' and revision=p_expected_revision
  returning * into v_updated;
  if not found then
    raise exception using errcode='40001',message='draft_revision_conflict';
  end if;

  insert into public.clinical_record_events(clinical_record_id,from_status,to_status,actor_id,metadata)
  values(p_record_id,'draft','finalized',v_actor,jsonb_build_object(
    'canonical_hash',v_hash,'filled_sections',v_filled_sections));

  return private.project_clinical_evolution_record(v_updated);
end $$;

-- Sign a finalized record (nutritionist only, not student)
create or replace function public.sign_clinical_record(p_record_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_record public.clinical_records%rowtype;
  v_updated public.clinical_records%rowtype; v_crn_number text; v_crn_region text;
  v_signed_at timestamptz:=clock_timestamp(); v_auth_level text; v_jwt_claims text;
  v_episode_status text; v_expected_hash text; v_canonical jsonb;
begin
  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;

  select * into v_record from public.clinical_records where id=p_record_id;
  if not found then raise exception using errcode='P0002',message='record_not_found'; end if;
  if v_record.status not in ('finalized') then raise exception using errcode='23514',message='only_finalized_records_can_be_signed'; end if;
  select e.status into v_episode_status from public.care_episodes e
  where e.id=v_record.care_episode_id for share;
  if v_episode_status is distinct from 'active'
    or not private.can_write_active_care_episode(v_record.care_episode_id) then
    raise exception using errcode='42501',message='episode_write_forbidden'; end if;

  -- Only the episode nutritionist can sign (not student)
  if v_actor <> v_record.nutritionist_id
    or (v_record.student_id is not null and v_actor<>v_record.supervisor_id) then
    raise exception using errcode='42501',message='only_nutritionist_can_sign'; end if;

  -- Verify signer is a verified professional
  select pv.crn_number, pv.crn_region into v_crn_number, v_crn_region
  from public.professional_verifications pv
  where pv.user_id = v_actor and pv.professional_role = 'nutritionist'
    and pv.status = 'approved' and pv.valid_until > now()
  order by pv.reviewed_at desc nulls last limit 1;
  if v_crn_number is null then raise exception using errcode='42501',message='verified_professional_required'; end if;
  v_canonical:=jsonb_build_object(
    'record_id',v_record.id,'patient_id',v_record.patient_id,
    'care_episode_id',v_record.care_episode_id,'nutritionist_id',v_record.nutritionist_id,
    'author_id',v_record.author_id,'student_id',v_record.student_id,
    'supervisor_id',v_record.supervisor_id,'record_type',v_record.record_type,
    'template_code',v_record.template_code,'template_version',v_record.template_version,
    'encounter_at',v_record.encounter_at,'visibility',v_record.visibility,
    'content',v_record.content,'retrospective_reason',v_record.retrospective_reason
  );
  v_expected_hash:=encode(
    extensions.digest(convert_to(v_canonical::text,'UTF8'),'sha256'),'hex'
  );
  if v_record.canonical_hash is distinct from v_expected_hash then
    raise exception using errcode='23514',message='finalized_record_hash_mismatch'; end if;

  v_jwt_claims:=nullif(current_setting('request.jwt.claims',true),'');
  v_auth_level:=coalesce(
    nullif(current_setting('request.jwt.claim.aal',true),''),
    nullif((v_jwt_claims::jsonb)->>'aal',''),
    'unknown'
  );

  update public.clinical_records set
    status = 'signed',
    signed_at = v_signed_at,
    updated_at = now()
  where id=p_record_id and status='finalized'
  returning * into v_updated;
  if not found then
    raise exception using errcode='23514',message='only_finalized_records_can_be_signed';
  end if;

  insert into public.clinical_record_events(clinical_record_id,from_status,to_status,actor_id,metadata)
  values(p_record_id,'finalized','signed',v_actor,jsonb_build_object(
    'canonical_hash',v_record.canonical_hash,'crn_number',v_crn_number,'crn_region',v_crn_region,
    'signed_at',v_signed_at,'auth_level',v_auth_level));

  return private.project_clinical_evolution_record(v_updated);
end $$;

drop function if exists public.cosign_clinical_record(uuid);

-- List clinical records by episode (with optional status filter)
create or replace function public.list_clinical_records_by_episode(
  p_patient_id uuid, p_episode_id uuid, p_status_filter text default null
) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if not private.can_read_care_episode(p_episode_id) or not exists(
    select 1 from public.care_episodes e where e.id=p_episode_id and e.patient_id=p_patient_id
  ) then raise exception using errcode='42501',message='episode_read_forbidden'; end if;

  return query select private.project_clinical_evolution_record(r)
  from public.clinical_records r
  where r.patient_id = p_patient_id
    and r.care_episode_id = p_episode_id
    and private.can_read_clinical_record(r.id)
    and (p_status_filter is null or r.status = p_status_filter)
  order by r.encounter_at desc, r.created_at desc;
end $$;

-- List available evolution templates
create or replace function public.list_evolution_templates() returns setof public.clinical_evolution_templates
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception using errcode='28000',message='authentication_required'; end if;
  return query select t.* from public.clinical_evolution_templates t
  where t.is_active and (t.category='system' or t.owner_id=(select auth.uid()))
  order by t.category='system' desc, t.name;
end $$;

-- 5. Grants -------------------------------------------------------------------

revoke all on function
  public.create_clinical_evolution_draft(uuid,uuid,text,timestamptz,text,text),
  public.update_clinical_record_draft(uuid,jsonb,text,bigint),
  public.finalize_clinical_record(uuid,jsonb,bigint,text),
  public.sign_clinical_record(uuid),
  public.list_clinical_records_by_episode(uuid,uuid,text),
  public.list_evolution_templates(),
  public.clone_evolution_template(text,text),
  public.version_private_evolution_template(text,jsonb),
  public.archive_private_evolution_template(text)
from public,anon,authenticated;

grant execute on function
  public.create_clinical_evolution_draft(uuid,uuid,text,timestamptz,text,text),
  public.update_clinical_record_draft(uuid,jsonb,text,bigint),
  public.finalize_clinical_record(uuid,jsonb,bigint,text),
  public.sign_clinical_record(uuid),
  public.list_clinical_records_by_episode(uuid,uuid,text),
  public.list_evolution_templates(),
  public.clone_evolution_template(text,text),
  public.version_private_evolution_template(text,jsonb),
  public.archive_private_evolution_template(text)
to authenticated,service_role;

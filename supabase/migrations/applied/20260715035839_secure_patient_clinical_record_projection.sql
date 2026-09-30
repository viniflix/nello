-- C4 follow-up: patient access is limited to official shared versions and
-- all patient-facing clinical record projections are explicitly minimized.

create or replace function private.is_patient_visible_clinical_record(p_record_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.clinical_records r
    where r.id=p_record_id
      and r.patient_id=(select auth.uid())
      and r.visibility='shared_with_patient'
      and (
        r.status='signed'
        or (
          r.status='corrected'
          and exists (
            select 1 from public.clinical_record_amendments a
            where a.target_record_id=r.id
              and a.status='effective'
              and a.amendment_type='correction'
          )
        )
        or (
          r.status='invalidated'
          and exists (
            select 1 from public.clinical_record_amendments a
            where a.target_record_id=r.id
              and a.status='effective'
              and a.amendment_type='invalidation'
          )
        )
      )
  )
$$;

revoke all on function private.is_patient_visible_clinical_record(uuid)
from public,anon,authenticated;

create or replace function private.can_read_clinical_record(p_record_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.clinical_records r
    where r.id=p_record_id
      and private.can_read_care_episode(r.care_episode_id)
      and (
        r.patient_id<>(select auth.uid())
        or private.is_patient_visible_clinical_record(r.id)
      )
  )
$$;

revoke all on function private.can_read_clinical_record(uuid)
from public,anon,authenticated;
grant execute on function private.can_read_clinical_record(uuid) to authenticated;

create or replace function private.project_patient_clinical_record(
  p_record public.clinical_records
) returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',p_record.id,
    'record_type',p_record.record_type,
    'status',p_record.status,
    'visibility',p_record.visibility,
    'encounter_at',p_record.encounter_at,
    'recorded_at',p_record.recorded_at,
    'content',p_record.content,
    'template_code',p_record.template_code,
    'template_version',p_record.template_version,
    'template_sections_snapshot',(
      select v.sections_snapshot
      from public.clinical_evolution_template_versions v
      where v.template_code=p_record.template_code
        and v.version=p_record.template_version
    ),
    'signed_at',p_record.signed_at,
    'chain_version',p_record.chain_version,
    'professional_display_name',(
      select profile.name
      from public.clinical_record_events event
      join public.user_profiles profile on profile.id=event.actor_id
      where event.clinical_record_id=p_record.id
        and event.to_status='signed'
      order by event.created_at desc,event.id desc
      limit 1
    ),
    'amendment',(
      select jsonb_build_object(
        'type',a.amendment_type,
        'status',a.status,
        'reason',a.reason,
        'effective_at',a.effective_at
      )
      from public.clinical_record_amendments a
      where a.status='effective'
        and (
          (a.amendment_type='correction'
            and (a.target_record_id=p_record.id or a.replacement_record_id=p_record.id))
          or (a.amendment_type='invalidation' and a.target_record_id=p_record.id)
        )
      order by a.effective_at desc,a.created_at desc
      limit 1
    )
  ))
$$;

revoke all on function private.project_patient_clinical_record(public.clinical_records)
from public,anon,authenticated;

drop policy if exists clinical_records_participant_select on public.clinical_records;
create policy clinical_records_participant_select
on public.clinical_records for select to authenticated
using (private.can_read_clinical_record(id));

drop policy if exists clinical_record_events_participant_select on public.clinical_record_events;
create policy clinical_record_events_participant_select
on public.clinical_record_events for select to authenticated
using (private.can_read_clinical_record(clinical_record_id));

-- RPCs below are the only supported read surface. Removing direct table SELECT
-- prevents a patient from requesting columns that RLS cannot redact.
revoke select on public.clinical_records,public.clinical_record_events from authenticated;
grant select on public.clinical_records,public.clinical_record_events to service_role;

create or replace function public.get_patient_record_foundation(p_patient_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_result jsonb;
  v_episode uuid;
  v_episode_status text;
  v_can_write boolean:=false;
begin
  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if v_actor<>p_patient_id and not exists (
    select 1 from public.care_episodes e
    where e.patient_id=p_patient_id and private.can_read_care_episode(e.id)
  ) then
    raise exception using errcode='42501',message='patient_record_read_forbidden';
  end if;

  select e.id,e.status into v_episode,v_episode_status
  from public.care_episodes e
  where e.patient_id=p_patient_id and private.can_read_care_episode(e.id)
  order by (e.nutritionist_id=v_actor) desc,e.status='active' desc,e.started_at desc
  limit 1;
  if v_episode is not null then
    v_can_write:=private.can_write_active_care_episode(v_episode);
  end if;

  select jsonb_build_object(
    'viewed_episode_id',v_episode,
    'viewed_episode_status',v_episode_status,
    'writable_episode_id',case when v_can_write then v_episode else null end,
    'can_write',v_can_write,
    'patient',jsonb_build_object(
      'id',p.id,'name',p.name,'phone',p.phone,'birth_date',p.birth_date,
      'gender',p.gender,'email',p.email,'occupation',p.occupation,
      'civil_status',p.civil_status,'address',p.address
    ),
    'records',coalesce(
      case when v_actor=p_patient_id then (
        select jsonb_agg(private.project_patient_clinical_record(official) order by official.encounter_at desc)
        from (
          select distinct on (r.root_record_id) r.*
          from public.clinical_records r
          where r.patient_id=p_patient_id
            and private.is_patient_visible_clinical_record(r.id)
          order by r.root_record_id,r.chain_version desc
        ) official
      ) else (
        select jsonb_agg(to_jsonb(r) order by r.encounter_at desc)
        from public.clinical_records r
        where r.patient_id=p_patient_id and private.can_read_clinical_record(r.id)
      ) end,
      '[]'::jsonb
    )
  ) into v_result
  from public.user_profiles p
  where p.id=p_patient_id and p.user_type='patient';

  if v_result is null then
    raise exception using errcode='P0002',message='patient_not_found';
  end if;
  return v_result;
end
$$;

create or replace function public.list_clinical_record_version_chain(p_record_id uuid)
returns setof jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_root uuid;
  v_patient uuid;
begin
  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  select r.root_record_id,r.patient_id into v_root,v_patient
  from public.clinical_records r where r.id=p_record_id;
  if not found or not private.can_read_clinical_record(p_record_id) then
    raise exception using errcode='P0002',message='clinical_record_not_found';
  end if;

  if v_actor=v_patient then
    return query
    select private.project_patient_clinical_record(r)
    from public.clinical_records r
    where r.root_record_id=v_root
      and private.is_patient_visible_clinical_record(r.id)
    order by r.chain_version desc;
  else
    return query
    select private.project_clinical_record_chain_item(r)
    from public.clinical_records r
    where r.root_record_id=v_root
      and private.can_read_clinical_record(r.id)
    order by r.chain_version desc;
  end if;
end
$$;

create or replace function public.list_clinical_records_by_episode(
  p_patient_id uuid,p_episode_id uuid,p_status_filter text default null
) returns setof jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid());
begin
  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if not private.can_read_care_episode(p_episode_id) or not exists (
    select 1 from public.care_episodes e
    where e.id=p_episode_id and e.patient_id=p_patient_id
  ) then
    raise exception using errcode='42501',message='episode_read_forbidden';
  end if;

  if v_actor=p_patient_id then
    return query
    select private.project_patient_clinical_record(r)
    from public.clinical_records r
    where r.patient_id=p_patient_id
      and r.care_episode_id=p_episode_id
      and private.is_patient_visible_clinical_record(r.id)
      and (p_status_filter is null or r.status=p_status_filter)
    order by r.encounter_at desc,r.created_at desc;
  else
    return query
    select private.project_clinical_evolution_record(r)
    from public.clinical_records r
    where r.patient_id=p_patient_id
      and r.care_episode_id=p_episode_id
      and private.can_read_clinical_record(r.id)
      and (p_status_filter is null or r.status=p_status_filter)
    order by r.encounter_at desc,r.created_at desc;
  end if;
end
$$;

create or replace function public.compare_clinical_record_versions(
  p_left_record_id uuid,p_right_record_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_left public.clinical_records%rowtype;
  v_right public.clinical_records%rowtype;
  v_sections jsonb;
begin
  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  select * into v_left from public.clinical_records where id=p_left_record_id;
  select * into v_right from public.clinical_records where id=p_right_record_id;
  if not found
    or not private.can_read_clinical_record(p_left_record_id)
    or not private.can_read_clinical_record(p_right_record_id) then
    raise exception using errcode='P0002',message='clinical_record_not_found';
  end if;
  if v_left.root_record_id<>v_right.root_record_id then
    raise exception using errcode='22023',message='clinical_record_versions_not_in_same_chain';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'key',keys.key,
      'left_value',v_left.content->keys.key,
      'right_value',v_right.content->keys.key,
      'change_type',case
        when not (v_left.content ? keys.key) then 'added'
        when not (v_right.content ? keys.key) then 'removed'
        when v_left.content->keys.key is distinct from v_right.content->keys.key then 'changed'
        else 'unchanged'
      end
    ) order by keys.key
  ),'[]'::jsonb) into v_sections
  from (
    select key from jsonb_object_keys(v_left.content) key
    union
    select key from jsonb_object_keys(v_right.content) key
  ) keys;

  if v_actor=v_left.patient_id then
    return jsonb_build_object(
      'left',private.project_patient_clinical_record(v_left),
      'right',private.project_patient_clinical_record(v_right),
      'sections',v_sections
    );
  end if;
  return jsonb_build_object(
    'root_record_id',v_left.root_record_id,
    'left',private.project_clinical_record_chain_item(v_left),
    'right',private.project_clinical_record_chain_item(v_right),
    'sections',v_sections
  );
end
$$;

revoke all on function public.get_patient_record_foundation(uuid),
  public.list_clinical_record_version_chain(uuid),
  public.list_clinical_records_by_episode(uuid,uuid,text),
  public.compare_clinical_record_versions(uuid,uuid)
from public,anon;
grant execute on function public.get_patient_record_foundation(uuid),
  public.list_clinical_record_version_chain(uuid),
  public.list_clinical_records_by_episode(uuid,uuid,text),
  public.compare_clinical_record_versions(uuid,uuid)
to authenticated,service_role;

-- Supports the patient foundation DISTINCT ON ordering directly. The record
-- primary key already covers per-record visibility checks; the unique
-- replacement index and partial effective-target index already reduce the
-- amendment lookups to at most one row, so no redundant indexes are added.
create index if not exists clinical_records_patient_root_version_idx
on public.clinical_records(patient_id,root_record_id,chain_version desc);

create or replace function public.list_patient_timeline(
  p_patient_id uuid,
  p_episode_id uuid,
  p_scope text,
  p_cursor_at timestamptz,
  p_cursor_event_id text,
  p_limit integer
)
returns table(
  event_id text,
  source_id text,
  source_type text,
  category text,
  subtype text,
  title text,
  summary text,
  occurred_at timestamptz,
  status text,
  is_legacy boolean
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid());
begin
  if v_actor is null then
    raise exception using errcode='42501',message='timeline_authentication_required';
  end if;
  if p_patient_id is null or p_episode_id is null then
    raise exception using errcode='22023',message='timeline_context_required';
  end if;
  if p_scope is null or p_scope not in ('clinical','operational','all') then
    raise exception using errcode='22023',message='timeline_scope_invalid';
  end if;
  if p_limit is null or p_limit<1 or p_limit>100 then
    raise exception using errcode='22023',message='timeline_limit_invalid';
  end if;
  if (p_cursor_at is null)<>(p_cursor_event_id is null)
    or (p_cursor_event_id is not null and length(p_cursor_event_id)=0) then
    raise exception using errcode='22023',message='timeline_cursor_invalid';
  end if;
  if not private.can_read_care_episode(p_episode_id) or not exists (
    select 1 from public.care_episodes e
    where e.id=p_episode_id and e.patient_id=p_patient_id
  ) then
    raise exception using errcode='42501',message='timeline_forbidden';
  end if;

  return query
  with source_events as (
    select
      'clinical_record:'||r.id::text as event_id,
      r.id::text as source_id,
      'clinical_record'::text as source_type,
      'clinical'::text as category,
      r.record_type::text as subtype,
      case r.record_type
        when 'clinical_evolution' then 'Evolução clínica'
        when 'initial_assessment' then 'Avaliação inicial'
        when 'follow_up' then 'Acompanhamento clínico'
        when 'intercurrence' then 'Intercorrência'
        else 'Registro clínico'
      end::text as title,
      case
        when v_actor=p_patient_id then case r.status
          when 'signed' then 'Registro clínico assinado'
          when 'corrected' then 'Uma versão corrigida por profissional permanece preservada no histórico.'
          when 'invalidated' then 'Invalidado pelo profissional responsável; preservado no histórico e fora da orientação vigente.'
          else 'Registro clínico'
        end
        else case r.status
          when 'draft' then 'Registro clínico em elaboração'
          when 'finalized' then 'Registro clínico finalizado'
          when 'signed' then 'Registro clínico assinado'
          when 'corrected' then 'Registro clínico corrigido'
          when 'invalidated' then 'Registro clínico invalidado'
          else 'Registro clínico'
        end
      end::text as summary,
      r.encounter_at as occurred_at,
      r.status::text as status,
      false as is_legacy
    from public.clinical_records r
    where r.patient_id=p_patient_id
      and r.care_episode_id=p_episode_id
      and (v_actor<>p_patient_id or private.is_patient_visible_clinical_record(r.id))

    union all

    select
      'anamnesis:'||a.id::text,a.id::text,'anamnesis'::text,'clinical'::text,
      'anamnesis'::text,'Anamnese'::text,
      case a.status
        when 'draft' then 'Anamnese em elaboração'
        when 'pending_patient' then 'Anamnese aguardando paciente'
        when 'in_progress' then 'Anamnese em preenchimento'
        when 'submitted' then 'Anamnese enviada'
        when 'validated' then 'Anamnese validada'
        else 'Anamnese'
      end::text,
      coalesce(a.created_at,a.date::timestamptz),a.status::text,true
    from public.anamnesis_records a
    where a.patient_id=p_patient_id
      and a.care_episode_id=p_episode_id
      and (v_actor<>p_patient_id or a.filled_by='patient' or a.status in ('submitted','validated'))

    union all

    select
      'meal_plan:'||m.id::text,m.id::text,'meal_plan'::text,'operational'::text,
      'meal_plan'::text,'Plano alimentar'::text,
      case when m.is_active then 'Plano alimentar ativo' else 'Plano alimentar arquivado' end::text,
      coalesce(m.created_at,m.start_date::timestamptz,'epoch'::timestamptz),
      case when m.is_active then 'active' else 'archived' end::text,true
    from public.meal_plans m
    where m.patient_id=p_patient_id and m.care_episode_id=p_episode_id and not m.is_draft

    union all

    select
      'appointment:'||a.id::text,a.id::text,'appointment'::text,'operational'::text,
      'appointment'::text,'Consulta'::text,
      case a.status
        when 'scheduled' then 'Consulta agendada'
        when 'confirmed' then 'Consulta confirmada'
        when 'awaiting_confirmation' then 'Consulta aguardando confirmação'
        when 'completed' then 'Consulta realizada'
        when 'cancelled' then 'Consulta cancelada'
        when 'no_show' then 'Ausência registrada'
        else 'Consulta'
      end::text,
      a.appointment_time,a.status::text,true
    from public.appointments a
    where a.patient_id=p_patient_id and a.care_episode_id=p_episode_id
  )
  select
    e.event_id,e.source_id,e.source_type,e.category,e.subtype,e.title,e.summary,
    e.occurred_at,e.status,e.is_legacy
  from source_events e
  where (p_scope='all' or e.category=p_scope)
    and (p_cursor_at is null or (e.occurred_at,e.event_id)<(p_cursor_at,p_cursor_event_id))
  order by e.occurred_at desc,e.event_id desc
  limit p_limit+1;
end
$$;

revoke all on function public.list_patient_timeline(uuid,uuid,text,timestamptz,text,integer)
from public,anon;
grant execute on function public.list_patient_timeline(uuid,uuid,text,timestamptz,text,integer)
to authenticated,service_role;

-- B4/C1 originally inferred student access from a global active supervision.
-- Episodes now persist their exact student and supervisor participants, so all
-- clinical read/write gates must use those immutable episode assignments.
create or replace function private.can_read_care_episode(p_episode_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.care_episodes e
    where e.id=p_episode_id
      and (
        e.patient_id=(select auth.uid())
        or e.nutritionist_id=(select auth.uid())
        or e.student_id=(select auth.uid())
        or e.supervisor_id=(select auth.uid())
      )
  )
$$;

create or replace function private.can_write_active_care_episode(p_episode_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_episode public.care_episodes%rowtype;
begin
  if v_actor is null then
    return false;
  end if;

  select e.* into v_episode
  from public.care_episodes e
  where e.id=p_episode_id
  for share;
  if not found or v_episode.status<>'active' then
    return false;
  end if;

  if v_episode.is_simulation then
    return v_episode.nutritionist_id=v_actor;
  end if;

  if v_episode.student_id is null and v_episode.supervisor_id is null then
    if v_episode.nutritionist_id<>v_actor then
      return false;
    end if;
    perform 1
    from public.professional_verifications pv
    where pv.user_id=v_episode.nutritionist_id
      and pv.professional_role='nutritionist'
      and pv.status='approved'
      and pv.valid_until>now()
    for share of pv;
    return found;
  end if;

  if v_actor not in (v_episode.student_id,v_episode.supervisor_id) then
    return false;
  end if;

  perform 1
  from public.student_supervisions s
  join public.professional_verifications student_pv
    on student_pv.user_id=s.student_id
  join public.professional_verifications supervisor_pv
    on supervisor_pv.user_id=s.supervisor_id
  where s.student_id=v_episode.student_id
    and s.supervisor_id=v_episode.supervisor_id
    and s.status='active'
    and student_pv.professional_role='student'
    and student_pv.status='approved'
    and student_pv.valid_until>now()
    and supervisor_pv.professional_role='nutritionist'
    and supervisor_pv.status='approved'
    and supervisor_pv.valid_until>now()
  for share of s,student_pv,supervisor_pv;
  return found;
end
$$;

-- C2 was already deployed before the B4 participant mismatch was discovered.
-- Replace only the two lifecycle RPCs whose role resolution depended on the
-- obsolete model (student acting inside the supervisor's regular episode).
create or replace function public.create_clinical_evolution_draft(
  p_patient_id uuid,
  p_episode_id uuid,
  p_template_code text,
  p_encounter_at timestamptz,
  p_visibility text,
  p_retrospective_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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

  select e.* into v_episode
  from public.care_episodes e
  where e.id=p_episode_id and e.patient_id=p_patient_id
  for update;
  if not found or v_episode.status<>'active'
    or not private.can_write_active_care_episode(p_episode_id) then
    raise exception using errcode='42501',message='episode_write_forbidden';
  end if;

  if v_episode.is_simulation then
    if v_actor<>v_episode.nutritionist_id then
      raise exception using errcode='42501',message='episode_write_forbidden';
    end if;
  elsif v_episode.student_id is not null then
    if v_actor<>v_episode.student_id or v_episode.supervisor_id is null then
      raise exception using errcode='42501',message='student_required_to_create';
    end if;
    v_student:=v_episode.student_id;
    v_supervisor:=v_episode.supervisor_id;
  else
    if v_actor<>v_episode.nutritionist_id or not exists (
      select 1
      from public.professional_verifications pv
      where pv.user_id=v_actor
        and pv.professional_role='nutritionist'
        and pv.status='approved'
        and pv.valid_until>now()
    ) then
      raise exception using errcode='42501',message='professional_capacity_required';
    end if;
  end if;

  select t.* into v_template
  from public.clinical_evolution_templates t
  where t.code=p_template_code
    and t.is_active
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

  if p_encounter_at<now()-interval '5 minutes' then
    v_reason:=btrim(coalesce(p_retrospective_reason,''));
    if length(v_reason) not between 10 and 500 then
      raise exception using errcode='22023',message='retrospective_reason_required';
    end if;
  else
    v_reason:=null;
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
    from public.clinical_records r
    where r.id=v_id
  );
end
$$;

create or replace function public.sign_clinical_record(p_record_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_record public.clinical_records%rowtype;
  v_updated public.clinical_records%rowtype;
  v_crn_number text;
  v_crn_region text;
  v_signed_at timestamptz:=clock_timestamp();
  v_auth_level text;
  v_jwt_claims text;
  v_episode_status text;
  v_expected_hash text;
  v_canonical jsonb;
begin
  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  select * into v_record
  from public.clinical_records
  where id=p_record_id;
  if not found then
    raise exception using errcode='P0002',message='record_not_found';
  end if;
  if v_record.status<>'finalized' then
    raise exception using errcode='23514',message='only_finalized_records_can_be_signed';
  end if;

  select e.status into v_episode_status
  from public.care_episodes e
  where e.id=v_record.care_episode_id
  for share;
  if v_episode_status is distinct from 'active'
    or not private.can_write_active_care_episode(v_record.care_episode_id) then
    raise exception using errcode='42501',message='episode_write_forbidden';
  end if;

  if (
    v_record.student_id is not null
    and v_actor<>v_record.supervisor_id
  ) or (
    v_record.student_id is null
    and v_actor<>v_record.nutritionist_id
  ) then
    raise exception using errcode='42501',message='only_nutritionist_can_sign';
  end if;

  select pv.crn_number,pv.crn_region into v_crn_number,v_crn_region
  from public.professional_verifications pv
  where pv.user_id=v_actor
    and pv.professional_role='nutritionist'
    and pv.status='approved'
    and pv.valid_until>now()
  order by pv.reviewed_at desc nulls last
  limit 1;
  if v_crn_number is null then
    raise exception using errcode='42501',message='verified_professional_required';
  end if;

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
    raise exception using errcode='23514',message='finalized_record_hash_mismatch';
  end if;

  v_jwt_claims:=nullif(current_setting('request.jwt.claims',true),'');
  v_auth_level:=coalesce(
    nullif(current_setting('request.jwt.claim.aal',true),''),
    nullif((v_jwt_claims::jsonb)->>'aal',''),
    'unknown'
  );

  update public.clinical_records
  set status='signed',signed_at=v_signed_at,updated_at=now()
  where id=p_record_id and status='finalized'
  returning * into v_updated;
  if not found then
    raise exception using errcode='23514',message='only_finalized_records_can_be_signed';
  end if;

  insert into public.clinical_record_events(
    clinical_record_id,from_status,to_status,actor_id,metadata
  ) values (
    p_record_id,'finalized','signed',v_actor,jsonb_build_object(
      'canonical_hash',v_record.canonical_hash,'crn_number',v_crn_number,
      'crn_region',v_crn_region,'signed_at',v_signed_at,'auth_level',v_auth_level
    )
  );

  return private.project_clinical_evolution_record(v_updated);
end
$$;

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
declare
  v_actor uuid := auth.uid();
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

  if not private.can_read_care_episode(p_episode_id)
    or not exists(
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
      case r.status
        when 'draft' then 'Registro clínico em elaboração'
        when 'finalized' then 'Registro clínico finalizado'
        when 'signed' then 'Registro clínico assinado'
        when 'corrected' then 'Registro clínico corrigido'
        when 'invalidated' then 'Registro clínico invalidado'
        else 'Registro clínico'
      end::text as summary,
      r.encounter_at as occurred_at,
      r.status::text as status,
      false as is_legacy
    from public.clinical_records r
    where r.patient_id=p_patient_id
      and r.care_episode_id=p_episode_id
      and (v_actor<>p_patient_id or r.visibility='shared_with_patient')

    union all

    select
      'anamnesis:'||a.id::text,
      a.id::text,
      'anamnesis'::text,
      'clinical'::text,
      'anamnesis'::text,
      'Anamnese'::text,
      case a.status
        when 'draft' then 'Anamnese em elaboração'
        when 'pending_patient' then 'Anamnese aguardando paciente'
        when 'in_progress' then 'Anamnese em preenchimento'
        when 'submitted' then 'Anamnese enviada'
        when 'validated' then 'Anamnese validada'
        else 'Anamnese'
      end::text,
      coalesce(a.created_at,a.date::timestamptz),
      a.status::text,
      true
    from public.anamnesis_records a
    where a.patient_id=p_patient_id
      and a.care_episode_id=p_episode_id
      and (
        v_actor<>p_patient_id
        or a.filled_by='patient'
        or a.status in ('submitted','validated')
      )

    union all

    select
      'meal_plan:'||m.id::text,
      m.id::text,
      'meal_plan'::text,
      'operational'::text,
      'meal_plan'::text,
      'Plano alimentar'::text,
      case when m.is_active then 'Plano alimentar ativo' else 'Plano alimentar arquivado' end::text,
      coalesce(m.created_at,m.start_date::timestamptz,'epoch'::timestamptz),
      case when m.is_active then 'active' else 'archived' end::text,
      true
    from public.meal_plans m
    where m.patient_id=p_patient_id
      and m.care_episode_id=p_episode_id
      and not m.is_draft

    union all

    select
      'appointment:'||a.id::text,
      a.id::text,
      'appointment'::text,
      'operational'::text,
      'appointment'::text,
      'Consulta'::text,
      case a.status
        when 'scheduled' then 'Consulta agendada'
        when 'confirmed' then 'Consulta confirmada'
        when 'awaiting_confirmation' then 'Consulta aguardando confirmação'
        when 'completed' then 'Consulta realizada'
        when 'cancelled' then 'Consulta cancelada'
        when 'no_show' then 'Ausência registrada'
        else 'Consulta'
      end::text,
      a.appointment_time,
      a.status::text,
      true
    from public.appointments a
    where a.patient_id=p_patient_id
      and a.care_episode_id=p_episode_id
  )
  select
    e.event_id,e.source_id,e.source_type,e.category,e.subtype,e.title,e.summary,
    e.occurred_at,e.status,e.is_legacy
  from source_events e
  where (p_scope='all' or e.category=p_scope)
    and (
      p_cursor_at is null
      or (e.occurred_at,e.event_id)<(p_cursor_at,p_cursor_event_id)
    )
  order by e.occurred_at desc,e.event_id desc
  limit p_limit+1;
end
$$;

revoke all on function public.list_patient_timeline(uuid,uuid,text,timestamptz,text,integer)
  from public,anon;
grant execute on function public.list_patient_timeline(uuid,uuid,text,timestamptz,text,integer)
  to authenticated,service_role;

comment on function public.list_patient_timeline(uuid,uuid,text,timestamptz,text,integer) is
  'Episode-scoped, minimized clinical/operational timeline using stable keyset pagination. Returns limit+1 rows.';

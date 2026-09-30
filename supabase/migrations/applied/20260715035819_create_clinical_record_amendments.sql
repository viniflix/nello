-- C4 foundation: immutable correction chains and minimized read projections.

-- 1. Linear version metadata ------------------------------------------------

alter table public.clinical_records
  add column if not exists root_record_id uuid,
  add column if not exists replaces_record_id uuid,
  add column if not exists chain_version integer,
  add column if not exists canonical_format_version smallint;

update public.clinical_records
set root_record_id=id,
    chain_version=1,
    canonical_format_version=1
where root_record_id is null
   or chain_version is null
   or canonical_format_version is null;

alter table public.clinical_records
  alter column root_record_id set not null,
  alter column chain_version set not null,
  alter column canonical_format_version set not null,
  add constraint clinical_records_root_record_id_fkey
    foreign key (root_record_id) references public.clinical_records(id) on delete restrict,
  add constraint clinical_records_replaces_record_id_fkey
    foreign key (replaces_record_id) references public.clinical_records(id) on delete restrict,
  add constraint clinical_records_replaces_record_id_key unique (replaces_record_id),
  add constraint clinical_records_root_chain_version_key unique (root_record_id,chain_version),
  add constraint clinical_records_chain_version_check check (chain_version>0),
  add constraint clinical_records_canonical_format_version_check
    check (canonical_format_version in (1,2)),
  add constraint clinical_records_chain_shape_check check (
    (replaces_record_id is null and root_record_id=id and chain_version=1)
    or
    (replaces_record_id is not null and root_record_id<>id and chain_version>1)
  );

create unique index clinical_records_one_current_signed_idx
  on public.clinical_records(root_record_id)
  where status='signed';

create index clinical_records_root_version_idx
  on public.clinical_records(root_record_id,chain_version desc);
create index clinical_records_replaces_idx
  on public.clinical_records(replaces_record_id)
  where replaces_record_id is not null;

create or replace function private.prepare_clinical_record_chain()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_previous public.clinical_records%rowtype;
begin
  if tg_op='UPDATE' then
    if new.root_record_id is distinct from old.root_record_id
      or new.replaces_record_id is distinct from old.replaces_record_id
      or new.chain_version is distinct from old.chain_version
      or new.canonical_format_version is distinct from old.canonical_format_version then
      raise exception using errcode='23514',message='clinical_record_chain_identity_immutable';
    end if;
    return new;
  end if;

  if new.replaces_record_id is null then
    new.root_record_id:=coalesce(new.root_record_id,new.id);
    new.chain_version:=coalesce(new.chain_version,1);
    new.canonical_format_version:=coalesce(new.canonical_format_version,1);
    if new.root_record_id<>new.id or new.chain_version<>1 then
      raise exception using errcode='23514',message='invalid_clinical_record_root_shape';
    end if;
    return new;
  end if;

  select * into v_previous
  from public.clinical_records
  where id=new.replaces_record_id
  for share;
  if not found then
    raise exception using errcode='23503',message='replaced_clinical_record_not_found';
  end if;

  new.root_record_id:=coalesce(new.root_record_id,v_previous.root_record_id);
  new.chain_version:=coalesce(new.chain_version,v_previous.chain_version+1);
  new.canonical_format_version:=coalesce(new.canonical_format_version,2);

  if new.root_record_id<>v_previous.root_record_id
    or new.chain_version<>v_previous.chain_version+1 then
    raise exception using errcode='23514',message='invalid_clinical_record_chain_version';
  end if;
  if new.patient_id<>v_previous.patient_id
    or new.care_episode_id<>v_previous.care_episode_id
    or new.nutritionist_id<>v_previous.nutritionist_id
    or new.record_type<>v_previous.record_type
    or new.template_code is distinct from v_previous.template_code
    or new.template_version is distinct from v_previous.template_version
    or new.encounter_at<>v_previous.encounter_at
    or new.visibility<>v_previous.visibility then
    raise exception using errcode='23514',message='clinical_record_chain_context_mismatch';
  end if;
  return new;
end
$$;

revoke all on function private.prepare_clinical_record_chain()
from public,anon,authenticated;

drop trigger if exists trg_clinical_records_prepare_chain on public.clinical_records;
create trigger trg_clinical_records_prepare_chain
before insert or update of root_record_id,replaces_record_id,chain_version,canonical_format_version
on public.clinical_records
for each row execute function private.prepare_clinical_record_chain();

-- 2. Formal amendment ledger ------------------------------------------------

create table public.clinical_record_amendments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.user_profiles(id) on delete restrict,
  care_episode_id uuid not null references public.care_episodes(id) on delete restrict,
  root_record_id uuid not null references public.clinical_records(id) on delete restrict,
  target_record_id uuid not null references public.clinical_records(id) on delete restrict,
  replacement_record_id uuid references public.clinical_records(id) on delete restrict,
  amendment_type text not null constraint clinical_record_amendments_type_check
    check (amendment_type in ('correction','invalidation')),
  status text not null constraint clinical_record_amendments_status_check
    check (status in ('draft','effective','abandoned')),
  reason text not null constraint clinical_record_amendments_reason_check
    check (length(btrim(reason)) between 20 and 2000),
  impact_snapshot jsonb not null constraint clinical_record_amendments_impact_snapshot_check
    check (jsonb_typeof(impact_snapshot)='object'),
  impact_hash text not null constraint clinical_record_amendments_impact_hash_check
    check (impact_hash ~ '^[0-9a-f]{64}$'),
  actor_id uuid not null references public.user_profiles(id) on delete restrict,
  responsible_id uuid not null references public.user_profiles(id) on delete restrict,
  supervisor_id uuid references public.user_profiles(id) on delete restrict,
  authentication_evidence jsonb not null default '{}'::jsonb
    constraint clinical_record_amendments_authentication_evidence_check
    check (jsonb_typeof(authentication_evidence)='object'),
  canonical_hash text constraint clinical_record_amendments_canonical_hash_check
    check (canonical_hash is null or canonical_hash ~ '^[0-9a-f]{64}$'),
  abandonment_reason text constraint clinical_record_amendments_abandonment_reason_check
    check (abandonment_reason is null or length(btrim(abandonment_reason)) between 20 and 2000),
  created_at timestamptz not null default now(),
  effective_at timestamptz,
  abandoned_at timestamptz,
  constraint clinical_record_amendments_replacement_shape_check check (
    (amendment_type='correction' and replacement_record_id is not null)
    or (amendment_type='invalidation' and replacement_record_id is null)
  ),
  constraint clinical_record_amendments_state_time_check check (
    (status='draft' and effective_at is null and abandoned_at is null
      and canonical_hash is null and abandonment_reason is null)
    or (status='effective' and effective_at is not null and abandoned_at is null
      and canonical_hash is not null and abandonment_reason is null)
    or (status='abandoned' and effective_at is null and abandoned_at is not null
      and abandonment_reason is not null)
  ),
  constraint clinical_record_amendments_replacement_record_id_key unique (replacement_record_id)
);

create unique index clinical_record_amendments_one_open_correction_idx
  on public.clinical_record_amendments(root_record_id)
  where amendment_type='correction' and status='draft';
create unique index clinical_record_amendments_one_effective_target_idx
  on public.clinical_record_amendments(target_record_id)
  where status='effective';
create index clinical_record_amendments_patient_created_idx
  on public.clinical_record_amendments(patient_id,created_at desc);
create index clinical_record_amendments_episode_created_idx
  on public.clinical_record_amendments(care_episode_id,created_at desc);
create index clinical_record_amendments_root_created_idx
  on public.clinical_record_amendments(root_record_id,created_at desc);
create index clinical_record_amendments_target_idx
  on public.clinical_record_amendments(target_record_id);
create index clinical_record_amendments_actor_idx
  on public.clinical_record_amendments(actor_id);
create index clinical_record_amendments_responsible_idx
  on public.clinical_record_amendments(responsible_id);
create index clinical_record_amendments_supervisor_idx
  on public.clinical_record_amendments(supervisor_id)
  where supervisor_id is not null;

create unique index notifications_clinical_amendment_once_idx
  on public.notifications(user_id,type,(content->>'amendment_id'))
  where type in ('clinical_record_corrected','clinical_record_invalidated')
    and content ? 'amendment_id';

create or replace function private.validate_clinical_record_amendment_shape()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_target public.clinical_records%rowtype;
  v_replacement public.clinical_records%rowtype;
begin
  select * into v_target
  from public.clinical_records
  where id=new.target_record_id;
  if not found then
    raise exception using errcode='23503',message='amendment_target_not_found';
  end if;
  if new.patient_id<>v_target.patient_id
    or new.care_episode_id<>v_target.care_episode_id
    or new.root_record_id<>v_target.root_record_id then
    raise exception using errcode='23514',message='amendment_target_context_mismatch';
  end if;

  if new.replacement_record_id is not null then
    select * into v_replacement
    from public.clinical_records
    where id=new.replacement_record_id;
    if not found then
      raise exception using errcode='23503',message='amendment_replacement_not_found';
    end if;
    if v_replacement.replaces_record_id<>new.target_record_id
      or v_replacement.root_record_id<>new.root_record_id
      or v_replacement.patient_id<>new.patient_id
      or v_replacement.care_episode_id<>new.care_episode_id then
      raise exception using errcode='23514',message='amendment_replacement_context_mismatch';
    end if;
  end if;
  return new;
end
$$;

create or replace function private.enforce_clinical_record_amendment_immutability()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op='DELETE' then
    raise exception using errcode='23514',message='clinical_record_amendments_do_not_support_hard_delete';
  end if;
  if old.status in ('effective','abandoned') then
    raise exception using errcode='23514',message='terminal_clinical_record_amendment_immutable';
  end if;
  if new.id<>old.id
    or new.patient_id<>old.patient_id
    or new.care_episode_id<>old.care_episode_id
    or new.root_record_id<>old.root_record_id
    or new.target_record_id<>old.target_record_id
    or new.replacement_record_id is distinct from old.replacement_record_id
    or new.amendment_type<>old.amendment_type
    or new.reason<>old.reason
    or new.impact_snapshot<>old.impact_snapshot
    or new.impact_hash<>old.impact_hash
    or new.actor_id<>old.actor_id
    or new.responsible_id<>old.responsible_id
    or new.supervisor_id is distinct from old.supervisor_id
    or new.created_at<>old.created_at then
    raise exception using errcode='23514',message='clinical_record_amendment_identity_immutable';
  end if;
  if new.status not in ('effective','abandoned') then
    raise exception using errcode='23514',message='invalid_clinical_record_amendment_transition';
  end if;
  return new;
end
$$;

revoke all on function private.validate_clinical_record_amendment_shape(),
  private.enforce_clinical_record_amendment_immutability()
from public,anon,authenticated;

create trigger trg_clinical_record_amendments_validate
before insert or update on public.clinical_record_amendments
for each row execute function private.validate_clinical_record_amendment_shape();
create trigger trg_clinical_record_amendments_immutable
before update or delete on public.clinical_record_amendments
for each row execute function private.enforce_clinical_record_amendment_immutability();

alter table public.clinical_record_amendments enable row level security;
revoke all on table public.clinical_record_amendments from public,anon,authenticated;
grant all on table public.clinical_record_amendments to service_role;

-- 3. Minimized read projections --------------------------------------------

create or replace function private.project_clinical_record_chain_item(
  p_record public.clinical_records
) returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select jsonb_build_object(
    'id',p_record.id,
    'patient_id',p_record.patient_id,
    'care_episode_id',p_record.care_episode_id,
    'nutritionist_id',p_record.nutritionist_id,
    'author_id',p_record.author_id,
    'student_id',p_record.student_id,
    'supervisor_id',p_record.supervisor_id,
    'record_type',p_record.record_type,
    'status',p_record.status,
    'visibility',p_record.visibility,
    'encounter_at',p_record.encounter_at,
    'recorded_at',p_record.recorded_at,
    'retrospective_reason',p_record.retrospective_reason,
    'content',p_record.content,
    'template_code',p_record.template_code,
    'template_version',p_record.template_version,
    'template_sections_snapshot',(
      select v.sections_snapshot
      from public.clinical_evolution_template_versions v
      where v.template_code=p_record.template_code
        and v.version=p_record.template_version
    ),
    'canonical_hash',p_record.canonical_hash,
    'signed_at',p_record.signed_at,
    'root_record_id',p_record.root_record_id,
    'replaces_record_id',p_record.replaces_record_id,
    'chain_version',p_record.chain_version,
    'canonical_format_version',p_record.canonical_format_version,
    'created_at',p_record.created_at,
    'updated_at',p_record.updated_at,
    'amendment',(
      select jsonb_build_object(
        'id',a.id,
        'type',a.amendment_type,
        'status',a.status,
        'reason',a.reason,
        'target_record_id',a.target_record_id,
        'replacement_record_id',a.replacement_record_id,
        'responsible_id',a.responsible_id,
        'created_at',a.created_at,
        'effective_at',a.effective_at,
        'abandoned_at',a.abandoned_at,
        'abandonment_reason',a.abandonment_reason
      )
      from public.clinical_record_amendments a
      where (a.target_record_id=p_record.id or a.replacement_record_id=p_record.id)
        and (auth.uid()<>p_record.patient_id or a.status='effective')
      order by a.created_at desc,a.id desc
      limit 1
    )
  )
$$;

revoke all on function private.project_clinical_record_chain_item(public.clinical_records)
from public,anon,authenticated;

create or replace function public.list_clinical_record_version_chain(p_record_id uuid)
returns setof jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_root uuid;
begin
  if auth.uid() is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  select r.root_record_id into v_root
  from public.clinical_records r
  where r.id=p_record_id;
  if not found or not private.can_read_clinical_record(p_record_id) then
    raise exception using errcode='P0002',message='clinical_record_not_found';
  end if;

  return query
  select private.project_clinical_record_chain_item(r)
  from public.clinical_records r
  where r.root_record_id=v_root
    and private.can_read_clinical_record(r.id)
  order by r.chain_version desc;
end
$$;

create or replace function public.compare_clinical_record_versions(
  p_left_record_id uuid,
  p_right_record_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_left public.clinical_records%rowtype;
  v_right public.clinical_records%rowtype;
  v_sections jsonb;
begin
  if auth.uid() is null then
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

  return jsonb_build_object(
    'root_record_id',v_left.root_record_id,
    'left',private.project_clinical_record_chain_item(v_left),
    'right',private.project_clinical_record_chain_item(v_right),
    'sections',v_sections
  );
end
$$;

revoke all on function public.list_clinical_record_version_chain(uuid),
  public.compare_clinical_record_versions(uuid,uuid)
from public,anon,authenticated;
grant execute on function public.list_clinical_record_version_chain(uuid),
  public.compare_clinical_record_versions(uuid,uuid)
to authenticated,service_role;

-- 4. Correction authorization and impact -----------------------------------

create or replace function private.clinical_record_signed_by(p_record_id uuid)
returns uuid
language sql
stable
security definer
set search_path=''
as $$
  select e.actor_id
  from public.clinical_record_events e
  where e.clinical_record_id=p_record_id
    and e.from_status='finalized' and e.to_status='signed'
  order by e.created_at desc,e.id desc
  limit 1
$$;

create or replace function private.can_start_clinical_record_correction(
  p_record_id uuid,
  p_actor uuid
) returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_record public.clinical_records%rowtype;
  v_episode public.care_episodes%rowtype;
  v_signer uuid;
begin
  if p_actor is null then return false; end if;
  select * into v_record from public.clinical_records where id=p_record_id;
  if not found or v_record.status<>'signed' then return false; end if;
  select * into v_episode from public.care_episodes where id=v_record.care_episode_id;
  if not found then return false; end if;
  v_signer:=private.clinical_record_signed_by(v_record.id);
  if v_signer is null then return false; end if;
  if p_actor=v_signer then return true; end if;
  if v_episode.status='active'
    and v_record.student_id=p_actor
    and v_record.supervisor_id=v_signer
    and exists (
      select 1 from public.student_supervisions s
      where s.student_id=p_actor and s.supervisor_id=v_signer and s.status='active'
    ) then
    return true;
  end if;
  return false;
end
$$;

create or replace function private.can_manage_clinical_record_correction(
  p_replacement_record_id uuid,
  p_actor uuid,
  p_action text
) returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_amendment public.clinical_record_amendments%rowtype;
  v_target public.clinical_records%rowtype;
  v_episode public.care_episodes%rowtype;
begin
  if p_actor is null or p_action not in ('edit','finalize','sign','abandon') then
    return false;
  end if;
  select * into v_amendment
  from public.clinical_record_amendments
  where replacement_record_id=p_replacement_record_id
    and amendment_type='correction' and status='draft';
  if not found then return false; end if;
  if p_actor=v_amendment.responsible_id then return true; end if;
  if p_action not in ('edit','abandon') or p_actor<>v_amendment.actor_id then
    return false;
  end if;
  select * into v_target from public.clinical_records where id=v_amendment.target_record_id;
  select * into v_episode from public.care_episodes where id=v_amendment.care_episode_id;
  return v_episode.status='active'
    and v_target.student_id=p_actor
    and v_target.supervisor_id=v_amendment.responsible_id
    and exists (
      select 1 from public.student_supervisions s
      where s.student_id=p_actor
        and s.supervisor_id=v_amendment.responsible_id
        and s.status='active'
    );
end
$$;

create or replace function private.build_clinical_record_amendment_impact(
  p_record public.clinical_records
) returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'record_id',p_record.id,
    'root_record_id',p_record.root_record_id,
    'chain_version',p_record.chain_version,
    'care_episode_id',p_record.care_episode_id,
    'episode_status',(select e.status from public.care_episodes e where e.id=p_record.care_episode_id),
    'visibility',p_record.visibility,
    'current_status',p_record.status,
    'has_patient_notice',p_record.visibility='shared_with_patient',
    'known_references',coalesce(p_record.source_references,'[]'::jsonb),
    'known_reference_count',jsonb_array_length(coalesce(p_record.source_references,'[]'::jsonb))
  )
$$;

create or replace function private.clinical_record_canonical_payload(
  p_record public.clinical_records,
  p_content jsonb,
  p_retrospective_reason text
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_base jsonb;
  v_amendment public.clinical_record_amendments%rowtype;
begin
  v_base:=jsonb_build_object(
    'record_id',p_record.id,'patient_id',p_record.patient_id,
    'care_episode_id',p_record.care_episode_id,'nutritionist_id',p_record.nutritionist_id,
    'author_id',p_record.author_id,'student_id',p_record.student_id,
    'supervisor_id',p_record.supervisor_id,'record_type',p_record.record_type,
    'template_code',p_record.template_code,'template_version',p_record.template_version,
    'encounter_at',p_record.encounter_at,'visibility',p_record.visibility,
    'content',p_content,'retrospective_reason',p_retrospective_reason
  );
  if p_record.canonical_format_version=1 then return v_base; end if;
  if p_record.canonical_format_version<>2 then
    raise exception using errcode='23514',message='unsupported_canonical_format_version';
  end if;
  select * into v_amendment
  from public.clinical_record_amendments
  where replacement_record_id=p_record.id and amendment_type='correction';
  if not found then
    raise exception using errcode='23514',message='correction_amendment_required_for_format_2';
  end if;
  return v_base || jsonb_build_object(
    'canonical_format_version',2,
    'root_record_id',p_record.root_record_id,
    'replaces_record_id',p_record.replaces_record_id,
    'chain_version',p_record.chain_version,
    'amendment_id',v_amendment.id,
    'amendment_type',v_amendment.amendment_type,
    'amendment_reason',v_amendment.reason,
    'responsible_id',v_amendment.responsible_id
  );
end
$$;

revoke all on function private.clinical_record_signed_by(uuid),
  private.can_start_clinical_record_correction(uuid,uuid),
  private.can_manage_clinical_record_correction(uuid,uuid,text),
  private.build_clinical_record_amendment_impact(public.clinical_records),
  private.clinical_record_canonical_payload(public.clinical_records,jsonb,text)
from public,anon,authenticated;

create or replace function public.get_clinical_record_amendment_impact(p_record_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_record public.clinical_records%rowtype;
  v_snapshot jsonb;
  v_hash text;
begin
  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  select * into v_record from public.clinical_records where id=p_record_id;
  if not found or not private.can_start_clinical_record_correction(p_record_id,v_actor) then
    raise exception using errcode='42501',message='clinical_record_amendment_forbidden';
  end if;
  v_snapshot:=private.build_clinical_record_amendment_impact(v_record);
  v_hash:=encode(extensions.digest(convert_to(v_snapshot::text,'UTF8'),'sha256'),'hex');
  return v_snapshot || jsonb_build_object('impact_hash',v_hash);
end
$$;

create or replace function public.start_clinical_record_correction(
  p_record_id uuid,
  p_reason text,
  p_impact_confirmation jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_target public.clinical_records%rowtype;
  v_signer uuid;
  v_reason text:=btrim(coalesce(p_reason,''));
  v_impact jsonb;
  v_impact_hash text;
  v_replacement_id uuid:=gen_random_uuid();
  v_amendment_id uuid:=gen_random_uuid();
  v_replacement public.clinical_records%rowtype;
begin
  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if length(v_reason) not between 20 and 2000 then
    raise exception using errcode='22023',message='amendment_reason_length_invalid';
  end if;
  if jsonb_typeof(p_impact_confirmation) is distinct from 'object'
    or coalesce((p_impact_confirmation->>'confirmed')::boolean,false) is not true then
    raise exception using errcode='22023',message='amendment_impact_confirmation_required';
  end if;

  select * into v_target from public.clinical_records where id=p_record_id;
  if not found then raise exception using errcode='P0002',message='clinical_record_not_found'; end if;
  if v_target.status<>'signed'
    and private.clinical_record_signed_by(v_target.id)=v_actor then
    raise exception using errcode='40001',message='amendment_chain_conflict';
  end if;
  if not private.can_start_clinical_record_correction(v_target.id,v_actor) then
    raise exception using errcode='42501',message='clinical_record_amendment_forbidden';
  end if;
  perform r.id from public.clinical_records r
  where r.id in (v_target.root_record_id,v_target.id)
  order by r.id for update;
  select * into v_target from public.clinical_records where id=p_record_id;
  if v_target.status<>'signed' then
    raise exception using errcode='40001',message='amendment_chain_conflict';
  end if;
  if not private.can_start_clinical_record_correction(v_target.id,v_actor) then
    raise exception using errcode='42501',message='clinical_record_amendment_forbidden';
  end if;
  if exists (
    select 1 from public.clinical_record_amendments a
    where a.root_record_id=v_target.root_record_id
      and a.amendment_type='correction' and a.status='draft'
  ) then
    raise exception using errcode='40001',message='amendment_chain_conflict';
  end if;

  v_impact:=private.build_clinical_record_amendment_impact(v_target);
  v_impact_hash:=encode(extensions.digest(convert_to(v_impact::text,'UTF8'),'sha256'),'hex');
  if p_impact_confirmation->>'impact_hash' is distinct from v_impact_hash then
    raise exception using errcode='40001',message='amendment_impact_changed';
  end if;
  v_signer:=private.clinical_record_signed_by(v_target.id);

  insert into public.clinical_records(
    id,patient_id,care_episode_id,nutritionist_id,author_id,student_id,supervisor_id,
    record_type,status,visibility,encounter_at,recorded_at,retrospective_reason,
    content,source_references,template_code,template_version,revision,
    root_record_id,replaces_record_id,chain_version,canonical_format_version
  ) values (
    v_replacement_id,v_target.patient_id,v_target.care_episode_id,v_target.nutritionist_id,
    v_actor,v_target.student_id,v_target.supervisor_id,v_target.record_type,'draft',
    v_target.visibility,v_target.encounter_at,now(),v_target.retrospective_reason,
    v_target.content,v_target.source_references,v_target.template_code,v_target.template_version,1,
    v_target.root_record_id,v_target.id,v_target.chain_version+1,2
  ) returning * into v_replacement;

  insert into public.clinical_record_amendments(
    id,patient_id,care_episode_id,root_record_id,target_record_id,replacement_record_id,
    amendment_type,status,reason,impact_snapshot,impact_hash,actor_id,responsible_id,
    supervisor_id
  ) values (
    v_amendment_id,v_target.patient_id,v_target.care_episode_id,v_target.root_record_id,
    v_target.id,v_replacement_id,'correction','draft',v_reason,v_impact,v_impact_hash,
    v_actor,v_signer,case when v_target.student_id is not null then v_signer else null end
  );

  insert into public.clinical_record_events(
    clinical_record_id,from_status,to_status,actor_id,reason,metadata
  ) values (
    v_replacement_id,null,'draft',v_actor,v_reason,
    jsonb_build_object('action','correction_started','amendment_id',v_amendment_id,
      'target_record_id',v_target.id,'root_record_id',v_target.root_record_id)
  );

  return private.project_clinical_evolution_record(v_replacement) || jsonb_build_object(
    'record_status',v_replacement.status,
    'replacement_record_id',v_replacement.id,
    'amendment_id',v_amendment_id,
    'amendment_status','draft'
  );
exception
  when unique_violation then
    raise exception using errcode='40001',message='amendment_chain_conflict';
end
$$;

-- 5. C2 lifecycle extended only for correction drafts -----------------------

create or replace function public.update_clinical_record_draft(
  p_record_id uuid, p_content jsonb, p_visibility text default null,
  p_expected_revision bigint default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_record public.clinical_records%rowtype;
  v_updated public.clinical_records%rowtype;
  v_template_sections jsonb;
  v_episode_status text;
  v_amendment public.clinical_record_amendments%rowtype;
  v_is_correction boolean;
begin
  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if p_expected_revision is null or p_expected_revision<1 then
    raise exception using errcode='22023',message='expected_revision_required'; end if;
  if p_visibility is not null and p_visibility not in ('professional_private','shared_with_patient','share_later') then
    raise exception using errcode='22023',message='invalid_visibility'; end if;

  select * into v_record from public.clinical_records where id=p_record_id;
  if not found then raise exception using errcode='P0002',message='record_not_found'; end if;
  if v_record.status<>'draft' then raise exception using errcode='23514',message='only_draft_records_can_be_edited'; end if;
  select * into v_amendment from public.clinical_record_amendments
  where replacement_record_id=p_record_id and amendment_type='correction';
  v_is_correction:=found;
  if v_is_correction and v_amendment.status<>'draft' then
    raise exception using errcode='40001',message='amendment_chain_conflict';
  end if;

  if v_is_correction then
    if p_visibility is not null and p_visibility<>v_record.visibility then
      raise exception using errcode='23514',message='correction_visibility_immutable';
    end if;
    if not private.can_manage_clinical_record_correction(p_record_id,v_actor,'edit') then
      raise exception using errcode='42501',message='correction_edit_forbidden';
    end if;
  else
    select e.status into v_episode_status from public.care_episodes e
    where e.id=v_record.care_episode_id for share;
    if v_episode_status is distinct from 'active'
      or not private.can_write_active_care_episode(v_record.care_episode_id) then
      raise exception using errcode='42501',message='episode_write_forbidden'; end if;
    if v_actor<>v_record.author_id
      and v_actor<>coalesce(v_record.supervisor_id,v_record.nutritionist_id) then
      raise exception using errcode='42501',message='draft_edit_forbidden'; end if;
  end if;

  select tv.sections_snapshot into v_template_sections
  from public.clinical_evolution_template_versions tv
  where tv.template_code=v_record.template_code and tv.version=v_record.template_version;
  perform private.validate_clinical_record_content(p_content,v_template_sections,false);

  update public.clinical_records set
    content=p_content,
    visibility=case when v_is_correction then visibility else coalesce(p_visibility,visibility) end,
    revision=revision+1,
    updated_at=now()
  where id=p_record_id and status='draft' and revision=p_expected_revision
  returning * into v_updated;
  if not found then raise exception using errcode='40001',message='draft_revision_conflict'; end if;

  insert into public.clinical_record_events(clinical_record_id,from_status,to_status,actor_id,metadata)
  values(p_record_id,'draft','draft',v_actor,jsonb_build_object(
    'action','autosave','content_keys',
    (select coalesce(jsonb_agg(k order by k),'[]') from jsonb_object_keys(p_content) k),
    'amendment_id',case when v_is_correction then v_amendment.id else null end));
  return private.project_clinical_evolution_record(v_updated);
end
$$;

create or replace function public.finalize_clinical_record(
  p_record_id uuid, p_content jsonb, p_expected_revision bigint default null,
  p_retrospective_reason text default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_record public.clinical_records%rowtype;
  v_updated public.clinical_records%rowtype;
  v_hash text;
  v_filled_sections integer;
  v_template_sections jsonb;
  v_reason text;
  v_canonical jsonb;
  v_episode_status text;
  v_amendment public.clinical_record_amendments%rowtype;
  v_is_correction boolean;
begin
  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if p_expected_revision is null or p_expected_revision<1 then
    raise exception using errcode='22023',message='expected_revision_required'; end if;
  select * into v_record from public.clinical_records where id=p_record_id;
  if not found then raise exception using errcode='P0002',message='record_not_found'; end if;
  if v_record.status<>'draft' then raise exception using errcode='23514',message='only_draft_records_can_be_finalized'; end if;
  select * into v_amendment from public.clinical_record_amendments
  where replacement_record_id=p_record_id and amendment_type='correction' and status='draft';
  v_is_correction:=found;

  if v_is_correction then
    if not private.can_manage_clinical_record_correction(p_record_id,v_actor,'finalize') then
      raise exception using errcode='42501',message='correction_finalize_forbidden';
    end if;
  else
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
  end if;

  select tv.sections_snapshot into v_template_sections
  from public.clinical_evolution_template_versions tv
  where tv.template_code=v_record.template_code and tv.version=v_record.template_version;
  v_filled_sections:=private.validate_clinical_record_content(p_content,v_template_sections,true);
  v_reason:=nullif(btrim(coalesce(p_retrospective_reason,v_record.retrospective_reason,'')),'');
  if v_record.encounter_at<v_record.created_at-interval '5 minutes'
    and (v_reason is null or length(v_reason) not between 10 and 500) then
    raise exception using errcode='22023',message='retrospective_reason_required'; end if;
  if v_reason is not null and length(v_reason)>500 then
    raise exception using errcode='22023',message='retrospective_reason_required'; end if;

  v_canonical:=private.clinical_record_canonical_payload(v_record,p_content,v_reason);
  v_hash:=encode(extensions.digest(convert_to(v_canonical::text,'UTF8'),'sha256'),'hex');
  update public.clinical_records set
    content=p_content,status='finalized',canonical_hash=v_hash,
    retrospective_reason=v_reason,revision=revision+1,updated_at=now()
  where id=p_record_id and status='draft' and revision=p_expected_revision
  returning * into v_updated;
  if not found then raise exception using errcode='40001',message='draft_revision_conflict'; end if;

  insert into public.clinical_record_events(clinical_record_id,from_status,to_status,actor_id,metadata)
  values(p_record_id,'draft','finalized',v_actor,jsonb_build_object(
    'canonical_hash',v_hash,'canonical_format_version',v_record.canonical_format_version,
    'filled_sections',v_filled_sections,
    'amendment_id',case when v_is_correction then v_amendment.id else null end));
  return private.project_clinical_evolution_record(v_updated);
end
$$;

-- 6. Atomic activation and audited abandonment ------------------------------

create or replace function private.enforce_clinical_record_c4_status_transition()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.status='signed' and new.status in ('corrected','invalidated') then
    if nullif(current_setting('nello.c4_transition_target',true),'') is distinct from old.id::text
      or nullif(current_setting('nello.c4_transition_status',true),'') is distinct from new.status then
      raise exception using errcode='23514',message='controlled_clinical_record_transition_required';
    end if;
  end if;
  return new;
end
$$;

revoke all on function private.enforce_clinical_record_c4_status_transition()
from public,anon,authenticated;

drop trigger if exists trg_clinical_records_c4_status_transition on public.clinical_records;
create trigger trg_clinical_records_c4_status_transition
before update of status on public.clinical_records
for each row execute function private.enforce_clinical_record_c4_status_transition();

create or replace function private.current_recent_authentication_evidence()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_claims jsonb;
  v_auth_time numeric;
  v_session_id text;
begin
  begin
    v_claims:=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb);
    v_auth_time:=(v_claims->>'auth_time')::numeric;
  exception when others then
    raise exception using errcode='28000',message='recent_reauthentication_required';
  end;
  v_session_id:=nullif(v_claims->>'session_id','');
  if v_auth_time is null or v_session_id is null
    or v_auth_time<extract(epoch from clock_timestamp()-interval '10 minutes')
    or v_auth_time>extract(epoch from clock_timestamp()+interval '1 minute') then
    raise exception using errcode='28000',message='recent_reauthentication_required';
  end if;
  return jsonb_build_object(
    'auth_time',to_timestamp(v_auth_time),
    'aal',coalesce(nullif(v_claims->>'aal',''),'unknown'),
    'amr',coalesce(v_claims->'amr','[]'::jsonb),
    'session_fingerprint',encode(
      extensions.digest(convert_to(v_session_id,'UTF8'),'sha256'),'hex'
    )
  );
end
$$;

revoke all on function private.current_recent_authentication_evidence()
from public,anon,authenticated;

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
  v_amendment public.clinical_record_amendments%rowtype;
  v_is_correction boolean;
  v_crn_number text;
  v_crn_region text;
  v_signed_at timestamptz:=clock_timestamp();
  v_auth_level text;
  v_jwt_claims text;
  v_episode_status text;
  v_expected_hash text;
  v_canonical jsonb;
  v_amendment_hash text;
begin
  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  select * into v_record from public.clinical_records where id=p_record_id;
  if not found then raise exception using errcode='P0002',message='record_not_found'; end if;
  select * into v_amendment from public.clinical_record_amendments
  where replacement_record_id=p_record_id and amendment_type='correction';
  v_is_correction:=found;
  if v_is_correction and v_amendment.status<>'draft' then
    raise exception using errcode='40001',message='amendment_chain_conflict';
  end if;

  if v_is_correction then
    perform r.id from public.clinical_records r
    where r.id in (v_amendment.root_record_id,v_amendment.target_record_id,p_record_id)
    order by r.id for update;
    select * into v_record from public.clinical_records where id=p_record_id;
    select * into v_amendment from public.clinical_record_amendments
    where id=v_amendment.id for update;
    if v_record.status<>'finalized'
      or v_amendment.status<>'draft'
      or not exists (
        select 1 from public.clinical_records t
        where t.id=v_amendment.target_record_id and t.status='signed'
      ) then
      raise exception using errcode='40001',message='amendment_chain_conflict';
    end if;
    if not private.can_manage_clinical_record_correction(p_record_id,v_actor,'sign') then
      raise exception using errcode='42501',message='correction_sign_forbidden';
    end if;
  else
    if v_record.status<>'finalized' then
      raise exception using errcode='23514',message='only_finalized_records_can_be_signed'; end if;
    select e.status into v_episode_status from public.care_episodes e
    where e.id=v_record.care_episode_id for share;
    if v_episode_status is distinct from 'active'
      or not private.can_write_active_care_episode(v_record.care_episode_id) then
      raise exception using errcode='42501',message='episode_write_forbidden'; end if;
    if (v_record.student_id is not null and v_actor<>v_record.supervisor_id)
      or (v_record.student_id is null and v_actor<>v_record.nutritionist_id) then
      raise exception using errcode='42501',message='only_nutritionist_can_sign'; end if;
  end if;

  select pv.crn_number,pv.crn_region into v_crn_number,v_crn_region
  from public.professional_verifications pv
  where pv.user_id=v_actor and pv.professional_role='nutritionist'
    and pv.status='approved' and pv.valid_until>now()
  order by pv.reviewed_at desc nulls last limit 1;
  if v_crn_number is null then
    raise exception using errcode='42501',message='verified_professional_required'; end if;

  v_canonical:=private.clinical_record_canonical_payload(
    v_record,v_record.content,v_record.retrospective_reason
  );
  v_expected_hash:=encode(extensions.digest(convert_to(v_canonical::text,'UTF8'),'sha256'),'hex');
  if v_record.canonical_hash is distinct from v_expected_hash then
    raise exception using errcode='23514',message='finalized_record_hash_mismatch'; end if;

  v_jwt_claims:=nullif(current_setting('request.jwt.claims',true),'');
  v_auth_level:=coalesce(
    nullif(current_setting('request.jwt.claim.aal',true),''),
    nullif((v_jwt_claims::jsonb)->>'aal',''),'unknown'
  );

  if v_is_correction then
    perform set_config('nello.c4_transition_target',v_amendment.target_record_id::text,true);
    perform set_config('nello.c4_transition_status','corrected',true);
    update public.clinical_records set status='corrected',updated_at=now()
    where id=v_amendment.target_record_id and status='signed';
    if not found then raise exception using errcode='40001',message='amendment_chain_conflict'; end if;
    perform set_config('nello.c4_transition_target','',true);
    perform set_config('nello.c4_transition_status','',true);

    update public.clinical_records set status='signed',signed_at=v_signed_at,updated_at=now()
    where id=p_record_id and status='finalized'
    returning * into v_updated;
    if not found then raise exception using errcode='40001',message='amendment_chain_conflict'; end if;

    v_amendment_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
      'amendment_id',v_amendment.id,'amendment_type',v_amendment.amendment_type,
      'root_record_id',v_amendment.root_record_id,
      'target_record_id',v_amendment.target_record_id,
      'replacement_record_id',v_amendment.replacement_record_id,
      'reason',v_amendment.reason,'impact_hash',v_amendment.impact_hash,
      'responsible_id',v_amendment.responsible_id,'effective_at',v_signed_at,
      'replacement_canonical_hash',v_record.canonical_hash
    )::text,'UTF8'),'sha256'),'hex');

    update public.clinical_record_amendments set
      status='effective',effective_at=v_signed_at,canonical_hash=v_amendment_hash,
      authentication_evidence=jsonb_build_object(
        'signed_at',v_signed_at,'auth_level',v_auth_level,
        'crn_number',v_crn_number,'crn_region',v_crn_region
      )
    where id=v_amendment.id and status='draft';
    if not found then raise exception using errcode='40001',message='amendment_chain_conflict'; end if;

    insert into public.clinical_record_events(
      clinical_record_id,from_status,to_status,actor_id,reason,metadata
    ) values (
      v_amendment.target_record_id,'signed','corrected',v_actor,v_amendment.reason,
      jsonb_build_object('amendment_id',v_amendment.id,
        'replacement_record_id',p_record_id)
    );

    insert into public.activity_log(
      event_name,patient_id,nutritionist_id,actor_user_id,source_module,payload
    ) values (
      'clinical_record.corrected',v_record.patient_id,v_record.nutritionist_id,
      v_actor,'clinical_records',jsonb_build_object(
        'amendment_id',v_amendment.id,'clinical_record_id',v_amendment.target_record_id,
        'replacement_record_id',p_record_id,'care_episode_id',v_record.care_episode_id
      )
    );
    if v_record.visibility='shared_with_patient' then
      insert into public.notifications(user_id,type,title,message,content)
      values (
        v_record.patient_id,'clinical_record_corrected','Registro clínico atualizado',
        'Seu nutricionista atualizou um registro compartilhado.',
        jsonb_build_object('amendment_id',v_amendment.id,
          'clinical_record_id',v_amendment.target_record_id,
          'replacement_record_id',p_record_id,'care_episode_id',v_record.care_episode_id)
      ) on conflict do nothing;
    end if;
  else
    update public.clinical_records set status='signed',signed_at=v_signed_at,updated_at=now()
    where id=p_record_id and status='finalized' returning * into v_updated;
    if not found then
      raise exception using errcode='23514',message='only_finalized_records_can_be_signed'; end if;
  end if;

  insert into public.clinical_record_events(
    clinical_record_id,from_status,to_status,actor_id,metadata
  ) values (
    p_record_id,'finalized','signed',v_actor,jsonb_build_object(
      'canonical_hash',v_record.canonical_hash,
      'canonical_format_version',v_record.canonical_format_version,
      'crn_number',v_crn_number,'crn_region',v_crn_region,
      'signed_at',v_signed_at,'auth_level',v_auth_level,
      'amendment_id',case when v_is_correction then v_amendment.id else null end
    )
  );
  return private.project_clinical_evolution_record(v_updated);
end
$$;

create or replace function public.abandon_clinical_record_correction(
  p_amendment_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_reason text:=btrim(coalesce(p_reason,''));
  v_amendment public.clinical_record_amendments%rowtype;
  v_updated public.clinical_record_amendments%rowtype;
begin
  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if length(v_reason) not between 20 and 2000 then
    raise exception using errcode='22023',message='abandonment_reason_length_invalid'; end if;
  select * into v_amendment from public.clinical_record_amendments where id=p_amendment_id;
  if not found then raise exception using errcode='P0002',message='amendment_not_found'; end if;
  perform r.id from public.clinical_records r
  where r.id in (v_amendment.root_record_id,v_amendment.target_record_id,v_amendment.replacement_record_id)
  order by r.id for update;
  select * into v_amendment from public.clinical_record_amendments
  where id=p_amendment_id for update;
  if v_amendment.status<>'draft'
    or not private.can_manage_clinical_record_correction(
      v_amendment.replacement_record_id,v_actor,'abandon'
    ) then
    raise exception using errcode='42501',message='correction_abandon_forbidden';
  end if;
  update public.clinical_records set status='invalidated',updated_at=now()
  where id=v_amendment.replacement_record_id and status='draft';
  if not found then raise exception using errcode='40001',message='amendment_chain_conflict'; end if;
  update public.clinical_record_amendments set
    status='abandoned',abandoned_at=clock_timestamp(),abandonment_reason=v_reason
  where id=p_amendment_id and status='draft'
  returning * into v_updated;
  if not found then raise exception using errcode='40001',message='amendment_chain_conflict'; end if;
  insert into public.clinical_record_events(
    clinical_record_id,from_status,to_status,actor_id,reason,metadata
  ) values (
    v_amendment.replacement_record_id,'draft','invalidated',v_actor,v_reason,
    jsonb_build_object('action','abandoned_correction_draft','amendment_id',p_amendment_id)
  );
  return jsonb_build_object(
    'id',v_updated.id,'status',v_updated.status,
    'target_record_id',v_updated.target_record_id,
    'replacement_record_id',v_updated.replacement_record_id,
    'abandoned_at',v_updated.abandoned_at,
    'abandonment_reason',v_updated.abandonment_reason
  );
end
$$;

create or replace function public.invalidate_clinical_record(
  p_record_id uuid,
  p_reason text,
  p_impact_confirmation jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_reason text:=btrim(coalesce(p_reason,''));
  v_target public.clinical_records%rowtype;
  v_impact jsonb;
  v_impact_hash text;
  v_auth_evidence jsonb;
  v_amendment_id uuid:=gen_random_uuid();
  v_effective_at timestamptz:=clock_timestamp();
  v_amendment_hash text;
begin
  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if length(v_reason) not between 20 and 2000 then
    raise exception using errcode='22023',message='amendment_reason_length_invalid';
  end if;
  if jsonb_typeof(p_impact_confirmation) is distinct from 'object'
    or coalesce((p_impact_confirmation->>'confirmed')::boolean,false) is not true then
    raise exception using errcode='22023',message='amendment_impact_confirmation_required';
  end if;
  v_auth_evidence:=private.current_recent_authentication_evidence();

  select * into v_target from public.clinical_records where id=p_record_id;
  if not found then
    raise exception using errcode='P0002',message='clinical_record_not_found';
  end if;
  if private.clinical_record_signed_by(v_target.id) is distinct from v_actor then
    raise exception using errcode='42501',message='clinical_record_invalidation_forbidden';
  end if;
  if v_target.status<>'signed' then
    raise exception using errcode='40001',message='amendment_chain_conflict';
  end if;
  perform r.id from public.clinical_records r
  where r.id in (v_target.root_record_id,v_target.id)
  order by r.id for update;
  select * into v_target from public.clinical_records where id=p_record_id;
  if private.clinical_record_signed_by(v_target.id) is distinct from v_actor then
    raise exception using errcode='42501',message='clinical_record_invalidation_forbidden';
  end if;
  if v_target.status<>'signed' then
    raise exception using errcode='40001',message='amendment_chain_conflict';
  end if;
  if exists (
    select 1 from public.clinical_record_amendments a
    where a.root_record_id=v_target.root_record_id
      and a.amendment_type='correction' and a.status='draft'
  ) then
    raise exception using errcode='40001',message='amendment_chain_conflict';
  end if;

  v_impact:=private.build_clinical_record_amendment_impact(v_target);
  v_impact_hash:=encode(
    extensions.digest(convert_to(v_impact::text,'UTF8'),'sha256'),'hex'
  );
  if p_impact_confirmation->>'impact_hash' is distinct from v_impact_hash then
    raise exception using errcode='40001',message='amendment_impact_changed';
  end if;
  v_amendment_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'amendment_id',v_amendment_id,'amendment_type','invalidation',
    'root_record_id',v_target.root_record_id,'target_record_id',v_target.id,
    'reason',v_reason,'impact_hash',v_impact_hash,'responsible_id',v_actor,
    'effective_at',v_effective_at,'authentication_evidence',v_auth_evidence
  )::text,'UTF8'),'sha256'),'hex');

  insert into public.clinical_record_amendments(
    id,patient_id,care_episode_id,root_record_id,target_record_id,replacement_record_id,
    amendment_type,status,reason,impact_snapshot,impact_hash,actor_id,responsible_id,
    authentication_evidence,canonical_hash,effective_at
  ) values (
    v_amendment_id,v_target.patient_id,v_target.care_episode_id,v_target.root_record_id,
    v_target.id,null,'invalidation','effective',v_reason,v_impact,v_impact_hash,
    v_actor,v_actor,v_auth_evidence,v_amendment_hash,v_effective_at
  );

  perform set_config('nello.c4_transition_target',v_target.id::text,true);
  perform set_config('nello.c4_transition_status','invalidated',true);
  update public.clinical_records set status='invalidated',updated_at=now()
  where id=v_target.id and status='signed';
  if not found then
    raise exception using errcode='40001',message='amendment_chain_conflict';
  end if;
  perform set_config('nello.c4_transition_target','',true);
  perform set_config('nello.c4_transition_status','',true);

  insert into public.clinical_record_events(
    clinical_record_id,from_status,to_status,actor_id,reason,metadata
  ) values (
    v_target.id,'signed','invalidated',v_actor,v_reason,
    jsonb_build_object('amendment_id',v_amendment_id)
  );
  insert into public.activity_log(
    event_name,patient_id,nutritionist_id,actor_user_id,source_module,payload
  ) values (
    'clinical_record.invalidated',v_target.patient_id,v_target.nutritionist_id,
    v_actor,'clinical_records',jsonb_build_object(
      'amendment_id',v_amendment_id,'clinical_record_id',v_target.id,
      'care_episode_id',v_target.care_episode_id
    )
  );
  if v_target.visibility='shared_with_patient' then
    insert into public.notifications(user_id,type,title,message,content)
    values (
      v_target.patient_id,'clinical_record_invalidated','Registro clínico atualizado',
      'Seu nutricionista atualizou um registro compartilhado.',
      jsonb_build_object('amendment_id',v_amendment_id,
        'clinical_record_id',v_target.id,'care_episode_id',v_target.care_episode_id)
    ) on conflict do nothing;
  end if;
  return jsonb_build_object(
    'amendment_id',v_amendment_id,'status','effective',
    'record_id',v_target.id,'record_status','invalidated','effective_at',v_effective_at
  );
exception
  when unique_violation then
    raise exception using errcode='40001',message='amendment_chain_conflict';
end
$$;

revoke all on function public.get_clinical_record_amendment_impact(uuid),
  public.start_clinical_record_correction(uuid,text,jsonb),
  public.abandon_clinical_record_correction(uuid,text),
  public.invalidate_clinical_record(uuid,text,jsonb)
from public,anon,authenticated;
grant execute on function public.get_clinical_record_amendment_impact(uuid),
  public.start_clinical_record_correction(uuid,text,jsonb),
  public.abandon_clinical_record_correction(uuid,text),
  public.invalidate_clinical_record(uuid,text,jsonb)
to authenticated,service_role;

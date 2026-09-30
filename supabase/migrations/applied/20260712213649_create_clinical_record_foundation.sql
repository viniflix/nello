create schema if not exists private;

create table public.clinical_record_types (
  code text primary key constraint clinical_record_types_code_check check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null constraint clinical_record_types_name_check check (length(btrim(name)) > 0),
  category text not null constraint clinical_record_types_category_check check (category in ('clinical','operational','consent')),
  minimum_schema jsonb not null default '{}'::jsonb constraint clinical_record_types_minimum_schema_check check (jsonb_typeof(minimum_schema) = 'object'),
  is_system boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Composite candidate keys let clinical data prove episode ownership without
-- trusting a future policy to compare independently valid foreign keys.
create unique index care_episodes_id_patient_idx on public.care_episodes(id,patient_id);
create unique index care_episodes_id_patient_nutritionist_idx on public.care_episodes(id,patient_id,nutritionist_id);

insert into public.clinical_record_types(code,name,category,minimum_schema) values
  ('initial_assessment','Avaliação inicial','clinical','{}'),
  ('clinical_evolution','Evolução clínica','clinical','{}'),
  ('follow_up','Acompanhamento','clinical','{}'),
  ('intercurrence','Intercorrência','clinical','{}'),
  ('clinical_contact','Contato clínico','clinical','{}'),
  ('nutrition_guidance','Orientação nutricional','clinical','{}'),
  ('referral','Encaminhamento','clinical','{}'),
  ('multidisciplinary_communication','Comunicação multidisciplinar','clinical','{}'),
  ('relevant_administrative','Administrativo relevante','operational','{}'),
  ('consent','Consentimento','consent','{}'),
  ('correction','Correção','clinical','{}'),
  ('invalidation','Invalidação','clinical','{}')
on conflict (code) do update set
  name=excluded.name, category=excluded.category, minimum_schema=excluded.minimum_schema,
  is_system=true, updated_at=now();

create table public.clinical_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.user_profiles(id) on delete restrict,
  care_episode_id uuid not null references public.care_episodes(id) on delete restrict,
  nutritionist_id uuid not null references public.user_profiles(id) on delete restrict,
  author_id uuid not null references public.user_profiles(id) on delete restrict,
  student_id uuid references public.user_profiles(id) on delete restrict,
  supervisor_id uuid references public.user_profiles(id) on delete restrict,
  record_type text not null references public.clinical_record_types(code) on delete restrict,
  status text not null default 'draft' constraint clinical_records_status_check check (status in ('draft','finalized','signed','corrected','invalidated')),
  visibility text not null default 'professional_private' constraint clinical_records_visibility_check check (visibility in ('professional_private','shared_with_patient','share_later')),
  encounter_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  retrospective_reason text,
  content jsonb not null default '{}'::jsonb constraint clinical_records_content_check check (jsonb_typeof(content)='object'),
  source_references jsonb not null default '[]'::jsonb constraint clinical_records_source_references_check check (jsonb_typeof(source_references)='array'),
  template_code text,
  template_version text,
  canonical_hash text,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinical_records_episode_owner_fk foreign key (care_episode_id,patient_id,nutritionist_id)
    references public.care_episodes(id,patient_id,nutritionist_id) on delete restrict,
  constraint clinical_records_retrospective_reason_check check (
    recorded_at <= encounter_at + interval '5 minutes' or length(btrim(retrospective_reason)) >= 10
  )
);

create table public.clinical_record_events (
  id uuid primary key default gen_random_uuid(),
  clinical_record_id uuid not null references public.clinical_records(id) on delete restrict,
  from_status text constraint clinical_record_events_from_status_check check (from_status is null or from_status in ('draft','finalized','signed','corrected','invalidated')),
  to_status text not null constraint clinical_record_events_to_status_check check (to_status in ('draft','finalized','signed','corrected','invalidated')),
  actor_id uuid not null references public.user_profiles(id) on delete restrict,
  reason text,
  metadata jsonb not null default '{}'::jsonb constraint clinical_record_events_metadata_check check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now()
);

create table public.patient_profile_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.user_profiles(id) on delete restrict,
  field_name text not null constraint patient_profile_events_field_name_check check (field_name in ('name','preferred_name','email','phone','birth_date','gender')),
  previous_value jsonb,
  new_value jsonb,
  source text not null constraint patient_profile_events_source_check check (source in ('patient','nutritionist','legal_guardian','migration')),
  actor_id uuid not null references public.user_profiles(id) on delete restrict,
  care_episode_id uuid references public.care_episodes(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint patient_profile_events_episode_patient_fk foreign key (care_episode_id,patient_id)
    references public.care_episodes(id,patient_id) on delete restrict
);

create table public.patient_episode_legal_guardians (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.user_profiles(id) on delete restrict,
  care_episode_id uuid not null references public.care_episodes(id) on delete restrict,
  author_id uuid not null references public.user_profiles(id) on delete restrict,
  name text not null constraint legal_guardians_name_check check (length(btrim(name)) > 0),
  cpf_last4 text constraint legal_guardians_cpf_last4_check check (cpf_last4 is null or cpf_last4 ~ '^[0-9]{4}$'),
  cpf_fingerprint text constraint legal_guardians_cpf_fingerprint_check check (cpf_fingerprint is null or cpf_fingerprint ~ '^[0-9a-f]{64}$'),
  relationship text not null constraint legal_guardians_relationship_check check (length(btrim(relationship)) > 0),
  contact jsonb not null default '{}'::jsonb constraint legal_guardians_contact_check check (jsonb_typeof(contact)='object'),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  consent jsonb not null default '{}'::jsonb constraint legal_guardians_consent_check check (jsonb_typeof(consent)='object'),
  is_primary boolean not null default false,
  status text not null default 'active' constraint legal_guardians_status_check check (status in ('active','replaced','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legal_guardians_episode_patient_fk foreign key (care_episode_id,patient_id)
    references public.care_episodes(id,patient_id) on delete restrict,
  constraint legal_guardians_valid_period_check check (valid_until is null or valid_until >= valid_from)
);

create table public.legal_guardian_events (
  id uuid primary key default gen_random_uuid(),
  legal_guardian_id uuid not null references public.patient_episode_legal_guardians(id) on delete restrict,
  from_status text constraint legal_guardian_events_from_status_check check (from_status is null or from_status in ('active','replaced','revoked')),
  to_status text not null constraint legal_guardian_events_to_status_check check (to_status in ('active','replaced','revoked')),
  actor_id uuid not null references public.user_profiles(id) on delete restrict,
  reason text,
  metadata jsonb not null default '{}'::jsonb constraint legal_guardian_events_metadata_check check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now()
);

create index clinical_records_patient_episode_encounter_idx on public.clinical_records(patient_id,care_episode_id,encounter_at desc);
create index clinical_records_status_pending_idx on public.clinical_records(status,recorded_at) where status in ('draft','finalized');
create index clinical_record_events_record_created_idx on public.clinical_record_events(clinical_record_id,created_at desc);
create index patient_profile_events_patient_created_idx on public.patient_profile_events(patient_id,occurred_at desc);
create index legal_guardian_events_guardian_created_idx on public.legal_guardian_events(legal_guardian_id,created_at desc);
create index legal_guardians_episode_status_idx on public.patient_episode_legal_guardians(care_episode_id,status);
create unique index legal_guardians_one_active_primary_idx on public.patient_episode_legal_guardians(care_episode_id) where status='active' and is_primary;

create function private.reject_clinical_foundation_mutation() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_table_name='clinical_records' and tg_op='DELETE' then raise exception 'clinical_records_do_not_support_hard_delete'; end if;
  if tg_table_name='clinical_record_types' and tg_op='DELETE' then raise exception 'clinical_record_types_do_not_support_client_delete'; end if;
  if tg_table_name='patient_profile_events' then raise exception 'patient_profile_events_are_immutable'; end if;
  if tg_table_name='clinical_record_events' then raise exception 'clinical_record_events_are_immutable'; end if;
  if tg_table_name='legal_guardian_events' then raise exception 'legal_guardian_events_are_immutable'; end if;
  return new;
end $$;

create function private.reject_clinical_record_type_mutation() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if old.record_type <> new.record_type then raise exception 'clinical_record_system_type_is_immutable'; end if;
  return new;
end $$;

create trigger trg_clinical_records_no_delete before delete on public.clinical_records for each row execute function private.reject_clinical_foundation_mutation();
create trigger trg_clinical_records_type_immutable before update on public.clinical_records for each row execute function private.reject_clinical_record_type_mutation();
create trigger trg_clinical_record_types_no_delete before delete on public.clinical_record_types for each row execute function private.reject_clinical_foundation_mutation();
create trigger trg_clinical_record_events_immutable before update or delete on public.clinical_record_events for each row execute function private.reject_clinical_foundation_mutation();
create trigger trg_patient_profile_events_immutable before update or delete on public.patient_profile_events for each row execute function private.reject_clinical_foundation_mutation();
create trigger trg_legal_guardian_events_immutable before update or delete on public.legal_guardian_events for each row execute function private.reject_clinical_foundation_mutation();

alter table public.clinical_record_types enable row level security;
alter table public.clinical_records enable row level security;
alter table public.clinical_record_events enable row level security;
alter table public.patient_profile_events enable row level security;
alter table public.patient_episode_legal_guardians enable row level security;
alter table public.legal_guardian_events enable row level security;

revoke all on table public.clinical_record_types,public.clinical_records,public.clinical_record_events,
  public.patient_profile_events,public.patient_episode_legal_guardians,public.legal_guardian_events
  from public,anon,authenticated;
revoke all on function private.reject_clinical_foundation_mutation() from public,anon,authenticated;
revoke all on function private.reject_clinical_record_type_mutation() from public,anon,authenticated;

alter table public.patient_profile_events drop constraint patient_profile_events_field_name_check;
alter table public.patient_profile_events add constraint patient_profile_events_field_name_check
  check (field_name in ('name','phone','birth_date','gender','email','occupation','civil_status','address'));

create or replace function private.can_read_care_episode(p_episode_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists (
    select 1 from public.care_episodes e
    where e.id=p_episode_id and (e.patient_id=auth.uid() or e.nutritionist_id=auth.uid() or (
      e.status='active' and exists(
        select 1 from public.professional_verifications pv
        join public.student_supervisions s on s.student_id=pv.user_id and s.status='active'
        where pv.user_id=auth.uid() and pv.professional_role='student' and pv.status='approved'
          and pv.valid_until>now() and s.supervisor_id=e.nutritionist_id
      )
    ))
  )
$$;

create or replace function private.can_read_legal_guardian_event(p_event_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.legal_guardian_events ev
    join public.patient_episode_legal_guardians g on g.id=ev.legal_guardian_id
    where ev.id=p_event_id and private.can_read_care_episode(g.care_episode_id)
  )
$$;

create or replace function private.can_write_active_care_episode(p_episode_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists (
    select 1 from public.care_episodes e
    where e.id=p_episode_id and e.status='active' and (
      e.nutritionist_id=auth.uid() or exists (
        select 1 from public.professional_verifications pv
        join public.student_supervisions s on s.student_id=pv.user_id and s.status='active'
        where pv.user_id=auth.uid() and pv.professional_role='student'
          and pv.status='approved' and pv.valid_until>now()
          and s.supervisor_id=e.nutritionist_id
      )
    )
  )
$$;

create or replace function private.resolve_active_care_episode(p_patient_id uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception using errcode='28000',message='authentication_required'; end if;
  select e.id into strict v_id from public.care_episodes e
  where e.patient_id=p_patient_id and e.status='active';
  if not private.can_write_active_care_episode(v_id) then
    raise exception using errcode='42501',message='active_episode_write_forbidden';
  end if;
  return v_id;
exception when no_data_found then
  raise exception using errcode='42501',message='active_episode_write_forbidden';
end $$;

revoke all on function private.can_read_care_episode(uuid),private.can_read_legal_guardian_event(uuid),private.can_write_active_care_episode(uuid),private.resolve_active_care_episode(uuid) from public,anon,authenticated;
grant execute on function private.can_read_care_episode(uuid),private.can_read_legal_guardian_event(uuid),private.can_write_active_care_episode(uuid) to authenticated;

create policy clinical_records_participant_select on public.clinical_records for select to authenticated
using (private.can_read_care_episode(care_episode_id));
create policy clinical_record_events_participant_select on public.clinical_record_events for select to authenticated
using (exists(select 1 from public.clinical_records r where r.id=clinical_record_id and private.can_read_care_episode(r.care_episode_id)));
create policy patient_profile_events_participant_select on public.patient_profile_events for select to authenticated
using (patient_id=auth.uid() or (care_episode_id is not null and private.can_read_care_episode(care_episode_id)));
create policy legal_guardians_participant_select on public.patient_episode_legal_guardians for select to authenticated
using (private.can_read_care_episode(care_episode_id));
create policy legal_guardian_events_participant_select on public.legal_guardian_events for select to authenticated
using (private.can_read_legal_guardian_event(id));

grant select on public.clinical_record_types,public.clinical_records,public.clinical_record_events,
  public.patient_profile_events,public.legal_guardian_events to authenticated,service_role;
grant select on public.patient_episode_legal_guardians to service_role;
grant all on public.clinical_record_types,public.clinical_records,public.clinical_record_events,
  public.patient_profile_events,public.patient_episode_legal_guardians,public.legal_guardian_events to service_role;

create or replace function public.get_patient_record_foundation(p_patient_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_result jsonb;
begin
  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if v_actor<>p_patient_id and not exists(select 1 from public.care_episodes e where e.patient_id=p_patient_id and private.can_read_care_episode(e.id)) then
    raise exception using errcode='42501',message='patient_record_read_forbidden';
  end if;
  select jsonb_build_object('patient',jsonb_build_object(
      'id',p.id,'name',p.name,'phone',p.phone,'birth_date',p.birth_date,'gender',p.gender,
      'email',p.email,'occupation',p.occupation,'civil_status',p.civil_status,'address',p.address),
    'records',coalesce((select jsonb_agg(to_jsonb(r) order by r.encounter_at desc) from public.clinical_records r where r.patient_id=p_patient_id and private.can_read_care_episode(r.care_episode_id)),'[]'::jsonb))
  into v_result from public.user_profiles p where p.id=p_patient_id and p.user_type='patient';
  if v_result is null then raise exception using errcode='P0002',message='patient_not_found'; end if;
  return v_result;
end $$;

create or replace function public.update_patient_progressive_profile(p_patient_id uuid,p_changes jsonb,p_source text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_key text; v_old jsonb; v_new jsonb; v_episode uuid; v_profile jsonb;
begin
  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if jsonb_typeof(p_changes)<>'object' or p_changes='{}'::jsonb then raise exception using errcode='22023',message='profile_changes_required'; end if;
  if p_source not in ('patient','nutritionist','legal_guardian','migration') then raise exception using errcode='22023',message='invalid_profile_source'; end if;
  if exists(select 1 from jsonb_object_keys(p_changes) k where k not in ('name','phone','birth_date','gender','email','occupation','civil_status','address')) then
    raise exception using errcode='22023',message='profile_field_not_allowed';
  end if;
  if v_actor=p_patient_id then if p_source<>'patient' then raise exception using errcode='42501',message='invalid_profile_source_for_actor'; end if;
  else v_episode:=private.resolve_active_care_episode(p_patient_id); if p_source<>'nutritionist' then raise exception using errcode='42501',message='invalid_profile_source_for_actor'; end if; end if;
  if p_changes ? 'name' and length(btrim(coalesce(p_changes->>'name','')))=0 then raise exception using errcode='23514',message='patient_name_required'; end if;
  select to_jsonb(p) into v_profile from public.user_profiles p where p.id=p_patient_id and p.user_type='patient' for update;
  if v_profile is null then raise exception using errcode='P0002',message='patient_not_found'; end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    v_old:=v_profile->v_key; v_new:=p_changes->v_key;
    case v_key
      when 'name' then update public.user_profiles set name=p_changes->>'name' where id=p_patient_id;
      when 'phone' then update public.user_profiles set phone=p_changes->>'phone' where id=p_patient_id;
      when 'birth_date' then update public.user_profiles set birth_date=nullif(p_changes->>'birth_date','')::date where id=p_patient_id;
      when 'gender' then update public.user_profiles set gender=p_changes->>'gender' where id=p_patient_id;
      when 'email' then update public.user_profiles set email=p_changes->>'email' where id=p_patient_id;
      when 'occupation' then update public.user_profiles set occupation=p_changes->>'occupation' where id=p_patient_id;
      when 'civil_status' then update public.user_profiles set civil_status=p_changes->>'civil_status' where id=p_patient_id;
      when 'address' then update public.user_profiles set address=p_changes->'address' where id=p_patient_id;
    end case;
    insert into public.patient_profile_events(patient_id,field_name,previous_value,new_value,source,actor_id,care_episode_id)
      values(p_patient_id,v_key,v_old,v_new,p_source,v_actor,v_episode);
  end loop;
  select jsonb_build_object('id',p.id,'name',p.name,'phone',p.phone,'birth_date',p.birth_date,'gender',p.gender,
    'email',p.email,'occupation',p.occupation,'civil_status',p.civil_status,'address',p.address)
    into v_profile from public.user_profiles p where p.id=p_patient_id;
  return v_profile;
end $$;

create or replace function public.list_patient_legal_guardians(p_patient_id uuid,p_episode_id uuid)
returns table(id uuid,patient_id uuid,care_episode_id uuid,author_id uuid,name text,relationship text,
  contact jsonb,valid_from timestamptz,valid_until timestamptz,consent jsonb,is_primary boolean,status text,
  created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if not private.can_read_care_episode(p_episode_id) or not exists(select 1 from public.care_episodes e where e.id=p_episode_id and e.patient_id=p_patient_id) then
    raise exception using errcode='42501',message='episode_read_forbidden'; end if;
  return query select g.id,g.patient_id,g.care_episode_id,g.author_id,g.name,g.relationship,g.contact,
    g.valid_from,g.valid_until,g.consent,g.is_primary,g.status,g.created_at,g.updated_at
    from public.patient_episode_legal_guardians g where g.patient_id=p_patient_id and g.care_episode_id=p_episode_id order by g.created_at;
end $$;

create or replace function public.upsert_patient_legal_guardian(p_patient_id uuid,p_episode_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_id uuid; v_previous public.patient_episode_legal_guardians%rowtype; v_reason text:=nullif(btrim(p_payload->>'reason'),'');
  v_valid_from timestamptz:=coalesce(nullif(p_payload->>'valid_from','')::timestamptz,now());
  v_valid_until timestamptz:=nullif(p_payload->>'valid_until','')::timestamptz;
  v_consent jsonb:=coalesce(p_payload->'consent','{}'::jsonb);
begin
  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if not private.can_write_active_care_episode(p_episode_id) or not exists(select 1 from public.care_episodes e where e.id=p_episode_id and e.patient_id=p_patient_id) then raise exception using errcode='42501',message='episode_write_forbidden'; end if;
  if p_payload ?| array['cpf','cpf_last4','cpf_fingerprint'] then raise exception using errcode='22023',message='cpf_not_accepted_without_secure_hmac'; end if;
  if length(btrim(coalesce(p_payload->>'name','')))=0 or length(btrim(coalesce(p_payload->>'relationship','')))=0 then raise exception using errcode='23514',message='guardian_identity_required'; end if;
  if jsonb_typeof(v_consent)<>'object' then raise exception using errcode='22023',message='guardian_consent_object_required'; end if;
  if v_valid_until is not null and v_valid_until<v_valid_from then raise exception using errcode='22023',message='guardian_valid_period_invalid'; end if;
  perform 1 from public.care_episodes where id=p_episode_id for update;
  select * into v_previous from public.patient_episode_legal_guardians where care_episode_id=p_episode_id and status='active' and is_primary for update;
  if found then
    if v_reason is null then raise exception using errcode='22023',message='guardian_replacement_reason_required'; end if;
    update public.patient_episode_legal_guardians set status='replaced',valid_until=greatest(now(),valid_from),updated_at=now() where id=v_previous.id;
    insert into public.legal_guardian_events(legal_guardian_id,from_status,to_status,actor_id,reason,metadata)
    values(v_previous.id,'active','replaced',v_actor,v_reason,jsonb_build_object('valid_until',greatest(now(),v_previous.valid_from)));
  end if;
  insert into public.patient_episode_legal_guardians(patient_id,care_episode_id,author_id,name,relationship,contact,valid_from,valid_until,consent,is_primary)
  values(p_patient_id,p_episode_id,v_actor,btrim(p_payload->>'name'),btrim(p_payload->>'relationship'),coalesce(p_payload->'contact','{}'),v_valid_from,v_valid_until,v_consent,coalesce((p_payload->>'is_primary')::boolean,true)) returning id into v_id;
  insert into public.legal_guardian_events(legal_guardian_id,from_status,to_status,actor_id,reason,metadata)
  values(v_id,null,'active',v_actor,v_reason,jsonb_build_object('valid_from',v_valid_from,'valid_until',v_valid_until,'consent',v_consent));
  return (select jsonb_build_object('id',g.id,'patient_id',g.patient_id,'care_episode_id',g.care_episode_id,
    'author_id',g.author_id,'name',g.name,'relationship',g.relationship,'contact',g.contact,'valid_from',g.valid_from,
    'valid_until',g.valid_until,'consent',g.consent,'is_primary',g.is_primary,'status',g.status,'created_at',g.created_at,'updated_at',g.updated_at)
    from public.patient_episode_legal_guardians g where g.id=v_id);
end $$;

create or replace function public.revoke_patient_legal_guardian(p_guardian_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_g public.patient_episode_legal_guardians%rowtype;
begin
  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if length(btrim(coalesce(p_reason,'')))=0 then raise exception using errcode='22023',message='guardian_revocation_reason_required'; end if;
  select * into v_g from public.patient_episode_legal_guardians where id=p_guardian_id for update;
  if not found or not private.can_write_active_care_episode(v_g.care_episode_id) then raise exception using errcode='42501',message='guardian_revoke_forbidden'; end if;
  if v_g.status<>'active' then raise exception using errcode='22023',message='guardian_not_active'; end if;
  update public.patient_episode_legal_guardians set status='revoked',valid_until=now(),updated_at=now() where id=p_guardian_id;
  insert into public.legal_guardian_events(legal_guardian_id,from_status,to_status,actor_id,reason) values(p_guardian_id,'active','revoked',v_actor,btrim(p_reason));
  return (select jsonb_build_object('id',g.id,'patient_id',g.patient_id,'care_episode_id',g.care_episode_id,
    'author_id',g.author_id,'name',g.name,'relationship',g.relationship,'contact',g.contact,'valid_from',g.valid_from,
    'valid_until',g.valid_until,'consent',g.consent,'is_primary',g.is_primary,'status',g.status,'created_at',g.created_at,'updated_at',g.updated_at)
    from public.patient_episode_legal_guardians g where g.id=p_guardian_id);
end $$;

create or replace function public.create_clinical_record_draft(p_patient_id uuid,p_record_type text,p_encounter_at timestamptz,p_visibility text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_episode uuid; v_nutritionist uuid; v_student uuid; v_supervisor uuid; v_id uuid;
begin
  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if p_encounter_at<now()-interval '5 minutes' then raise exception using errcode='22023',message='retrospective_reason_required'; end if;
  if not exists(select 1 from public.clinical_record_types t where t.code=p_record_type and t.is_active) then raise exception using errcode='22023',message='active_record_type_required'; end if;
  v_episode:=private.resolve_active_care_episode(p_patient_id);
  select nutritionist_id into v_nutritionist from public.care_episodes where id=v_episode for update;
  if exists(select 1 from public.professional_verifications where user_id=v_actor and professional_role='student' and status='approved' and valid_until>now()) then
    v_student:=v_actor;
    select s.supervisor_id into v_supervisor from public.student_supervisions s
      where s.student_id=v_actor and s.status='active' and s.supervisor_id=v_nutritionist
      order by s.started_at desc nulls last,s.id limit 1;
    if v_supervisor is null then raise exception using errcode='42501',message='active_supervisor_required'; end if;
  elsif v_actor<>v_nutritionist then raise exception using errcode='42501',message='professional_capacity_required'; end if;
  insert into public.clinical_records(patient_id,care_episode_id,nutritionist_id,author_id,student_id,supervisor_id,record_type,visibility,encounter_at)
  values(p_patient_id,v_episode,v_nutritionist,v_actor,v_student,v_supervisor,p_record_type,p_visibility,p_encounter_at) returning id into v_id;
  insert into public.clinical_record_events(clinical_record_id,from_status,to_status,actor_id) values(v_id,null,'draft',v_actor);
  return (select to_jsonb(r) from public.clinical_records r where r.id=v_id);
end $$;

revoke all on function public.get_patient_record_foundation(uuid),public.update_patient_progressive_profile(uuid,jsonb,text),
 public.list_patient_legal_guardians(uuid,uuid),public.upsert_patient_legal_guardian(uuid,uuid,jsonb),
 public.revoke_patient_legal_guardian(uuid,text),public.create_clinical_record_draft(uuid,text,timestamptz,text) from public,anon;
grant execute on function public.get_patient_record_foundation(uuid),public.update_patient_progressive_profile(uuid,jsonb,text),
 public.list_patient_legal_guardians(uuid,uuid),public.upsert_patient_legal_guardian(uuid,uuid,jsonb),
 public.revoke_patient_legal_guardian(uuid,text),public.create_clinical_record_draft(uuid,text,timestamptz,text) to authenticated,service_role;

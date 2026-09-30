-- C5 etapa 2: dominio canonico de anexos clinicos.
-- Storage e RPCs de acesso pertencem as etapas seguintes.

create table public.clinical_attachment_categories (
  code text primary key constraint clinical_attachment_categories_code_check
    check (code ~ '^[a-z][a-z0-9_]*$'),
  label text not null constraint clinical_attachment_categories_label_check
    check (length(btrim(label)) between 3 and 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.clinical_attachment_categories(code,label) values
  ('laboratory_exam','Exames laboratoriais'),
  ('report','Laudos e relatorios'),
  ('clinical_image','Imagens clinicas'),
  ('referral','Encaminhamentos'),
  ('consent','Consentimentos e termos'),
  ('external_prescription','Prescricoes e orientacoes externas'),
  ('patient_document','Documentos fornecidos pelo paciente'),
  ('other','Outros documentos clinicos');

-- Candidate keys allow composite foreign keys to prove episode coherence.
create unique index clinical_records_id_episode_patient_idx
  on public.clinical_records(id,care_episode_id,patient_id);

create table public.clinical_attachments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.user_profiles(id) on delete restrict,
  care_episode_id uuid not null references public.care_episodes(id) on delete restrict,
  clinical_record_id uuid,
  root_attachment_id uuid not null,
  version integer not null default 1 constraint clinical_attachments_version_check check (version > 0),
  replaces_attachment_id uuid,
  category_code text not null references public.clinical_attachment_categories(code) on delete restrict,
  description text constraint clinical_attachments_description_check
    check (description is null or length(btrim(description)) between 3 and 2000),
  clinical_date date,
  source text not null constraint clinical_attachments_source_check
    check (source in ('nutritionist','student','patient','system_import')),
  author_id uuid not null references public.user_profiles(id) on delete restrict,
  reviewed_by uuid references public.user_profiles(id) on delete restrict,
  reviewed_at timestamptz,
  storage_bucket text not null default 'clinical-attachments'
    constraint clinical_attachments_bucket_check check (storage_bucket='clinical-attachments'),
  storage_path text not null unique constraint clinical_attachments_path_check
    check (length(storage_path) between 10 and 500 and storage_path ~ '^[A-Za-z0-9/_-]+$'),
  original_filename text not null constraint clinical_attachments_filename_check
    check (length(btrim(original_filename)) between 1 and 255),
  mime_type text not null constraint clinical_attachments_mime_check
    check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes bigint not null constraint clinical_attachments_size_check
    check (size_bytes between 1 and 15728640),
  sha256 text constraint clinical_attachments_sha256_check
    check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'uploading' constraint clinical_attachments_status_check
    check (status in ('uploading','pending_review','active','superseded','invalidated','quarantined','upload_failed')),
  visibility text not null default 'professional_private'
    constraint clinical_attachments_visibility_check
    check (visibility in ('professional_private','shared_with_patient','share_later')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  invalidated_at timestamptz,
  invalidation_reason text,
  constraint clinical_attachments_episode_patient_fk
    foreign key (care_episode_id,patient_id)
    references public.care_episodes(id,patient_id) on delete restrict,
  constraint clinical_attachments_record_episode_patient_fk
    foreign key (clinical_record_id,care_episode_id,patient_id)
    references public.clinical_records(id,care_episode_id,patient_id) on delete restrict,
  constraint clinical_attachments_review_check check (
    (reviewed_by is null and reviewed_at is null)
    or (reviewed_by is not null and reviewed_at is not null)
  ),
  constraint clinical_attachments_other_description_check check (
    category_code <> 'other' or length(btrim(coalesce(description,''))) >= 3
  ),
  constraint clinical_attachments_hash_lifecycle_check check (
    status in ('uploading','upload_failed') or sha256 is not null
  ),
  constraint clinical_attachments_invalidation_check check (
    (status='invalidated' and invalidated_at is not null and length(btrim(invalidation_reason)) >= 10)
    or (status<>'invalidated' and invalidated_at is null and invalidation_reason is null)
  )
);

alter table public.clinical_attachments
  add constraint clinical_attachments_root_fk foreign key (root_attachment_id)
  references public.clinical_attachments(id) on delete restrict deferrable initially immediate,
  add constraint clinical_attachments_replaces_fk foreign key (replaces_attachment_id)
  references public.clinical_attachments(id) on delete restrict;

create unique index clinical_attachments_id_patient_episode_idx
  on public.clinical_attachments(id,patient_id,care_episode_id);
create unique index clinical_attachments_root_version_idx
  on public.clinical_attachments(root_attachment_id,version);
create index clinical_attachments_episode_created_idx
  on public.clinical_attachments(care_episode_id,created_at desc);
create index clinical_attachments_patient_status_idx
  on public.clinical_attachments(patient_id,status,created_at desc);
create index clinical_attachments_pending_review_idx
  on public.clinical_attachments(care_episode_id,created_at)
  where status='pending_review';
create index clinical_attachments_record_idx
  on public.clinical_attachments(clinical_record_id,created_at desc)
  where clinical_record_id is not null;

create table public.clinical_attachment_events (
  id uuid primary key default gen_random_uuid(),
  clinical_attachment_id uuid not null references public.clinical_attachments(id) on delete restrict,
  patient_id uuid not null references public.user_profiles(id) on delete restrict,
  care_episode_id uuid not null references public.care_episodes(id) on delete restrict,
  actor_id uuid not null references public.user_profiles(id) on delete restrict,
  actor_role text not null constraint clinical_attachment_events_actor_role_check
    check (actor_role in ('nutritionist','student','patient','system')),
  action text not null constraint clinical_attachment_events_action_check
    check (action in ('created','metadata_updated','reviewed','status_changed','visibility_changed','replaced','rejected','invalidated')),
  from_status text constraint clinical_attachment_events_from_status_check
    check (from_status is null or from_status in ('uploading','pending_review','active','superseded','invalidated','quarantined','upload_failed')),
  to_status text not null constraint clinical_attachment_events_to_status_check
    check (to_status in ('uploading','pending_review','active','superseded','invalidated','quarantined','upload_failed')),
  from_visibility text constraint clinical_attachment_events_from_visibility_check
    check (from_visibility is null or from_visibility in ('professional_private','shared_with_patient','share_later')),
  to_visibility text not null constraint clinical_attachment_events_to_visibility_check
    check (to_visibility in ('professional_private','shared_with_patient','share_later')),
  reason text,
  metadata jsonb not null default '{}'::jsonb
    constraint clinical_attachment_events_metadata_check check (
      jsonb_typeof(metadata)='object'
      and not (metadata ?| array['content','description','filename','original_filename','signed_url','storage_path','sha256'])
    ),
  created_at timestamptz not null default now(),
  constraint clinical_attachment_events_attachment_scope_fk
    foreign key (clinical_attachment_id,patient_id,care_episode_id)
    references public.clinical_attachments(id,patient_id,care_episode_id) on delete restrict,
  constraint clinical_attachment_events_reason_check check (
    action not in ('replaced','rejected','invalidated') or length(btrim(reason)) >= 10
  )
);

create index clinical_attachment_events_attachment_created_idx
  on public.clinical_attachment_events(clinical_attachment_id,created_at,id);
create index clinical_attachment_events_episode_created_idx
  on public.clinical_attachment_events(care_episode_id,created_at desc);

create function private.clinical_attachment_actor_role(p_actor_id uuid, p_source text)
returns text language sql stable security definer set search_path='' as $$
  select case
    when p_source='system_import' then 'system'
    when exists(select 1 from public.user_profiles p where p.id=p_actor_id and p.user_type='patient') then 'patient'
    when exists(
      select 1 from public.professional_verifications v
      where v.user_id=p_actor_id and v.professional_role='student'
    ) then 'student'
    else 'nutritionist'
  end
$$;

create function private.prepare_clinical_attachment()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_previous public.clinical_attachments;
  v_reason text := nullif(btrim(current_setting('app.clinical_attachment_reason',true)),'');
begin
  if tg_op='INSERT' then
    if new.root_attachment_id is null then new.root_attachment_id := new.id; end if;

    if new.replaces_attachment_id is null then
      if new.root_attachment_id<>new.id or new.version<>1 then
        raise exception 'clinical_attachment_invalid_initial_version';
      end if;
    else
      select * into v_previous from public.clinical_attachments
      where id=new.replaces_attachment_id for update;
      if not found
        or v_previous.root_attachment_id<>new.root_attachment_id
        or v_previous.patient_id<>new.patient_id
        or v_previous.care_episode_id<>new.care_episode_id
        or new.version<>v_previous.version+1 then
        raise exception 'clinical_attachment_invalid_replacement_chain';
      end if;
    end if;

    if new.source='patient' and new.status not in ('uploading','pending_review','quarantined','upload_failed') then
      raise exception 'patient_attachment_requires_professional_review';
    end if;
    return new;
  end if;

  if old.id<>new.id or old.patient_id<>new.patient_id or old.care_episode_id<>new.care_episode_id
    or old.root_attachment_id<>new.root_attachment_id or old.version<>new.version
    or old.replaces_attachment_id is distinct from new.replaces_attachment_id
    or old.source<>new.source or old.author_id<>new.author_id or old.created_at<>new.created_at then
    raise exception 'clinical_attachment_identity_is_immutable';
  end if;

  if old.status<>'uploading' and (
    old.storage_bucket<>new.storage_bucket or old.storage_path<>new.storage_path
    or old.original_filename<>new.original_filename or old.mime_type<>new.mime_type
    or old.size_bytes<>new.size_bytes or old.sha256 is distinct from new.sha256
  ) then raise exception 'clinical_attachment_content_is_immutable'; end if;

  if old.status not in ('uploading','pending_review') and (
    old.category_code<>new.category_code or old.description is distinct from new.description
    or old.clinical_date is distinct from new.clinical_date
    or old.clinical_record_id is distinct from new.clinical_record_id
  ) then raise exception 'clinical_attachment_metadata_is_immutable'; end if;

  if old.reviewed_by is not null and (
    old.reviewed_by is distinct from new.reviewed_by or old.reviewed_at is distinct from new.reviewed_at
  ) then raise exception 'clinical_attachment_review_is_immutable'; end if;

  if old.status<>new.status and not (
    (old.status='uploading' and new.status in ('pending_review','active','quarantined','upload_failed'))
    or (old.status='pending_review' and new.status in ('active','invalidated','quarantined'))
    or (old.status='active' and new.status in ('superseded','invalidated','quarantined'))
    or (old.status='quarantined' and new.status in ('active','invalidated'))
  ) then raise exception 'clinical_attachment_invalid_status_transition'; end if;

  if new.status='invalidated' and old.status<>'invalidated' then
    if length(btrim(coalesce(new.invalidation_reason,v_reason,'')))<10 then
      raise exception 'clinical_attachment_invalidation_reason_required';
    end if;
    new.invalidation_reason := coalesce(nullif(btrim(new.invalidation_reason),''),v_reason);
    new.invalidated_at := now();
  elsif new.status='superseded' and old.status<>'superseded' and length(coalesce(v_reason,''))<10 then
    raise exception 'clinical_attachment_replacement_reason_required';
  end if;

  if old.visibility<>new.visibility and old.status not in ('uploading','pending_review')
    and length(coalesce(v_reason,''))<10 then
    raise exception 'clinical_attachment_visibility_reason_required';
  end if;

  new.updated_at := now();
  return new;
end
$$;

create function private.record_clinical_attachment_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_actor_id uuid;
  v_action text;
  v_reason text := nullif(btrim(current_setting('app.clinical_attachment_reason',true)),'');
begin
  v_actor_id := coalesce(auth.uid(),new.reviewed_by,new.author_id);
  if tg_op='INSERT' then
    v_action := 'created';
  elsif old.status<>new.status then
    v_action := case
      when new.status='superseded' then 'replaced'
      when new.status='invalidated' and old.status='pending_review' then 'rejected'
      when new.status='invalidated' then 'invalidated'
      else 'status_changed'
    end;
  elsif old.visibility<>new.visibility then
    v_action := 'visibility_changed';
  elsif old.reviewed_by is distinct from new.reviewed_by then
    v_action := 'reviewed';
  else
    v_action := 'metadata_updated';
  end if;

  insert into public.clinical_attachment_events(
    clinical_attachment_id,patient_id,care_episode_id,actor_id,actor_role,action,
    from_status,to_status,from_visibility,to_visibility,reason,metadata
  ) values (
    new.id,new.patient_id,new.care_episode_id,v_actor_id,
    private.clinical_attachment_actor_role(v_actor_id,new.source),v_action,
    case when tg_op='UPDATE' then old.status end,new.status,
    case when tg_op='UPDATE' then old.visibility end,new.visibility,
    coalesce(new.invalidation_reason,v_reason),'{}'::jsonb
  );
  return new;
end
$$;

create function private.reject_clinical_attachment_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='clinical_attachments' then
    raise exception 'clinical_attachments_do_not_support_hard_delete';
  end if;
  raise exception 'clinical_attachment_events_are_immutable';
end
$$;

create trigger trg_prepare_clinical_attachment
  before insert or update on public.clinical_attachments
  for each row execute function private.prepare_clinical_attachment();
create trigger trg_record_clinical_attachment_event
  after insert or update on public.clinical_attachments
  for each row execute function private.record_clinical_attachment_event();
create trigger trg_clinical_attachments_no_delete
  before delete on public.clinical_attachments
  for each row execute function private.reject_clinical_attachment_mutation();
create trigger trg_clinical_attachment_events_immutable
  before update or delete on public.clinical_attachment_events
  for each row execute function private.reject_clinical_attachment_mutation();

alter table public.clinical_attachment_categories enable row level security;
alter table public.clinical_attachments enable row level security;
alter table public.clinical_attachment_events enable row level security;

revoke all on table public.clinical_attachment_categories,public.clinical_attachments,
  public.clinical_attachment_events from public,anon,authenticated;
revoke all on function private.clinical_attachment_actor_role(uuid,text),
  private.prepare_clinical_attachment(),private.record_clinical_attachment_event(),
  private.reject_clinical_attachment_mutation() from public,anon,authenticated;

grant all on table public.clinical_attachment_categories,public.clinical_attachments,
  public.clinical_attachment_events to service_role;

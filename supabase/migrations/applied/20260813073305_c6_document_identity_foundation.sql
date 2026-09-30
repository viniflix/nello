-- C6.1: versioned professional identity used by the central document engine.

create table public.professional_document_identities (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.user_profiles(id) on delete restrict,
  verification_id uuid not null references public.professional_verifications(id) on delete restrict,
  version integer not null check (version > 0),
  status text not null check (status in ('active', 'archived')),
  professional_name text not null,
  clinic_name text,
  professional_email text,
  professional_phone text,
  address_line text,
  address_city text,
  address_state text,
  address_postal_code text,
  primary_color text not null,
  accent_color text not null,
  header_text text,
  footer_text text,
  crn_region text,
  crn_number text,
  normalized_crn text,
  logo_storage_path text,
  signature_storage_path text,
  stamp_storage_path text,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archive_reason text,
  constraint professional_document_identity_status_shape check (
    (status = 'active' and archived_at is null and archive_reason is null)
    or (status = 'archived' and archived_at is not null and archive_reason is not null)
  ),
  constraint professional_document_identity_crn_shape check (
    (normalized_crn is null and crn_region is null and crn_number is null)
    or (normalized_crn is not null and crn_number is not null)
  )
);

create unique index professional_document_identities_version_unique
  on public.professional_document_identities(professional_id, version);
create unique index professional_document_identities_one_active
  on public.professional_document_identities(professional_id)
  where status = 'active';
create index professional_document_identities_professional_created_idx
  on public.professional_document_identities(professional_id, created_at desc);

create table public.professional_document_identity_events (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.professional_document_identities(id) on delete restrict,
  professional_id uuid not null references public.user_profiles(id) on delete restrict,
  actor_id uuid not null references public.user_profiles(id) on delete restrict,
  event_type text not null check (event_type in ('created', 'superseded')),
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index professional_document_identity_events_owner_created_idx
  on public.professional_document_identity_events(professional_id, created_at desc);

alter table public.professional_document_identities enable row level security;
alter table public.professional_document_identity_events enable row level security;

revoke all on table public.professional_document_identities from public, anon, authenticated;
revoke all on table public.professional_document_identity_events from public, anon, authenticated;
grant select, insert, update on table public.professional_document_identities to service_role;
grant select, insert on table public.professional_document_identity_events to service_role;

create or replace function private.reject_document_identity_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'document_identity_delete_forbidden';
end;
$$;

create or replace function private.reject_document_identity_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'document_identity_events_are_immutable';
end;
$$;

revoke all on function private.reject_document_identity_delete() from public, anon, authenticated;
revoke all on function private.reject_document_identity_event_mutation() from public, anon, authenticated;

create trigger trg_document_identity_no_delete
before delete on public.professional_document_identities
for each row execute function private.reject_document_identity_delete();

create trigger trg_document_identity_events_immutable
before update or delete on public.professional_document_identity_events
for each row execute function private.reject_document_identity_event_mutation();

create or replace function private.merge_document_identity_text(
  p_payload jsonb,
  p_key text,
  p_current text,
  p_default text default null
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_payload ? p_key then nullif(btrim(p_payload->>p_key), '')
    else coalesce(p_current, p_default)
  end;
$$;

revoke all on function private.merge_document_identity_text(jsonb, text, text, text)
  from public, anon, authenticated;

create or replace function public.get_my_document_identity()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_profile public.user_profiles%rowtype;
  v_verification public.professional_verifications%rowtype;
  v_identity public.professional_document_identities%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select * into v_profile from public.user_profiles where id = v_actor;
  if not found then
    raise exception using errcode = '42501', message = 'profile_not_found';
  end if;
  if v_profile.user_type is distinct from 'nutritionist' then
    raise exception using errcode = '42501', message = 'document_identity_professional_only';
  end if;

  select * into v_verification
  from public.professional_verifications
  where user_id = v_actor;

  select * into v_identity
  from public.professional_document_identities
  where professional_id = v_actor and status = 'active';

  if found then
    return jsonb_strip_nulls(jsonb_build_object(
      'source', 'saved',
      'id', v_identity.id,
      'version', v_identity.version,
      'professional_name', v_identity.professional_name,
      'clinic_name', v_identity.clinic_name,
      'professional_email', v_identity.professional_email,
      'professional_phone', v_identity.professional_phone,
      'address_line', v_identity.address_line,
      'address_city', v_identity.address_city,
      'address_state', v_identity.address_state,
      'address_postal_code', v_identity.address_postal_code,
      'primary_color', v_identity.primary_color,
      'accent_color', v_identity.accent_color,
      'header_text', v_identity.header_text,
      'footer_text', v_identity.footer_text,
      'crn_region', v_identity.crn_region,
      'crn_number', v_identity.crn_number,
      'normalized_crn', v_identity.normalized_crn,
      'verification_status', v_verification.status,
      'can_sign', coalesce(v_verification.professional_role = 'nutritionist'
        and v_verification.status = 'approved'
        and v_verification.valid_until > now()
        and v_identity.normalized_crn is not null, false),
      'assets', jsonb_build_object(
        'has_logo', v_identity.logo_storage_path is not null,
        'has_visual_signature', v_identity.signature_storage_path is not null,
        'has_stamp', v_identity.stamp_storage_path is not null
      ),
      'created_at', v_identity.created_at
    ));
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'source', 'profile_default',
    'version', 0,
    'professional_name', v_profile.name,
    'professional_email', v_profile.email,
    'professional_phone', v_profile.phone,
    'primary_color', '#4F8A3C',
    'accent_color', '#7DAF69',
    'crn_region', case when v_verification.status = 'approved' then v_verification.crn_region end,
    'crn_number', case when v_verification.status = 'approved' then v_verification.crn_number end,
    'normalized_crn', case when v_verification.status = 'approved' then v_verification.normalized_crn end,
    'verification_status', coalesce(v_verification.status, 'not_submitted'),
    'can_sign', coalesce(v_verification.professional_role = 'nutritionist'
      and v_verification.status = 'approved'
      and v_verification.valid_until > now()
      and v_verification.normalized_crn is not null, false),
    'assets', jsonb_build_object('has_logo', false, 'has_visual_signature', false, 'has_stamp', false)
  ));
end;
$$;

create or replace function public.save_my_document_identity(
  p_payload jsonb,
  p_expected_version integer default null,
  p_reason text default 'profile_update'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_profile public.user_profiles%rowtype;
  v_verification public.professional_verifications%rowtype;
  v_current public.professional_document_identities%rowtype;
  v_saved public.professional_document_identities%rowtype;
  v_next_version integer;
  v_unknown_key text;
  v_name text;
  v_clinic text;
  v_email text;
  v_phone text;
  v_address_line text;
  v_address_city text;
  v_address_state text;
  v_postal_code text;
  v_primary_color text;
  v_accent_color text;
  v_header text;
  v_footer text;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'document_identity_payload_must_be_object';
  end if;

  select key into v_unknown_key
  from jsonb_object_keys(p_payload) key
  where key <> all(array[
    'professional_name', 'clinic_name', 'professional_email', 'professional_phone',
    'address_line', 'address_city', 'address_state', 'address_postal_code',
    'primary_color', 'accent_color', 'header_text', 'footer_text'
  ]::text[])
  limit 1;
  if v_unknown_key is not null then
    raise exception using errcode = '22023', message = 'document_identity_unknown_field:' || v_unknown_key;
  end if;

  select * into v_profile from public.user_profiles where id = v_actor;
  select * into v_verification
  from public.professional_verifications
  where user_id = v_actor
    and professional_role = 'nutritionist'
    and status = 'approved'
    and valid_until > now()
  for share;

  if not found or v_profile.user_type is distinct from 'nutritionist' then
    raise exception using errcode = '42501', message = 'document_identity_requires_verified_nutritionist';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('document_identity:' || v_actor::text, 0));
  select * into v_current
  from public.professional_document_identities
  where professional_id = v_actor and status = 'active'
  for update;

  if found then
    if p_expected_version is null or p_expected_version <> v_current.version then
      raise exception using errcode = '40001', message = 'document_identity_revision_conflict';
    end if;
    v_next_version := v_current.version + 1;
  else
    if p_expected_version is not null and p_expected_version <> 0 then
      raise exception using errcode = '40001', message = 'document_identity_revision_conflict';
    end if;
    v_next_version := 1;
  end if;

  v_name := private.merge_document_identity_text(p_payload, 'professional_name', v_current.professional_name, v_profile.name);
  v_clinic := private.merge_document_identity_text(p_payload, 'clinic_name', v_current.clinic_name, null);
  v_email := private.merge_document_identity_text(p_payload, 'professional_email', v_current.professional_email, v_profile.email);
  v_phone := private.merge_document_identity_text(p_payload, 'professional_phone', v_current.professional_phone, v_profile.phone);
  v_address_line := private.merge_document_identity_text(p_payload, 'address_line', v_current.address_line, null);
  v_address_city := private.merge_document_identity_text(p_payload, 'address_city', v_current.address_city, null);
  v_address_state := private.merge_document_identity_text(p_payload, 'address_state', v_current.address_state, null);
  v_postal_code := private.merge_document_identity_text(p_payload, 'address_postal_code', v_current.address_postal_code, null);
  v_primary_color := coalesce(private.merge_document_identity_text(p_payload, 'primary_color', v_current.primary_color, '#4F8A3C'), '#4F8A3C');
  v_accent_color := coalesce(private.merge_document_identity_text(p_payload, 'accent_color', v_current.accent_color, '#7DAF69'), '#7DAF69');
  v_header := private.merge_document_identity_text(p_payload, 'header_text', v_current.header_text, null);
  v_footer := private.merge_document_identity_text(p_payload, 'footer_text', v_current.footer_text, null);

  if v_name is null or length(v_name) > 160
     or length(coalesce(v_clinic, '')) > 160
     or length(coalesce(v_email, '')) > 254
     or length(coalesce(v_phone, '')) > 40
     or length(coalesce(v_address_line, '')) > 240
     or length(coalesce(v_address_city, '')) > 120
     or length(coalesce(v_address_state, '')) > 40
     or length(coalesce(v_postal_code, '')) > 20
     or length(coalesce(v_header, '')) > 300
     or length(coalesce(v_footer, '')) > 300
     or length(coalesce(v_reason, '')) > 240 then
    raise exception using errcode = '22023', message = 'document_identity_field_out_of_bounds';
  end if;
  if concat_ws('', v_name, v_clinic, v_email, v_phone, v_address_line, v_address_city,
      v_address_state, v_postal_code, v_header, v_footer) ~ '[<>]' then
    raise exception using errcode = '22023', message = 'document_identity_markup_not_allowed';
  end if;
  if v_primary_color !~ '^#[0-9A-Fa-f]{6}$' or v_accent_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception using errcode = '22023', message = 'document_identity_invalid_color';
  end if;
  if v_reason is null then
    raise exception using errcode = '22023', message = 'document_identity_reason_required';
  end if;

  if v_current.id is not null then
    update public.professional_document_identities
    set status = 'archived', archived_at = now(), archive_reason = v_reason
    where id = v_current.id;

    insert into public.professional_document_identity_events(
      identity_id, professional_id, actor_id, event_type, reason, metadata
    ) values (
      v_current.id, v_actor, v_actor, 'superseded', v_reason,
      jsonb_build_object('version', v_current.version, 'superseded_by_version', v_next_version)
    );
  end if;

  insert into public.professional_document_identities(
    professional_id, verification_id, version, status,
    professional_name, clinic_name, professional_email, professional_phone,
    address_line, address_city, address_state, address_postal_code,
    primary_color, accent_color, header_text, footer_text,
    crn_region, crn_number, normalized_crn,
    logo_storage_path, signature_storage_path, stamp_storage_path,
    created_by
  ) values (
    v_actor, v_verification.id, v_next_version, 'active',
    v_name, v_clinic, v_email, v_phone,
    v_address_line, v_address_city, v_address_state, v_postal_code,
    upper(v_primary_color), upper(v_accent_color), v_header, v_footer,
    v_verification.crn_region, v_verification.crn_number, v_verification.normalized_crn,
    v_current.logo_storage_path, v_current.signature_storage_path, v_current.stamp_storage_path,
    v_actor
  ) returning * into v_saved;

  insert into public.professional_document_identity_events(
    identity_id, professional_id, actor_id, event_type, reason, metadata
  ) values (
    v_saved.id, v_actor, v_actor, 'created', v_reason,
    jsonb_build_object('version', v_saved.version, 'previous_version', nullif(v_saved.version - 1, 0))
  );

  return public.get_my_document_identity();
end;
$$;

revoke all on function public.get_my_document_identity() from public, anon, authenticated;
revoke all on function public.save_my_document_identity(jsonb, integer, text) from public, anon, authenticated;
grant execute on function public.get_my_document_identity() to authenticated, service_role;
grant execute on function public.save_my_document_identity(jsonb, integer, text) to authenticated, service_role;

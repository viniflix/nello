-- Onda B4 / Task 1: identidade profissional verificável e continuidade alpha.

create table if not exists public.professional_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.user_profiles(id) on delete restrict,
  professional_role text not null check (professional_role in ('nutritionist', 'student')),
  status text not null default 'not_submitted'
    check (status in ('not_submitted', 'pending', 'needs_information', 'approved', 'rejected', 'expired', 'suspended')),
  verification_method text,
  crn_region text,
  crn_number text,
  normalized_crn text,
  institution_name text,
  current_semester smallint check (current_semester is null or current_semester between 1 and 20),
  expected_graduation_at date,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  valid_until timestamptz,
  reviewed_by uuid references public.user_profiles(id) on delete set null,
  decision_reason text,
  source_url text,
  source_checked_at timestamptz,
  document_required_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professional_verifications_role_fields_check check (
    (professional_role = 'nutritionist' and institution_name is null and current_semester is null)
    or professional_role = 'student'
  ),
  constraint professional_verifications_approved_validity_check check (
    status <> 'approved' or valid_until is not null
  )
);

create unique index if not exists professional_verifications_approved_crn_unique
  on public.professional_verifications (normalized_crn)
  where normalized_crn is not null and status = 'approved';
create index if not exists professional_verifications_status_idx
  on public.professional_verifications (status, professional_role, valid_until);

create table if not exists public.verification_events (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.professional_verifications(id) on delete restrict,
  actor_id uuid references public.user_profiles(id) on delete set null,
  from_status text,
  to_status text not null,
  reason text not null,
  source_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists verification_events_verification_created_idx
  on public.verification_events (verification_id, created_at desc);

create table if not exists public.verification_documents (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.professional_verifications(id) on delete restrict,
  owner_id uuid not null references public.user_profiles(id) on delete restrict,
  document_type text not null,
  storage_path text,
  content_sha256 text not null,
  uploaded_at timestamptz not null default now(),
  scheduled_deletion_at timestamptz,
  deleted_at timestamptz,
  retention_status text not null default 'pending_review'
    check (retention_status in ('pending_review', 'scheduled_for_deletion', 'deleted')),
  created_at timestamptz not null default now()
);

create index if not exists verification_documents_verification_idx
  on public.verification_documents (verification_id, retention_status);

create table if not exists public.student_supervisions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.user_profiles(id) on delete restrict,
  supervisor_id uuid not null references public.user_profiles(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'rejected', 'ended')),
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  response_reason text,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_supervisions_distinct_participants_check check (student_id <> supervisor_id)
);

create unique index if not exists student_supervisions_one_open_pair
  on public.student_supervisions (student_id, supervisor_id)
  where status in ('pending', 'active');
create unique index if not exists student_supervisions_one_active_student
  on public.student_supervisions (student_id)
  where status = 'active';

create or replace function private.reject_verification_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'verification_events_are_immutable';
end;
$$;

revoke all on function private.reject_verification_event_mutation() from public, anon, authenticated;

drop trigger if exists trg_verification_events_immutable on public.verification_events;
create trigger trg_verification_events_immutable
before update or delete on public.verification_events
for each row execute function private.reject_verification_event_mutation();

create or replace function private.has_current_clinical_capacity(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.professional_verifications v
    where v.user_id = p_user_id
      and v.status = 'approved'
      and v.valid_until > now()
      and (
        v.professional_role = 'nutritionist'
        or (
          v.professional_role = 'student'
          and exists (
            select 1
            from public.student_supervisions s
            join public.professional_verifications supervisor
              on supervisor.user_id = s.supervisor_id
            where s.student_id = v.user_id
              and s.status = 'active'
              and supervisor.professional_role = 'nutritionist'
              and supervisor.status = 'approved'
              and supervisor.valid_until > now()
          )
        )
      )
  );
$$;

revoke all on function private.has_current_clinical_capacity(uuid) from public, anon, authenticated;
grant execute on function private.has_current_clinical_capacity(uuid) to postgres, service_role;

create or replace function public.get_my_professional_verification()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_strip_nulls(jsonb_build_object(
      'id', v.id,
      'professional_role', v.professional_role,
      'status', case
        when v.status = 'approved' and v.valid_until <= now() then 'expired'
        else v.status
      end,
      'verification_method', v.verification_method,
      'crn_region', v.crn_region,
      'crn_number', v.crn_number,
      'institution_name', v.institution_name,
      'current_semester', v.current_semester,
      'expected_graduation_at', v.expected_graduation_at,
      'submitted_at', v.submitted_at,
      'reviewed_at', v.reviewed_at,
      'valid_until', v.valid_until,
      'decision_reason', v.decision_reason,
      'document_required_reason', v.document_required_reason,
      'has_clinical_capacity', private.has_current_clinical_capacity(v.user_id)
    ))
    from public.professional_verifications v
    where v.user_id = auth.uid()
  ), jsonb_build_object(
    'status', 'not_submitted',
    'has_clinical_capacity', false
  ));
$$;

revoke all on function public.get_my_professional_verification() from public, anon;
grant execute on function public.get_my_professional_verification() to authenticated, service_role;

alter table public.professional_verifications enable row level security;
alter table public.verification_events enable row level security;
alter table public.verification_documents enable row level security;
alter table public.student_supervisions enable row level security;

drop policy if exists professional_verifications_select_owner_or_admin on public.professional_verifications;
create policy professional_verifications_select_owner_or_admin
on public.professional_verifications for select to authenticated
using (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists verification_events_select_owner_or_admin on public.verification_events;
create policy verification_events_select_owner_or_admin
on public.verification_events for select to authenticated
using (
  private.is_admin()
  or exists (
    select 1 from public.professional_verifications v
    where v.id = verification_id and v.user_id = (select auth.uid())
  )
);

drop policy if exists verification_documents_select_owner_or_admin on public.verification_documents;
create policy verification_documents_select_owner_or_admin
on public.verification_documents for select to authenticated
using (owner_id = (select auth.uid()) or private.is_admin());

drop policy if exists student_supervisions_select_participant_or_admin on public.student_supervisions;
create policy student_supervisions_select_participant_or_admin
on public.student_supervisions for select to authenticated
using (
  student_id = (select auth.uid())
  or supervisor_id = (select auth.uid())
  or private.is_admin()
);

revoke all on table public.professional_verifications from anon;
revoke all on table public.verification_events from anon;
revoke all on table public.verification_documents from anon;
revoke all on table public.student_supervisions from anon;
revoke insert, update, delete on table public.professional_verifications from authenticated;
revoke insert, update, delete on table public.verification_events from authenticated;
revoke insert, update, delete on table public.verification_documents from authenticated;
revoke insert, update, delete on table public.student_supervisions from authenticated;
grant select on table public.professional_verifications to authenticated;
grant select on table public.verification_events to authenticated;
grant select on table public.verification_documents to authenticated;
grant select on table public.student_supervisions to authenticated;

with migrated as (
  insert into public.professional_verifications (
    user_id,
    professional_role,
    status,
    verification_method,
    crn_number,
    normalized_crn,
    submitted_at,
    reviewed_at,
    valid_until,
    decision_reason
  )
  select
    p.id,
    'nutritionist',
    'approved',
    'approved_by_migration',
    nullif(btrim(p.crn), ''),
    case
      when nullif(btrim(p.crn), '') is null then null
      else upper(regexp_replace(p.crn, '[^A-Za-z0-9]', '', 'g'))
    end,
    now(),
    now(),
    '2026-09-30 23:59:59-03'::timestamptz,
    'alpha_continuity_migration'
  from public.user_profiles p
  where p.user_type = 'nutritionist'
  on conflict (user_id) do nothing
  returning id
)
insert into public.verification_events (
  verification_id,
  actor_id,
  from_status,
  to_status,
  reason,
  metadata
)
select
  id,
  null,
  'not_submitted',
  'approved',
  'alpha_continuity_migration',
  jsonb_build_object('valid_until', '2026-09-30T23:59:59-03:00')
from migrated;

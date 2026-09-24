-- The profile, professional link and retry key commit together.
create table if not exists private.offline_patient_requests (
  request_id uuid primary key,
  nutritionist_id uuid not null,
  patient_id uuid not null,
  invite_code text not null,
  created_at timestamptz not null default now()
);

revoke all on private.offline_patient_requests from public, anon, authenticated;

create or replace function public.create_offline_patient_atomic(
  p_request_id uuid,
  p_nutritionist_id uuid,
  p_patient_id uuid,
  p_invite_code text,
  p_email text,
  p_profile jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing private.offline_patient_requests%rowtype;
  inserted boolean := false;
  affected bigint;
begin
  if p_request_id is null or p_nutritionist_id is null or p_patient_id is null
    or p_invite_code !~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'
    or jsonb_typeof(p_profile) <> 'object'
    or nullif(trim(p_profile->>'name'), '') is null then
    raise exception 'invalid_offline_patient_request' using errcode = '22023';
  end if;

  insert into private.offline_patient_requests
    (request_id, nutritionist_id, patient_id, invite_code)
  values (p_request_id, p_nutritionist_id, p_patient_id, p_invite_code)
  on conflict (request_id) do nothing;
  get diagnostics affected = row_count;
  inserted := affected = 1;

  select * into existing from private.offline_patient_requests where request_id = p_request_id;
  if existing.nutritionist_id <> p_nutritionist_id then
    raise exception 'offline_patient_request_owner_mismatch' using errcode = '42501';
  end if;
  if not inserted then
    return jsonb_build_object('userId', existing.patient_id, 'inviteCode', existing.invite_code);
  end if;

  insert into public.user_profiles (
    id, name, full_name, email, birth_date, user_type, nutritionist_id,
    patient_invite_code, is_active, phone, cpf, gender, occupation,
    civil_status, observations, address, needs_password_reset
  ) values (
    p_patient_id, p_profile->>'name', p_profile->>'name', nullif(trim(p_email), ''),
    nullif(p_profile->>'birth_date', '')::date, 'patient', p_nutritionist_id,
    p_invite_code, true, nullif(p_profile->>'phone', ''), nullif(p_profile->>'cpf', ''),
    nullif(p_profile->>'gender', ''), nullif(p_profile->>'occupation', ''),
    nullif(p_profile->>'civil_status', ''), nullif(p_profile->>'observations', ''),
    case when jsonb_typeof(p_profile->'address') = 'object' then p_profile->'address' else null end,
    true
  );

  insert into public.nutritionist_patients (nutritionist_id, patient_id, status)
  values (p_nutritionist_id, p_patient_id, 'active');

  return jsonb_build_object('userId', p_patient_id, 'inviteCode', p_invite_code);
end;
$$;

revoke all on function public.create_offline_patient_atomic(uuid, uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_offline_patient_atomic(uuid, uuid, uuid, text, text, jsonb) to service_role;

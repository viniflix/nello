-- Pré-lançamento: mantém testers profissionais operacionais sem remover a
-- fundação B4. A capacidade clínica continua derivada de
-- professional_verifications; esta migração apenas materializa uma aprovação
-- temporária até o paywall e o onboarding regulatório definitivo.

create or replace function private.auto_approve_prelaunch_nutritionist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_verification_id uuid;
  v_from_status text := 'not_submitted';
  v_previous_valid_until timestamptz;
  v_prelaunch_valid_until constant timestamptz := '2099-12-31 23:59:59+00'::timestamptz;
begin
  if new.user_type is distinct from 'nutritionist' then
    return new;
  end if;

  select v.id, v.status, v.valid_until
  into v_verification_id, v_from_status, v_previous_valid_until
  from public.professional_verifications v
  where v.user_id = new.id
  for update;

  if found
    and v_from_status = 'approved'
    and v_previous_valid_until >= v_prelaunch_valid_until then
    return new;
  end if;

  insert into public.professional_verifications (
    user_id,
    professional_role,
    status,
    verification_method,
    submitted_at,
    reviewed_at,
    valid_until,
    decision_reason
  )
  values (
    new.id,
    'nutritionist',
    'approved',
    'pre_paywall_auto_approval',
    now(),
    now(),
    v_prelaunch_valid_until,
    'pre_paywall_tester_continuity'
  )
  on conflict (user_id) do update set
    professional_role = 'nutritionist',
    status = 'approved',
    verification_method = case
      when professional_verifications.status = 'approved'
        then professional_verifications.verification_method
      else 'pre_paywall_auto_approval'
    end,
    institution_name = null,
    current_semester = null,
    expected_graduation_at = null,
    submitted_at = coalesce(professional_verifications.submitted_at, now()),
    reviewed_at = now(),
    valid_until = v_prelaunch_valid_until,
    decision_reason = case
      when professional_verifications.status = 'approved'
        then coalesce(
          professional_verifications.decision_reason,
          'pre_paywall_tester_continuity'
        )
      else 'pre_paywall_tester_continuity'
    end,
    document_required_reason = null,
    updated_at = now()
  returning id into v_verification_id;

  insert into public.verification_events (
    verification_id,
    actor_id,
    from_status,
    to_status,
    reason,
    metadata
  )
  values (
    v_verification_id,
    null,
    v_from_status,
    'approved',
    'pre_paywall_tester_continuity',
    jsonb_build_object(
      'automatic', true,
      'temporary_until_paywall', true,
      'previous_valid_until', v_previous_valid_until,
      'valid_until', v_prelaunch_valid_until
    )
  );

  return new;
end;
$$;

revoke all on function private.auto_approve_prelaunch_nutritionist()
from public, anon, authenticated;

drop trigger if exists trg_auto_approve_prelaunch_nutritionist
on public.user_profiles;
create trigger trg_auto_approve_prelaunch_nutritionist
after insert or update of user_type
on public.user_profiles
for each row
when (new.user_type = 'nutritionist')
execute function private.auto_approve_prelaunch_nutritionist();

-- Audita o estado anterior antes de estender a continuidade dos profissionais
-- já cadastrados. Contas suspensas/rejeitadas também são liberadas porque o
-- proprietário autorizou explicitamente todos os testers atuais.
create temporary table prelaunch_verification_snapshot
on commit drop
as
select
  p.id as user_id,
  v.status as previous_status,
  v.valid_until as previous_valid_until
from public.user_profiles p
left join public.professional_verifications v on v.user_id = p.id
where p.user_type = 'nutritionist';

insert into public.professional_verifications (
  user_id,
  professional_role,
  status,
  verification_method,
  submitted_at,
  reviewed_at,
  valid_until,
  decision_reason
)
select
  p.id,
  'nutritionist',
  'approved',
  'pre_paywall_auto_approval',
  now(),
  now(),
  '2099-12-31 23:59:59+00'::timestamptz,
  'pre_paywall_tester_continuity'
from public.user_profiles p
where p.user_type = 'nutritionist'
on conflict (user_id) do update set
  professional_role = 'nutritionist',
  status = 'approved',
  verification_method = case
    when professional_verifications.status = 'approved'
      then professional_verifications.verification_method
    else 'pre_paywall_auto_approval'
  end,
  institution_name = null,
  current_semester = null,
  expected_graduation_at = null,
  submitted_at = coalesce(professional_verifications.submitted_at, now()),
  reviewed_at = now(),
  valid_until = '2099-12-31 23:59:59+00'::timestamptz,
  decision_reason = case
    when professional_verifications.status = 'approved'
      then coalesce(
        professional_verifications.decision_reason,
        'pre_paywall_tester_continuity'
      )
    else 'pre_paywall_tester_continuity'
  end,
  document_required_reason = null,
  updated_at = now();

insert into public.verification_events (
  verification_id,
  actor_id,
  from_status,
  to_status,
  reason,
  metadata
)
select
  v.id,
  null,
  coalesce(s.previous_status, 'not_submitted'),
  'approved',
  'pre_paywall_tester_continuity',
  jsonb_build_object(
    'automatic', true,
    'temporary_until_paywall', true,
    'previous_valid_until', s.previous_valid_until,
    'valid_until', v.valid_until
  )
from prelaunch_verification_snapshot s
join public.professional_verifications v on v.user_id = s.user_id;

-- Restaura o contrato B2 que materializa um episódio ao ativar um vínculo.
-- O trigger/função haviam sofrido drift no banco remoto.
create or replace function private.sync_care_episode_for_active_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active_episode public.care_episodes%rowtype;
begin
  if new.status is distinct from 'active' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status is not distinct from 'active' then
    return new;
  end if;

  select ce.* into v_active_episode
  from public.care_episodes ce
  where ce.patient_id = new.patient_id
    and ce.status = 'active'
  for update;

  if found then
    if v_active_episode.nutritionist_id <> new.nutritionist_id then
      raise exception using
        errcode = '23505',
        message = 'patient_has_another_active_care_episode';
    end if;
    return new;
  end if;

  insert into public.care_episodes (
    nutritionist_id,
    patient_id,
    status,
    started_at,
    start_reason,
    started_by
  )
  values (
    new.nutritionist_id,
    new.patient_id,
    'active',
    coalesce(new.created_at, now()),
    'link_approved',
    coalesce(auth.uid(), new.nutritionist_id)
  );

  return new;
end;
$$;

revoke all on function private.sync_care_episode_for_active_link()
from public, anon, authenticated;

drop trigger if exists trg_sync_care_episode_for_active_link
on public.nutritionist_patients;
create trigger trg_sync_care_episode_for_active_link
after insert or update of status
on public.nutritionist_patients
for each row
execute function private.sync_care_episode_for_active_link();

-- Repara somente vínculos ativos que não possuem nenhum episódio ativo.
-- Não altera vínculos históricos, episódios encerrados ou dados clínicos.
insert into public.care_episodes (
  nutritionist_id,
  patient_id,
  status,
  started_at,
  start_reason,
  started_by
)
select
  np.nutritionist_id,
  np.patient_id,
  'active',
  coalesce(np.created_at, now()),
  'prelaunch_active_link_repair',
  np.nutritionist_id
from public.nutritionist_patients np
where np.status = 'active'
  and not exists (
    select 1
    from public.care_episodes ce
    where ce.patient_id = np.patient_id
      and ce.status = 'active'
  )
on conflict (patient_id) where status = 'active' do nothing;

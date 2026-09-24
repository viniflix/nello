-- Synthetic global and offline invite redemption; all changes are rolled back.
begin;

do $fixture$
declare
  v_professional uuid := gen_random_uuid();
  v_global_patient uuid := gen_random_uuid();
  v_offline_patient uuid := gen_random_uuid();
  v_unclaimed_profile uuid := gen_random_uuid();
  v_episode uuid;
begin
  perform set_config('qa.professional_id', v_professional::text, true);
  perform set_config('qa.global_patient_id', v_global_patient::text, true);
  perform set_config('qa.offline_patient_id', v_offline_patient::text, true);
  perform set_config('qa.unclaimed_profile_id', v_unclaimed_profile::text, true);
  perform set_config('qa.global_code', 'W2G-' || replace(v_professional::text, '-', ''), true);
  perform set_config('qa.offline_code', 'W2O-' || replace(v_unclaimed_profile::text, '-', ''), true);

  insert into auth.users (id, aud, role, email, raw_user_meta_data)
  values
    (v_professional, 'authenticated', 'authenticated',
      'wave2-' || v_professional || '@example.invalid',
      '{"name":"Wave 2 QA professional","user_type":"nutritionist"}'::jsonb),
    (v_global_patient, 'authenticated', 'authenticated',
      'wave2-' || v_global_patient || '@example.invalid',
      '{"name":"Wave 2 QA global patient","user_type":"patient"}'::jsonb),
    (v_offline_patient, 'authenticated', 'authenticated',
      'wave2-' || v_offline_patient || '@example.invalid',
      '{"name":"Wave 2 QA offline patient","user_type":"patient"}'::jsonb);

  update public.user_profiles
  set invite_code = current_setting('qa.global_code')
  where id = v_professional;

  insert into public.user_profiles
    (id, name, user_type, nutritionist_id, patient_invite_code)
  values
    (v_unclaimed_profile, 'Wave 2 QA unclaimed profile', 'patient',
      v_professional, current_setting('qa.offline_code'));
  insert into public.nutritionist_patients (nutritionist_id, patient_id, status)
  values (v_professional, v_unclaimed_profile, 'active');
  select id into v_episode from public.care_episodes
  where patient_id = v_unclaimed_profile and nutritionist_id = v_professional
    and status = 'active' limit 1;
  if v_episode is null then
    v_episode := gen_random_uuid();
    insert into public.care_episodes (id, patient_id, nutritionist_id, status)
    values (v_episode, v_unclaimed_profile, v_professional, 'active');
  end if;
  perform set_config('qa.episode_id', v_episode::text, true);
  insert into public.growth_records
    (patient_id, care_episode_id, record_date, weight, height)
  values (v_unclaimed_profile, v_episode, current_date, 70, 170);
end;
$fixture$;

set local role authenticated;

do $assertions$
declare
  v_professional uuid := current_setting('qa.professional_id')::uuid;
  v_global_patient uuid := current_setting('qa.global_patient_id')::uuid;
  v_offline_patient uuid := current_setting('qa.offline_patient_id')::uuid;
  v_unclaimed_profile uuid := current_setting('qa.unclaimed_profile_id')::uuid;
  v_episode uuid := current_setting('qa.episode_id')::uuid;
  v_result jsonb;
  v_count integer;
begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_global_patient::text, true);
  select public.redeem_invite_code(current_setting('qa.global_code')) into v_result;
  if v_result->>'type' <> 'link_pending' or v_result->>'success' <> 'true' then
    raise exception 'QA_GLOBAL_INVITE_REDEEM_FAILED: %', v_result;
  end if;
  select count(*) into v_count from public.nutritionist_patients
  where nutritionist_id = v_professional and patient_id = v_global_patient and status = 'pending';
  if v_count <> 1 then raise exception 'QA_GLOBAL_INVITE_LINK_MISSING'; end if;

  select public.redeem_invite_code('W2-INVALID-CODE') into v_result;
  if v_result->>'success' <> 'false' then raise exception 'QA_INVALID_CODE_ACCEPTED'; end if;

  -- A patient with an existing pending link must keep that account and link.
  select public.redeem_invite_code(current_setting('qa.offline_code')) into v_result;
  if v_result->>'code' <> 'current_profile_not_claimable' then
    raise exception 'QA_EXISTING_PROFILE_CLAIM_ACCEPTED: %', v_result;
  end if;
  select count(*) into v_count from public.nutritionist_patients
  where nutritionist_id = v_professional and patient_id = v_global_patient and status = 'pending';
  if v_count <> 1 then raise exception 'QA_EXISTING_PROFILE_LINK_LOST'; end if;

  perform set_config('request.jwt.claim.sub', v_offline_patient::text, true);
  select public.redeem_invite_code(current_setting('qa.offline_code')) into v_result;
  if v_result->>'type' <> 'profile_claimed' or v_result->>'success' <> 'true' then
    raise exception 'QA_OFFLINE_INVITE_REDEEM_FAILED: %', v_result;
  end if;
  select count(*) into v_count from public.nutritionist_patients
  where nutritionist_id = v_professional and patient_id = v_offline_patient and status = 'active';
  if v_count <> 1 then raise exception 'QA_OFFLINE_INVITE_LINK_MISSING'; end if;
  select count(*) into v_count from public.user_profiles
  where id = v_unclaimed_profile;
  if v_count <> 0 then raise exception 'QA_UNCLAIMED_PROFILE_REMAINS'; end if;
  select count(*) into v_count from public.care_episodes
  where id = v_episode and patient_id = v_offline_patient;
  if v_count <> 1 then raise exception 'QA_OFFLINE_EPISODE_LOST'; end if;
  select count(*) into v_count from public.growth_records
  where care_episode_id = v_episode and patient_id = v_offline_patient;
  if v_count <> 1 then raise exception 'QA_OFFLINE_GROWTH_LOST'; end if;
end;
$assertions$;

rollback;

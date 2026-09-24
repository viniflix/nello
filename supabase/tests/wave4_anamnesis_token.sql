-- Anonymous token submission with a clinical flag. The entire fixture rolls back.
begin;

do $fixture$
declare
  v_professional uuid := gen_random_uuid();
  v_patient uuid := gen_random_uuid();
  v_episode uuid;
  v_record uuid := gen_random_uuid();
  v_token uuid := gen_random_uuid();
begin
  perform set_config('qa.patient_id', v_patient::text, true);
  perform set_config('qa.record_id', v_record::text, true);
  perform set_config('qa.token', v_token::text, true);
  insert into auth.users (id, aud, role, email, raw_user_meta_data)
  values
    (v_professional, 'authenticated', 'authenticated',
      'wave4-' || v_professional || '@example.invalid',
      '{"name":"Wave 4 professional","user_type":"nutritionist"}'::jsonb),
    (v_patient, 'authenticated', 'authenticated',
      'wave4-' || v_patient || '@example.invalid',
      '{"name":"Wave 4 patient","user_type":"patient"}'::jsonb);
  update public.user_profiles set nutritionist_id = v_professional where id = v_patient;
  insert into public.nutritionist_patients (nutritionist_id, patient_id, status)
  values (v_professional, v_patient, 'active');
  select id into v_episode from public.care_episodes
  where patient_id = v_patient and nutritionist_id = v_professional and status = 'active'
  limit 1;
  if v_episode is null then
    v_episode := gen_random_uuid();
    insert into public.care_episodes (id, patient_id, nutritionist_id, status)
    values (v_episode, v_patient, v_professional, 'active');
  end if;
  insert into public.anamnesis_records
    (id, patient_id, nutritionist_id, care_episode_id, content, status,
     template_snapshot, public_access_token, token_expires_at, filled_by)
  values
    (v_record, v_patient, v_professional, v_episode, '{}'::jsonb, 'in_progress',
     '{"sections":[{"fields":[{"id":"symptom","label":"Sintoma","clinical_flag_key":"symptom_flag"}]}]}'::jsonb,
     v_token, now() + interval '1 hour', 'patient');
end;
$fixture$;

set local role anon;

do $assertions$
declare
  v_result jsonb;
  v_error text;
begin
  perform set_config('request.jwt.claim.role', 'anon', true);
  begin
    perform public.submit_anamnesis_by_token(
      current_setting('qa.token')::uuid, '{"symptom":"yes"}'::jsonb,
      'submitted', false, null, null);
    raise exception 'QA_CONSENT_BYPASS_ALLOWED';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'LGPD_CONSENT_REQUIRED' then raise; end if;
  end;
  select public.submit_anamnesis_by_token(
    current_setting('qa.token')::uuid, '{"symptom":"yes"}'::jsonb,
    'submitted', true, null, null) into v_result;
  if v_result->>'success' <> 'true' then raise exception 'QA_TOKEN_SUBMISSION_FAILED'; end if;
  begin
    perform public.submit_anamnesis_by_token(
      current_setting('qa.token')::uuid, '{"symptom":"yes"}'::jsonb,
      'submitted', true, null, null);
    raise exception 'QA_TOKEN_REPLAY_ALLOWED';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'TOKEN_INVALID_OR_EXPIRED' then raise; end if;
  end;

  -- Assertions run as the database owner below because anon has no direct
  -- SELECT on clinical tables.
end;
$assertions$;

reset role;

do $persistence$
declare
  v_status text;
  v_token_after uuid;
  v_flag jsonb;
begin
  select status, public_access_token into v_status, v_token_after
  from public.anamnesis_records where id = current_setting('qa.record_id')::uuid;
  if v_status <> 'submitted' or v_token_after is not null then
    raise exception 'QA_SUBMISSION_NOT_FINALIZED';
  end if;
  select clinical_flags->'symptom_flag' into v_flag
  from public.user_profiles where id = current_setting('qa.patient_id')::uuid;
  if v_flag->>'value' <> 'yes' then raise exception 'QA_CLINICAL_FLAG_NOT_SAVED'; end if;
end;
$persistence$;

rollback;

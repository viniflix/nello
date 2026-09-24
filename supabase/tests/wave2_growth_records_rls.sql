-- Execute as the database owner. Every fixture and probe is rolled back.
-- No clinical record or profile remains after this script.
begin;

do $fixture$
declare
  v_patient uuid := gen_random_uuid();
  v_professional uuid := gen_random_uuid();
  v_active_episode uuid := gen_random_uuid();
  v_ended_episode uuid := gen_random_uuid();
begin
  perform set_config('qa.patient_id', v_patient::text, true);
  perform set_config('qa.professional_id', v_professional::text, true);
  perform set_config('qa.active_episode_id', v_active_episode::text, true);
  perform set_config('qa.ended_episode_id', v_ended_episode::text, true);

  -- Auth trigger creates each profile; the reserved .invalid addresses never
  -- receive mail and the surrounding transaction removes both identities.
  insert into auth.users (id, aud, role, email, raw_user_meta_data)
  values
    (v_professional, 'authenticated', 'authenticated',
      'wave2-' || v_professional || '@example.invalid',
      '{"name":"Wave 2 QA professional","user_type":"nutritionist"}'::jsonb),
    (v_patient, 'authenticated', 'authenticated',
      'wave2-' || v_patient || '@example.invalid',
      '{"name":"Wave 2 QA patient","user_type":"patient"}'::jsonb);
  update public.user_profiles
  set nutritionist_id = v_professional
  where id = v_patient;
  insert into public.care_episodes (id, patient_id, nutritionist_id, status)
  values (v_active_episode, v_patient, v_professional, 'active');
  insert into public.care_episodes (id, patient_id, nutritionist_id, status, ended_at, end_reason)
  values (v_ended_episode, v_patient, v_professional, 'ended', now(), 'QA fixture');
end;
$fixture$;

set local role authenticated;

do $assertions$
declare
  v_patient uuid := current_setting('qa.patient_id')::uuid;
  v_professional uuid := current_setting('qa.professional_id')::uuid;
  v_active_episode uuid := current_setting('qa.active_episode_id')::uuid;
  v_ended_episode uuid := current_setting('qa.ended_episode_id')::uuid;
  v_record_id bigint;
  v_rows integer;
  v_message text;
  v_state text;
begin
  perform set_config('request.jwt.claim.sub', v_patient::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  begin
    insert into public.growth_records
      (patient_id, care_episode_id, record_date, weight, height)
    values (v_patient, v_active_episode, current_date, 70, 170);
    raise exception 'QA_PATIENT_CLINICAL_INSERT_WAS_ALLOWED';
  exception when others then
    get stacked diagnostics v_message = message_text, v_state = returned_sqlstate;
    if v_state <> '42501' or position('row-level security' in lower(v_message)) = 0 then
      raise;
    end if;
  end;

  insert into public.patient_progress_measurements
    (patient_id, record_date, weight)
  values (v_patient, current_date, 70);

  perform set_config('request.jwt.claim.sub', v_professional::text, true);
  insert into public.growth_records
    (patient_id, care_episode_id, record_date, weight, height)
  values (v_patient, v_active_episode, current_date, 70, 170)
  returning id into v_record_id;

  perform set_config('request.jwt.claim.sub', v_patient::text, true);
  update public.growth_records set notes = 'forbidden QA edit' where id = v_record_id;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'QA_PATIENT_CLINICAL_UPDATE_WAS_ALLOWED'; end if;

  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  select count(*) into v_rows from public.growth_records where id = v_record_id;
  if v_rows <> 0 then raise exception 'QA_OTHER_TENANT_READ_WAS_ALLOWED'; end if;

  perform set_config('request.jwt.claim.sub', v_professional::text, true);
  update public.growth_records set notes = 'authorized QA edit' where id = v_record_id;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'QA_PROFESSIONAL_CLINICAL_UPDATE_DENIED'; end if;

  begin
    insert into public.growth_records
      (patient_id, care_episode_id, record_date, weight, height)
    values (v_patient, v_ended_episode, current_date, 70, 170);
    raise exception 'QA_ENDED_EPISODE_INSERT_WAS_ALLOWED';
  exception when others then
    get stacked diagnostics v_message = message_text, v_state = returned_sqlstate;
    if v_state <> '42501' or position('row-level security' in lower(v_message)) = 0 then
      raise;
    end if;
  end;
end;
$assertions$;

rollback;

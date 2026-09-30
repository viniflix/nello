-- C7: authenticated, minimized and on-demand data portability snapshot.
-- The snapshot is not persisted. Binary files remain private and are fetched separately
-- through the existing short-lived, re-authorized attachment contract.

create or replace function private.export_subject_rows(
  p_table regclass,
  p_subject_column name,
  p_subject_id uuid,
  p_redacted_keys text[] default '{}'::text[]
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(source_row) - $2), ''[]''::jsonb) from %s source_row where %I = $1',
    p_table,
    p_subject_column
  ) into v_rows using p_subject_id, p_redacted_keys;
  return v_rows;
end;
$$;

revoke all on function private.export_subject_rows(regclass, name, uuid, text[]) from public, anon, authenticated;

create or replace function public.build_my_data_export_snapshot()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_profile jsonb;
  v_categories jsonb;
  v_attachments jsonb;
  v_chats jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select to_jsonb(profile_row)
         - array['is_admin', 'simulation_owner_id', 'invite_code', 'patient_invite_code']::text[]
    into v_profile
    from public.user_profiles profile_row
   where profile_row.id = v_actor
     and profile_row.user_type = 'patient';

  if v_profile is null then
    raise exception using errcode = '42501', message = 'patient_export_only';
  end if;

  v_attachments := private.export_subject_rows(
    'public.clinical_attachments'::regclass,
    'patient_id',
    v_actor,
    array['storage_bucket', 'storage_path', 'upload_expires_at']
  );
  select coalesce(jsonb_agg(to_jsonb(chat_row) - 'media_url' order by chat_row.created_at), '[]'::jsonb)
    into v_chats from public.chats chat_row where chat_row.from_id=v_actor or chat_row.to_id=v_actor;

  v_categories := jsonb_build_object(
    'care_episodes', private.export_subject_rows('public.care_episodes'::regclass, 'patient_id', v_actor),
    'care_relationships', private.export_subject_rows('public.nutritionist_patients'::regclass, 'patient_id', v_actor),
    'archived_care_relationships', private.export_subject_rows('public.archived_patient_links'::regclass, 'patient_id', v_actor),
    'anamneses', private.export_subject_rows(
      'public.anamnesis_records'::regclass,
      'patient_id',
      v_actor,
      array['public_access_token', 'token_expires_at', 'lgpd_ip_address']
    ),
    'appointments', private.export_subject_rows('public.appointments'::regclass, 'patient_id', v_actor),
    'checkins', private.export_subject_rows(
      'public.checkin_sessions'::regclass,
      'patient_id',
      v_actor,
      array['token']
    ),
    'clinical_records', private.export_subject_rows('public.clinical_records'::regclass, 'patient_id', v_actor),
    'clinical_attachments', v_attachments,
    'clinical_attachment_events', private.export_subject_rows('public.clinical_attachment_events'::regclass, 'patient_id', v_actor),
    'clinical_amendments', private.export_subject_rows('public.clinical_record_amendments'::regclass, 'patient_id', v_actor),
    'official_documents', private.export_subject_rows('public.document_artifacts'::regclass, 'patient_id', v_actor),
    'anthropometry', private.export_subject_rows('public.growth_records'::regclass, 'patient_id', v_actor),
    'energy_calculations', private.export_subject_rows('public.energy_expenditure_calculations'::regclass, 'patient_id', v_actor),
    'glycemia', private.export_subject_rows('public.glycemia_records'::regclass, 'patient_id', v_actor),
    'laboratory_results', private.export_subject_rows(
      'public.lab_results'::regclass,
      'patient_id',
      v_actor,
      array['pdf_url']
    ),
    'goals', private.export_subject_rows('public.patient_goals'::regclass, 'patient_id', v_actor),
    'meal_plans', private.export_subject_rows('public.meal_plans'::regclass, 'patient_id', v_actor),
    'food_diary', private.export_subject_rows(
      'public.meals'::regclass,
      'patient_id',
      v_actor,
      array['photo_url']
    ),
    'food_diary_audit', private.export_subject_rows('public.meal_audit_log'::regclass, 'patient_id', v_actor),
    'food_diary_edit_history', private.export_subject_rows('public.meal_edit_history'::regclass, 'patient_id', v_actor),
    'meal_plan_versions', private.export_subject_rows('public.meal_plan_versions'::regclass, 'patient_id', v_actor),
    'prescriptions', private.export_subject_rows('public.prescriptions'::regclass, 'patient_id', v_actor),
    'progress_photos', private.export_subject_rows(
      'public.progress_photos'::regclass,
      'patient_id',
      v_actor,
      array['photo_url', 'storage_path']
    ),
    'progress_photo_events', private.export_subject_rows('public.progress_photo_events'::regclass, 'patient_id', v_actor),
    'legal_guardians', private.export_subject_rows('public.patient_episode_legal_guardians'::regclass, 'patient_id', v_actor, array['cpf_fingerprint']),
    'reminder_preferences', private.export_subject_rows('public.patient_reminder_preferences'::regclass, 'patient_id', v_actor),
    'module_sync_flags', private.export_subject_rows('public.patient_module_sync_flags'::regclass, 'patient_id', v_actor),
    'financial_records', private.export_subject_rows('public.financial_records'::regclass, 'patient_id', v_actor, array['attachment_url']),
    'financial_transactions', private.export_subject_rows('public.financial_transactions'::regclass, 'patient_id', v_actor),
    'messages', v_chats,
    'dispatched_communications', private.export_subject_rows('public.template_dispatch_log'::regclass, 'patient_id', v_actor),
    'supplement_logs', private.export_subject_rows('public.supplement_logs'::regclass, 'patient_id', v_actor),
    'weekly_summaries', private.export_subject_rows('public.weekly_summaries'::regclass, 'patient_id', v_actor),
    'achievements', private.export_subject_rows('public.user_achievements'::regclass, 'user_id', v_actor),
    'notifications', private.export_subject_rows(
      'public.notifications'::regclass,
      'user_id',
      v_actor,
      array['link_url']
    ),
    'notification_events', private.export_subject_rows('public.notification_events'::regclass, 'user_id', v_actor),
    'activity_history', private.export_subject_rows('public.activity_log'::regclass, 'patient_id', v_actor)
  );

  insert into public.activity_log(event_name, occurred_at, payload, patient_id, source_module, actor_user_id)
  values ('patient_data_export_generated', statement_timestamp(), jsonb_build_object('schema_version', 'nello-portability-1'), v_actor, 'privacy', v_actor);

  return jsonb_build_object(
    'schema_version', 'nello-portability-1',
    'generated_at', statement_timestamp(),
    'data_controller', 'Nello',
    'subject', v_profile,
    'categories', v_categories,
    'attachment_manifest', v_attachments,
    'scope_notice', 'Copia de portabilidade gerada pelo titular. URLs temporarias, segredos, tokens e dados tecnicos de seguranca foram omitidos.'
  );
end;
$$;

revoke all on function public.build_my_data_export_snapshot() from public, anon, authenticated;
grant execute on function public.build_my_data_export_snapshot() to authenticated, service_role;

comment on function public.build_my_data_export_snapshot() is
  'C7: creates an ephemeral, authenticated patient portability snapshot without storage URLs, secrets or raw security telemetry.';

create or replace function public.authorize_my_data_export_attachment(p_attachment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_attachment public.clinical_attachments%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select * into v_attachment
    from public.clinical_attachments
   where id = p_attachment_id
     and patient_id = v_actor
     and upload_confirmed_at is not null
     and status in ('active', 'invalidated');

  if not found then
    raise exception using errcode = '42501', message = 'data_export_attachment_forbidden';
  end if;

  insert into public.activity_log(event_name, occurred_at, payload, patient_id, source_module, actor_user_id)
  values (
    'patient_data_export_attachment_authorized',
    statement_timestamp(),
    jsonb_build_object('attachment_id', v_attachment.id),
    v_actor,
    'privacy',
    v_actor
  );

  return jsonb_build_object(
    'attachment_id', v_attachment.id,
    'storage_bucket', v_attachment.storage_bucket,
    'storage_path', v_attachment.storage_path,
    'expires_in', 300,
    'authorization_expires_at', statement_timestamp() + interval '300 seconds'
  );
end;
$$;

revoke all on function public.authorize_my_data_export_attachment(uuid) from public, anon, authenticated;
grant execute on function public.authorize_my_data_export_attachment(uuid) to authenticated, service_role;

comment on function public.authorize_my_data_export_attachment(uuid) is
  'C7: re-authorizes one patient-owned attachment for a 300-second portability download and records the access.';

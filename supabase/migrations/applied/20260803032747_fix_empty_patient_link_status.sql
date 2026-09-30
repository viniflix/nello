-- Keep the relationship row inside its established status domain. Visibility is
-- controlled by care_episodes.end_reason = 'empty_profile_removed'.
create or replace function public.remove_empty_patient(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_status jsonb;
  v_episode public.care_episodes%rowtype;
  v_snapshot jsonb;
begin
  if v_actor is null then
    raise exception 'AutenticaÃ§Ã£o obrigatÃ³ria.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_patient_id::text, 0));
  v_status := private.empty_patient_removal_status(p_patient_id);

  if not coalesce((v_status ->> 'can_remove')::boolean, false) then
    raise exception 'Este cadastro nÃ£o pode ser removido: %.', coalesce(v_status ->> 'reason', 'unknown')
      using errcode = 'P0001';
  end if;

  select * into strict v_episode
  from public.care_episodes
  where id = (v_status ->> 'care_episode_id')::uuid
  for update;

  v_snapshot := private.minimal_patient_snapshot(p_patient_id);

  update public.care_episodes
  set status = 'ended',
      ended_at = now(),
      ended_by = v_actor,
      end_reason = 'empty_profile_removed',
      patient_snapshot = coalesce(nullif(patient_snapshot, '{}'::jsonb), v_snapshot),
      updated_at = now()
  where id = v_episode.id;

  update public.nutritionist_patients
  set status = 'ended'
  where nutritionist_id = v_actor
    and patient_id = p_patient_id
    and status = 'active';

  update public.user_profiles
  set nutritionist_id = null
  where id = p_patient_id
    and nutritionist_id = v_actor;

  insert into private.empty_patient_removal_audit (
    patient_id, nutritionist_id, care_episode_id, removed_by, patient_snapshot
  ) values (
    p_patient_id, v_actor, v_episode.id, v_actor, coalesce(v_snapshot, '{}'::jsonb)
  );

  perform private.write_care_episode_activity(
    'care_episode.empty_profile_removed',
    v_episode,
    v_actor,
    'empty_profile_removed'
  );

  return jsonb_build_object('success', true, 'patient_id', p_patient_id);
end;
$function$;

revoke all on function public.remove_empty_patient(uuid) from public, anon;
grant execute on function public.remove_empty_patient(uuid) to authenticated;

begin;

do $$
begin
  if to_regprocedure('private.auto_approve_prelaunch_nutritionist()') is null then
    raise exception 'prelaunch_auto_approval_function_missing';
  end if;
  if to_regprocedure('private.sync_care_episode_for_active_link()') is null then
    raise exception 'care_episode_sync_function_missing';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.user_profiles'::regclass
      and tgname = 'trg_auto_approve_prelaunch_nutritionist'
      and not tgisinternal
  ) then
    raise exception 'prelaunch_auto_approval_trigger_missing';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.nutritionist_patients'::regclass
      and tgname = 'trg_sync_care_episode_for_active_link'
      and not tgisinternal
  ) then
    raise exception 'care_episode_sync_trigger_missing';
  end if;

  if exists (
    select 1
    from pg_proc p
    where p.oid in (
      'private.auto_approve_prelaunch_nutritionist()'::regprocedure,
      'private.sync_care_episode_for_active_link()'::regprocedure
    )
      and (
        not p.prosecdef
        or p.proconfig is distinct from array['search_path=""']
      )
  ) then
    raise exception 'prelaunch_private_function_not_hardened';
  end if;

  raise notice 'PASS: temporary approval and episode sync contracts exist';
end
$$;

do $$
begin
  if exists (
    select 1
    from public.user_profiles p
    where p.user_type = 'nutritionist'
      and not private.has_current_clinical_capacity(p.id)
  ) then
    raise exception 'current_nutritionist_without_clinical_capacity';
  end if;

  if exists (
    select 1
    from public.nutritionist_patients np
    where np.status = 'active'
      and not exists (
        select 1
        from public.care_episodes ce
        where ce.patient_id = np.patient_id
          and ce.nutritionist_id = np.nutritionist_id
          and ce.status = 'active'
      )
  ) then
    raise exception 'active_link_without_matching_active_episode';
  end if;

  if exists (
    select 1
    from public.nutritionist_patients np
    join public.care_episodes ce
      on ce.patient_id = np.patient_id
     and ce.status = 'active'
    where np.status = 'active'
      and ce.nutritionist_id <> np.nutritionist_id
  ) then
    raise exception 'active_link_episode_owner_mismatch';
  end if;

  raise notice 'PASS: current testers and active care episodes are coherent';
end
$$;

rollback;

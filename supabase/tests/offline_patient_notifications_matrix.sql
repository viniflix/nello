begin;

do $matrix$
begin
  if pg_get_functiondef('private.start_care_episode(uuid,text)'::regprocedure)
      !~* 'select episode[.][*] into v_episode' then
    raise exception 'start_care_episode_does_not_reuse_synced_episode';
  end if;

  if pg_get_functiondef('private.notify_care_episode_participant(uuid,text,text,text,uuid)'::regprocedure)
      !~* 'auth[.]users' then
    raise exception 'care_episode_notification_does_not_guard_offline_profiles';
  end if;

  if pg_get_functiondef('private.create_daily_log_reminders()'::regprocedure)
      !~* 'join auth[.]users' then
    raise exception 'daily_reminders_do_not_filter_platform_accounts';
  end if;

  if pg_get_functiondef('private.create_daily_log_reminders()'::regprocedure)
      !~* 'episode[.]status = ''active''' then
    raise exception 'daily_reminders_do_not_require_active_care';
  end if;

  if pg_get_functiondef('private.create_appointment_reminders()'::regprocedure)
      !~* 'join auth[.]users' then
    raise exception 'appointment_reminders_do_not_filter_platform_accounts';
  end if;

  if has_function_privilege('authenticated',
      'private.notify_care_episode_participant(uuid,text,text,text,uuid)', 'execute') then
    raise exception 'private_notification_helper_exposed';
  end if;

  if has_function_privilege('authenticated', 'public.create_daily_log_reminders()', 'execute')
      or has_function_privilege('anon', 'public.create_daily_log_reminders()', 'execute') then
    raise exception 'daily_scheduler_exposed_to_clients';
  end if;

  if has_function_privilege('authenticated', 'public.create_appointment_reminders()', 'execute')
      or has_function_privilege('anon', 'public.create_appointment_reminders()', 'execute') then
    raise exception 'appointment_scheduler_exposed_to_clients';
  end if;
end;
$matrix$;

rollback;

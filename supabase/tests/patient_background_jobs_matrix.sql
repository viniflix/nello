begin;

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'process_patient_reminders'
      and p.prosecdef
  ) then
    raise exception 'private_reminder_function_not_hardened';
  end if;

  if has_function_privilege('authenticated', 'private.process_patient_reminders(uuid)', 'execute') then
    raise exception 'private_reminder_function_exposed';
  end if;

  if not has_function_privilege('authenticated', 'public.process_patient_reminders(uuid)', 'execute') then
    raise exception 'public_reminder_function_unavailable';
  end if;

  if pg_get_functiondef('private.process_patient_reminders(uuid)'::regprocedure)
      !~ 'pg_advisory_xact_lock' then
    raise exception 'reminder_concurrency_lock_missing';
  end if;

  if pg_get_functiondef('private.process_patient_reminders(uuid)'::regprocedure)
      !~ 'at time zone v_timezone' then
    raise exception 'reminder_patient_timezone_missing';
  end if;
end;
$$;

rollback;

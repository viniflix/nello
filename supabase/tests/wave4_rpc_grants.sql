-- Catalog regression for the Wave 4 RPC exposure review.
do $checks$
begin
  if has_function_privilege('anon', 'public.get_meal_plan_with_foods_optimized(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.get_meal_plan_with_foods_optimized(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'private.get_meal_plan_with_foods_optimized(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'private.get_meal_plan_with_foods_optimized(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.transition_appointment_status(uuid,text,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.transition_appointment_status(uuid,text,text)', 'EXECUTE')
    or has_function_privilege('anon', 'private.transition_appointment_status(uuid,text,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'private.transition_appointment_status(uuid,text,text)', 'EXECUTE') then
    raise exception 'WAVE4_LEGACY_RPC_EXPOSED';
  end if;

  if has_function_privilege('anon', 'public.get_financial_summary(date,date)', 'EXECUTE')
    or has_function_privilege('anon', 'private.get_financial_summary(date,date)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.get_financial_summary(date,date)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'private.get_financial_summary(date,date)', 'EXECUTE') then
    raise exception 'WAVE4_FINANCIAL_GRANTS_WRONG';
  end if;

  if has_function_privilege('anon', 'public.transition_appointment_status(bigint,text,text)', 'EXECUTE')
    or has_function_privilege('anon', 'private.transition_appointment_status(bigint,text,text)', 'EXECUTE')
    or has_function_privilege('anon', 'private.set_active_meal_plan(bigint)', 'EXECUTE')
    or has_function_privilege('anon', 'private.assert_plan_ready_to_activate(bigint,uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.transition_appointment_status(bigint,text,text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'private.set_active_meal_plan(bigint)', 'EXECUTE') then
    raise exception 'WAVE4_WORKFLOW_GRANTS_WRONG';
  end if;
end;
$checks$;

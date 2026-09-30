-- These mutations require an authenticated actor. Their internal guards
-- already reject auth.uid() = null; remove the unnecessary anonymous grants.
revoke execute on function public.transition_appointment_status(bigint, text, text)
  from public, anon;
revoke execute on function private.transition_appointment_status(bigint, text, text)
  from public, anon;
grant execute on function public.transition_appointment_status(bigint, text, text)
  to authenticated;
grant execute on function private.transition_appointment_status(bigint, text, text)
  to authenticated;

revoke execute on function private.set_active_meal_plan(bigint)
  from public, anon;
revoke execute on function private.assert_plan_ready_to_activate(bigint, uuid)
  from public, anon;
grant execute on function private.set_active_meal_plan(bigint)
  to authenticated;
grant execute on function private.assert_plan_ready_to_activate(bigint, uuid)
  to authenticated;

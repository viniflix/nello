-- Legacy UUID signatures predate bigint IDs in meal_plans and appointments.
-- They are not used by the current client and must not remain callable through
-- public wrappers or directly through the private schema.
revoke execute on function public.get_meal_plan_with_foods_optimized(uuid)
  from public, anon, authenticated;
revoke execute on function private.get_meal_plan_with_foods_optimized(uuid)
  from public, anon, authenticated;

revoke execute on function public.transition_appointment_status(uuid, text, text)
  from public, anon, authenticated;
revoke execute on function private.transition_appointment_status(uuid, text, text)
  from public, anon, authenticated;

-- This summary scopes its rows to auth.uid(); anonymous callers have no
-- legitimate financial workflow. Preserve authenticated access.
revoke execute on function public.get_financial_summary(date, date)
  from public, anon;
revoke execute on function private.get_financial_summary(date, date)
  from public, anon;
grant execute on function public.get_financial_summary(date, date)
  to authenticated;
grant execute on function private.get_financial_summary(date, date)
  to authenticated;

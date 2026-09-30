revoke all on function public.start_care_episode(uuid, text) from public, anon, authenticated;
revoke all on function public.end_care_episode(uuid, text) from public, anon, authenticated;
grant execute on function public.start_care_episode(uuid, text) to service_role;
grant execute on function public.end_care_episode(uuid, text) to service_role;

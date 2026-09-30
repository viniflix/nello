revoke execute on function public.extract_and_inject_clinical_flags(uuid) from public;
revoke execute on function public.generate_anamnesis_link(uuid, uuid, integer) from public;
grant execute on function public.extract_and_inject_clinical_flags(uuid) to authenticated, service_role;
grant execute on function public.generate_anamnesis_link(uuid, uuid, integer) to authenticated, service_role;

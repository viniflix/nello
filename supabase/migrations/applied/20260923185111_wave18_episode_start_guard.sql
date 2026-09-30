-- An episode may only be restored for a link the patient has already approved.
create or replace function public.start_care_episode(
  p_patient_id uuid, p_start_reason text default 'care_started'
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.nutritionist_patients np
    where np.patient_id=p_patient_id and np.nutritionist_id=auth.uid()
      and np.status='active'
  ) then
    raise exception 'ACTIVE_PATIENT_LINK_REQUIRED' using errcode='42501';
  end if;
  return private.start_care_episode(p_patient_id,p_start_reason);
end;
$function$;

revoke execute on function private.start_care_episode(uuid,text) from public, anon, authenticated;

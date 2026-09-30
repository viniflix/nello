-- Keep the same tenant/visibility checks while allowing patient-wide listings.
-- Passing NULL (or omitting the second argument) now selects every authorized
-- episode for the patient. The RPC never exposes another patient's artifacts.
create or replace function public.list_document_artifacts(
  p_patient_id uuid,
  p_episode_id uuid default null
)
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_document_artifact(a.id)
  from public.document_artifacts a
  where a.patient_id = p_patient_id
    and (p_episode_id is null or a.care_episode_id = p_episode_id)
    and (
      auth.uid() in (a.professional_id, a.preparer_id, coalesce(a.supervisor_id, a.professional_id))
      or (
        auth.uid() = a.patient_id
        and a.status in ('signed', 'invalidated', 'superseded')
        and a.visibility = 'shared_with_patient'
      )
    )
  order by a.created_at desc;
$$;

revoke all on function public.list_document_artifacts(uuid, uuid) from public, anon;
grant execute on function public.list_document_artifacts(uuid, uuid) to authenticated;

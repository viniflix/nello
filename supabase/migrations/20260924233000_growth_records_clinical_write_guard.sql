-- Wave 2: self-reported weight/height belongs in patient_progress_measurements.
-- Existing permissive policies also allowed the patient to write directly to
-- growth_records. A restrictive policy is ANDed with those policies without
-- changing their read behavior or rewriting any historical clinical record.

create policy growth_records_clinical_insert_guard
on public.growth_records as restrictive for insert to authenticated
with check (
  care_episode_id is not null
  and exists (
    select 1 from public.care_episodes ce
    where ce.id = growth_records.care_episode_id
      and ce.patient_id = growth_records.patient_id
      and ce.nutritionist_id = (select auth.uid())
      and ce.status = 'active'
  )
);

create policy growth_records_clinical_update_guard
on public.growth_records as restrictive for update to authenticated
using (
  exists (
    select 1 from public.care_episodes ce
    where ce.id = growth_records.care_episode_id
      and ce.patient_id = growth_records.patient_id
      and ce.nutritionist_id = (select auth.uid())
  )
  or (
    care_episode_id is null
    and exists (
      select 1 from public.user_profiles up
      where up.id = growth_records.patient_id
        and up.nutritionist_id = (select auth.uid())
        and up.is_active is true
    )
  )
)
with check (
  exists (
    select 1 from public.care_episodes ce
    where ce.id = growth_records.care_episode_id
      and ce.patient_id = growth_records.patient_id
      and ce.nutritionist_id = (select auth.uid())
  )
  or (
    care_episode_id is null
    and exists (
      select 1 from public.user_profiles up
      where up.id = growth_records.patient_id
        and up.nutritionist_id = (select auth.uid())
        and up.is_active is true
    )
  )
);

-- The current care team can review measurements reported by the patient.
create policy patient_progress_measurements_care_team_select
  on public.patient_progress_measurements
  for select to authenticated
  using (
    exists (
      select 1 from public.care_episodes e
      where e.patient_id = patient_progress_measurements.patient_id
        and e.status = 'active'
        and private.can_read_care_episode(e.id)
    )
  );

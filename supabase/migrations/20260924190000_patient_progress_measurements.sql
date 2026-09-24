-- Restore authorized clinical reads/writes while keeping clinical revisions protected.
create policy growth_records_read_participants on public.growth_records
  for select to authenticated
  using (
    patient_id = (select auth.uid())
    or (care_episode_id is not null and private.can_read_care_episode(care_episode_id))
  );

create policy growth_records_insert_professional on public.growth_records
  for insert to authenticated
  with check (
    care_episode_id is not null
    and private.can_write_active_care_episode(care_episode_id)
    and created_by_user_id = (select auth.uid())
    and confirmed_by = (select auth.uid())
  );

-- Self-reported measures do not claim clinical validation and accept partial entries.
create table public.patient_progress_measurements (
  id bigint generated always as identity primary key,
  patient_id uuid not null references auth.users(id) on delete cascade,
  record_date date not null,
  weight numeric(6,2) check (weight is null or weight between 20 and 350),
  height numeric(6,2) check (height is null or height between 100 and 250),
  head_circumference numeric(6,2) check (head_circumference is null or head_circumference between 20 and 80),
  created_at timestamptz not null default now(),
  constraint patient_progress_has_measure check (weight is not null or height is not null or head_circumference is not null),
  constraint patient_progress_date_valid check (record_date <= current_date + 1)
);

create index patient_progress_measurements_patient_date_idx
  on public.patient_progress_measurements(patient_id, record_date desc, id desc);

alter table public.patient_progress_measurements enable row level security;
revoke all on public.patient_progress_measurements from public, anon;
grant select, insert on public.patient_progress_measurements to authenticated;
grant usage, select on sequence public.patient_progress_measurements_id_seq to authenticated;

create policy patient_progress_measurements_self_select on public.patient_progress_measurements
  for select to authenticated using (patient_id = (select auth.uid()));

create policy patient_progress_measurements_self_insert on public.patient_progress_measurements
  for insert to authenticated with check (patient_id = (select auth.uid()));

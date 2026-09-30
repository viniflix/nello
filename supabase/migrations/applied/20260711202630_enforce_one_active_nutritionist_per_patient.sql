create unique index if not exists nutritionist_patients_one_active_nutritionist_per_patient
  on public.nutritionist_patients (patient_id)
  where status = 'active';

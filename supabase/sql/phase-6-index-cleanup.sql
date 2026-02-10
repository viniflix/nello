-- Fase 6: limpeza pontual de indices duplicados
-- Apenas duplicados confirmados pelo linter.
-- Execute em horario de baixo uso.

begin;

-- meals: manter idx_meals_patient_date
drop index if exists public.idx_meals_patient_created;

-- prescriptions: manter idx_prescriptions_patient_id
drop index if exists public.idx_prescriptions_patient;

commit;

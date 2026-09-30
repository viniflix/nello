ALTER TABLE public.energy_expenditure_calculations
  ADD COLUMN IF NOT EXISTS body_fat_percentage numeric,
  ADD COLUMN IF NOT EXISTS tmb_protocol text,
  ADD COLUMN IF NOT EXISTS tmb_result numeric,
  ADD COLUMN IF NOT EXISTS injury_factor numeric DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS mets_activities jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS get_result numeric,
  ADD COLUMN IF NOT EXISTS venta_target_weight numeric,
  ADD COLUMN IF NOT EXISTS venta_timeframe_days integer,
  ADD COLUMN IF NOT EXISTS venta_adjustment_kcal numeric,
  ADD COLUMN IF NOT EXISTS final_planned_kcal numeric,
  ADD COLUMN IF NOT EXISTS gender text;

COMMENT ON COLUMN public.energy_expenditure_calculations.tmb_protocol IS 'Protocolo TMB: mifflin, harris, cunningham, fao, tinsley';
COMMENT ON COLUMN public.energy_expenditure_calculations.mets_activities IS 'Array de atividades extras [{name, met, duration_min, kcal}]';
COMMENT ON COLUMN public.energy_expenditure_calculations.final_planned_kcal IS 'Meta calórica final (GET + ajuste VENTA)';

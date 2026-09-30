-- Templates de plano alimentar não têm data de início — permitir NULL
ALTER TABLE meal_plans ALTER COLUMN start_date DROP NOT NULL;

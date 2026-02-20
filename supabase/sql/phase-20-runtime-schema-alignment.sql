-- Phase 20: Runtime schema alignment for legacy frontend contracts
-- Goal:
-- 1) Adopt growth_records as canonical anthropometry table
-- 2) Create missing runtime tables used by current frontend
-- 3) Add compatibility columns to meal_plans
-- 4) Provide core RPC helpers expected by app

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------
-- 1) meal_plans compatibility columns
-- -----------------------------------------------------
ALTER TABLE IF EXISTS public.meal_plans
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS active_days text[] DEFAULT ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS daily_calories numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_protein numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_carbs numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_fat numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS template_tags text[];

UPDATE public.meal_plans
SET
  name = COALESCE(name, title, 'Plano alimentar'),
  description = COALESCE(description, notes),
  start_date = COALESCE(start_date, created_at::date),
  is_active = COALESCE(is_active, status = 'active')
WHERE
  name IS NULL
  OR description IS NULL
  OR start_date IS NULL;

-- -----------------------------------------------------
-- 2) growth_records (canonical)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.growth_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  nutritionist_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  record_date date NOT NULL DEFAULT CURRENT_DATE,
  weight numeric,
  height numeric,
  notes text,
  circumferences jsonb DEFAULT '{}'::jsonb,
  skinfolds jsonb DEFAULT '{}'::jsonb,
  bone_diameters jsonb DEFAULT '{}'::jsonb,
  bioimpedance jsonb DEFAULT '{}'::jsonb,
  photos text[],
  results jsonb DEFAULT '{}'::jsonb,
  supersedes_record_id uuid REFERENCES public.growth_records(id) ON DELETE SET NULL,
  revision_group_id uuid,
  revision_number integer NOT NULL DEFAULT 1,
  is_latest_revision boolean NOT NULL DEFAULT true,
  change_reason text,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_records_patient_date
  ON public.growth_records(patient_id, record_date DESC);

CREATE INDEX IF NOT EXISTS idx_growth_records_revision_group
  ON public.growth_records(revision_group_id, revision_number DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_growth_records_latest_unique
  ON public.growth_records(revision_group_id)
  WHERE is_latest_revision = true;

-- -----------------------------------------------------
-- 3) Core runtime tables missing in current project
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.energy_expenditure_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  nutritionist_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  method text,
  sex text,
  age integer,
  weight numeric,
  height numeric,
  tmb numeric,
  get numeric,
  activity_factor numeric,
  goal_adjustment numeric,
  target_calories numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_energy_expenditure_patient_created_at
  ON public.energy_expenditure_calculations(patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.patient_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  nutritionist_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  goal_type text NOT NULL,
  title text NOT NULL,
  description text,
  initial_weight numeric,
  target_weight numeric,
  current_weight numeric,
  start_date date,
  target_date date,
  is_realistic boolean NOT NULL DEFAULT true,
  viability_score integer NOT NULL DEFAULT 5,
  viability_notes text,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_daily_deficit numeric,
  daily_calorie_goal numeric,
  energy_expenditure_id uuid REFERENCES public.energy_expenditure_calculations(id) ON DELETE SET NULL,
  meal_plan_id uuid REFERENCES public.meal_plans(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  progress_percentage numeric NOT NULL DEFAULT 0,
  completion_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_goals_patient_status
  ON public.patient_goals(patient_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.meal_plan_meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id uuid NOT NULL REFERENCES public.meal_plans(id) ON DELETE CASCADE,
  name text NOT NULL,
  meal_type text,
  meal_time time,
  notes text,
  order_index integer NOT NULL DEFAULT 0,
  total_calories numeric NOT NULL DEFAULT 0,
  total_protein numeric NOT NULL DEFAULT 0,
  total_carbs numeric NOT NULL DEFAULT 0,
  total_fat numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meal_plan_meals_plan_order
  ON public.meal_plan_meals(meal_plan_id, order_index);

CREATE TABLE IF NOT EXISTS public.meal_plan_foods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_meal_id uuid NOT NULL REFERENCES public.meal_plan_meals(id) ON DELETE CASCADE,
  food_id uuid,
  quantity numeric NOT NULL DEFAULT 1,
  unit text,
  calories numeric NOT NULL DEFAULT 0,
  protein numeric NOT NULL DEFAULT 0,
  carbs numeric NOT NULL DEFAULT 0,
  fat numeric NOT NULL DEFAULT 0,
  notes text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meal_plan_foods_meal_order
  ON public.meal_plan_foods(meal_plan_meal_id, order_index);

CREATE TABLE IF NOT EXISTS public.meal_plan_reference_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id uuid NOT NULL UNIQUE REFERENCES public.meal_plans(id) ON DELETE CASCADE,
  weight_kg numeric,
  weight_type text DEFAULT 'current',
  total_energy_kcal numeric,
  macro_mode text DEFAULT 'percentage',
  protein_percentage numeric,
  carbs_percentage numeric,
  fat_percentage numeric,
  protein_g_per_kg numeric,
  carbs_g_per_kg numeric,
  fat_g_per_kg numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.household_measures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text UNIQUE,
  category text,
  description text,
  ml_equivalent numeric,
  grams_equivalent numeric,
  order_index integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.food_household_measures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  food_id uuid NOT NULL,
  measure_id uuid NOT NULL REFERENCES public.household_measures(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 1,
  grams numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(food_id, measure_id)
);

CREATE INDEX IF NOT EXISTS idx_food_household_measures_food
  ON public.food_household_measures(food_id);

-- -----------------------------------------------------
-- 4) foods compatibility view (read-only)
-- -----------------------------------------------------
DROP VIEW IF EXISTS public.foods;
CREATE VIEW public.foods AS
SELECT
  rf.id,
  rf.name,
  rf.source::text AS source,
  rf.source_id,
  rf."group",
  rf.group_norm,
  rf.description,
  rf.preparation,
  rf.portion_size,
  rf.base_unit,
  rf.calories,
  rf.protein,
  rf.carbs,
  rf.fat,
  rf.fiber,
  rf.sodium,
  rf.saturated_fat,
  rf.trans_fat,
  rf.cholesterol,
  rf.sugar,
  rf.calcium,
  rf.iron,
  rf.magnesium,
  rf.phosphorus,
  rf.potassium,
  rf.zinc,
  rf.vitamin_a,
  rf.vitamin_c,
  rf.vitamin_d,
  rf.vitamin_e,
  rf.vitamin_b12,
  rf.folate,
  COALESCE(rf.is_active, true) AS is_active,
  rf.created_at,
  NULL::uuid AS nutritionist_id
FROM public.reference_foods rf
UNION ALL
SELECT
  nf.id,
  nf.name,
  'custom'::text AS source,
  nf.barcode AS source_id,
  NULL::text AS "group",
  NULL::text AS group_norm,
  nf.brand AS description,
  NULL::text AS preparation,
  nf.base_qty AS portion_size,
  nf.base_unit,
  nf.energy_kcal AS calories,
  nf.protein_g AS protein,
  nf.carbohydrate_g AS carbs,
  nf.lipid_g AS fat,
  nf.fiber_g AS fiber,
  nf.sodium_mg AS sodium,
  nf.saturated_fat_g AS saturated_fat,
  nf.trans_fat_g AS trans_fat,
  nf.cholesterol_mg AS cholesterol,
  nf.sugar_g AS sugar,
  nf.calcium_mg AS calcium,
  nf.iron_mg AS iron,
  nf.magnesium_mg AS magnesium,
  nf.phosphorus_mg AS phosphorus,
  nf.potassium_mg AS potassium,
  nf.zinc_mg AS zinc,
  nf.vitamin_a_mcg AS vitamin_a,
  nf.vitamin_c_mg AS vitamin_c,
  nf.vitamin_d_mcg AS vitamin_d,
  nf.vitamin_e_mg AS vitamin_e,
  nf.vitamin_b12_mcg AS vitamin_b12,
  nf.folate_mcg AS folate,
  COALESCE(nf.is_active, true) AS is_active,
  nf.created_at,
  nf.nutritionist_id
FROM public.nutritionist_foods nf;

-- -----------------------------------------------------
-- 5) Updated-at trigger helper
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_growth_records_set_updated_at ON public.growth_records;
CREATE TRIGGER trg_growth_records_set_updated_at
BEFORE UPDATE ON public.growth_records
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_energy_expenditure_set_updated_at ON public.energy_expenditure_calculations;
CREATE TRIGGER trg_energy_expenditure_set_updated_at
BEFORE UPDATE ON public.energy_expenditure_calculations
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_patient_goals_set_updated_at ON public.patient_goals;
CREATE TRIGGER trg_patient_goals_set_updated_at
BEFORE UPDATE ON public.patient_goals
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_meal_plan_meals_set_updated_at ON public.meal_plan_meals;
CREATE TRIGGER trg_meal_plan_meals_set_updated_at
BEFORE UPDATE ON public.meal_plan_meals
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_meal_plan_foods_set_updated_at ON public.meal_plan_foods;
CREATE TRIGGER trg_meal_plan_foods_set_updated_at
BEFORE UPDATE ON public.meal_plan_foods
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_meal_plan_reference_values_set_updated_at ON public.meal_plan_reference_values;
CREATE TRIGGER trg_meal_plan_reference_values_set_updated_at
BEFORE UPDATE ON public.meal_plan_reference_values
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_household_measures_set_updated_at ON public.household_measures;
CREATE TRIGGER trg_household_measures_set_updated_at
BEFORE UPDATE ON public.household_measures
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_food_household_measures_set_updated_at ON public.food_household_measures;
CREATE TRIGGER trg_food_household_measures_set_updated_at
BEFORE UPDATE ON public.food_household_measures
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------
-- 6) App RPC compatibility
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_goal_progress(goal_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  g record;
  start_delta numeric;
  current_delta numeric;
BEGIN
  SELECT initial_weight, target_weight, current_weight
    INTO g
  FROM public.patient_goals
  WHERE id = goal_id;

  IF g IS NULL THEN
    RETURN 0;
  END IF;

  IF g.initial_weight IS NULL OR g.target_weight IS NULL OR g.current_weight IS NULL THEN
    RETURN 0;
  END IF;

  start_delta := g.target_weight - g.initial_weight;
  IF start_delta = 0 THEN
    RETURN 100;
  END IF;

  current_delta := g.current_weight - g.initial_weight;
  RETURN LEAST(100, GREATEST(0, ROUND((current_delta / start_delta) * 100, 2)));
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_macro_targets(p_meal_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  ref record;
  protein_g numeric := 0;
  carbs_g numeric := 0;
  fat_g numeric := 0;
BEGIN
  SELECT *
    INTO ref
  FROM public.meal_plan_reference_values
  WHERE meal_plan_id = p_meal_plan_id;

  IF ref IS NULL THEN
    RETURN jsonb_build_object('has_data', false);
  END IF;

  IF COALESCE(ref.macro_mode, 'percentage') = 'g_per_kg' THEN
    protein_g := COALESCE(ref.weight_kg, 0) * COALESCE(ref.protein_g_per_kg, 0);
    carbs_g := COALESCE(ref.weight_kg, 0) * COALESCE(ref.carbs_g_per_kg, 0);
    fat_g := COALESCE(ref.weight_kg, 0) * COALESCE(ref.fat_g_per_kg, 0);
  ELSE
    protein_g := (COALESCE(ref.total_energy_kcal, 0) * COALESCE(ref.protein_percentage, 0) / 100) / 4;
    carbs_g := (COALESCE(ref.total_energy_kcal, 0) * COALESCE(ref.carbs_percentage, 0) / 100) / 4;
    fat_g := (COALESCE(ref.total_energy_kcal, 0) * COALESCE(ref.fat_percentage, 0) / 100) / 9;
  END IF;

  RETURN jsonb_build_object(
    'has_data', true,
    'total_energy_kcal', COALESCE(ref.total_energy_kcal, 0),
    'protein_g', ROUND(protein_g, 2),
    'carbs_g', ROUND(carbs_g, 2),
    'fat_g', ROUND(fat_g, 2)
  );
END;
$$;

-- -----------------------------------------------------
-- 7) Minimal RLS enablement for new tables
-- -----------------------------------------------------
ALTER TABLE public.growth_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.energy_expenditure_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plan_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plan_foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plan_reference_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_measures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_household_measures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "growth_records_read_write_involved" ON public.growth_records;
CREATE POLICY "growth_records_read_write_involved"
  ON public.growth_records
  FOR ALL
  TO authenticated
  USING (
    patient_id = auth.uid()
    OR nutritionist_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.nutritionist_patients np
      WHERE np.patient_id = growth_records.patient_id
        AND np.nutritionist_id = auth.uid()
    )
  )
  WITH CHECK (
    patient_id = auth.uid()
    OR nutritionist_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.nutritionist_patients np
      WHERE np.patient_id = growth_records.patient_id
        AND np.nutritionist_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "energy_calc_read_write_involved" ON public.energy_expenditure_calculations;
CREATE POLICY "energy_calc_read_write_involved"
  ON public.energy_expenditure_calculations
  FOR ALL
  TO authenticated
  USING (
    patient_id = auth.uid()
    OR nutritionist_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.nutritionist_patients np
      WHERE np.patient_id = energy_expenditure_calculations.patient_id
        AND np.nutritionist_id = auth.uid()
    )
  )
  WITH CHECK (
    patient_id = auth.uid()
    OR nutritionist_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.nutritionist_patients np
      WHERE np.patient_id = energy_expenditure_calculations.patient_id
        AND np.nutritionist_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "patient_goals_read_write_involved" ON public.patient_goals;
CREATE POLICY "patient_goals_read_write_involved"
  ON public.patient_goals
  FOR ALL
  TO authenticated
  USING (
    patient_id = auth.uid()
    OR nutritionist_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.nutritionist_patients np
      WHERE np.patient_id = patient_goals.patient_id
        AND np.nutritionist_id = auth.uid()
    )
  )
  WITH CHECK (
    patient_id = auth.uid()
    OR nutritionist_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.nutritionist_patients np
      WHERE np.patient_id = patient_goals.patient_id
        AND np.nutritionist_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "meal_plan_meals_involved" ON public.meal_plan_meals;
CREATE POLICY "meal_plan_meals_involved"
  ON public.meal_plan_meals
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.meal_plans mp
      WHERE mp.id = meal_plan_meals.meal_plan_id
        AND (
          mp.patient_id = auth.uid()
          OR mp.nutritionist_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.nutritionist_patients np
            WHERE np.patient_id = mp.patient_id
              AND np.nutritionist_id = auth.uid()
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.meal_plans mp
      WHERE mp.id = meal_plan_meals.meal_plan_id
        AND (
          mp.patient_id = auth.uid()
          OR mp.nutritionist_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.nutritionist_patients np
            WHERE np.patient_id = mp.patient_id
              AND np.nutritionist_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "meal_plan_foods_involved" ON public.meal_plan_foods;
CREATE POLICY "meal_plan_foods_involved"
  ON public.meal_plan_foods
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.meal_plan_meals mpm
      JOIN public.meal_plans mp ON mp.id = mpm.meal_plan_id
      WHERE mpm.id = meal_plan_foods.meal_plan_meal_id
        AND (
          mp.patient_id = auth.uid()
          OR mp.nutritionist_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.nutritionist_patients np
            WHERE np.patient_id = mp.patient_id
              AND np.nutritionist_id = auth.uid()
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.meal_plan_meals mpm
      JOIN public.meal_plans mp ON mp.id = mpm.meal_plan_id
      WHERE mpm.id = meal_plan_foods.meal_plan_meal_id
        AND (
          mp.patient_id = auth.uid()
          OR mp.nutritionist_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.nutritionist_patients np
            WHERE np.patient_id = mp.patient_id
              AND np.nutritionist_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "meal_plan_reference_values_involved" ON public.meal_plan_reference_values;
CREATE POLICY "meal_plan_reference_values_involved"
  ON public.meal_plan_reference_values
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.meal_plans mp
      WHERE mp.id = meal_plan_reference_values.meal_plan_id
        AND (
          mp.patient_id = auth.uid()
          OR mp.nutritionist_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.nutritionist_patients np
            WHERE np.patient_id = mp.patient_id
              AND np.nutritionist_id = auth.uid()
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.meal_plans mp
      WHERE mp.id = meal_plan_reference_values.meal_plan_id
        AND (
          mp.patient_id = auth.uid()
          OR mp.nutritionist_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.nutritionist_patients np
            WHERE np.patient_id = mp.patient_id
              AND np.nutritionist_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "household_measures_read_all" ON public.household_measures;
CREATE POLICY "household_measures_read_all"
  ON public.household_measures
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "food_household_measures_read_write_involved" ON public.food_household_measures;
CREATE POLICY "food_household_measures_read_write_involved"
  ON public.food_household_measures
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;


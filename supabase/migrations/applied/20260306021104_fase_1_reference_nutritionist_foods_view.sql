DO $$ BEGIN
  CREATE TYPE food_source AS ENUM ('TACO', 'TBCA', 'USDA', 'CUSTOM', 'OFF', 'TUCUNDUVA');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.reference_foods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  source food_source NOT NULL,
  source_id text NOT NULL,
  "group" text,
  portion_size numeric DEFAULT 100,
  base_unit text DEFAULT 'g',
  calories numeric DEFAULT 0,
  protein numeric DEFAULT 0,
  carbs numeric DEFAULT 0,
  fat numeric DEFAULT 0,
  fiber numeric DEFAULT 0,
  calcium numeric,
  iron numeric,
  sodium numeric,
  potassium numeric,
  vitamin_c numeric,
  created_at timestamptz DEFAULT now(),
  saturated_fat numeric DEFAULT 0,
  monounsaturated_fat numeric DEFAULT 0,
  polyunsaturated_fat numeric DEFAULT 0,
  trans_fat numeric DEFAULT 0,
  cholesterol numeric DEFAULT 0,
  sugar numeric DEFAULT 0,
  magnesium numeric DEFAULT 0,
  phosphorus numeric DEFAULT 0,
  zinc numeric DEFAULT 0,
  vitamin_a numeric DEFAULT 0,
  vitamin_d numeric DEFAULT 0,
  vitamin_e numeric DEFAULT 0,
  vitamin_b12 numeric DEFAULT 0,
  folate numeric DEFAULT 0,
  nutritionist_id text,
  description text,
  preparation text,
  is_active boolean DEFAULT true,
  group_norm text
);

CREATE TABLE IF NOT EXISTS public.nutritionist_foods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nutritionist_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  brand text,
  barcode text,
  base_qty numeric DEFAULT 100,
  base_unit text DEFAULT 'g',
  energy_kcal numeric DEFAULT 0,
  protein_g numeric DEFAULT 0,
  carbohydrate_g numeric DEFAULT 0,
  lipid_g numeric DEFAULT 0,
  fiber_g numeric DEFAULT 0,
  calcium_mg numeric,
  iron_mg numeric,
  sodium_mg numeric,
  potassium_mg numeric,
  vitamin_c_mg numeric,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  saturated_fat_g numeric DEFAULT 0,
  monounsaturated_fat_g numeric DEFAULT 0,
  polyunsaturated_fat_g numeric DEFAULT 0,
  trans_fat_g numeric DEFAULT 0,
  cholesterol_mg numeric DEFAULT 0,
  sugar_g numeric DEFAULT 0,
  magnesium_mg numeric DEFAULT 0,
  phosphorus_mg numeric DEFAULT 0,
  zinc_mg numeric DEFAULT 0,
  vitamin_a_mcg numeric DEFAULT 0,
  vitamin_d_mcg numeric DEFAULT 0,
  vitamin_e_mg numeric DEFAULT 0,
  vitamin_b12_mcg numeric DEFAULT 0,
  folate_mcg numeric DEFAULT 0
);

DROP TABLE IF EXISTS public.foods CASCADE;

CREATE OR REPLACE VIEW public.foods AS
SELECT rf.id, rf.name, rf.source::text AS source, rf.source_id, rf."group", rf.group_norm, rf.description, rf.preparation, rf.portion_size, rf.base_unit, rf.calories, rf.protein, rf.carbs, rf.fat, rf.fiber, rf.sodium, rf.saturated_fat, rf.trans_fat, rf.cholesterol, rf.sugar, rf.calcium, rf.iron, rf.magnesium, rf.phosphorus, rf.potassium, rf.zinc, rf.vitamin_a, rf.vitamin_c, rf.vitamin_d, rf.vitamin_e, rf.vitamin_b12, rf.folate, COALESCE(rf.is_active, true) AS is_active, rf.created_at, NULL::uuid AS nutritionist_id FROM reference_foods rf
UNION ALL
SELECT nf.id, nf.name, 'custom'::text, nf.barcode, NULL::text, NULL::text, nf.brand, NULL::text, nf.base_qty, nf.base_unit, nf.energy_kcal, nf.protein_g, nf.carbohydrate_g, nf.lipid_g, nf.fiber_g, nf.sodium_mg, nf.saturated_fat_g, nf.trans_fat_g, nf.cholesterol_mg, nf.sugar_g, nf.calcium_mg, nf.iron_mg, nf.magnesium_mg, nf.phosphorus_mg, nf.potassium_mg, nf.zinc_mg, nf.vitamin_a_mcg, nf.vitamin_c_mg, nf.vitamin_d_mcg, nf.vitamin_e_mg, nf.vitamin_b12_mcg, nf.folate_mcg, COALESCE(nf.is_active, true), nf.created_at, nf.nutritionist_id FROM nutritionist_foods nf;

ALTER TABLE meal_plan_foods ALTER COLUMN food_id TYPE uuid USING NULL;
ALTER TABLE meal_items DROP COLUMN IF EXISTS food_id;
ALTER TABLE meal_items ADD COLUMN IF NOT EXISTS reference_food_id uuid;
ALTER TABLE meal_items ADD COLUMN IF NOT EXISTS nutritionist_food_id uuid;
DROP TABLE IF EXISTS food_measures CASCADE;
CREATE TABLE food_measures (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference_food_id uuid REFERENCES reference_foods(id) ON DELETE CASCADE, nutritionist_food_id uuid REFERENCES nutritionist_foods(id) ON DELETE CASCADE, label text NOT NULL, weight_in_grams numeric NOT NULL, created_at timestamptz DEFAULT now(), CONSTRAINT food_measures_one_food CHECK ( (reference_food_id IS NOT NULL AND nutritionist_food_id IS NULL) OR (reference_food_id IS NULL AND nutritionist_food_id IS NOT NULL) ));
ALTER TABLE food_household_measures DROP COLUMN IF EXISTS food_id;
ALTER TABLE food_household_measures ADD COLUMN IF NOT EXISTS food_id uuid;

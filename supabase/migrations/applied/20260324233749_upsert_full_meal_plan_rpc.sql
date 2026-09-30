CREATE OR REPLACE FUNCTION upsert_full_meal_plan(
  p_plan_id BIGINT,
  p_plan_data JSONB,
  p_meals JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_meal JSONB;
  v_food JSONB;
  v_sub JSONB;
  v_new_meal_id BIGINT;
  v_new_food_id BIGINT;
BEGIN
  -- 1. Update the meal plan itself
  UPDATE meal_plans
  SET 
    name = (p_plan_data->>'name'),
    description = (p_plan_data->>'description'),
    start_date = (p_plan_data->>'start_date')::DATE,
    end_date = (p_plan_data->>'end_date')::DATE,
    is_active = COALESCE((p_plan_data->>'is_active')::BOOLEAN, true),
    is_draft = COALESCE((p_plan_data->>'is_draft')::BOOLEAN, false),
    daily_calories = COALESCE((p_plan_data->>'daily_calories')::NUMERIC, 0),
    daily_protein = COALESCE((p_plan_data->>'daily_protein')::NUMERIC, 0),
    daily_carbs = COALESCE((p_plan_data->>'daily_carbs')::NUMERIC, 0),
    daily_fat = COALESCE((p_plan_data->>'daily_fat')::NUMERIC, 0),
    updated_at = NOW()
  WHERE id = p_plan_id;

  -- 2. Clear old structure (Deletes cascade to foods and subs if constraints permit, 
  --    but we'll be explicit to ensure performance and correctness)
  -- Assuming ON DELETE CASCADE is set. If not, we should delete children first.
  DELETE FROM meal_plan_food_substitutions 
  WHERE meal_plan_food_id IN (
    SELECT id FROM meal_plan_foods 
    WHERE meal_plan_meal_id IN (
      SELECT id FROM meal_plan_meals WHERE meal_plan_id = p_plan_id
    )
  );
  
  DELETE FROM meal_plan_foods 
  WHERE meal_plan_meal_id IN (
    SELECT id FROM meal_plan_meals WHERE meal_plan_id = p_plan_id
  );

  DELETE FROM meal_plan_meals WHERE meal_plan_id = p_plan_id;

  -- 3. Insert new structure
  FOR v_meal IN SELECT * FROM jsonb_array_elements(p_meals)
  LOOP
    INSERT INTO meal_plan_meals (
      meal_plan_id, name, meal_type, meal_time, order_index, notes,
      total_calories, total_protein, total_carbs, total_fat
    ) VALUES (
      p_plan_id,
      v_meal->>'name',
      COALESCE((v_meal->>'meal_type'), 'other')::meal_type_enum,
      (v_meal->>'meal_time')::TIME,
      COALESCE((v_meal->>'order_index')::INTEGER, 0),
      v_meal->>'notes',
      COALESCE((v_meal->>'total_calories')::NUMERIC, 0),
      COALESCE((v_meal->>'total_protein')::NUMERIC, 0),
      COALESCE((v_meal->>'total_carbs')::NUMERIC, 0),
      COALESCE((v_meal->>'total_fat')::NUMERIC, 0)
    ) RETURNING id INTO v_new_meal_id;

    -- Insert foods for this meal
    IF v_meal ? 'foods' THEN
      FOR v_food IN SELECT * FROM jsonb_array_elements(v_meal->'foods')
      LOOP
        INSERT INTO meal_plan_foods (
          meal_plan_meal_id, food_id, quantity, unit, 
          calories, protein, carbs, fat, notes, order_index,
          patient_description
        ) VALUES (
          v_new_meal_id,
          (v_food->>'food_id')::UUID,
          COALESCE((v_food->>'quantity')::NUMERIC, 0),
          v_food->>'unit',
          COALESCE((v_food->>'calories')::NUMERIC, 0),
          COALESCE((v_food->>'protein')::NUMERIC, 0),
          COALESCE((v_food->>'carbs')::NUMERIC, 0),
          COALESCE((v_food->>'fat')::NUMERIC, 0),
          v_food->>'notes',
          COALESCE((v_food->>'order_index')::INTEGER, 0),
          v_food->>'patient_description'
        ) RETURNING id INTO v_new_food_id;

        -- Insert substitutes
        IF v_food ? 'substitutes' THEN
          FOR v_sub IN SELECT * FROM jsonb_array_elements(v_food->'substitutes')
          LOOP
            INSERT INTO meal_plan_food_substitutions (
              meal_plan_food_id, substitute_food_id, notes
            ) VALUES (
              v_new_food_id,
              (v_sub->>'id')::UUID,
              v_sub->>'notes'
            );
          END LOOP;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('status', 'success', 'plan_id', p_plan_id);
END;
$$;

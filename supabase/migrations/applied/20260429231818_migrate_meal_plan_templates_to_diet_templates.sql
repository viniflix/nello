
-- ============================================================
-- MIGRAÇÃO: meal_plans (is_template=true) → diet_templates
-- ============================================================
-- Esta migration move os dados de templates de dieta que estavam
-- armazenados em meal_plans (usando is_template=true) para a tabela
-- dedicada diet_templates, que é a fonte de dados correta.
-- ============================================================

DO $$
DECLARE
  v_mp RECORD;
  v_new_dt_id UUID;
  v_meal RECORD;
  v_new_dtm_id UUID;
BEGIN
  -- Iterar sobre cada meal_plan que é template
  FOR v_mp IN
    SELECT id, name, description, template_tags, nutritionist_id, created_at
    FROM meal_plans
    WHERE is_template = true
  LOOP
    -- Verificar se já não foi migrado (evitar duplicatas pelo nome + user)
    IF NOT EXISTS (
      SELECT 1 FROM diet_templates
      WHERE user_id = v_mp.nutritionist_id
        AND name = v_mp.name
    ) THEN
      -- 1. Inserir na diet_templates
      INSERT INTO diet_templates (user_id, name, description, tags, created_at, updated_at)
      VALUES (
        v_mp.nutritionist_id,
        v_mp.name,
        v_mp.description,
        COALESCE(v_mp.template_tags, ARRAY[]::text[]),
        v_mp.created_at,
        NOW()
      )
      RETURNING id INTO v_new_dt_id;

      RAISE NOTICE 'Migrated meal_plan id=% "%" → diet_template id=%', 
        v_mp.id, v_mp.name, v_new_dt_id;

      -- 2. Iterar sobre refeições do meal_plan
      FOR v_meal IN
        SELECT id, name, meal_time, order_index
        FROM meal_plan_meals
        WHERE meal_plan_id = v_mp.id
        ORDER BY order_index
      LOOP
        -- Inserir refeição em diet_template_meals
        INSERT INTO diet_template_meals (template_id, name, time, order_index)
        VALUES (
          v_new_dt_id,
          v_meal.name,
          v_meal.meal_time::time,
          v_meal.order_index
        )
        RETURNING id INTO v_new_dtm_id;

        -- 3. Migrar alimentos da refeição
        INSERT INTO diet_template_foods (meal_id, food_id, quantity, unit, observation, order_index)
        SELECT
          v_new_dtm_id,
          mpf.food_id,
          mpf.quantity,
          mpf.unit,
          COALESCE(mpf.notes, ''),
          mpf.order_index
        FROM meal_plan_foods mpf
        WHERE mpf.meal_plan_meal_id = v_meal.id;

        RAISE NOTICE '  Migrated meal "%" with foods', v_meal.name;
      END LOOP;
    ELSE
      RAISE NOTICE 'Skipping meal_plan id=% "%" — already exists in diet_templates', 
        v_mp.id, v_mp.name;
    END IF;
  END LOOP;

  RAISE NOTICE 'Migration complete.';
END;
$$;

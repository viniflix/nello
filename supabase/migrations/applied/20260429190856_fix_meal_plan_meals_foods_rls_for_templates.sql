-- ── meal_plan_meals ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Access meal_plan_meals via meal_plans" ON meal_plan_meals;

CREATE POLICY "Access meal_plan_meals via meal_plans"
ON meal_plan_meals FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM meal_plans p
    WHERE p.id = meal_plan_meals.meal_plan_id
      AND (
        -- Paciente vê suas próprias refeições
        p.patient_id = (SELECT auth.uid())
        OR
        -- Nutricionista acessa planos de seus pacientes
        (p.patient_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM user_profiles up
          WHERE up.id = p.patient_id
            AND up.nutritionist_id = (SELECT auth.uid())
        ))
        OR
        -- Nutricionista acessa seus próprios templates (patient_id IS NULL)
        (p.patient_id IS NULL AND p.nutritionist_id = (SELECT auth.uid()))
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM meal_plans p
    WHERE p.id = meal_plan_meals.meal_plan_id
      AND (
        (p.patient_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM user_profiles up
          WHERE up.id = p.patient_id
            AND up.nutritionist_id = (SELECT auth.uid())
        ))
        OR
        (p.patient_id IS NULL AND p.nutritionist_id = (SELECT auth.uid()))
      )
  )
);

-- ── meal_plan_meal_foods ──────────────────────────────────────────────────────
-- Verificar se a tabela existe e tem policies similares
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'meal_plan_meal_foods'
  ) THEN
    -- Dropar e recriar
    EXECUTE 'DROP POLICY IF EXISTS "Access meal_plan_meal_foods via meal_plans" ON meal_plan_meal_foods';
    EXECUTE 'DROP POLICY IF EXISTS "Access meal_plan_meal_foods" ON meal_plan_meal_foods';
  END IF;
END $$;

-- Recriar policy para meal_plan_meal_foods se a tabela existir
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'meal_plan_meal_foods' AND table_schema = 'public'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Access meal_plan_meal_foods via meal_plans"
      ON meal_plan_meal_foods FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM meal_plan_meals mm
          JOIN meal_plans p ON p.id = mm.meal_plan_id
          WHERE mm.id = meal_plan_meal_foods.meal_plan_meal_id
            AND (
              p.patient_id = (SELECT auth.uid())
              OR
              (p.patient_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM user_profiles up
                WHERE up.id = p.patient_id
                  AND up.nutritionist_id = (SELECT auth.uid())
              ))
              OR
              (p.patient_id IS NULL AND p.nutritionist_id = (SELECT auth.uid()))
            )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM meal_plan_meals mm
          JOIN meal_plans p ON p.id = mm.meal_plan_id
          WHERE mm.id = meal_plan_meal_foods.meal_plan_meal_id
            AND (
              (p.patient_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM user_profiles up
                WHERE up.id = p.patient_id
                  AND up.nutritionist_id = (SELECT auth.uid())
              ))
              OR
              (p.patient_id IS NULL AND p.nutritionist_id = (SELECT auth.uid()))
            )
        )
      )
    $policy$;
  END IF;
END $$;

-- ── meal_plan_foods ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Access meal_plan_foods via meal_plan_meals" ON meal_plan_foods;

CREATE POLICY "Access meal_plan_foods via meal_plan_meals"
ON meal_plan_foods FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM meal_plan_meals m
    JOIN meal_plans p ON p.id = m.meal_plan_id
    WHERE m.id = meal_plan_foods.meal_plan_meal_id
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
    SELECT 1
    FROM meal_plan_meals m
    JOIN meal_plans p ON p.id = m.meal_plan_id
    WHERE m.id = meal_plan_foods.meal_plan_meal_id
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

-- ── meal_plan_reference_values ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Access meal_plan_reference_values via meal_plans" ON meal_plan_reference_values;

CREATE POLICY "Access meal_plan_reference_values via meal_plans"
ON meal_plan_reference_values FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM meal_plans p
    WHERE p.id = meal_plan_reference_values.meal_plan_id
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
    SELECT 1 FROM meal_plans p
    WHERE p.id = meal_plan_reference_values.meal_plan_id
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

-- ── meal_plan_versions ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Nutricionista gerencia versões dos seus planos" ON meal_plan_versions;

CREATE POLICY "Nutricionista gerencia versões dos seus planos"
ON meal_plan_versions FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM meal_plans p
    WHERE p.id = meal_plan_versions.meal_plan_id
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
    SELECT 1 FROM meal_plans p
    WHERE p.id = meal_plan_versions.meal_plan_id
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

-- ── meal_plan_food_substitutions ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Access meal_plan_food_substitutions via meal_plan_foods" ON meal_plan_food_substitutions;

CREATE POLICY "Access meal_plan_food_substitutions via meal_plan_foods"
ON meal_plan_food_substitutions FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM meal_plan_foods mf
    JOIN meal_plan_meals m ON m.id = mf.meal_plan_meal_id
    JOIN meal_plans p ON p.id = m.meal_plan_id
    WHERE mf.id = meal_plan_food_substitutions.meal_plan_food_id
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
    SELECT 1
    FROM meal_plan_foods mf
    JOIN meal_plan_meals m ON m.id = mf.meal_plan_meal_id
    JOIN meal_plans p ON p.id = m.meal_plan_id
    WHERE mf.id = meal_plan_food_substitutions.meal_plan_food_id
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

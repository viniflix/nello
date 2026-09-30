-- DROP policies existentes para recriar com suporte a templates (patient_id IS NULL)
DROP POLICY IF EXISTS "Nutritionists insert meal_plans" ON meal_plans;
DROP POLICY IF EXISTS "Nutritionists update meal_plans" ON meal_plans;
DROP POLICY IF EXISTS "Nutritionists delete meal_plans" ON meal_plans;
DROP POLICY IF EXISTS "Read meal_plans" ON meal_plans;

-- INSERT: nutricionista pode inserir plano para seus pacientes OU um template (patient_id IS NULL)
CREATE POLICY "Nutritionists insert meal_plans"
ON meal_plans FOR INSERT
WITH CHECK (
  is_nutritionist()
  AND (
    -- Plano de paciente normal
    (patient_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = meal_plans.patient_id
        AND up.nutritionist_id = (SELECT auth.uid())
    ))
    OR
    -- Template global do nutricionista (sem paciente vinculado)
    (patient_id IS NULL AND nutritionist_id = (SELECT auth.uid()))
  )
);

-- UPDATE: mesmo critério
CREATE POLICY "Nutritionists update meal_plans"
ON meal_plans FOR UPDATE
USING (
  is_nutritionist()
  AND (
    (patient_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = meal_plans.patient_id
        AND up.nutritionist_id = (SELECT auth.uid())
    ))
    OR
    (patient_id IS NULL AND nutritionist_id = (SELECT auth.uid()))
  )
)
WITH CHECK (
  is_nutritionist()
  AND (
    (patient_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = meal_plans.patient_id
        AND up.nutritionist_id = (SELECT auth.uid())
    ))
    OR
    (patient_id IS NULL AND nutritionist_id = (SELECT auth.uid()))
  )
);

-- DELETE: idem
CREATE POLICY "Nutritionists delete meal_plans"
ON meal_plans FOR DELETE
USING (
  is_nutritionist()
  AND (
    (patient_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = meal_plans.patient_id
        AND up.nutritionist_id = (SELECT auth.uid())
    ))
    OR
    (patient_id IS NULL AND nutritionist_id = (SELECT auth.uid()))
  )
);

-- SELECT: nutricionista vê planos dos seus pacientes + seus templates; paciente vê os próprios
CREATE POLICY "Read meal_plans"
ON meal_plans FOR SELECT
USING (
  -- Paciente vê seus próprios planos
  (patient_id = (SELECT auth.uid()))
  OR
  -- Nutricionista vê planos de seus pacientes
  (is_nutritionist() AND patient_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = meal_plans.patient_id
      AND up.nutritionist_id = (SELECT auth.uid())
  ))
  OR
  -- Nutricionista vê seus próprios templates
  (is_nutritionist() AND patient_id IS NULL AND nutritionist_id = (SELECT auth.uid()))
);

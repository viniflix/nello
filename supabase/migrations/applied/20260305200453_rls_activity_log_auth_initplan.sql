-- Fix activity_log RLS: auth.uid() -> (select auth.uid()) for InitPlan optimization
DROP POLICY IF EXISTS "Nutritionists can read activity_log for their patients" ON public.activity_log;
DROP POLICY IF EXISTS "Nutritionists can insert activity_log for their patients" ON public.activity_log;

CREATE POLICY "Nutritionists can read activity_log for their patients" ON public.activity_log
FOR SELECT TO authenticated
USING (
  patient_id IN (
    SELECT user_profiles.id FROM user_profiles
    WHERE user_profiles.nutritionist_id = (select auth.uid())
  )
);

CREATE POLICY "Nutritionists can insert activity_log for their patients" ON public.activity_log
FOR INSERT TO authenticated
WITH CHECK (
  patient_id IN (
    SELECT user_profiles.id FROM user_profiles
    WHERE user_profiles.nutritionist_id = (select auth.uid())
  )
);

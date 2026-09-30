-- Phase 38: Correções de segurança - migração foods
-- Resolve alertas do Supabase Security Advisor

BEGIN;

-- 1) View foods: SECURITY INVOKER
ALTER VIEW public.foods SET (security_invoker = true);

-- 2) reference_foods: habilitar RLS + política de leitura
ALTER TABLE public.reference_foods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON public.reference_foods;
CREATE POLICY "Public read access"
  ON public.reference_foods
  FOR SELECT
  TO authenticated
  USING (true);

-- 3) nutritionist_foods: habilitar RLS + políticas
ALTER TABLE public.nutritionist_foods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Nutri manages own foods" ON public.nutritionist_foods;
CREATE POLICY "Nutri manages own foods"
  ON public.nutritionist_foods
  FOR ALL
  TO authenticated
  USING (auth.uid() = nutritionist_id)
  WITH CHECK (auth.uid() = nutritionist_id);

DROP POLICY IF EXISTS "Patient sees linked nutri foods" ON public.nutritionist_foods;
CREATE POLICY "Patient sees linked nutri foods"
  ON public.nutritionist_foods
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.nutritionist_patients np
      WHERE np.patient_id = auth.uid()
        AND np.nutritionist_id = nutritionist_foods.nutritionist_id
    )
  );

-- 4) food_measures: habilitar RLS + políticas
ALTER TABLE public.food_measures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read measures" ON public.food_measures;
CREATE POLICY "Public read measures"
  ON public.food_measures
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Nutri creates measures" ON public.food_measures;
CREATE POLICY "Nutri creates measures"
  ON public.food_measures
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.user_type = 'nutritionist'
    )
  );

DROP POLICY IF EXISTS "Nutri updates own measures" ON public.food_measures;
CREATE POLICY "Nutri updates own measures"
  ON public.food_measures
  FOR UPDATE
  TO authenticated
  USING (
    (nutritionist_food_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.nutritionist_foods nf
      WHERE nf.id = food_measures.nutritionist_food_id
        AND nf.nutritionist_id = auth.uid()
    ))
    OR (reference_food_id IS NOT NULL AND (
      (SELECT public.is_admin())
      OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.user_type = 'nutritionist')
    ))
  )
  WITH CHECK (
    (nutritionist_food_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.nutritionist_foods nf
      WHERE nf.id = food_measures.nutritionist_food_id
        AND nf.nutritionist_id = auth.uid()
    ))
    OR (reference_food_id IS NOT NULL AND (
      (SELECT public.is_admin())
      OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.user_type = 'nutritionist')
    ))
  );

DROP POLICY IF EXISTS "Nutri deletes own measures" ON public.food_measures;
CREATE POLICY "Nutri deletes own measures"
  ON public.food_measures
  FOR DELETE
  TO authenticated
  USING (
    (nutritionist_food_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.nutritionist_foods nf
      WHERE nf.id = food_measures.nutritionist_food_id
        AND nf.nutritionist_id = auth.uid()
    ))
    OR (reference_food_id IS NOT NULL AND (
      (SELECT public.is_admin())
      OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.user_type = 'nutritionist')
    ))
  );

COMMIT;

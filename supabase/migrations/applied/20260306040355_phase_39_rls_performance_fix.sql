-- Phase 39: Performance fix - auth_rls_initplan + multiple_permissive_policies
-- Wrap auth.uid() in (select auth.uid()) para avaliação única
-- Consolida SELECT policies em nutritionist_foods

BEGIN;

-- =====================================================
-- 1) nutritionist_foods: fix initplan + merge SELECT policies
-- =====================================================
DROP POLICY IF EXISTS "Nutri manages own foods" ON public.nutritionist_foods;
DROP POLICY IF EXISTS "Patient sees linked nutri foods" ON public.nutritionist_foods;

-- Política única para SELECT (nutri vê próprios OU paciente vê do nutricionista vinculado)
CREATE POLICY "Nutri or patient reads foods"
  ON public.nutritionist_foods
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) = nutritionist_id
    OR EXISTS (
      SELECT 1 FROM public.nutritionist_patients np
      WHERE np.patient_id = (select auth.uid())
        AND np.nutritionist_id = nutritionist_foods.nutritionist_id
    )
  );

-- Nutricionista gerencia próprios (INSERT, UPDATE, DELETE)
CREATE POLICY "Nutri manages own foods"
  ON public.nutritionist_foods
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = nutritionist_id)
  WITH CHECK ((select auth.uid()) = nutritionist_id);

-- Ajuste: FOR ALL inclui SELECT; precisamos excluir SELECT para evitar duplicata.
-- Na verdade FOR ALL com USING já cobre SELECT. O problema é que agora temos duas
-- políticas que dão SELECT. Precisamos que "Nutri manages own foods" seja só INSERT/UPDATE/DELETE.
-- Em PostgreSQL não dá para fazer FOR INSERT, UPDATE, DELETE em uma única policy.
-- Precisamos de 3 policies separadas OU usar RESTRICTIVE.
-- Alternativa: manter uma única política SELECT combinada e para write ter só "Nutri manages own foods"
-- mas FOR ALL inclui SELECT... então teríamos duplicata de novo.
-- Solução: "Nutri manages own foods" com FOR INSERT, UPDATE, DELETE (3 comandos).
-- Em Postgres: CREATE POLICY ... FOR INSERT, UPDATE, DELETE
DROP POLICY IF EXISTS "Nutri manages own foods" ON public.nutritionist_foods;
CREATE POLICY "Nutri manages own foods"
  ON public.nutritionist_foods
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = nutritionist_id);

CREATE POLICY "Nutri updates own foods"
  ON public.nutritionist_foods
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = nutritionist_id)
  WITH CHECK ((select auth.uid()) = nutritionist_id);

CREATE POLICY "Nutri deletes own foods"
  ON public.nutritionist_foods
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = nutritionist_id);

-- =====================================================
-- 2) food_measures: fix initplan
-- =====================================================
DROP POLICY IF EXISTS "Nutri creates measures" ON public.food_measures;
CREATE POLICY "Nutri creates measures"
  ON public.food_measures
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = (select auth.uid())
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
        AND nf.nutritionist_id = (select auth.uid())
    ))
    OR (reference_food_id IS NOT NULL AND (
      (SELECT public.is_admin())
      OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = (select auth.uid()) AND up.user_type = 'nutritionist')
    ))
  )
  WITH CHECK (
    (nutritionist_food_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.nutritionist_foods nf
      WHERE nf.id = food_measures.nutritionist_food_id
        AND nf.nutritionist_id = (select auth.uid())
    ))
    OR (reference_food_id IS NOT NULL AND (
      (SELECT public.is_admin())
      OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = (select auth.uid()) AND up.user_type = 'nutritionist')
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
        AND nf.nutritionist_id = (select auth.uid())
    ))
    OR (reference_food_id IS NOT NULL AND (
      (SELECT public.is_admin())
      OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = (select auth.uid()) AND up.user_type = 'nutritionist')
    ))
  );

COMMIT;

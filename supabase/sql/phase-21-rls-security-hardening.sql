-- Phase 21: RLS and database security hardening
-- Goals:
-- 1) Remove permissive ALL policy from food_household_measures
-- 2) Force SECURITY INVOKER on foods compatibility view
-- 3) Fix mutable search_path on core public functions

BEGIN;

-- =====================================================
-- 1) Function hardening: immutable search_path
-- =====================================================
ALTER FUNCTION public.set_updated_at()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.calculate_goal_progress(uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.calculate_macro_targets(uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.handle_asaas_webhook_update(text, text, timestamptz, jsonb)
  SET search_path = public, pg_temp;

-- =====================================================
-- 2) View hardening: enforce invoker permissions
-- =====================================================
ALTER VIEW public.foods SET (security_invoker = true);

-- =====================================================
-- 3) RLS hardening: food_household_measures
-- =====================================================
ALTER TABLE public.food_household_measures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "food_household_measures_read_write_involved" ON public.food_household_measures;
DROP POLICY IF EXISTS "food_household_measures_select_authenticated" ON public.food_household_measures;
DROP POLICY IF EXISTS "food_household_measures_insert_owner_or_admin" ON public.food_household_measures;
DROP POLICY IF EXISTS "food_household_measures_update_owner_or_admin" ON public.food_household_measures;
DROP POLICY IF EXISTS "food_household_measures_delete_owner_or_admin" ON public.food_household_measures;

-- Read remains available to authenticated users because these are lookup/conversion rows.
CREATE POLICY "food_household_measures_select_authenticated"
  ON public.food_household_measures
  FOR SELECT
  TO authenticated
  USING (true);

-- Writes are restricted to:
-- - owner nutritionist of custom food (nutritionist_foods.nutritionist_id = auth.uid())
-- - super_admin role
CREATE POLICY "food_household_measures_insert_owner_or_admin"
  ON public.food_household_measures
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.nutritionist_foods nf
      WHERE nf.id = food_household_measures.food_id
        AND nf.nutritionist_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = (SELECT auth.uid())
        AND up.role = 'super_admin'
    )
  );

CREATE POLICY "food_household_measures_update_owner_or_admin"
  ON public.food_household_measures
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.nutritionist_foods nf
      WHERE nf.id = food_household_measures.food_id
        AND nf.nutritionist_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = (SELECT auth.uid())
        AND up.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.nutritionist_foods nf
      WHERE nf.id = food_household_measures.food_id
        AND nf.nutritionist_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = (SELECT auth.uid())
        AND up.role = 'super_admin'
    )
  );

CREATE POLICY "food_household_measures_delete_owner_or_admin"
  ON public.food_household_measures
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.nutritionist_foods nf
      WHERE nf.id = food_household_measures.food_id
        AND nf.nutritionist_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = (SELECT auth.uid())
        AND up.role = 'super_admin'
    )
  );

COMMIT;

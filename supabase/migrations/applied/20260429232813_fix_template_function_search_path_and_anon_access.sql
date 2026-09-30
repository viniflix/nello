
-- ============================================================
-- Sprint 4 — Etapa 4.1: Corrigir search_path nas funções de template
-- e revogar acesso anon às RPCs sensíveis de template
-- ============================================================

-- 1. Fixar search_path em clone_diet_template_to_patient
ALTER FUNCTION public.clone_diet_template_to_patient(uuid, uuid, uuid, text)
  SET search_path = public, pg_catalog;

-- 2. Fixar search_path em clone_meal_template_to_plan
ALTER FUNCTION public.clone_meal_template_to_plan(uuid, bigint, text, time without time zone)
  SET search_path = public, pg_catalog;

-- 3. Fixar search_path em set_updated_at_ncm (trigger fn)
ALTER FUNCTION public.set_updated_at_ncm()
  SET search_path = public, pg_catalog;

-- 4. Fixar search_path em convert_custom_measure_to_grams
ALTER FUNCTION public.convert_custom_measure_to_grams()
  SET search_path = public, pg_catalog;

-- ============================================================
-- Revogar acesso anon às RPCs de template (segurança)
-- ============================================================

-- 5. clone_diet_template_to_patient: apenas authenticated deve chamar
REVOKE EXECUTE ON FUNCTION public.clone_diet_template_to_patient(uuid, uuid, uuid, text) FROM anon;

-- 6. clone_meal_template_to_plan: apenas authenticated deve chamar
REVOKE EXECUTE ON FUNCTION public.clone_meal_template_to_plan(uuid, bigint, text, time without time zone) FROM anon;

-- 7. convert_custom_measure_to_grams: trigger, não deve ser chamada por anon
REVOKE EXECUTE ON FUNCTION public.convert_custom_measure_to_grams() FROM anon;

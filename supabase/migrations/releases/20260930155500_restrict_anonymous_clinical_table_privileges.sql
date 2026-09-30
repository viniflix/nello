-- RLS already limits these relations to authenticated roles. Remove the inherited
-- anonymous table API surface; authenticated workflows and token RPCs are unchanged.
REVOKE ALL ON TABLE public.growth_records, public.meal_plans, public.diet_templates FROM anon;
-- These supported workflows use versioning/invalidation RPCs, or append-only
-- inserts (energy). Do not allow clients to bypass them by mutating history.
REVOKE UPDATE ON TABLE public.lab_results, public.energy_expenditure_calculations FROM authenticated;
REVOKE DELETE ON TABLE public.growth_records FROM authenticated;

-- TRUNCATE bypasses row policies and row triggers; clients have no supported use.
REVOKE TRUNCATE ON TABLE public.growth_records, public.meal_plans, public.diet_templates, public.lab_results, public.energy_expenditure_calculations FROM anon, authenticated;

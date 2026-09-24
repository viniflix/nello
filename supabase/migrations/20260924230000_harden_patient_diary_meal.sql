-- BH-09/BH-10 review: the existing save_patient_diary_meal RPC performs the
-- header, item replacement, server-side nutrient totals and audit in one
-- PostgreSQL transaction. Keep its trusted search path empty and its entry
-- point limited to authenticated users. No historical diary or prescribed
-- meal-plan rows are rewritten by this migration.
alter function public.save_patient_diary_meal(bigint, jsonb, jsonb)
  set search_path = '';

revoke all on function public.save_patient_diary_meal(bigint, jsonb, jsonb)
  from public, anon;
grant execute on function public.save_patient_diary_meal(bigint, jsonb, jsonb)
  to authenticated;

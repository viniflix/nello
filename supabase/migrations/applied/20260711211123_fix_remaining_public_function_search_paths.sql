alter function public.update_modified_column() set search_path = public, pg_temp;
alter function public.get_food_stats(uuid) set search_path = public, pg_temp;
alter function public.create_diet_template(uuid, text, text, jsonb, jsonb) set search_path = public, pg_temp;
alter function public.create_diet_template(uuid, text, text, text[], jsonb) set search_path = public, pg_temp;
alter function public.update_diet_template(uuid, uuid, text, text, jsonb, jsonb) set search_path = public, pg_temp;
alter function public.update_diet_template(uuid, uuid, text, text, text[], jsonb) set search_path = public, pg_temp;

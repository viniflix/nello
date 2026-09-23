-- A single RPC call is one PostgreSQL transaction: validation, parent and children
-- either commit together or leave the previous version untouched.
create or replace function public.save_meal_template(
  p_id uuid, p_expected_updated_at timestamptz, p_name text,
  p_description text, p_tags text[], p_foods jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_updated_at timestamptz;
  v_food jsonb;
  v_food_id uuid;
  v_quantity numeric;
  v_index integer := 0;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if length(coalesce(btrim(p_name), '')) not between 3 and 100
     or jsonb_typeof(coalesce(p_foods, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_foods, '[]'::jsonb)) > 100 then
    raise exception using errcode = '22023', message = 'invalid_meal_template_payload';
  end if;
  if p_id is null then
    insert into public.meal_templates (user_id, name, description, tags)
    values (auth.uid(), btrim(p_name), nullif(btrim(p_description), ''), coalesce(p_tags, '{}'::text[]))
    returning id into v_id;
  else
    select updated_at into v_updated_at from public.meal_templates
    where id = p_id and user_id = auth.uid() for update;
    if not found then
      raise exception using errcode = '42501', message = 'meal_template_not_found_or_forbidden';
    end if;
    if p_expected_updated_at is null or v_updated_at is distinct from p_expected_updated_at then
      raise exception using errcode = '40001', message = 'meal_template_changed_elsewhere';
    end if;
    update public.meal_templates set name = btrim(p_name),
      description = nullif(btrim(p_description), ''), tags = coalesce(p_tags, '{}'::text[]),
      updated_at = clock_timestamp() where id = p_id;
    delete from public.meal_template_foods where meal_template_id = p_id;
    v_id := p_id;
  end if;
  for v_food in select value from jsonb_array_elements(coalesce(p_foods, '[]'::jsonb)) loop
    v_food_id := (v_food->>'food_id')::uuid;
    v_quantity := (v_food->>'quantity')::numeric;
    if v_quantity is null or v_quantity::text = 'NaN' or v_quantity <= 0 or v_quantity > 100000
      or length(coalesce(v_food->>'unit', '')) not between 1 and 40
      or not exists (select 1 from public.foods f where f.id = v_food_id and f.is_active
        and (f.nutritionist_id is null or f.nutritionist_id = auth.uid())) then
      raise exception using errcode = '22023', message = 'invalid_meal_template_food';
    end if;
    insert into public.meal_template_foods
      (meal_template_id, food_id, quantity, unit, observation, order_index)
    values (v_id, v_food_id, v_quantity, v_food->>'unit',
      nullif(v_food->>'observation', ''), v_index);
    v_index := v_index + 1;
  end loop;
  return v_id;
end;
$$;

create or replace function public.save_recipe_template(
  p_id uuid, p_expected_updated_at timestamptz, p_name text,
  p_description text, p_preparation_method text, p_yield_quantity numeric,
  p_yield_unit text, p_ingredients jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_updated_at timestamptz;
  v_ingredient jsonb;
  v_food_id uuid;
  v_quantity numeric;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if length(coalesce(btrim(p_name), '')) not between 3 and 100
    or p_yield_quantity is null or p_yield_quantity::text = 'NaN'
    or p_yield_quantity <= 0 or p_yield_quantity > 100000
    or length(coalesce(btrim(p_yield_unit), '')) not between 1 and 40
    or jsonb_typeof(coalesce(p_ingredients, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_ingredients, '[]'::jsonb)) > 100 then
    raise exception using errcode = '22023', message = 'invalid_recipe_payload';
  end if;
  if p_id is null then
    insert into public.recipes
      (user_id, name, description, preparation_method, yield_quantity, yield_unit)
    values (auth.uid(), btrim(p_name), nullif(btrim(p_description), ''),
      nullif(btrim(p_preparation_method), ''), p_yield_quantity, btrim(p_yield_unit))
    returning id into v_id;
  else
    select updated_at into v_updated_at from public.recipes
    where id = p_id and user_id = auth.uid() and coalesce(is_deleted, false) = false for update;
    if not found then
      raise exception using errcode = '42501', message = 'recipe_not_found_or_forbidden';
    end if;
    if p_expected_updated_at is null or v_updated_at is distinct from p_expected_updated_at then
      raise exception using errcode = '40001', message = 'recipe_changed_elsewhere';
    end if;
    update public.recipes set name = btrim(p_name),
      description = nullif(btrim(p_description), ''),
      preparation_method = nullif(btrim(p_preparation_method), ''),
      yield_quantity = p_yield_quantity, yield_unit = btrim(p_yield_unit),
      version = version + 1, updated_at = clock_timestamp() where id = p_id;
    delete from public.recipe_ingredients where recipe_id = p_id;
    v_id := p_id;
  end if;
  for v_ingredient in select value from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) loop
    v_food_id := (v_ingredient->>'food_id')::uuid;
    v_quantity := (v_ingredient->>'quantity')::numeric;
    if v_quantity is null or v_quantity::text = 'NaN' or v_quantity <= 0 or v_quantity > 100000
      or length(coalesce(v_ingredient->>'unit', '')) not between 1 and 40
      or not exists (select 1 from public.foods f where f.id = v_food_id and f.is_active
        and (f.nutritionist_id is null or f.nutritionist_id = auth.uid())) then
      raise exception using errcode = '22023', message = 'invalid_recipe_ingredient';
    end if;
    insert into public.recipe_ingredients (recipe_id, food_id, quantity, unit)
    values (v_id, v_food_id, v_quantity, v_ingredient->>'unit');
  end loop;
  return v_id;
end;
$$;

revoke all on function public.save_meal_template(uuid,timestamptz,text,text,text[],jsonb) from public, anon;
revoke all on function public.save_recipe_template(uuid,timestamptz,text,text,text,numeric,text,jsonb) from public, anon;
grant execute on function public.save_meal_template(uuid,timestamptz,text,text,text[],jsonb) to authenticated;
grant execute on function public.save_recipe_template(uuid,timestamptz,text,text,text,numeric,text,jsonb) to authenticated;


-- Save a custom food and its complete measure set in one transaction.
create or replace function public.save_custom_food_with_measures(
  p_food_id uuid, p_food jsonb, p_measures jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_food public.nutritionist_foods%rowtype;
  v_item jsonb;
  v_id uuid;
  v_label text;
  v_grams numeric;
  v_kept uuid[] := '{}'::uuid[];
  v_numeric_key text;
begin
  if v_actor is null or not exists (
    select 1 from public.user_profiles where id=v_actor and user_type='nutritionist'
  ) then raise exception 'NUTRITIONIST_REQUIRED' using errcode='42501'; end if;
  if jsonb_typeof(p_food) <> 'object' or jsonb_typeof(p_measures) <> 'array'
     or jsonb_array_length(p_measures) > 40 then
    raise exception 'INVALID_FOOD_PAYLOAD' using errcode='22023';
  end if;

  if p_food_id is not null then
    select * into v_food from public.nutritionist_foods
    where id=p_food_id and nutritionist_id=v_actor for update;
    if not found then raise exception 'FOOD_NOT_OWNED' using errcode='42501'; end if;
  end if;
  v_food := jsonb_populate_record(v_food,p_food);
  v_food.id := coalesce(p_food_id,pg_catalog.gen_random_uuid());
  v_food.nutritionist_id := v_actor;
  if p_food_id is null then v_food.created_at := now(); end if;
  if nullif(pg_catalog.btrim(v_food.name),'') is null or length(v_food.name)>200
     or coalesce(v_food.base_qty,0)<=0 or v_food.base_qty>100000 then
    raise exception 'INVALID_FOOD_FIELDS' using errcode='22023';
  end if;
  -- Reject non-numeric and implausible values before any write, including NaN.
  for v_numeric_key in select key from jsonb_each(p_food)
    where key in ('energy_kcal','protein_g','carbohydrate_g','lipid_g','fiber_g',
      'sodium_mg','saturated_fat_g','monounsaturated_fat_g','polyunsaturated_fat_g',
      'trans_fat_g','cholesterol_mg','sugar_g','calcium_mg','iron_mg','magnesium_mg',
      'phosphorus_mg','potassium_mg','zinc_mg','vitamin_a_mcg','vitamin_c_mg',
      'vitamin_d_mcg','vitamin_e_mg','vitamin_b12_mcg','folate_mcg')
  loop
    if p_food->v_numeric_key <> 'null'::jsonb and (
      jsonb_typeof(p_food->v_numeric_key) <> 'number'
      or (p_food->>v_numeric_key)::numeric < 0
      or (p_food->>v_numeric_key)::numeric > 100000
    ) then raise exception 'INVALID_NUTRIENT: %',v_numeric_key using errcode='22023'; end if;
  end loop;

  if p_food_id is null then
    insert into public.nutritionist_foods select (v_food).*;
  else
    update public.nutritionist_foods set
      name=v_food.name, brand=v_food.brand, barcode=v_food.barcode,
      base_qty=v_food.base_qty, base_unit=v_food.base_unit,
      energy_kcal=v_food.energy_kcal, protein_g=v_food.protein_g,
      carbohydrate_g=v_food.carbohydrate_g, lipid_g=v_food.lipid_g,
      fiber_g=v_food.fiber_g, sodium_mg=v_food.sodium_mg,
      saturated_fat_g=v_food.saturated_fat_g,
      monounsaturated_fat_g=v_food.monounsaturated_fat_g,
      polyunsaturated_fat_g=v_food.polyunsaturated_fat_g,
      trans_fat_g=v_food.trans_fat_g, cholesterol_mg=v_food.cholesterol_mg,
      sugar_g=v_food.sugar_g, calcium_mg=v_food.calcium_mg,
      iron_mg=v_food.iron_mg, magnesium_mg=v_food.magnesium_mg,
      phosphorus_mg=v_food.phosphorus_mg, potassium_mg=v_food.potassium_mg,
      zinc_mg=v_food.zinc_mg, vitamin_a_mcg=v_food.vitamin_a_mcg,
      vitamin_c_mg=v_food.vitamin_c_mg, vitamin_d_mcg=v_food.vitamin_d_mcg,
      vitamin_e_mg=v_food.vitamin_e_mg, vitamin_b12_mcg=v_food.vitamin_b12_mcg,
      folate_mcg=v_food.folate_mcg
    where id=p_food_id and nutritionist_id=v_actor;
  end if;

  for v_item in select value from jsonb_array_elements(p_measures) loop
    if jsonb_typeof(v_item)<>'object' then raise exception 'INVALID_MEASURE' using errcode='22023'; end if;
    v_label := pg_catalog.btrim(v_item->>'label');
    if nullif(v_label,'') is null or length(v_label)>120
       or jsonb_typeof(v_item->'grams')<>'number' then
      raise exception 'INVALID_MEASURE' using errcode='22023';
    end if;
    v_grams := (v_item->>'grams')::numeric;
    if v_grams<=0 or v_grams>100000 then raise exception 'INVALID_MEASURE_WEIGHT' using errcode='22023'; end if;
    if v_item ? 'id' and nullif(v_item->>'id','') is not null then
      v_id := (v_item->>'id')::uuid;
      if v_id=any(v_kept) then raise exception 'DUPLICATE_MEASURE' using errcode='22023'; end if;
      perform 1 from public.food_measures where id=v_id and nutritionist_food_id=v_food.id for update;
      if not found then raise exception 'MEASURE_NOT_OWNED' using errcode='42501'; end if;
      if exists(select 1 from public.meal_items where measure_id=v_id)
         and exists(select 1 from public.food_measures
           where id=v_id and (label<>v_label or weight_in_grams<>v_grams)) then
        raise exception 'MEASURE_IN_USE' using errcode='23503';
      end if;
      update public.food_measures set label=v_label,weight_in_grams=v_grams,
        version=case when label<>v_label or weight_in_grams<>v_grams then version+1 else version end
      where id=v_id;
    else
      insert into public.food_measures(nutritionist_food_id,label,weight_in_grams)
      values(v_food.id,v_label,v_grams) returning id into v_id;
    end if;
    v_kept := array_append(v_kept,v_id);
  end loop;

  if exists(select 1 from public.meal_items mi join public.food_measures fm on fm.id=mi.measure_id
    where fm.nutritionist_food_id=v_food.id and not (fm.id=any(v_kept))) then
    raise exception 'MEASURE_IN_USE' using errcode='23503';
  end if;
  delete from public.food_measures where nutritionist_food_id=v_food.id and not (id=any(v_kept));
  return jsonb_build_object('id',v_food.id,'source','custom','name',v_food.name);
end;
$function$;

revoke all on function public.save_custom_food_with_measures(uuid,jsonb,jsonb) from public;
grant execute on function public.save_custom_food_with_measures(uuid,jsonb,jsonb) to authenticated;

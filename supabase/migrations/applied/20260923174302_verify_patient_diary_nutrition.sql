-- Review of wave 14: derive diary nutrients and household weight from owned food data.
alter table public.meal_items add column if not exists grams numeric;
alter table public.meal_items add column if not exists measure_id uuid references public.food_measures(id);
update public.meal_items set grams = quantity
where grams is null and lower(coalesce(unit, 'g')) in ('g', 'gram', 'grams', 'ml');

create or replace function public.save_patient_diary_meal(
  p_meal_id bigint, p_payload jsonb, p_items jsonb
) returns bigint
language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_patient uuid := auth.uid();
  v_nutritionist uuid;
  v_meal_id bigint;
  v_meal_date date;
  v_meal_time time;
  v_meal_type text;
  v_notes text;
  v_item jsonb;
  v_food_id uuid;
  v_food record;
  v_source text;
  v_quantity numeric;
  v_grams numeric;
  v_unit text;
  v_measure_id uuid;
  v_measure record;
  v_base_qty numeric;
  v_calories numeric;
  v_protein numeric;
  v_carbs numeric;
  v_fat numeric;
  v_total_calories numeric := 0;
  v_total_protein numeric := 0;
  v_total_carbs numeric := 0;
  v_total_fat numeric := 0;
  v_audit_items jsonb := '[]'::jsonb;
begin
  if v_patient is null then raise exception 'DIARY_AUTH_REQUIRED'; end if;
  if jsonb_typeof(p_payload) <> 'object' or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'DIARY_INVALID_PAYLOAD';
  end if;
  select nutritionist_id into v_nutritionist from public.user_profiles where id = v_patient;
  v_meal_date := (p_payload->>'meal_date')::date;
  v_meal_time := (p_payload->>'meal_time')::time;
  v_meal_type := nullif(btrim(p_payload->>'meal_type'), '');
  v_notes := nullif(btrim(coalesce(p_payload->>'notes', '')), '');
  if v_meal_date is null or v_meal_time is null or v_meal_type is null
     or length(v_meal_type) > 80 or length(coalesce(v_notes, '')) > 2000 then
    raise exception 'DIARY_INVALID_MEAL';
  end if;

  if p_meal_id is null then
    insert into public.meals(patient_id, meal_date, meal_time, meal_type, notes,
      total_calories, total_protein, total_carbs, total_fat)
    values(v_patient, v_meal_date, v_meal_time, v_meal_type, v_notes, 0, 0, 0, 0)
    returning id into v_meal_id;
  else
    select id into v_meal_id from public.meals
    where id = p_meal_id and patient_id = v_patient and deleted_at is null for update;
    if not found then raise exception 'DIARY_MEAL_NOT_FOUND'; end if;
    delete from public.meal_items where meal_id = v_meal_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'DIARY_INVALID_ITEM'; end if;
    v_food_id := (v_item->>'food_id')::uuid;
    v_source := coalesce(nullif(v_item->>'food_source', ''), 'reference');
    v_quantity := (v_item->>'quantity')::numeric;
    v_unit := coalesce(nullif(btrim(v_item->>'unit'), ''), 'g');
    v_measure_id := nullif(v_item->>'measure_id', '')::uuid;
    if v_food_id is null or v_source not in ('custom', 'reference')
      or v_quantity is null or v_quantity::text = 'NaN'
      or v_quantity <= 0 or v_quantity > 100000 or length(v_unit) > 40 then
      raise exception 'DIARY_INVALID_ITEM';
    end if;
    select id, name, source, nutritionist_id, is_active, portion_size,
      protein, carbs, fat into v_food from public.foods where id = v_food_id;
    if not found then raise exception 'DIARY_FOOD_UNAVAILABLE'; end if;
    if not coalesce(v_food.is_active, false)
      or (v_source = 'custom' and (v_food.source <> 'custom' or v_food.nutritionist_id is distinct from v_nutritionist))
      or (v_source = 'reference' and v_food.source = 'custom') then
      raise exception 'DIARY_FOOD_UNAVAILABLE';
    end if;

    if lower(v_unit) in ('g', 'gram', 'grams', 'ml') then
      if v_measure_id is not null then raise exception 'DIARY_INVALID_MEASURE'; end if;
      v_grams := v_quantity;
    else
      if v_measure_id is null then raise exception 'DIARY_INVALID_MEASURE'; end if;
      select id, label, weight_in_grams into v_measure from public.food_measures
      where id = v_measure_id and
        ((v_source = 'custom' and nutritionist_food_id = v_food_id)
        or (v_source = 'reference' and reference_food_id = v_food_id));
      if not found then raise exception 'DIARY_INVALID_MEASURE'; end if;
      if v_measure.label <> v_unit or v_measure.weight_in_grams <= 0 then
        raise exception 'DIARY_INVALID_MEASURE';
      end if;
      v_grams := v_quantity * v_measure.weight_in_grams;
    end if;
    if v_grams <= 0 or v_grams > 100000 then raise exception 'DIARY_INVALID_WEIGHT'; end if;
    v_base_qty := case when v_source = 'custom' then nullif(v_food.portion_size, 0) else 100 end;
    if v_base_qty is null or v_base_qty <= 0 then raise exception 'DIARY_INVALID_FOOD_BASE'; end if;
    v_protein := round(coalesce(v_food.protein, 0) * v_grams / v_base_qty, 2);
    v_carbs := round(coalesce(v_food.carbs, 0) * v_grams / v_base_qty, 2);
    v_fat := round(coalesce(v_food.fat, 0) * v_grams / v_base_qty, 2);
    v_calories := round((coalesce(v_food.protein, 0) * 4
      + coalesce(v_food.carbs, 0) * 4 + coalesce(v_food.fat, 0) * 9) * v_grams / v_base_qty, 2);
    if v_protein < 0 or v_carbs < 0 or v_fat < 0 or v_calories < 0
      or v_protein::text = 'NaN' or v_carbs::text = 'NaN'
      or v_fat::text = 'NaN' or v_calories::text = 'NaN' then
      raise exception 'DIARY_INVALID_NUTRITION';
    end if;
    insert into public.meal_items(meal_id, reference_food_id, nutritionist_food_id,
      name, quantity, unit, grams, measure_id, calories, protein, carbs, fat)
    values(v_meal_id,
      case when v_source = 'reference' then v_food_id else null end,
      case when v_source = 'custom' then v_food_id else null end,
      v_food.name, v_quantity, v_unit, v_grams, v_measure_id,
      v_calories, v_protein, v_carbs, v_fat);
    v_total_calories := v_total_calories + v_calories;
    v_total_protein := v_total_protein + v_protein;
    v_total_carbs := v_total_carbs + v_carbs;
    v_total_fat := v_total_fat + v_fat;
    v_audit_items := v_audit_items || jsonb_build_array(jsonb_build_object(
      'food_id', v_food_id, 'name', v_food.name, 'quantity', v_quantity,
      'unit', v_unit, 'grams', v_grams, 'calories', v_calories,
      'protein', v_protein, 'carbs', v_carbs, 'fat', v_fat));
  end loop;

  update public.meals set meal_date = v_meal_date, meal_time = v_meal_time,
    meal_type = v_meal_type, notes = v_notes,
    total_calories = v_total_calories, total_protein = v_total_protein,
    total_carbs = v_total_carbs, total_fat = v_total_fat,
    is_edited = p_meal_id is not null, updated_at = now()
  where id = v_meal_id;
  perform public.log_meal_action(v_patient, v_meal_id,
    case when p_meal_id is null then 'create' else 'update' end,
    v_meal_type, v_meal_date, v_meal_time,
    jsonb_build_object('total_calories',v_total_calories,'total_protein',v_total_protein,
      'total_carbs',v_total_carbs,'total_fat',v_total_fat,'items',v_audit_items));
  return v_meal_id;
end;
$function$;

revoke all on function public.save_patient_diary_meal(bigint,jsonb,jsonb) from public, anon;
grant execute on function public.save_patient_diary_meal(bigint,jsonb,jsonb) to authenticated;

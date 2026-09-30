-- Wave 14: keep the meal header, items, totals and audit entry in one transaction.
create or replace function public.save_patient_diary_meal(
  p_meal_id bigint, p_payload jsonb, p_items jsonb
) returns bigint
language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_patient uuid := auth.uid();
  v_meal_id bigint;
  v_meal_date date;
  v_meal_time time;
  v_meal_type text;
  v_notes text;
  v_item jsonb;
  v_food_id uuid;
  v_source text;
  v_name text;
  v_quantity numeric;
  v_calories numeric;
  v_protein numeric;
  v_carbs numeric;
  v_fat numeric;
  v_total_calories numeric := 0;
  v_total_protein numeric := 0;
  v_total_carbs numeric := 0;
  v_total_fat numeric := 0;
begin
  if v_patient is null then raise exception 'DIARY_AUTH_REQUIRED'; end if;
  if jsonb_typeof(p_payload) <> 'object' or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'DIARY_INVALID_PAYLOAD';
  end if;
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
    v_name := nullif(btrim(v_item->>'name'), '');
    v_quantity := (v_item->>'quantity')::numeric;
    v_calories := (v_item->>'calories')::numeric;
    v_protein := (v_item->>'protein')::numeric;
    v_carbs := (v_item->>'carbs')::numeric;
    v_fat := (v_item->>'fat')::numeric;
    if v_food_id is null or v_source not in ('custom', 'reference')
      or v_name is null or length(v_name) > 300
      or v_quantity is null or v_quantity <= 0 or v_quantity > 100000
      or v_calories is null or v_calories < 0 or v_calories > 100000
      or v_protein is null or v_protein < 0 or v_protein > 100000
      or v_carbs is null or v_carbs < 0 or v_carbs > 100000
      or v_fat is null or v_fat < 0 or v_fat > 100000
      or v_quantity::text = 'NaN' or v_calories::text = 'NaN'
      or v_protein::text = 'NaN' or v_carbs::text = 'NaN' or v_fat::text = 'NaN'
      or length(coalesce(v_item->>'unit', 'gram')) > 40 then
      raise exception 'DIARY_INVALID_ITEM';
    end if;
    insert into public.meal_items(meal_id, reference_food_id, nutritionist_food_id,
      name, quantity, unit, calories, protein, carbs, fat)
    values(v_meal_id,
      case when v_source = 'reference' then v_food_id else null end,
      case when v_source = 'custom' then v_food_id else null end,
      v_name, v_quantity, coalesce(nullif(v_item->>'unit', ''), 'gram'),
      v_calories, v_protein, v_carbs, v_fat);
    v_total_calories := v_total_calories + v_calories;
    v_total_protein := v_total_protein + v_protein;
    v_total_carbs := v_total_carbs + v_carbs;
    v_total_fat := v_total_fat + v_fat;
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
      'total_carbs',v_total_carbs,'total_fat',v_total_fat,'items',p_items));
  return v_meal_id;
end;
$function$;

revoke all on function public.save_patient_diary_meal(bigint,jsonb,jsonb) from public, anon;
grant execute on function public.save_patient_diary_meal(bigint,jsonb,jsonb) to authenticated;

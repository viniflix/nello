-- Copies a whole plan without exposing a partial prescription to a patient.
create or replace function public.copy_meal_plan_to_patient_atomic(
  p_source_plan_id bigint, p_target_patient_id uuid, p_name text default null
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_source public.meal_plans%rowtype;
  v_episode uuid;
  v_plan_id bigint;
  v_meal record;
  v_food record;
  v_sub record;
  v_meal_id bigint;
  v_food_id bigint;
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='authentication_required';
  end if;
  select * into v_source from public.meal_plans
  where id=p_source_plan_id and nutritionist_id=auth.uid() and archived_at is null;
  if not found then
    raise exception using errcode='42501', message='source_plan_not_found_or_forbidden';
  end if;
  if p_target_patient_id is null or length(coalesce(btrim(coalesce(p_name,v_source.name)),'')) not between 3 and 100 then
    raise exception using errcode='22023', message='invalid_plan_copy_payload';
  end if;
  v_episode := private.resolve_active_care_episode(p_target_patient_id);
  if not private.can_write_active_meal_plan(p_target_patient_id,auth.uid(),v_episode) then
    raise exception using errcode='42501', message='target_patient_not_in_active_care';
  end if;
  if not exists(select 1 from public.meal_plan_meals where meal_plan_id=p_source_plan_id) then
    raise exception using errcode='22023', message='source_plan_has_no_meals';
  end if;
  insert into public.meal_plans
    (patient_id,nutritionist_id,care_episode_id,name,description,active_days,
     start_date,is_active,is_draft,plan_mode,prescription_status,source_snapshot)
  values
    (p_target_patient_id,auth.uid(),v_episode,btrim(coalesce(p_name,v_source.name)),
     v_source.description,v_source.active_days,current_date,false,false,
     v_source.plan_mode,'draft',
     jsonb_build_object('origin','copy_meal_plan_to_patient','source_plan_id',p_source_plan_id,
       'copied_at',now(),'requires_professional_review',true))
  returning id into v_plan_id;

  for v_meal in select * from public.meal_plan_meals
      where meal_plan_id=p_source_plan_id order by order_index,id loop
    insert into public.meal_plan_meals
      (meal_plan_id,name,meal_type,meal_time,order_index,notes,
       total_calories,total_protein,total_carbs,total_fat)
    values
      (v_plan_id,v_meal.name,v_meal.meal_type,v_meal.meal_time,v_meal.order_index,
       v_meal.notes,v_meal.total_calories,v_meal.total_protein,v_meal.total_carbs,v_meal.total_fat)
    returning id into v_meal_id;
    for v_food in select * from public.meal_plan_foods
        where meal_plan_meal_id=v_meal.id order by order_index,id loop
      if not exists(select 1 from public.foods f where f.id=v_food.food_id and f.is_active
        and (f.nutritionist_id is null or f.nutritionist_id=auth.uid())) then
        raise exception using errcode='22023', message='source_plan_food_unavailable';
      end if;
      insert into public.meal_plan_foods
        (meal_plan_meal_id,food_id,quantity,unit,calories,protein,carbs,fat,notes,
         order_index,patient_description,food_snapshot,measure_snapshot,equivalent_group)
      values
        (v_meal_id,v_food.food_id,v_food.quantity,v_food.unit,v_food.calories,
         v_food.protein,v_food.carbs,v_food.fat,v_food.notes,v_food.order_index,
         v_food.patient_description,v_food.food_snapshot,v_food.measure_snapshot,
         v_food.equivalent_group)
      returning id into v_food_id;
      for v_sub in select * from public.meal_plan_food_substitutions
          where meal_plan_food_id=v_food.id order by id loop
        if not exists(select 1 from public.foods f where f.id=v_sub.substitute_food_id and f.is_active
          and (f.nutritionist_id is null or f.nutritionist_id=auth.uid())) then
          raise exception using errcode='22023', message='source_plan_substitute_unavailable';
        end if;
        insert into public.meal_plan_food_substitutions
          (meal_plan_food_id,substitute_food_id,notes,quantity,unit,food_snapshot,equivalence_basis)
        values
          (v_food_id,v_sub.substitute_food_id,v_sub.notes,v_sub.quantity,v_sub.unit,
           v_sub.food_snapshot,v_sub.equivalence_basis);
      end loop;
    end loop;
  end loop;
  return v_plan_id;
end;
$$;

revoke all on function public.copy_meal_plan_to_patient_atomic(bigint,uuid,text) from public,anon;
grant execute on function public.copy_meal_plan_to_patient_atomic(bigint,uuid,text) to authenticated;

-- Activating a new plan and deactivating the previous one must be one transaction.
create or replace function public.create_meal_plan_atomic(p_plan_data jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_patient uuid;
  v_episode uuid;
  v_active boolean;
  v_plan_id bigint;
  v_name text;
  v_days jsonb;
begin
  if auth.uid() is null or jsonb_typeof(p_plan_data)<>'object' then
    raise exception using errcode='42501', message='authentication_required';
  end if;
  v_patient := (p_plan_data->>'patient_id')::uuid;
  v_name := btrim(coalesce(p_plan_data->>'name',''));
  v_active := coalesce((p_plan_data->>'is_active')::boolean,true);
  v_days := coalesce(p_plan_data->'active_days',
    '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]'::jsonb);
  if v_patient is null or length(v_name) not between 3 and 100
    or jsonb_typeof(v_days)<>'array'
    or jsonb_array_length(v_days)=0
    or coalesce(p_plan_data->>'plan_mode','hybrid') not in ('quantitative','qualitative','hybrid')
    or (p_plan_data ? 'nutritionist_id' and (p_plan_data->>'nutritionist_id')::uuid<>auth.uid()) then
    raise exception using errcode='22023', message='invalid_meal_plan_payload';
  end if;
  v_episode := private.resolve_active_care_episode(v_patient);
  if not private.can_write_active_meal_plan(v_patient,auth.uid(),v_episode) then
    raise exception using errcode='42501', message='meal_plan_write_forbidden';
  end if;
  -- Serializes competing creations for the same patient.
  perform pg_advisory_xact_lock(hashtext(v_patient::text));
  if v_active then
    update public.meal_plans set is_active=false
    where patient_id=v_patient and is_active=true;
  end if;
  insert into public.meal_plans
    (patient_id,nutritionist_id,care_episode_id,name,description,active_days,
     start_date,end_date,is_active,plan_mode,prescription_status)
  values
    (v_patient,auth.uid(),v_episode,v_name,nullif(btrim(p_plan_data->>'description'),''),
     v_days,coalesce((p_plan_data->>'start_date')::date,current_date),
     nullif(p_plan_data->>'end_date','')::date,v_active,
     coalesce(p_plan_data->>'plan_mode','hybrid'),'draft')
  returning id into v_plan_id;
  return v_plan_id;
end;
$$;
revoke all on function public.create_meal_plan_atomic(jsonb) from public,anon;
grant execute on function public.create_meal_plan_atomic(jsonb) to authenticated;

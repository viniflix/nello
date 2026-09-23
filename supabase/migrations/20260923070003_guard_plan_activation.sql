-- Newly created plans remain inactive until the professional finalizes their content.
create or replace function public.create_meal_plan_atomic(p_plan_data jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_patient uuid; v_episode uuid; v_plan_id bigint; v_name text; v_days jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='authentication_required'; end if;
  if jsonb_typeof(p_plan_data)<>'object' then raise exception using errcode='22023',message='invalid_meal_plan_payload'; end if;
  v_patient:=(p_plan_data->>'patient_id')::uuid;
  v_name:=btrim(coalesce(p_plan_data->>'name',''));
  v_days:=coalesce(p_plan_data->'active_days',
    '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]'::jsonb);
  if v_patient is null or length(v_name) not between 3 and 100
    or jsonb_typeof(v_days)<>'array' or jsonb_array_length(v_days)=0
    or coalesce(p_plan_data->>'plan_mode','hybrid') not in ('quantitative','qualitative','hybrid')
    or (p_plan_data ? 'nutritionist_id' and (p_plan_data->>'nutritionist_id')::uuid<>auth.uid()) then
    raise exception using errcode='22023',message='invalid_meal_plan_payload';
  end if;
  if coalesce((p_plan_data->>'is_active')::boolean,false) then
    raise exception using errcode='22023',message='create_plan_inactive_then_finalize';
  end if;
  v_episode:=private.resolve_active_care_episode(v_patient);
  if not private.can_write_active_meal_plan(v_patient,auth.uid(),v_episode) then
    raise exception using errcode='42501',message='meal_plan_write_forbidden';
  end if;
  insert into public.meal_plans
    (patient_id,nutritionist_id,care_episode_id,name,description,active_days,
     start_date,end_date,is_active,plan_mode,prescription_status)
  values
    (v_patient,auth.uid(),v_episode,v_name,nullif(btrim(p_plan_data->>'description'),''),
     v_days,coalesce((p_plan_data->>'start_date')::date,current_date),
     nullif(p_plan_data->>'end_date','')::date,false,
     coalesce(p_plan_data->>'plan_mode','hybrid'),'draft')
  returning id into v_plan_id;
  return v_plan_id;
end;
$$;

create or replace function private.assert_plan_ready_to_activate(p_plan_id bigint,p_patient_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_plan public.meal_plans%rowtype;
begin
  select * into v_plan from public.meal_plans where id=p_plan_id for update;
  if not found or v_plan.patient_id is distinct from p_patient_id
    or v_plan.nutritionist_id is distinct from auth.uid()
    or v_plan.archived_at is not null
    or not private.can_write_active_meal_plan(v_plan.patient_id,v_plan.nutritionist_id,v_plan.care_episode_id) then
    raise exception using errcode='42501',message='plan_activation_forbidden';
  end if;
  if v_plan.prescription_status not in ('finalized','signed')
    or v_plan.confirmed_by is distinct from auth.uid()
    or not exists(select 1 from public.meal_plan_meals m
      join public.meal_plan_foods f on f.meal_plan_meal_id=m.id
      where m.meal_plan_id=p_plan_id) then
    raise exception using errcode='22023',message='plan_requires_professional_finalization';
  end if;
end;
$$;

create or replace function private.set_active_meal_plan(p_plan_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_patient uuid;
begin
  select patient_id into v_patient from public.meal_plans where id=p_plan_id;
  if v_patient is null then raise exception using errcode='42501',message='plan_activation_forbidden'; end if;
  perform pg_advisory_xact_lock(hashtext(v_patient::text));
  perform private.assert_plan_ready_to_activate(p_plan_id,v_patient);
  update public.meal_plans set is_active=false
  where patient_id=v_patient and is_active=true and id<>p_plan_id;
  update public.meal_plans set is_active=true where id=p_plan_id;
end;
$$;

create or replace function private.promote_draft_to_active(p_draft_id bigint,p_patient_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_patient_id is null then raise exception using errcode='42501',message='plan_activation_forbidden'; end if;
  perform pg_advisory_xact_lock(hashtext(p_patient_id::text));
  perform private.assert_plan_ready_to_activate(p_draft_id,p_patient_id);
  update public.meal_plans set is_active=false
  where patient_id=p_patient_id and is_active=true and id<>p_draft_id;
  update public.meal_plans set is_draft=false,is_active=true,updated_at=now()
  where id=p_draft_id and patient_id=p_patient_id;
end;
$$;

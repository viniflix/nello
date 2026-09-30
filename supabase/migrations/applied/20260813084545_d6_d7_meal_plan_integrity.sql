-- D6-D7: coherent meal-plan modes, nutritional snapshots, measures and auditable archive.
alter table public.meal_plans add column if not exists plan_mode text not null default 'hybrid' check(plan_mode in('quantitative','qualitative','hybrid')),add column if not exists prescription_status text not null default 'draft' check(prescription_status in('draft','finalized','signed','archived','invalidated')),add column if not exists source_snapshot jsonb not null default '{}'::jsonb,add column if not exists confirmed_by uuid references public.user_profiles(id) on delete restrict,add column if not exists confirmed_at timestamptz,add column if not exists archived_at timestamptz,add column if not exists archived_by uuid references public.user_profiles(id) on delete restrict,add column if not exists archive_reason text;
alter table public.meal_plan_foods add column if not exists food_snapshot jsonb not null default '{}'::jsonb,add column if not exists measure_snapshot jsonb not null default '{}'::jsonb,add column if not exists equivalent_group text;
alter table public.meal_plan_food_substitutions add column if not exists food_snapshot jsonb not null default '{}'::jsonb,add column if not exists equivalence_basis text not null default 'professional_choice';
alter table public.household_measures add column if not exists version integer not null default 1,add column if not exists source_code text,add column if not exists source_version integer,add column if not exists updated_at timestamptz not null default now();
alter table public.food_measures add column if not exists version integer not null default 1,add column if not exists source_snapshot jsonb not null default '{}'::jsonb;
alter table public.recipes add column if not exists version integer not null default 1,add column if not exists source_snapshot jsonb not null default '{}'::jsonb,add column if not exists archived_at timestamptz;
alter table public.recipe_ingredients add column if not exists food_snapshot jsonb not null default '{}'::jsonb,add column if not exists measure_snapshot jsonb not null default '{}'::jsonb;

alter table public.meal_plan_foods add constraint meal_plan_foods_positive_quantity_check check(quantity>0),add constraint meal_plan_foods_nonnegative_macros_check check(coalesce(calories,0)>=0 and coalesce(protein,0)>=0 and coalesce(carbs,0)>=0 and coalesce(fat,0)>=0);
alter table public.meal_plan_food_substitutions add constraint meal_plan_substitutions_positive_quantity_check check(quantity is null or quantity>0);
alter table public.food_measures add constraint food_measures_positive_weight_check check(weight_in_grams>0);
alter table public.recipe_ingredients add constraint recipe_ingredients_positive_quantity_check check(quantity>0);

create function public.archive_meal_plan(p_plan_id bigint,p_reason text)returns jsonb language plpgsql security definer set search_path='' as $$declare v public.meal_plans%rowtype;v_reason text:=nullif(btrim(p_reason),'');begin if length(coalesce(v_reason,''))<10 then raise exception using errcode='22023',message='meal_plan_archive_reason_required';end if;select*into v from public.meal_plans where id=p_plan_id for update;if not found or not private.can_write_active_care_episode(v.care_episode_id)or auth.uid()<>v.nutritionist_id then raise exception using errcode='42501',message='meal_plan_archive_forbidden';end if;update public.meal_plans set is_active=false,is_draft=false,prescription_status='archived',archived_at=now(),archived_by=auth.uid(),archive_reason=v_reason,updated_at=now()where id=v.id;insert into public.activity_log(event_name,occurred_at,payload,patient_id,source_module,nutritionist_id,actor_user_id)values('meal_plan.archived',now(),jsonb_build_object('plan_id',v.id,'reason',v_reason),v.patient_id,'meal_plan',v.nutritionist_id,auth.uid());return jsonb_build_object('id',v.id,'status','archived');end$$;

create function private.prevent_meal_plan_delete()returns trigger language plpgsql security definer set search_path='' as $$begin raise exception using errcode='23514',message='meal_plan_hard_delete_forbidden';end$$;
create trigger trg_meal_plans_no_delete before delete on public.meal_plans for each row execute function private.prevent_meal_plan_delete();
revoke all on function public.archive_meal_plan(bigint,text)from public,anon,authenticated;grant execute on function public.archive_meal_plan(bigint,text)to authenticated,service_role;revoke all on function private.prevent_meal_plan_delete()from public,anon,authenticated;

-- Freeze the exact nutritional reference used by a prescription. The current
-- food catalogue may evolve, but an issued plan must remain reproducible.
create function private.freeze_prescription_food_reference()returns trigger language plpgsql security definer set search_path='' as $$
declare v_food record;v_measure record;
begin
  select * into v_food from public.foods where id=new.food_id;
  if not found then raise exception using errcode='23503',message='prescription_food_not_found';end if;
  if new.food_snapshot='{}'::jsonb then
    new.food_snapshot:=jsonb_strip_nulls(jsonb_build_object(
      'id',v_food.id,'name',v_food.name,'source',v_food.source,'source_id',v_food.source_id,
      'portion_size',v_food.portion_size,'base_unit',v_food.base_unit,'calories',v_food.calories,
      'protein',v_food.protein,'carbs',v_food.carbs,'fat',v_food.fat,'fiber',v_food.fiber,
      'sodium',v_food.sodium,'captured_at',now()
    ));
  end if;
  if new.measure_snapshot='{}'::jsonb then
    select fm.id,fm.label,fm.weight_in_grams,fm.version,fm.source_snapshot into v_measure
    from public.food_measures fm
    where (fm.reference_food_id=new.food_id or fm.nutritionist_food_id=new.food_id)
      and lower(fm.label)=lower(new.unit) order by fm.version desc,fm.created_at desc limit 1;
    new.measure_snapshot:=case when found then jsonb_strip_nulls(jsonb_build_object(
      'id',v_measure.id,'label',v_measure.label,'weight_in_grams',v_measure.weight_in_grams,
      'version',v_measure.version,'source',v_measure.source_snapshot
    ))else jsonb_build_object('label',new.unit,'kind','prescription_unit')end;
  end if;
  return new;
end$$;

create function private.freeze_substitution_food_reference()returns trigger language plpgsql security definer set search_path='' as $$
declare v_food record;
begin
  select * into v_food from public.foods where id=new.substitute_food_id;
  if not found then raise exception using errcode='23503',message='substitution_food_not_found';end if;
  if new.food_snapshot='{}'::jsonb then new.food_snapshot:=jsonb_strip_nulls(jsonb_build_object(
    'id',v_food.id,'name',v_food.name,'source',v_food.source,'source_id',v_food.source_id,
    'portion_size',v_food.portion_size,'base_unit',v_food.base_unit,'calories',v_food.calories,
    'protein',v_food.protein,'carbs',v_food.carbs,'fat',v_food.fat,'captured_at',now()
  ));end if;
  return new;
end$$;

create function private.freeze_recipe_ingredient_reference()returns trigger language plpgsql security definer set search_path='' as $$
declare v_food record;v_measure record;
begin
  select * into v_food from public.foods where id=new.food_id;
  if not found then raise exception using errcode='23503',message='recipe_food_not_found';end if;
  if new.food_snapshot='{}'::jsonb then new.food_snapshot:=jsonb_strip_nulls(jsonb_build_object(
    'id',v_food.id,'name',v_food.name,'source',v_food.source,'source_id',v_food.source_id,
    'portion_size',v_food.portion_size,'base_unit',v_food.base_unit,'calories',v_food.calories,
    'protein',v_food.protein,'carbs',v_food.carbs,'fat',v_food.fat,'captured_at',now()
  ));end if;
  if new.measure_snapshot='{}'::jsonb then
    select fm.id,fm.label,fm.weight_in_grams,fm.version,fm.source_snapshot into v_measure
    from public.food_measures fm where(fm.reference_food_id=new.food_id or fm.nutritionist_food_id=new.food_id)
      and lower(fm.label)=lower(coalesce(new.unit,''))order by fm.version desc,fm.created_at desc limit 1;
    new.measure_snapshot:=case when found then jsonb_strip_nulls(jsonb_build_object(
      'id',v_measure.id,'label',v_measure.label,'weight_in_grams',v_measure.weight_in_grams,
      'version',v_measure.version,'source',v_measure.source_snapshot
    ))else jsonb_build_object('label',coalesce(new.unit,''),'kind','recipe_unit')end;
  end if;
  return new;
end$$;

create trigger trg_meal_plan_foods_freeze_reference before insert or update of food_id,unit on public.meal_plan_foods for each row execute function private.freeze_prescription_food_reference();
create trigger trg_meal_plan_substitutions_freeze_reference before insert or update of substitute_food_id,unit on public.meal_plan_food_substitutions for each row execute function private.freeze_substitution_food_reference();
create trigger trg_recipe_ingredients_freeze_reference before insert or update of food_id,unit on public.recipe_ingredients for each row execute function private.freeze_recipe_ingredient_reference();
revoke all on function private.freeze_prescription_food_reference(),private.freeze_substitution_food_reference(),private.freeze_recipe_ingredient_reference()from public,anon,authenticated;

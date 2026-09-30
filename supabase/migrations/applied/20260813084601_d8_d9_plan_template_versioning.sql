-- D8-D9: immutable plan history and deep-copy templates with server-owned identity.
-- Only the database owner may compose the private episode resolver inside the
-- protected deep-copy routine; client roles remain explicitly revoked.
grant execute on function private.resolve_active_care_episode(uuid) to postgres;
alter table public.meal_plan_versions add column if not exists care_episode_id uuid references public.care_episodes(id)on delete restrict;
update public.meal_plan_versions v set care_episode_id=p.care_episode_id from public.meal_plans p where p.id=v.meal_plan_id and v.care_episode_id is null;
drop policy if exists "Nutricionista gerencia versÃµes dos seus planos"on public.meal_plan_versions;
create policy meal_plan_versions_episode_select on public.meal_plan_versions for select to authenticated using(patient_id=auth.uid()or(care_episode_id is not null and private.can_read_care_episode(care_episode_id)));
revoke all on table public.meal_plan_versions from anon;
revoke insert,update,delete,truncate,references,trigger on table public.meal_plan_versions from authenticated;
grant select on table public.meal_plan_versions to authenticated;
revoke all on sequence public.meal_plan_versions_id_seq from anon,authenticated;
alter table public.diet_templates add column if not exists current_version integer not null default 1;
create table public.diet_template_versions(
 id uuid primary key default gen_random_uuid(),template_id uuid not null references public.diet_templates(id)on delete restrict,version integer not null,snapshot jsonb not null,change_reason text not null,created_by uuid not null references public.user_profiles(id)on delete restrict,created_at timestamptz not null default now(),unique(template_id,version)
);
create index diet_template_versions_template_idx on public.diet_template_versions(template_id,version desc);
alter table public.diet_template_versions enable row level security;revoke all on table public.diet_template_versions from public,anon,authenticated;

create function private.build_diet_template_snapshot(p_template_id uuid)returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('template',jsonb_build_object('id',t.id,'name',t.name,'description',t.description,'tags',t.tags,'version',t.current_version),'meals',coalesce((select jsonb_agg(jsonb_build_object('name',m.name,'time',m.time,'order_index',m.order_index,'foods',coalesce((select jsonb_agg(jsonb_build_object('food_id',f.food_id,'quantity',f.quantity,'unit',f.unit,'observation',f.observation,'order_index',f.order_index,'substitutions',coalesce((select jsonb_agg(jsonb_build_object('food_id',s.substitute_food_id,'quantity',s.quantity,'unit',s.unit)order by s.id)from public.diet_template_food_substitutions s where s.template_food_id=f.id),'[]'::jsonb))order by f.order_index,f.id)from public.diet_template_foods f where f.meal_id=m.id),'[]'::jsonb))order by m.order_index,m.id)from public.diet_template_meals m where m.template_id=t.id),'[]'::jsonb))from public.diet_templates t where t.id=p_template_id$$;
revoke all on function private.build_diet_template_snapshot(uuid)from public,anon,authenticated;
grant execute on function private.build_diet_template_snapshot(uuid)to postgres,service_role;

create function public.list_diet_template_versions(p_template_id uuid)returns setof jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('id',v.id,'version',v.version,'snapshot',v.snapshot,'change_reason',v.change_reason,'created_at',v.created_at)
from public.diet_template_versions v join public.diet_templates t on t.id=v.template_id
where v.template_id=p_template_id and t.user_id=auth.uid()
order by v.version desc$$;
revoke all on function public.list_diet_template_versions(uuid)from public,anon,authenticated;
grant execute on function public.list_diet_template_versions(uuid)to authenticated,service_role;

create function private.prevent_version_mutation()returns trigger language plpgsql security definer set search_path='' as $$begin raise exception using errcode='23514',message='clinical_version_is_immutable';end$$;
create trigger trg_diet_template_versions_immutable before update or delete on public.diet_template_versions for each row execute function private.prevent_version_mutation();
create trigger trg_meal_plan_versions_immutable before update or delete on public.meal_plan_versions for each row execute function private.prevent_version_mutation();
revoke all on function private.prevent_version_mutation()from public,anon,authenticated;

create function private.build_meal_plan_snapshot(p_plan_id bigint)returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
  'schema_version',1,
  'plan',to_jsonb(p),
  'meals',coalesce((
    select jsonb_agg(to_jsonb(m)||jsonb_build_object(
      'foods',coalesce((
        select jsonb_agg(to_jsonb(f)||jsonb_build_object(
          'substitutions',coalesce((select jsonb_agg(to_jsonb(s)order by s.id)from public.meal_plan_food_substitutions s where s.meal_plan_food_id=f.id),'[]'::jsonb)
        )order by f.order_index,f.id)from public.meal_plan_foods f where f.meal_plan_meal_id=m.id
      ),'[]'::jsonb)
    )order by m.order_index,m.id)from public.meal_plan_meals m where m.meal_plan_id=p.id
  ),'[]'::jsonb),
  'captured_at',now()
)from public.meal_plans p where p.id=p_plan_id$$;

create function private.capture_meal_plan_version(p_plan_id bigint,p_reason text,p_metadata jsonb default'{}'::jsonb)returns integer language plpgsql security definer set search_path='' as $$
declare v_plan public.meal_plans%rowtype;v_version integer;v_snapshot jsonb;
begin
  select*into v_plan from public.meal_plans where id=p_plan_id;
  if not found then raise exception using errcode='P0002',message='meal_plan_not_found';end if;
  select coalesce(max(version_number),0)+1 into v_version from public.meal_plan_versions where meal_plan_id=p_plan_id;
  v_snapshot:=private.build_meal_plan_snapshot(p_plan_id);
  insert into public.meal_plan_versions(meal_plan_id,nutritionist_id,patient_id,care_episode_id,version_number,change_reason,snapshot,is_rollback,metadata,created_by)
  values(p_plan_id,v_plan.nutritionist_id,v_plan.patient_id,v_plan.care_episode_id,v_version,coalesce(nullif(btrim(p_reason),''),'EdiÃ§Ã£o do plano'),v_snapshot,false,coalesce(p_metadata,'{}'::jsonb),auth.uid());
  return v_version;
end$$;

-- Preserve the existing storage algorithm behind a non-client callable name,
-- then put authorization and atomic history around it.
alter function private.upsert_full_meal_plan(bigint,jsonb,jsonb)rename to write_full_meal_plan_storage;
revoke all on function private.write_full_meal_plan_storage(bigint,jsonb,jsonb)from public,anon,authenticated;
grant execute on function private.write_full_meal_plan_storage(bigint,jsonb,jsonb)to postgres;

create function private.upsert_full_meal_plan(p_plan_id bigint,p_plan_data jsonb,p_meals jsonb)returns jsonb language plpgsql security definer set search_path='' as $$
declare v_plan public.meal_plans%rowtype;v_result jsonb;v_version integer;v_reason text;
begin
  if auth.uid()is null then raise exception using errcode='28000',message='authentication_required';end if;
  if jsonb_typeof(coalesce(p_plan_data,'{}'::jsonb))<>'object'or jsonb_typeof(coalesce(p_meals,'[]'::jsonb))<>'array'then raise exception using errcode='22023',message='invalid_meal_plan_payload';end if;
  select*into v_plan from public.meal_plans where id=p_plan_id for update;
  if not found or not private.can_write_active_meal_plan(v_plan.patient_id,v_plan.nutritionist_id,v_plan.care_episode_id)then raise exception using errcode='42501',message='meal_plan_write_forbidden';end if;
  v_reason:=coalesce(nullif(btrim(p_plan_data->>'change_reason'),''),'EdiÃ§Ã£o confirmada pelo nutricionista');
  if not exists(select 1 from public.meal_plan_versions where meal_plan_id=p_plan_id)then
    perform private.capture_meal_plan_version(p_plan_id,'VersÃ£o inicial antes da primeira ediÃ§Ã£o',jsonb_build_object('origin','server_baseline'));
  end if;
  v_result:=private.write_full_meal_plan_storage(p_plan_id,p_plan_data,p_meals);
  update public.meal_plans set
    active_days=case when jsonb_typeof(p_plan_data->'active_days')='array'then p_plan_data->'active_days'else active_days end,
    plan_mode=case when p_plan_data->>'plan_mode'in('quantitative','qualitative','hybrid')then p_plan_data->>'plan_mode'else plan_mode end,
    prescription_status=case when coalesce((p_plan_data->>'is_draft')::boolean,false)then'draft'else'finalized'end,
    confirmed_by=case when coalesce((p_plan_data->>'is_draft')::boolean,false)then null else auth.uid()end,
    confirmed_at=case when coalesce((p_plan_data->>'is_draft')::boolean,false)then null else now()end,
    source_snapshot=jsonb_build_object('protocol_code','meal_plan.cfn_res_594','protocol_version',1,'professional_confirmed',not coalesce((p_plan_data->>'is_draft')::boolean,false),'captured_at',now()),
    updated_at=now()
  where id=p_plan_id;
  v_version:=private.capture_meal_plan_version(p_plan_id,v_reason,jsonb_build_object('origin','upsert_full_meal_plan','atomic',true));
  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('version_number',v_version);
end$$;

create or replace function public.upsert_full_meal_plan(p_plan_id bigint,p_plan_data jsonb,p_meals jsonb)returns jsonb language sql security definer set search_path='' as $$select private.upsert_full_meal_plan(p_plan_id,p_plan_data,p_meals)$$;
revoke all on function public.upsert_full_meal_plan(bigint,jsonb,jsonb)from public,anon,authenticated;
grant execute on function public.upsert_full_meal_plan(bigint,jsonb,jsonb)to authenticated,service_role;
revoke all on function private.build_meal_plan_snapshot(bigint),private.capture_meal_plan_version(bigint,text,jsonb),private.upsert_full_meal_plan(bigint,jsonb,jsonb)from public,anon,authenticated;
grant execute on function private.build_meal_plan_snapshot(bigint),private.capture_meal_plan_version(bigint,text,jsonb),private.upsert_full_meal_plan(bigint,jsonb,jsonb)to postgres;

drop function if exists public.create_diet_template(uuid,text,text,jsonb,jsonb);
drop function if exists public.update_diet_template(uuid,uuid,text,text,jsonb,jsonb);
create or replace function public.create_diet_template(p_user_id uuid,p_name text,p_description text,p_tags text[],p_meals jsonb)returns uuid language plpgsql security definer set search_path='' as $$declare v_id uuid;v_meal jsonb;v_meal_id uuid;v_food jsonb;begin if auth.uid()is null or p_user_id<>auth.uid()then raise exception using errcode='42501',message='template_owner_mismatch';end if;if length(coalesce(btrim(p_name),''))<3 or jsonb_typeof(coalesce(p_meals,'[]'::jsonb))<>'array'then raise exception using errcode='22023',message='invalid_diet_template_payload';end if;insert into public.diet_templates(user_id,name,description,tags,current_version)values(auth.uid(),btrim(p_name),nullif(btrim(p_description),''),coalesce(p_tags,'{}'::text[]),1)returning id into v_id;for v_meal in select value from jsonb_array_elements(coalesce(p_meals,'[]'::jsonb))loop insert into public.diet_template_meals(template_id,name,time,order_index)values(v_id,coalesce(nullif(btrim(v_meal->>'name'),''),'RefeiÃ§Ã£o'),nullif(v_meal->>'time','')::time,coalesce((v_meal->>'order_index')::integer,0))returning id into v_meal_id;for v_food in select value from jsonb_array_elements(coalesce(v_meal->'foods','[]'::jsonb))loop insert into public.diet_template_foods(meal_id,food_id,quantity,unit,observation,order_index)values(v_meal_id,(v_food->>'food_id')::uuid,(v_food->>'quantity')::numeric,coalesce(nullif(v_food->>'unit',''),'g'),nullif(v_food->>'observation',''),coalesce((v_food->>'order_index')::integer,0));end loop;end loop;insert into public.diet_template_versions(template_id,version,snapshot,change_reason,created_by)values(v_id,1,private.build_diet_template_snapshot(v_id),'CriaÃ§Ã£o do template',auth.uid());return v_id;end$$;

create or replace function public.update_diet_template(p_template_id uuid,p_user_id uuid,p_name text,p_description text,p_tags text[],p_meals jsonb)returns void language plpgsql security definer set search_path='' as $$declare v_current integer;v_meal jsonb;v_meal_id uuid;v_food jsonb;begin if auth.uid()is null or p_user_id<>auth.uid()then raise exception using errcode='42501',message='template_owner_mismatch';end if;if length(coalesce(btrim(p_name),''))<3 or jsonb_typeof(coalesce(p_meals,'[]'::jsonb))<>'array'then raise exception using errcode='22023',message='invalid_diet_template_payload';end if;select current_version into v_current from public.diet_templates where id=p_template_id and user_id=auth.uid()for update;if not found then raise exception using errcode='42501',message='template_not_found_or_forbidden';end if;insert into public.diet_template_versions(template_id,version,snapshot,change_reason,created_by)values(p_template_id,v_current,private.build_diet_template_snapshot(p_template_id),'Snapshot anterior Ã  ediÃ§Ã£o',auth.uid())on conflict(template_id,version)do nothing;delete from public.diet_template_meals where template_id=p_template_id;update public.diet_templates set name=btrim(p_name),description=nullif(btrim(p_description),''),tags=coalesce(p_tags,'{}'::text[]),current_version=v_current+1,updated_at=now()where id=p_template_id;for v_meal in select value from jsonb_array_elements(coalesce(p_meals,'[]'::jsonb))loop insert into public.diet_template_meals(template_id,name,time,order_index)values(p_template_id,coalesce(nullif(btrim(v_meal->>'name'),''),'RefeiÃ§Ã£o'),nullif(v_meal->>'time','')::time,coalesce((v_meal->>'order_index')::integer,0))returning id into v_meal_id;for v_food in select value from jsonb_array_elements(coalesce(v_meal->'foods','[]'::jsonb))loop insert into public.diet_template_foods(meal_id,food_id,quantity,unit,observation,order_index)values(v_meal_id,(v_food->>'food_id')::uuid,(v_food->>'quantity')::numeric,coalesce(nullif(v_food->>'unit',''),'g'),nullif(v_food->>'observation',''),coalesce((v_food->>'order_index')::integer,0));end loop;end loop;insert into public.diet_template_versions(template_id,version,snapshot,change_reason,created_by)values(p_template_id,v_current+1,private.build_diet_template_snapshot(p_template_id),'Template atualizado',auth.uid());end$$;

create or replace function private.clone_diet_template_to_patient(p_template_id uuid,p_patient_id uuid,p_nutritionist_id uuid,p_name text default null)returns bigint language plpgsql security definer set search_path='' as $$declare v_template public.diet_templates%rowtype;v_episode uuid;v_plan bigint;v_meal public.diet_template_meals%rowtype;v_plan_meal bigint;v_food public.diet_template_foods%rowtype;v_plan_food bigint;v_sub public.diet_template_food_substitutions%rowtype;v_nutrition public.foods%rowtype;begin if auth.uid()is null or p_nutritionist_id<>auth.uid()then raise exception using errcode='42501',message='template_clone_actor_mismatch';end if;select*into v_template from public.diet_templates where id=p_template_id and user_id=auth.uid();if not found then raise exception using errcode='42501',message='template_not_found_or_forbidden';end if;v_episode:=private.resolve_active_care_episode(p_patient_id);insert into public.meal_plans(patient_id,nutritionist_id,care_episode_id,name,description,is_active,is_draft,start_date,plan_mode,prescription_status,source_snapshot)values(p_patient_id,auth.uid(),v_episode,coalesce(nullif(btrim(p_name),''),v_template.name),v_template.description,true,true,current_date,'hybrid','draft',jsonb_build_object('template_id',v_template.id,'template_version',v_template.current_version,'deep_copy',true))returning id into v_plan;for v_meal in select*from public.diet_template_meals where template_id=p_template_id order by order_index,id loop insert into public.meal_plan_meals(meal_plan_id,name,meal_type,meal_time,order_index)values(v_plan,v_meal.name,'other',v_meal.time,v_meal.order_index)returning id into v_plan_meal;for v_food in select*from public.diet_template_foods where meal_id=v_meal.id order by order_index,id loop select*into v_nutrition from public.foods where id=v_food.food_id;insert into public.meal_plan_foods(meal_plan_meal_id,food_id,quantity,unit,notes,order_index,calories,protein,carbs,fat,food_snapshot)values(v_plan_meal,v_food.food_id,v_food.quantity,v_food.unit,v_food.observation,v_food.order_index,coalesce(v_nutrition.calories,0)*v_food.quantity/100,coalesce(v_nutrition.protein,0)*v_food.quantity/100,coalesce(v_nutrition.carbs,0)*v_food.quantity/100,coalesce(v_nutrition.fat,0)*v_food.quantity/100,jsonb_strip_nulls(jsonb_build_object('name',v_nutrition.name,'source',v_nutrition.source,'source_id',v_nutrition.source_id,'base_quantity_g',100,'calories',v_nutrition.calories,'protein',v_nutrition.protein,'carbs',v_nutrition.carbs,'fat',v_nutrition.fat)))returning id into v_plan_food;for v_sub in select*from public.diet_template_food_substitutions where template_food_id=v_food.id loop insert into public.meal_plan_food_substitutions(meal_plan_food_id,substitute_food_id,quantity,unit)values(v_plan_food,v_sub.substitute_food_id,v_sub.quantity,v_sub.unit);end loop;end loop;end loop;return v_plan;end$$;

create or replace function public.clone_diet_template_to_patient(p_template_id uuid,p_patient_id uuid,p_nutritionist_id uuid,p_name text default null)returns bigint language sql security definer set search_path='' as $$select private.clone_diet_template_to_patient(p_template_id,p_patient_id,p_nutritionist_id,p_name)$$;

revoke all on function public.create_diet_template(uuid,text,text,text[],jsonb),public.update_diet_template(uuid,uuid,text,text,text[],jsonb),public.clone_diet_template_to_patient(uuid,uuid,uuid,text)from public,anon,authenticated;grant execute on function public.create_diet_template(uuid,text,text,text[],jsonb),public.update_diet_template(uuid,uuid,text,text,text[],jsonb),public.clone_diet_template_to_patient(uuid,uuid,uuid,text)to authenticated,service_role;revoke all on function private.clone_diet_template_to_patient(uuid,uuid,uuid,text)from public,anon,authenticated;grant execute on function private.clone_diet_template_to_patient(uuid,uuid,uuid,text)to postgres,service_role;

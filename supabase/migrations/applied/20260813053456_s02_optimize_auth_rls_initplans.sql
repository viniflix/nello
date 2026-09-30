-- S0.2 / estágio 2: auth.uid() deve ser calculado uma vez por comando, não por linha.
-- As expressões de propriedade permanecem equivalentes às policies anteriores.
set lock_timeout = '5s';
set statement_timeout = '30s';

alter policy "Users can manage their own diet templates"
on public.diet_templates
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter policy "Users can manage their own template meals"
on public.diet_template_meals
to authenticated
using (exists (
  select 1
  from public.diet_templates dt
  where dt.id = diet_template_meals.template_id
    and dt.user_id = (select auth.uid())
))
with check (exists (
  select 1
  from public.diet_templates dt
  where dt.id = diet_template_meals.template_id
    and dt.user_id = (select auth.uid())
));

alter policy "Users can manage their own template foods"
on public.diet_template_foods
to authenticated
using (exists (
  select 1
  from public.diet_template_meals dtm
  join public.diet_templates dt on dt.id = dtm.template_id
  where dtm.id = diet_template_foods.meal_id
    and dt.user_id = (select auth.uid())
))
with check (exists (
  select 1
  from public.diet_template_meals dtm
  join public.diet_templates dt on dt.id = dtm.template_id
  where dtm.id = diet_template_foods.meal_id
    and dt.user_id = (select auth.uid())
));

alter policy "Users can manage their own template substitutions"
on public.diet_template_food_substitutions
to authenticated
using (exists (
  select 1
  from public.diet_template_foods dtf
  join public.diet_template_meals dtm on dtm.id = dtf.meal_id
  join public.diet_templates dt on dt.id = dtm.template_id
  where dtf.id = diet_template_food_substitutions.template_food_id
    and dt.user_id = (select auth.uid())
))
with check (exists (
  select 1
  from public.diet_template_foods dtf
  join public.diet_template_meals dtm on dtm.id = dtf.meal_id
  join public.diet_templates dt on dt.id = dtm.template_id
  where dtf.id = diet_template_food_substitutions.template_food_id
    and dt.user_id = (select auth.uid())
));

alter policy "Users can manage their own meal templates"
on public.meal_templates
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter policy "Users can manage their own meal template foods"
on public.meal_template_foods
to authenticated
using (exists (
  select 1
  from public.meal_templates mt
  where mt.id = meal_template_foods.meal_template_id
    and mt.user_id = (select auth.uid())
))
with check (exists (
  select 1
  from public.meal_templates mt
  where mt.id = meal_template_foods.meal_template_id
    and mt.user_id = (select auth.uid())
));

alter policy "Users can manage their own meal template substitutions"
on public.meal_template_food_substitutions
to authenticated
using (exists (
  select 1
  from public.meal_template_foods mtf
  join public.meal_templates mt on mt.id = mtf.meal_template_id
  where mtf.id = meal_template_food_substitutions.template_food_id
    and mt.user_id = (select auth.uid())
))
with check (exists (
  select 1
  from public.meal_template_foods mtf
  join public.meal_templates mt on mt.id = mtf.meal_template_id
  where mtf.id = meal_template_food_substitutions.template_food_id
    and mt.user_id = (select auth.uid())
));

alter policy "Users can manage their own recipes"
on public.recipes
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter policy "Users can manage their own recipe ingredients"
on public.recipe_ingredients
to authenticated
using (exists (
  select 1
  from public.recipes r
  where r.id = recipe_ingredients.recipe_id
    and r.user_id = (select auth.uid())
))
with check (exists (
  select 1
  from public.recipes r
  where r.id = recipe_ingredients.recipe_id
    and r.user_id = (select auth.uid())
));

alter policy nutritionist_custom_measures_select
on public.nutritionist_custom_measures
to authenticated
using ((select auth.uid()) = nutritionist_id);

alter policy nutritionist_custom_measures_insert
on public.nutritionist_custom_measures
to authenticated
with check (
  (select auth.uid()) = nutritionist_id
  and (
    select count(*)
    from public.nutritionist_custom_measures existing_measure
    where existing_measure.nutritionist_id = (select auth.uid())
  ) < 20
);

alter policy nutritionist_custom_measures_update
on public.nutritionist_custom_measures
to authenticated
using ((select auth.uid()) = nutritionist_id)
with check ((select auth.uid()) = nutritionist_id);

alter policy nutritionist_custom_measures_delete
on public.nutritionist_custom_measures
to authenticated
using ((select auth.uid()) = nutritionist_id);

-- Remove policies legadas sobrepostas e recria um contrato único por operação.
drop policy if exists "Nutricionista pode gerenciar seus templates" on public.anamnesis_templates;
drop policy if exists "Nutricionista vê seus templates e os globais" on public.anamnesis_templates;
drop policy if exists "Nutricionists can view their own templates and system defaults" on public.anamnesis_templates;
drop policy if exists "Nutricionists can create their own templates" on public.anamnesis_templates;
drop policy if exists "Nutricionists can update their own templates" on public.anamnesis_templates;
drop policy if exists "Nutricionists can delete their own templates" on public.anamnesis_templates;

create policy anamnesis_templates_select
on public.anamnesis_templates
for select to authenticated
using (
  nutritionist_id = (select auth.uid())
  or is_system_default is true
);

create policy anamnesis_templates_insert
on public.anamnesis_templates
for insert to authenticated
with check (
  nutritionist_id = (select auth.uid())
  and is_system_default is false
);

create policy anamnesis_templates_update
on public.anamnesis_templates
for update to authenticated
using (
  nutritionist_id = (select auth.uid())
  and is_system_default is false
)
with check (
  nutritionist_id = (select auth.uid())
  and is_system_default is false
);

create policy anamnesis_templates_delete
on public.anamnesis_templates
for delete to authenticated
using (
  nutritionist_id = (select auth.uid())
  and is_system_default is false
);

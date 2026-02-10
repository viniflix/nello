-- Fase 13: criar indices para FKs sem cobertura (INFO do linter)
-- Seguro executar em horario de baixo uso.

begin;

do $$
declare
  r record;
  v_cols text;
  v_index_name text;
begin
  for r in
    select con.conname, n.nspname, c.relname, con.conrelid, con.conkey
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'f'
      and n.nspname = 'public'
      and con.conname in (
        'anamnese_answers_field_id_fkey',
        'anamnese_fields_nutritionist_id_fkey',
        'anamnesis_records_template_id_fkey',
        'anamnesis_template_fields_field_id_fkey',
        'financial_records_patient_id_fkey',
        'financial_records_service_id_fkey',
        'food_household_measures_food_id_fkey',
        'food_household_measures_measure_id_fkey',
        'glycemia_records_nutritionist_id_fkey',
        'glycemia_records_patient_id_fkey',
        'meal_edit_history_meal_id_fkey',
        'meal_history_changed_by_fkey',
        'meal_history_meal_id_fkey',
        'meals_meal_plan_id_fkey',
        'patient_goals_energy_expenditure_id_fkey',
        'patient_goals_meal_plan_id_fkey',
        'recurring_expenses_nutritionist_id_fkey',
        'services_nutritionist_id_fkey',
        'user_achievements_achievement_id_fkey'
      )
  loop
    select string_agg(quote_ident(a.attname), ', ' order by cols.ord)
      into v_cols
    from unnest(r.conkey) with ordinality as cols(attnum, ord)
    join pg_attribute a on a.attrelid = r.conrelid and a.attnum = cols.attnum;

    v_index_name := left(format('idx_%s_%s_fk', r.relname, r.conname), 63);

    if to_regclass(format('%I.%I', r.nspname, v_index_name)) is null then
      execute format('create index %I on %I.%I (%s)', v_index_name, r.nspname, r.relname, v_cols);
    end if;
  end loop;
end $$;

commit;

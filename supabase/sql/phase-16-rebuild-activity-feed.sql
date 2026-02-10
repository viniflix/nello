-- Fase 16: reconstruir RPC get_comprehensive_activity_feed_optimized
-- Remove dependencias de colunas inexistentes (ex: anr.form_type).

begin;

drop function if exists public.get_comprehensive_activity_feed_optimized(uuid, integer);

create function public.get_comprehensive_activity_feed_optimized(
  p_nutritionist_id uuid,
  p_limit int default 30
)
returns table (
  activity_type text,
  activity_id text,
  patient_id uuid,
  patient_name text,
  activity_date timestamptz,
  activity_data jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  has_table boolean;
  has_col boolean;
  q text;
  queries text[] := '{}';
  created_expr text;
  meal_type_expr text;
  details_expr text;
  action_expr text;
  weight_expr text;
  height_expr text;
  name_expr text;
  notes_expr text;
  date_expr text;
begin
  if p_limit is null or p_limit < 1 then
    p_limit := 30;
  end if;

  -- meal_audit_log
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'meal_audit_log'
  ) into has_table;
  if has_table then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'meal_audit_log' and column_name = 'created_at'
    ) into has_col;
    created_expr := case when has_col then 'mal.created_at' else 'now()' end;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'meal_audit_log' and column_name = 'meal_type'
    ) into has_col;
    meal_type_expr := case when has_col then 'mal.meal_type' else 'null' end;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'meal_audit_log' and column_name = 'details'
    ) into has_col;
    details_expr := case when has_col then 'mal.details' else 'null' end;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'meal_audit_log' and column_name = 'action'
    ) into has_col;
    action_expr := case when has_col then 'mal.action' else 'null' end;

    q := format(
      'select %L as activity_type,
              mal.id::text as activity_id,
              mal.patient_id::uuid as patient_id,
              p.name as patient_name,
              %s as activity_date,
              jsonb_build_object(
                ''meal_type'', %s,
                ''total_calories'', case when %s is null then null else nullif(%s->>''total_calories'', '''')::numeric end,
                ''action'', %s
              ) as activity_data
       from public.meal_audit_log mal
       join patients p on p.id = mal.patient_id',
      'meal', created_expr, meal_type_expr, details_expr, details_expr, action_expr
    );
    queries := array_append(queries, q);
  end if;

  -- growth_records (anthropometry)
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'growth_records'
  ) into has_table;
  if has_table then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'growth_records' and column_name = 'record_date'
    ) into has_col;
    date_expr := case when has_col then 'gr.record_date' else 'null' end;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'growth_records' and column_name = 'created_at'
    ) into has_col;
    created_expr := case when has_col then 'gr.created_at' else 'null' end;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'growth_records' and column_name = 'weight'
    ) into has_col;
    weight_expr := case when has_col then 'gr.weight' else 'null' end;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'growth_records' and column_name = 'height'
    ) into has_col;
    height_expr := case when has_col then 'gr.height' else 'null' end;

    q := format(
      'select %L as activity_type,
              gr.id::text as activity_id,
              gr.patient_id::uuid as patient_id,
              p.name as patient_name,
              coalesce(%s, %s, now()) as activity_date,
              jsonb_build_object(''weight'', %s, ''height'', %s) as activity_data
       from public.growth_records gr
       join patients p on p.id = gr.patient_id',
      'anthropometry', date_expr, created_expr, weight_expr, height_expr
    );
    queries := array_append(queries, q);
  end if;

  -- anamnesis_records
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'anamnesis_records'
  ) into has_table;
  if has_table then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'anamnesis_records' and column_name = 'date'
    ) into has_col;
    date_expr := case when has_col then 'anr.date' else 'null' end;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'anamnesis_records' and column_name = 'created_at'
    ) into has_col;
    created_expr := case when has_col then 'anr.created_at' else 'null' end;

    q := format(
      'select %L as activity_type,
              anr.id::text as activity_id,
              anr.patient_id::uuid as patient_id,
              p.name as patient_name,
              coalesce(%s, %s, now()) as activity_date,
              jsonb_build_object(''status'', ''completed'') as activity_data
       from public.anamnesis_records anr
       join patients p on p.id = anr.patient_id',
      'anamnesis', date_expr, created_expr
    );
    queries := array_append(queries, q);
  end if;

  -- meal_plans
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'meal_plans'
  ) into has_table;
  if has_table then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'meal_plans' and column_name = 'name'
    ) into has_col;
    name_expr := case when has_col then 'mp.name' else 'null' end;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'meal_plans' and column_name = 'created_at'
    ) into has_col;
    created_expr := case when has_col then 'mp.created_at' else 'now()' end;

    q := format(
      'select %L as activity_type,
              mp.id::text as activity_id,
              mp.patient_id::uuid as patient_id,
              p.name as patient_name,
              %s as activity_date,
              jsonb_build_object(''name'', %s) as activity_data
       from public.meal_plans mp
       join patients p on p.id = mp.patient_id',
      'meal_plan', created_expr, name_expr
    );
    queries := array_append(queries, q);
  end if;

  -- appointments
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'appointments'
  ) into has_table;
  if has_table then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'appointments' and column_name = 'appointment_time'
    ) into has_col;
    date_expr := case when has_col then 'a.appointment_time' else 'now()' end;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'appointments' and column_name = 'notes'
    ) into has_col;
    notes_expr := case when has_col then 'a.notes' else 'null' end;

    q := format(
      'select %L as activity_type,
              a.id::text as activity_id,
              a.patient_id::uuid as patient_id,
              p.name as patient_name,
              %s as activity_date,
              jsonb_build_object(''notes'', %s) as activity_data
       from public.appointments a
       join patients p on p.id = a.patient_id',
      'appointment', date_expr, notes_expr
    );
    queries := array_append(queries, q);
  end if;

  -- user_achievements
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'user_achievements'
  ) into has_table;
  if has_table then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'user_achievements' and column_name = 'achieved_at'
    ) into has_col;
    created_expr := case when has_col then 'ua.achieved_at' else 'now()' end;

    q := format(
      'select %L as activity_type,
              ua.id::text as activity_id,
              ua.user_id::uuid as patient_id,
              p.name as patient_name,
              %s as activity_date,
              jsonb_build_object(''achievement_id'', ua.achievement_id) as activity_data
       from public.user_achievements ua
       join patients p on p.id = ua.user_id',
      'achievement', created_expr
    );
    queries := array_append(queries, q);
  end if;

  if array_length(queries, 1) is null then
    return;
  end if;

  q := 'with patients as (
          select id, name
          from public.user_profiles
          where nutritionist_id = $1
        )
        select * from ('
        || array_to_string(queries, ' union all ')
        || ') feed
        order by activity_date desc nulls last
        limit $2';

  return query execute q using p_nutritionist_id, p_limit;
end;
$$;

commit;

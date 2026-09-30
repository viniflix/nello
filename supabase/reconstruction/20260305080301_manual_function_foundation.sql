-- CI-only current definitions absent from recorded CREATE FUNCTION statements.

-- A name appearing in a consumer is NOT proof that its definition was recorded.

CREATE SCHEMA IF NOT EXISTS private;

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION private.clear_message_notifications_from_sender(p_sender_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from public.notifications n
  where n.user_id = auth.uid()
    and n.type = 'new_message'
    and coalesce(n.content->>'from_id', '') = p_sender_id::text;
end;
$function$;

CREATE OR REPLACE FUNCTION private.get_invite_details(p_invite_code text)
 RETURNS TABLE(patient_name text, nutritionist_name text, nutritionist_gender text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_patient_name TEXT;
  v_nutritionist_id UUID;
  v_nutritionist_name TEXT;
  v_nutritionist_gender TEXT;
BEGIN
  -- Validate code format roughly (optional but good practice)
  IF length(p_invite_code) < 3 THEN
    RAISE EXCEPTION 'Código inválido';
  END IF;

  -- Find the offline patient profile
  SELECT name, nutritionist_id 
  INTO v_patient_name, v_nutritionist_id 
  FROM user_profiles 
  WHERE patient_invite_code = p_invite_code 
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite não encontrado ou expirado';
  END IF;

  -- Find the nutritionist details
  IF v_nutritionist_id IS NOT NULL THEN
    SELECT name, gender 
    INTO v_nutritionist_name, v_nutritionist_gender
    FROM user_profiles
    WHERE id = v_nutritionist_id;
  END IF;

  RETURN QUERY SELECT v_patient_name, v_nutritionist_name, v_nutritionist_gender;
END;
$function$;

CREATE OR REPLACE FUNCTION private.get_operational_health_summary(p_nutritionist_id uuid DEFAULT auth.uid(), p_window_hours integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_now timestamptz := now();
  v_since timestamptz;
  v_total int := 0;
  v_errors int := 0;
  v_error_rate numeric := 0;
  v_avg_latency numeric := 0;
  v_module_stats jsonb := '[]'::jsonb;
begin
  v_since := v_now - make_interval(hours => greatest(1, least(coalesce(p_window_hours, 24), 168)));
  with filtered as (
    select * from public.operational_observability_log l
    where l.created_at >= v_since and (p_nutritionist_id is null or l.nutritionist_id = p_nutritionist_id)
  )
  select count(*)::int, count(*) filter (where event_type = 'error')::int, coalesce(avg(latency_ms), 0)
  into v_total, v_errors, v_avg_latency from filtered;
  v_error_rate := case when v_total > 0 then round((v_errors::numeric / v_total::numeric) * 100, 2) else 0 end;
  with filtered as (
    select * from public.operational_observability_log l
    where l.created_at >= v_since and (p_nutritionist_id is null or l.nutritionist_id = p_nutritionist_id)
  ),
  by_module as (
    select module, count(*)::int as total_events, count(*) filter (where event_type = 'error')::int as error_events,
      round(coalesce(avg(latency_ms), 0), 2) as avg_latency_ms
    from filtered group by module
  )
  select coalesce(jsonb_agg(jsonb_build_object('module', module, 'total_events', total_events, 'error_events', error_events, 'avg_latency_ms', avg_latency_ms) order by module), '[]'::jsonb)
  into v_module_stats from by_module;
  return jsonb_build_object('window_hours', greatest(1, least(coalesce(p_window_hours, 24), 168)), 'since', v_since, 'until', v_now,
    'total_events', v_total, 'error_events', v_errors, 'error_rate', v_error_rate, 'avg_latency_ms', round(v_avg_latency, 2), 'module_stats', v_module_stats);
end;
$function$;

CREATE OR REPLACE FUNCTION private.get_own_profile_attrs()
 RETURNS TABLE(is_admin boolean, user_type text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select up.is_admin, up.user_type
  from public.user_profiles up
  where up.id = auth.uid()
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION private.interact_notification(p_notification_id uuid, p_delete_if_message boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type text;
  v_owner uuid;
begin
  select n.type, n.user_id
    into v_type, v_owner
  from public.notifications n
  where n.id = p_notification_id;

  if v_owner is null then
    return;
  end if;

  if auth.uid() is distinct from v_owner then
    raise exception 'Sem permissão para interagir com esta notificação.';
  end if;

  if p_delete_if_message and v_type = 'new_message' then
    delete from public.notifications
    where id = p_notification_id
      and user_id = auth.uid();
  else
    update public.notifications
    set is_read = true
    where id = p_notification_id
      and user_id = auth.uid();
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.is_nutritionist()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and user_type = 'nutritionist'
  );
$function$;

CREATE OR REPLACE FUNCTION private.is_patient()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and user_type = 'patient'
  );
$function$;

CREATE OR REPLACE FUNCTION private.log_meal_action_secure(p_meal_id text, p_action text, p_details jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_patient_id uuid;
  v_has_meal_nutritionist boolean;
  v_has_audit_nutritionist boolean;
  v_nutritionist_id uuid;
begin
  -- buscar patient_id de forma resiliente (id pode ser uuid ou bigint)
  select m.patient_id
    into v_patient_id
  from public.meals m
  where m.id::text = p_meal_id
  limit 1;

  if v_patient_id is null then
    raise exception 'meal not found';
  end if;

  -- verificar se existe coluna nutritionist_id em meals
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'meals'
      and column_name = 'nutritionist_id'
  ) into v_has_meal_nutritionist;

  if v_has_meal_nutritionist then
    execute format('select nutritionist_id from public.meals where id::text = %L', p_meal_id)
      into v_nutritionist_id;
  else
    -- derivar nutritionist_id pelo patient_id (via user_profiles)
    select p.nutritionist_id into v_nutritionist_id
    from public.user_profiles p
    where p.id = v_patient_id
    limit 1;
  end if;

  if not (v_patient_id = auth.uid() or v_nutritionist_id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  -- verificar se audit_log possui nutritionist_id
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'meal_audit_log'
      and column_name = 'nutritionist_id'
  ) into v_has_audit_nutritionist;

  if v_has_audit_nutritionist then
    execute format(
      'insert into public.meal_audit_log (meal_id, patient_id, nutritionist_id, action, details, created_at)
       values (%L, %L, %L, %L, %L, now())',
      p_meal_id,
      v_patient_id::text,
      v_nutritionist_id::text,
      p_action,
      p_details::text
    );
  else
    execute format(
      'insert into public.meal_audit_log (meal_id, patient_id, action, details, created_at)
       values (%L, %L, %L, %L, now())',
      p_meal_id,
      v_patient_id::text,
      p_action,
      p_details::text
    );
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.log_operational_event(p_module text, p_operation text, p_event_type text DEFAULT 'success'::text, p_latency_ms integer DEFAULT 0, p_nutritionist_id uuid DEFAULT NULL::uuid, p_patient_id uuid DEFAULT NULL::uuid, p_error_message text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_event_id bigint;
begin
  if p_module is null or trim(p_module) = '' then p_module := 'system'; end if;
  if p_operation is null or trim(p_operation) = '' then p_operation := 'unknown_operation'; end if;
  if p_event_type not in ('success', 'error') then p_event_type := 'error'; end if;
  insert into public.operational_observability_log (nutritionist_id, patient_id, module, operation, event_type, latency_ms, error_message, metadata)
  values (p_nutritionist_id, p_patient_id, p_module, p_operation, p_event_type, greatest(coalesce(p_latency_ms, 0), 0), p_error_message, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_event_id;
  return v_event_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.sync_notification_read_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.is_read is true and new.read_at is null then
    new.read_at := now();
  elsif new.is_read is false then
    new.read_at := null;
  elsif new.read_at is not null then
    new.is_read := true;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.write_full_meal_plan_storage(p_plan_id bigint, p_plan_data jsonb, p_meals jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_meal JSONB;
  v_food JSONB;
  v_sub JSONB;
  v_new_meal_id BIGINT;
  v_new_food_id BIGINT;
BEGIN
  -- 1. Update the meal plan itself
  UPDATE meal_plans
  SET 
    name = (p_plan_data->>'name'),
    description = (p_plan_data->>'description'),
    start_date = (p_plan_data->>'start_date')::DATE,
    end_date = (p_plan_data->>'end_date')::DATE,
    is_active = COALESCE((p_plan_data->>'is_active')::BOOLEAN, true),
    is_draft = COALESCE((p_plan_data->>'is_draft')::BOOLEAN, false),
    daily_calories = COALESCE((p_plan_data->>'daily_calories')::NUMERIC, 0),
    daily_protein = COALESCE((p_plan_data->>'daily_protein')::NUMERIC, 0),
    daily_carbs = COALESCE((p_plan_data->>'daily_carbs')::NUMERIC, 0),
    daily_fat = COALESCE((p_plan_data->>'daily_fat')::NUMERIC, 0),
    updated_at = NOW()
  WHERE id = p_plan_id;

  -- 2. Clear old structure (Deletes cascade to foods and subs if constraints permit, 
  --    but we'll be explicit to ensure performance and correctness)
  -- Assuming ON DELETE CASCADE is set. If not, we should delete children first.
  DELETE FROM meal_plan_food_substitutions 
  WHERE meal_plan_food_id IN (
    SELECT id FROM meal_plan_foods 
    WHERE meal_plan_meal_id IN (
      SELECT id FROM meal_plan_meals WHERE meal_plan_id = p_plan_id
    )
  );
  
  DELETE FROM meal_plan_foods 
  WHERE meal_plan_meal_id IN (
    SELECT id FROM meal_plan_meals WHERE meal_plan_id = p_plan_id
  );

  DELETE FROM meal_plan_meals WHERE meal_plan_id = p_plan_id;

  -- 3. Insert new structure
  FOR v_meal IN SELECT * FROM jsonb_array_elements(p_meals)
  LOOP
    INSERT INTO meal_plan_meals (
      meal_plan_id, name, meal_type, meal_time, order_index, notes,
      total_calories, total_protein, total_carbs, total_fat
    ) VALUES (
      p_plan_id,
      v_meal->>'name',
      COALESCE((v_meal->>'meal_type'), 'other')::meal_type_enum,
      private.normalize_meal_time(v_meal->>'meal_time'),
      COALESCE((v_meal->>'order_index')::INTEGER, 0),
      v_meal->>'notes',
      COALESCE((v_meal->>'total_calories')::NUMERIC, 0),
      COALESCE((v_meal->>'total_protein')::NUMERIC, 0),
      COALESCE((v_meal->>'total_carbs')::NUMERIC, 0),
      COALESCE((v_meal->>'total_fat')::NUMERIC, 0)
    ) RETURNING id INTO v_new_meal_id;

    -- Insert foods for this meal
    IF v_meal ? 'foods' THEN
      FOR v_food IN SELECT * FROM jsonb_array_elements(v_meal->'foods')
      LOOP
        INSERT INTO meal_plan_foods (
          meal_plan_meal_id, food_id, quantity, unit, 
          calories, protein, carbs, fat, notes, order_index,
          patient_description
        ) VALUES (
          v_new_meal_id,
          (v_food->>'food_id')::UUID,
          COALESCE((v_food->>'quantity')::NUMERIC, 0),
          v_food->>'unit',
          COALESCE((v_food->>'calories')::NUMERIC, 0),
          COALESCE((v_food->>'protein')::NUMERIC, 0),
          COALESCE((v_food->>'carbs')::NUMERIC, 0),
          COALESCE((v_food->>'fat')::NUMERIC, 0),
          v_food->>'notes',
          COALESCE((v_food->>'order_index')::INTEGER, 0),
          v_food->>'patient_description'
        ) RETURNING id INTO v_new_food_id;

        -- Insert substitutes
        IF v_food ? 'substitutes' THEN
          FOR v_sub IN SELECT * FROM jsonb_array_elements(v_food->'substitutes')
          LOOP
            INSERT INTO meal_plan_food_substitutions (
              meal_plan_food_id, substitute_food_id, notes
            ) VALUES (
              v_new_food_id,
              (v_sub->>'id')::UUID,
              v_sub->>'notes'
            );
          END LOOP;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('status', 'success', 'plan_id', p_plan_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public._validate_growth_record_json_section(p_section jsonb, p_section_name text, p_default_min numeric, p_default_max numeric)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  kv record;
  v_num numeric;
  min_limit numeric;
  max_limit numeric;
BEGIN
  IF p_section IS NULL OR jsonb_typeof(p_section) <> 'object' THEN
    RETURN;
  END IF;

  FOR kv IN SELECT key, value FROM jsonb_each_text(p_section)
  LOOP
    IF kv.value IS NULL OR btrim(kv.value) = '' THEN
      CONTINUE;
    END IF;

    BEGIN
      v_num := kv.value::numeric;
    EXCEPTION
      WHEN others THEN
        RAISE EXCEPTION 'Valor inválido em %.%: "%"', p_section_name, kv.key, kv.value;
    END;

    min_limit := p_default_min;
    max_limit := p_default_max;

    IF p_section_name = 'bioimpedance' THEN
      IF kv.key = 'percent_gordura' THEN
        min_limit := 2;
        max_limit := 75;
      ELSIF kv.key = 'percent_massa_magra' THEN
        min_limit := 20;
        max_limit := 98;
      ELSIF kv.key = 'gordura_visceral' THEN
        min_limit := 1;
        max_limit := 40;
      END IF;
    END IF;

    IF v_num < min_limit OR v_num > max_limit THEN
      RAISE EXCEPTION 'Valor fora da faixa em %.%: % (esperado entre % e %)',
        p_section_name, kv.key, v_num, min_limit, max_limit;
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auth_role()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select auth.role();
$function$;

CREATE OR REPLACE FUNCTION public.auth_setting(p_name text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select current_setting(p_name, true);
$function$;

CREATE OR REPLACE FUNCTION public.auth_uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.can_delete_user(p_target_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select is_admin()
  or exists (
    select 1 from public.user_profiles p
    where p.id = p_target_id
      and p.nutritionist_id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.clear_message_notifications_from_sender(p_sender_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ select private.clear_message_notifications_from_sender($1); $function$;

CREATE OR REPLACE FUNCTION public.generate_random_invite_code(length integer DEFAULT 6)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  chars text := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text := '';
  i int;
BEGIN
  FOR i IN 1..length LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_unique_invite_code(col_name text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  new_code text;
  found text;
BEGIN
  LOOP
    new_code := generate_random_invite_code(6);
    -- Check uniqueness
    IF col_name = 'invite_code' THEN
      SELECT invite_code INTO found FROM public.user_profiles WHERE invite_code = new_code LIMIT 1;
    ELSE
      SELECT patient_invite_code INTO found FROM public.user_profiles WHERE patient_invite_code = new_code LIMIT 1;
    END IF;
    
    IF found IS NULL THEN
      RETURN new_code;
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_anthropometry_longitudinal_score(p_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  latest_rec record;
  goal_type text;
  objective text;
  out_json jsonb := '{}'::jsonb;
  window_days integer;
  baseline_rec record;
  weight_delta numeric;
  bmi_latest numeric;
  bmi_base numeric;
  bmi_delta numeric;
  score integer;
  status text;
BEGIN
  SELECT *
  INTO latest_rec
  FROM public.growth_records
  WHERE patient_id = p_patient_id
    AND COALESCE(is_latest_revision, true) = true
  ORDER BY record_date DESC, COALESCE(revision_number, 1) DESC
  LIMIT 1;

  IF latest_rec IS NULL THEN
    RETURN jsonb_build_object(
      'has_data', false,
      'message', 'Sem registros antropométricos suficientes.'
    );
  END IF;

  SELECT pg.goal_type
  INTO goal_type
  FROM public.patient_goals pg
  WHERE pg.patient_id = p_patient_id
    AND pg.status = 'active'
  ORDER BY pg.created_at DESC
  LIMIT 1;

  goal_type := lower(COALESCE(goal_type, 'maintenance'));
  IF goal_type IN ('weight_loss', 'perda_peso', 'emagrecimento') THEN
    objective := 'weight_loss';
  ELSIF goal_type IN ('weight_gain', 'ganho_peso', 'hipertrofia') THEN
    objective := 'weight_gain';
  ELSE
    objective := 'maintenance';
  END IF;

  out_json := jsonb_build_object(
    'has_data', true,
    'objective', objective,
    'latest_record_date', latest_rec.record_date
  );

  FOREACH window_days IN ARRAY ARRAY[30, 60, 90]
  LOOP
    SELECT *
    INTO baseline_rec
    FROM public.growth_records
    WHERE patient_id = p_patient_id
      AND COALESCE(is_latest_revision, true) = true
      AND record_date <= (latest_rec.record_date - make_interval(days => window_days))
    ORDER BY record_date DESC, COALESCE(revision_number, 1) DESC
    LIMIT 1;

    IF baseline_rec IS NULL THEN
      out_json := out_json || jsonb_build_object(
        format('d%s', window_days),
        jsonb_build_object('has_data', false)
      );
      CONTINUE;
    END IF;

    weight_delta := CASE
      WHEN latest_rec.weight IS NOT NULL AND baseline_rec.weight IS NOT NULL
      THEN round((latest_rec.weight - baseline_rec.weight)::numeric, 2)
      ELSE NULL
    END;

    bmi_latest := CASE
      WHEN latest_rec.weight IS NOT NULL AND latest_rec.height IS NOT NULL
      THEN latest_rec.weight / ((latest_rec.height / 100.0) ^ 2)
      ELSE NULL
    END;

    bmi_base := CASE
      WHEN baseline_rec.weight IS NOT NULL AND baseline_rec.height IS NOT NULL
      THEN baseline_rec.weight / ((baseline_rec.height / 100.0) ^ 2)
      ELSE NULL
    END;

    bmi_delta := CASE
      WHEN bmi_latest IS NOT NULL AND bmi_base IS NOT NULL
      THEN round((bmi_latest - bmi_base)::numeric, 2)
      ELSE NULL
    END;

    score := 0;
    IF objective = 'weight_loss' THEN
      IF weight_delta IS NOT NULL THEN
        IF weight_delta < -0.2 THEN score := score + 2;
        ELSIF weight_delta > 0.2 THEN score := score - 2;
        END IF;
      END IF;
      IF bmi_delta IS NOT NULL THEN
        IF bmi_delta < -0.1 THEN score := score + 1;
        ELSIF bmi_delta > 0.1 THEN score := score - 1;
        END IF;
      END IF;
    ELSIF objective = 'weight_gain' THEN
      IF weight_delta IS NOT NULL THEN
        IF weight_delta > 0.2 THEN score := score + 2;
        ELSIF weight_delta < -0.2 THEN score := score - 2;
        END IF;
      END IF;
      IF bmi_delta IS NOT NULL THEN
        IF bmi_delta > 0.1 THEN score := score + 1;
        ELSIF bmi_delta < -0.1 THEN score := score - 1;
        END IF;
      END IF;
    ELSE
      IF weight_delta IS NOT NULL THEN
        IF abs(weight_delta) <= 0.5 THEN score := score + 1;
        ELSE score := score - 1;
        END IF;
      END IF;
    END IF;

    status := CASE
      WHEN score >= 2 THEN 'improved'
      WHEN score <= -2 THEN 'worsened'
      ELSE 'stable'
    END;

    out_json := out_json || jsonb_build_object(
      format('d%s', window_days),
      jsonb_build_object(
        'has_data', true,
        'baseline_record_date', baseline_rec.record_date,
        'weight_delta', weight_delta,
        'bmi_delta', bmi_delta,
        'score', score,
        'status', status
      )
    );
  END LOOP;

  RETURN out_json;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_food_stats(p_nutritionist_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT json_build_object(
    'total', count(*),
    'custom', count(*) FILTER (WHERE source = 'custom' OR nutritionist_id = p_nutritionist_id),
    'public', count(*) FILTER (WHERE source != 'custom' AND nutritionist_id IS NULL),
    'taco', count(*) FILTER (WHERE source = 'TACO'),
    'tbca', count(*) FILTER (WHERE source = 'TBCA'),
    'tucunduva', count(*) FILTER (WHERE source = 'TUCUNDUVA'),
    'usda', count(*) FILTER (WHERE source = 'USDA'),
    'nello', count(*) FILTER (WHERE source = 'Nello')
  ) FROM foods WHERE is_active = true;
$function$;

CREATE OR REPLACE FUNCTION public.get_invite_details(p_invite_code text)
 RETURNS TABLE(patient_name text, nutritionist_name text, nutritionist_gender text)
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ select * from private.get_invite_details($1); $function$;

CREATE OR REPLACE FUNCTION public.get_operational_health_summary(p_nutritionist_id uuid DEFAULT auth.uid(), p_window_hours integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ select private.get_operational_health_summary($1, $2); $function$;

CREATE OR REPLACE FUNCTION public.get_own_profile_attrs()
 RETURNS TABLE(is_admin boolean, user_type text)
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ select * from private.get_own_profile_attrs(); $function$;

CREATE OR REPLACE FUNCTION public.interact_notification(p_notification_id uuid, p_delete_if_message boolean DEFAULT true)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ select private.interact_notification($1, $2); $function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select private.is_admin(); $function$;

CREATE OR REPLACE FUNCTION public.is_nutritionist()
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ select private.is_nutritionist(); $function$;

CREATE OR REPLACE FUNCTION public.is_patient()
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ select private.is_patient(); $function$;

CREATE OR REPLACE FUNCTION public.log_meal_action_secure(p_meal_id text, p_action text, p_details jsonb)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ select private.log_meal_action_secure($1, $2, $3); $function$;

CREATE OR REPLACE FUNCTION public.log_operational_event(p_module text, p_operation text, p_event_type text DEFAULT 'success'::text, p_latency_ms integer DEFAULT 0, p_nutritionist_id uuid DEFAULT NULL::uuid, p_patient_id uuid DEFAULT NULL::uuid, p_error_message text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS bigint
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ select private.log_operational_event($1, $2, $3, $4, $5, $6, $7, $8); $function$;

CREATE OR REPLACE FUNCTION public.set_message_templates_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin new.updated_at = now(); return new; end;
$function$;

CREATE OR REPLACE FUNCTION public.slugify_name(p_name text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_slug text;
begin
  if p_name is null or trim(p_name) = '' then
    return 'paciente';
  end if;
  -- Minúsculas, substituir espaços por hífen, remover acentos, apenas a-z0-9 e hífen
  v_slug := lower(trim(p_name));
  v_slug := translate(v_slug, 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeeiiiiooooouuuucn');
  v_slug := regexp_replace(v_slug, '[^a-z0-9\s-]', '', 'g');
  v_slug := regexp_replace(v_slug, '\s+', '-', 'g');
  v_slug := regexp_replace(v_slug, '-+', '-', 'g');  -- hífens duplicados
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then return 'paciente'; end if;
  return v_slug;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_growth_records_apply_versioning()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  source_group public.growth_records.revision_group_id%TYPE;
  source_revision integer;
BEGIN
  IF NEW.supersedes_record_id IS NOT NULL THEN
    -- Marcar o registro antigo ANTES do insert para evitar violar unique constraint
    UPDATE public.growth_records
    SET is_latest_revision = false
    WHERE id = NEW.supersedes_record_id
      AND is_latest_revision = true;

    SELECT COALESCE(revision_group_id, id), COALESCE(revision_number, 1)
    INTO source_group, source_revision
    FROM public.growth_records
    WHERE id = NEW.supersedes_record_id;

    IF source_group IS NULL THEN
      source_group := COALESCE(NEW.revision_group_id, NEW.id);
      source_revision := 0;
    END IF;

    NEW.revision_group_id := COALESCE(NEW.revision_group_id, source_group);
    NEW.revision_number := GREATEST(COALESCE(NEW.revision_number, source_revision + 1), source_revision + 1);
    NEW.is_latest_revision := true;
  ELSE
    NEW.revision_group_id := COALESCE(NEW.revision_group_id, NEW.id);
    NEW.revision_number := COALESCE(NEW.revision_number, 1);
    NEW.is_latest_revision := COALESCE(NEW.is_latest_revision, true);
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_growth_records_mark_previous_not_latest()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.revision_group_id IS NOT NULL AND NEW.is_latest_revision IS TRUE THEN
    UPDATE public.growth_records
    SET is_latest_revision = false
    WHERE revision_group_id = NEW.revision_group_id
      AND id <> NEW.id
      AND is_latest_revision = true;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_growth_records_sync_modules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- 2.1 Atualiza peso atual da meta ativa
  IF NEW.weight IS NOT NULL THEN
    UPDATE public.patient_goals
    SET current_weight = NEW.weight,
        updated_at = now()
    WHERE patient_id = NEW.patient_id
      AND status = 'active';
  END IF;

  -- 2.2 Marca módulos dependentes para revisão/recálculo
  INSERT INTO public.patient_module_sync_flags (
    patient_id,
    anthropometry_updated_at,
    needs_energy_recalc,
    needs_meal_plan_review,
    updated_at
  )
  VALUES (
    NEW.patient_id,
    now(),
    true,
    true,
    now()
  )
  ON CONFLICT (patient_id)
  DO UPDATE
  SET anthropometry_updated_at = EXCLUDED.anthropometry_updated_at,
      needs_energy_recalc = true,
      needs_meal_plan_review = true,
      updated_at = now();

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_growth_records_validate_clinical()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.record_date IS NULL THEN
    RAISE EXCEPTION 'record_date é obrigatório';
  END IF;

  IF NEW.record_date > (CURRENT_DATE + INTERVAL '1 day')::date THEN
    RAISE EXCEPTION 'record_date não pode estar no futuro distante';
  END IF;

  -- Básico opcional, mas quando preenchido deve estar em faixa plausível
  IF NEW.weight IS NOT NULL AND (NEW.weight < 20 OR NEW.weight > 350) THEN
    RAISE EXCEPTION 'weight fora da faixa clínica plausível (20-350 kg): %', NEW.weight;
  END IF;

  IF NEW.height IS NOT NULL AND (NEW.height < 100 OR NEW.height > 250) THEN
    RAISE EXCEPTION 'height fora da faixa clínica plausível (100-250 cm): %', NEW.height;
  END IF;

  -- Se um dos dois vier, ambos devem vir (coerência da seção básica)
  IF (NEW.weight IS NULL) <> (NEW.height IS NULL) THEN
    RAISE EXCEPTION 'Peso e altura devem ser informados juntos na seção básica';
  END IF;

  -- Pelo menos uma seção deve ser preenchida
  IF NEW.weight IS NULL
     AND (NEW.circumferences IS NULL OR NEW.circumferences = '{}'::jsonb)
     AND (NEW.skinfolds IS NULL OR NEW.skinfolds = '{}'::jsonb)
     AND (NEW.bone_diameters IS NULL OR NEW.bone_diameters = '{}'::jsonb)
     AND (NEW.bioimpedance IS NULL OR NEW.bioimpedance = '{}'::jsonb)
     AND (NEW.photos IS NULL OR jsonb_array_length(to_jsonb(NEW.photos)) = 0) THEN
    RAISE EXCEPTION 'Registro inválido: preencha pelo menos uma seção antropométrica';
  END IF;

  PERFORM public._validate_growth_record_json_section(NEW.circumferences, 'circumferences', 10, 300);
  PERFORM public._validate_growth_record_json_section(NEW.skinfolds, 'skinfolds', 1, 120);
  PERFORM public._validate_growth_record_json_section(NEW.bone_diameters, 'bone_diameters', 1, 40);
  PERFORM public._validate_growth_record_json_section(NEW.bioimpedance, 'bioimpedance', 0, 1000);

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_set_invite_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.user_type = 'nutritionist' AND NEW.invite_code IS NULL THEN
    NEW.invite_code := generate_random_invite_code(6);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.user_profiles_sync_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  base_slug text;
  final_slug text;
  counter int;
begin
  if new.user_type <> 'patient' or new.nutritionist_id is null then
    return new;
  end if;
  base_slug := public.slugify_name(coalesce(new.name, 'paciente'));
  final_slug := base_slug;
  counter := 1;
  while exists (
    select 1 from public.user_profiles
    where nutritionist_id = new.nutritionist_id and slug = final_slug and id <> new.id
  ) loop
    final_slug := base_slug || '-' || counter;
    counter := counter + 1;
  end loop;
  new.slug := final_slug;
  return new;
end;
$function$;

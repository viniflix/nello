


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."food_source" AS ENUM (
    'TACO',
    'TBCA',
    'USDA',
    'CUSTOM',
    'OFF',
    'TUCUNDUVA',
    'Nello'
);


ALTER TYPE "public"."food_source" OWNER TO "postgres";


CREATE TYPE "public"."meal_type_enum" AS ENUM (
    'breakfast',
    'morning_snack',
    'lunch',
    'afternoon_snack',
    'dinner',
    'supper',
    'pre_workout',
    'post_workout',
    'other'
);


ALTER TYPE "public"."meal_type_enum" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."add_patient_xp"("p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_xp" integer, "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
  current_xp INTEGER;
  new_xp INTEGER;
  new_level TEXT;
BEGIN
  SELECT xp_points INTO current_xp
  FROM nutritionist_patients
  WHERE patient_id = p_patient_id AND nutritionist_id = p_nutritionist_id;
  
  new_xp := COALESCE(current_xp, 0) + p_xp;
  
  new_level := CASE
    WHEN new_xp >= 5000 THEN 'Lendário'
    WHEN new_xp >= 2000 THEN 'Campeão'
    WHEN new_xp >= 1000 THEN 'Consistente'
    WHEN new_xp >= 500  THEN 'Dedicado'
    WHEN new_xp >= 200  THEN 'Comprometido'
    ELSE 'Iniciante'
  END;
  
  UPDATE nutritionist_patients SET
    xp_points = new_xp,
    level_name = new_level
  WHERE patient_id = p_patient_id AND nutritionist_id = p_nutritionist_id;
  
  RETURN jsonb_build_object('xp', new_xp, 'level', new_level, 'gained', p_xp);
END;
$$;


ALTER FUNCTION "private"."add_patient_xp"("p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_xp" integer, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."approve_patient_link"("p_patient_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_nutri_id uuid;
BEGIN
    v_nutri_id := auth.uid();
    
    UPDATE public.nutritionist_patients 
    SET status = 'active'
    WHERE nutritionist_id = v_nutri_id AND patient_id = p_patient_id;

    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'message', 'Vínculo aprovado com sucesso');
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'Solicitação não encontrada');
    END IF;
END;
$$;


ALTER FUNCTION "private"."approve_patient_link"("p_patient_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."check_and_grant_achievements"("p_user_id" "uuid") RETURNS TABLE("name" "text", "description" "text", "icon_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    achievement_rec RECORD;
    newly_achieved RECORD;
    unlocked_achievements JSONB := '[]'::jsonb;
BEGIN
    FOR achievement_rec IN
        SELECT a.*
        FROM public.achievements a
        LEFT JOIN public.user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = p_user_id
        WHERE ua.id IS NULL
    LOOP
        DECLARE
            is_achieved BOOLEAN := FALSE;
        BEGIN
            CASE achievement_rec.criteria->>'type'
                WHEN 'meal_count' THEN
                    SELECT count(*) >= (achievement_rec.criteria->>'count')::int INTO is_achieved FROM public.meals WHERE patient_id = p_user_id;
                WHEN 'log_streak' THEN
                    WITH dates AS (
                        SELECT DISTINCT meal_date 
                        FROM public.meals 
                        WHERE patient_id = p_user_id 
                        ORDER BY meal_date DESC
                    ),
                    streaks AS (
                        SELECT meal_date, meal_date - (ROW_NUMBER() OVER (ORDER BY meal_date) * INTERVAL '1 day') as grp 
                        FROM dates
                    )
                    SELECT COALESCE(MAX(count), 0) >= (achievement_rec.criteria->>'days')::int INTO is_achieved FROM (SELECT COUNT(*) as count FROM streaks GROUP BY grp) s;
                WHEN 'food_variety' THEN
                     SELECT count(DISTINCT food_id) >= (achievement_rec.criteria->>'count')::int INTO is_achieved FROM public.meal_items mi JOIN public.meals m ON mi.meal_id = m.id WHERE m.patient_id = p_user_id AND mi.food_id IS NOT NULL;
                WHEN 'weekday_log' THEN
                    SELECT EXISTS(SELECT 1 FROM public.meals WHERE patient_id = p_user_id AND EXTRACT(ISODOW FROM meal_date) = (achievement_rec.criteria->>'day')::int) INTO is_achieved;
                WHEN 'weekend_log' THEN
                    SELECT EXISTS(SELECT 1 FROM public.meals WHERE patient_id = p_user_id AND EXTRACT(ISODOW FROM meal_date) = 6) AND EXISTS(SELECT 1 FROM public.meals WHERE patient_id = p_user_id AND EXTRACT(ISODOW FROM meal_date) = 7) INTO is_achieved;
                WHEN 'meal_completion' THEN
                    SELECT EXISTS(SELECT 1 FROM (SELECT meal_date, array_agg(DISTINCT meal_type) as types FROM public.meals WHERE patient_id = p_user_id GROUP BY meal_date) as daily_meals WHERE daily_meals.types @> ARRAY['Café da Manhã', 'Almoço', 'Jantar']) INTO is_achieved;
                WHEN 'days_on_platform' THEN
                    SELECT (now()::date - (SELECT created_at::date FROM auth.users WHERE id = p_user_id)) >= (achievement_rec.criteria->>'days')::int INTO is_achieved;
                WHEN 'used_search' THEN
                    SELECT EXISTS(SELECT 1 FROM public.meals WHERE patient_id = p_user_id) INTO is_achieved;
                ELSE
                    is_achieved := FALSE;
            END CASE;

            IF is_achieved THEN
                INSERT INTO public.user_achievements (user_id, achievement_id)
                VALUES (p_user_id, achievement_rec.id)
                ON CONFLICT (user_id, achievement_id) DO NOTHING
                RETURNING achievement_id INTO newly_achieved;

                IF newly_achieved IS NOT NULL THEN
                    unlocked_achievements := unlocked_achievements || jsonb_build_object(
                        'name', achievement_rec.name,
                        'description', achievement_rec.description,
                        'icon_name', achievement_rec.icon_name
                    );

                    INSERT INTO public.notifications (user_id, type, content)
                    VALUES (p_user_id, 'new_achievement', jsonb_build_object('name', achievement_rec.name, 'description', achievement_rec.description));
                END IF;
            END IF;
        END;
    END LOOP;

    RETURN QUERY SELECT (value->>'name')::text, (value->>'description')::text, (value->>'icon_name')::text FROM jsonb_array_elements(unlocked_achievements);
END;
$$;


ALTER FUNCTION "private"."check_and_grant_achievements"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."check_is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = auth.uid()
    AND is_admin = TRUE
  );
END;
$$;


ALTER FUNCTION "private"."check_is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."clear_message_notifications_from_sender"("p_sender_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.notifications n
  where n.user_id = auth.uid()
    and n.type = 'new_message'
    and coalesce(n.content->>'from_id', '') = p_sender_id::text;
end;
$$;


ALTER FUNCTION "private"."clear_message_notifications_from_sender"("p_sender_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."clone_diet_template_to_patient"("p_template_id" "uuid", "p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_name" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
    v_template public.diet_templates%ROWTYPE;
    v_new_plan_id BIGINT;
    v_meal public.diet_template_meals%ROWTYPE;
    v_new_meal_id BIGINT;
    v_food public.diet_template_foods%ROWTYPE;
    v_new_food_id BIGINT;
    v_sub public.diet_template_food_substitutions%ROWTYPE;
BEGIN
    -- Check permissions
    SELECT * INTO v_template FROM public.diet_templates WHERE id = p_template_id AND user_id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Template not found or access denied';
    END IF;

    -- Create Meal Plan
    INSERT INTO public.meal_plans (
        patient_id,
        nutritionist_id,
        name,
        description,
        is_active,
        is_draft,
        start_date
    ) VALUES (
        p_patient_id,
        p_nutritionist_id,
        COALESCE(p_name, v_template.name),
        v_template.description,
        true,
        true, -- Defaults to draft so nutritionist can edit before activating
        CURRENT_DATE
    ) RETURNING id INTO v_new_plan_id;

    -- Clone Meals
    FOR v_meal IN SELECT * FROM public.diet_template_meals WHERE template_id = p_template_id ORDER BY order_index ASC LOOP
        INSERT INTO public.meal_plan_meals (
            meal_plan_id,
            name,
            meal_type,
            meal_time,
            order_index
        ) VALUES (
            v_new_plan_id,
            v_meal.name,
            'other', -- Default or map if available
            v_meal.time,
            v_meal.order_index
        ) RETURNING id INTO v_new_meal_id;

        -- Clone Foods
        FOR v_food IN SELECT * FROM public.diet_template_foods WHERE meal_id = v_meal.id ORDER BY order_index ASC LOOP
            INSERT INTO public.meal_plan_foods (
                meal_plan_meal_id,
                food_id,
                quantity,
                unit,
                notes,
                order_index,
                calories, protein, carbs, fat -- Defaults as 0 for recalculation in frontend
            ) VALUES (
                v_new_meal_id,
                v_food.food_id,
                v_food.quantity,
                v_food.unit,
                v_food.observation,
                v_food.order_index,
                0, 0, 0, 0
            ) RETURNING id INTO v_new_food_id;

            -- Clone Substitutions
            FOR v_sub IN SELECT * FROM public.diet_template_food_substitutions WHERE template_food_id = v_food.id LOOP
                INSERT INTO public.meal_plan_food_substitutions (
                    meal_plan_food_id,
                    substitute_food_id,
                    quantity,
                    unit
                ) VALUES (
                    v_new_food_id,
                    v_sub.substitute_food_id,
                    v_sub.quantity,
                    v_sub.unit
                );
            END LOOP;
        END LOOP;
    END LOOP;

    RETURN v_new_plan_id;
END;
$$;


ALTER FUNCTION "private"."clone_diet_template_to_patient"("p_template_id" "uuid", "p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."clone_meal_template_to_plan"("p_meal_template_id" "uuid", "p_meal_plan_id" bigint, "p_meal_type" "text", "p_meal_time" time without time zone DEFAULT NULL::time without time zone) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
    v_template public.meal_templates%ROWTYPE;
    v_new_meal_id BIGINT;
    v_food public.meal_template_foods%ROWTYPE;
    v_new_food_id BIGINT;
    v_sub public.meal_template_food_substitutions%ROWTYPE;
BEGIN
    -- Check permissions
    SELECT * INTO v_template FROM public.meal_templates WHERE id = p_meal_template_id AND user_id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Template not found or access denied';
    END IF;

    -- Create Meal in Plan
    INSERT INTO public.meal_plan_meals (
        meal_plan_id,
        name,
        meal_type,
        meal_time,
        order_index
    ) VALUES (
        p_meal_plan_id,
        v_template.name,
        p_meal_type::public.meal_type_enum,
        p_meal_time,
        (SELECT COALESCE(MAX(order_index) + 1, 0) FROM public.meal_plan_meals WHERE meal_plan_id = p_meal_plan_id)
    ) RETURNING id INTO v_new_meal_id;

    -- Clone Foods
    FOR v_food IN SELECT * FROM public.meal_template_foods WHERE meal_template_id = p_meal_template_id ORDER BY order_index ASC LOOP
        INSERT INTO public.meal_plan_foods (
            meal_plan_meal_id,
            food_id,
            quantity,
            unit,
            notes,
            order_index,
            calories, protein, carbs, fat -- Defaults as 0
        ) VALUES (
            v_new_meal_id,
            v_food.food_id,
            v_food.quantity,
            v_food.unit,
            v_food.observation,
            v_food.order_index,
            0, 0, 0, 0
        ) RETURNING id INTO v_new_food_id;

        -- Clone Substitutions
        FOR v_sub IN SELECT * FROM public.meal_template_food_substitutions WHERE template_food_id = v_food.id LOOP
            INSERT INTO public.meal_plan_food_substitutions (
                meal_plan_food_id,
                substitute_food_id,
                quantity,
                unit
            ) VALUES (
                v_new_food_id,
                v_sub.substitute_food_id,
                v_sub.quantity,
                v_sub.unit
            );
        END LOOP;
    END LOOP;

    RETURN v_new_meal_id;
END;
$$;


ALTER FUNCTION "private"."clone_meal_template_to_plan"("p_meal_template_id" "uuid", "p_meal_plan_id" bigint, "p_meal_type" "text", "p_meal_time" time without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."create_appointment_reminders"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  appt RECORD;
BEGIN
  FOR appt IN
    SELECT id, patient_id, appointment_time
    FROM appointments
    WHERE
      status = 'scheduled' AND
      reminder_sent_at IS NULL AND
      appointment_time BETWEEN now() AND now() + interval '48 hours'
  LOOP
    INSERT INTO notifications(user_id, type, content)
    VALUES(
      appt.patient_id,
      'appointment_reminder',
      jsonb_build_object('appointment_time', appt.appointment_time)
    );

    UPDATE appointments
    SET reminder_sent_at = now()
    WHERE id = appt.id;
  END LOOP;
END;
$$;


ALTER FUNCTION "private"."create_appointment_reminders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."create_daily_log_reminders"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  patient RECORD;
BEGIN
  FOR patient IN
    SELECT id FROM user_profiles WHERE user_type = 'patient'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM notifications
      WHERE user_id = patient.id
      AND type = 'daily_log_reminder'
      AND created_at >= date_trunc('day', now())
    ) THEN
      INSERT INTO notifications(user_id, type, content)
      VALUES(
        patient.id,
        'daily_log_reminder',
        jsonb_build_object('message', 'Não se esqueça de registrar suas refeições hoje!')
      );
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "private"."create_daily_log_reminders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."create_notification"("p_user_id" "uuid", "p_type" "text" DEFAULT 'info'::"text", "p_title" "text" DEFAULT NULL::"text", "p_message" "text" DEFAULT NULL::"text", "p_link_url" "text" DEFAULT NULL::"text", "p_content" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id uuid;
begin
  insert into public.notifications (
    user_id,
    type,
    title,
    message,
    link_url,
    content,
    is_read
  )
  values (
    p_user_id,
    coalesce(p_type, 'info'),
    p_title,
    p_message,
    p_link_url,
    jsonb_strip_nulls(
      coalesce(p_content, '{}'::jsonb) ||
      jsonb_build_object(
        'title', p_title,
        'message', p_message,
        'link_url', p_link_url
      )
    ),
    false
  )
  returning id into v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "private"."create_notification"("p_user_id" "uuid", "p_type" "text", "p_title" "text", "p_message" "text", "p_link_url" "text", "p_content" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."create_summary_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO notifications(user_id, type, content)
  VALUES(NEW.patient_id, 'new_weekly_summary', jsonb_build_object('week_start_date', NEW.week_start_date, 'nutritionist_id', NEW.nutritionist_id));
  RETURN NEW;
END;
$$;


ALTER FUNCTION "private"."create_summary_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."delete_patient"("patient_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM auth.admin_delete_user(patient_id);
END;
$$;


ALTER FUNCTION "private"."delete_patient"("patient_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_admin_dashboard_stats"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  total_nutris int;
  total_patients int;
  total_meals int;
  active_patients int;
  
  estimated_mrr numeric;
  
  recent_users json;
  growth_data json;
  goals_dist json;
  feature_adoption json;
begin
  -- Restrict to admins
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- 1. Contadores Básicos
  select count(*) into total_nutris from user_profiles where user_type = 'nutritionist';
  select count(*) into total_patients from user_profiles where user_type = 'patient';
  select count(*) into total_meals from meals;
  
  -- estimated MRR (R$97 per nutritionist)
  estimated_mrr := total_nutris * 97.00;

  -- Pacientes Ativos (com atividade nos ultimos 30 dias usando activity_log)
  select count(distinct patient_id) into active_patients 
  from activity_log 
  where occurred_at > now() - interval '30 days' and patient_id is not null;

  -- 2. Usuários Recentes (Últimos 5 nutricionistas)
  select json_agg(t) into recent_users from (
    select id, name, user_type, created_at, avatar_url 
    from user_profiles 
    where user_type = 'nutritionist'
    order by created_at desc 
    limit 5
  ) t;

  -- 3. Dados de Crescimento (Últimos 6 meses agrupados por mês) - Só nutricionistas
  select json_agg(t) into growth_data from (
    select 
      to_char(date_trunc('month', created_at), 'Mon') as name,
      count(*) as users
    from user_profiles
    where created_at > now() - interval '6 months' and user_type = 'nutritionist'
    group by 1, date_trunc('month', created_at)
    order by date_trunc('month', created_at)
  ) t;

  -- 4. Distribuição de Objetivos
  select json_agg(t) into goals_dist from (
    select goal as name, count(*) as value
    from user_profiles
    where user_type = 'patient' and goal is not null
    group by goal
  ) t;
  
  -- 5. Adoção de Funcionalidades (Feature Adoption)
  select json_agg(t) into feature_adoption from (
    select 'Receitas' as name, count(*) as value from nutritionist_foods
    UNION ALL
    select 'Anamneses' as name, count(*) as value from anamnesis_records
    UNION ALL
    select 'Planos Alimentares' as name, count(*) as value from meal_plans
    UNION ALL
    select 'Avaliações Físicas' as name, count(*) as value from growth_records
  ) t;

  return json_build_object(
    'counts', json_build_object(
      'nutritionists', total_nutris,
      'patients', total_patients,
      'meals', total_meals,
      'active_rate', active_patients,
      'estimated_mrr', estimated_mrr
    ),
    'recent_users', coalesce(recent_users, '[]'::json),
    'growth_chart', coalesce(growth_data, '[]'::json),
    'goals_chart', coalesce(goals_dist, '[]'::json),
    'feature_adoption', coalesce(feature_adoption, '[]'::json)
  );
end;
$_$;


ALTER FUNCTION "private"."get_admin_dashboard_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_chat_recipient_profile"("recipient_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "avatar_url" "text", "user_type" "text", "is_active" boolean, "nutritionist_id" "uuid", "last_seen_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        up.id,
        up.name,
        up.avatar_url,
        up.user_type,
        up.is_active,
        up.nutritionist_id,
        up.last_seen_at
    FROM public.user_profiles up
    WHERE up.id = recipient_id;
END;
$$;


ALTER FUNCTION "private"."get_chat_recipient_profile"("recipient_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_comprehensive_activity_feed_optimized"("p_nutritionist_id" "uuid", "p_limit" integer DEFAULT 30) RETURNS TABLE("activity_type" "text", "activity_id" "text", "patient_id" "uuid", "patient_name" "text", "activity_date" timestamp with time zone, "activity_data" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$ declare q text; queries text[] := '{}'; begin if p_limit is null or p_limit < 1 then p_limit := 30; end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'meal_audit_log') then q := 'select ''meal''::text as activity_type, mal.id::text as activity_id, mal.patient_id::uuid as patient_id, p.name as patient_name, mal.created_at as activity_date, jsonb_build_object(''meal_type'', mal.meal_type, ''total_calories'', case when mal.details is null then null else nullif(mal.details->>''total_calories'', '''')::numeric end, ''action'', mal.action) as activity_data from public.meal_audit_log mal join patients p on p.id = mal.patient_id'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'growth_records') then q := 'select ''anthropometry''::text as activity_type, gr.id::text as activity_id, gr.patient_id::uuid as patient_id, p.name as patient_name, coalesce(gr.record_date::timestamptz, gr.created_at, now()) as activity_date, jsonb_build_object(''weight'', gr.weight, ''height'', gr.height) as activity_data from public.growth_records gr join patients p on p.id = gr.patient_id'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'anamnesis_records') then q := 'select ''anamnesis''::text as activity_type, anr.id::text as activity_id, anr.patient_id::uuid as patient_id, p.name as patient_name, coalesce(anr.date::timestamptz, anr.created_at, now()) as activity_date, jsonb_build_object(''status'', ''completed'') as activity_data from public.anamnesis_records anr join patients p on p.id = anr.patient_id'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'meal_plans') then q := 'select ''meal_plan''::text as activity_type, mp.id::text as activity_id, mp.patient_id::uuid as patient_id, p.name as patient_name, mp.created_at as activity_date, jsonb_build_object(''name'', mp.name) as activity_data from public.meal_plans mp join patients p on p.id = mp.patient_id'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'appointments') then q := 'select ''appointment''::text as activity_type, a.id::text as activity_id, a.patient_id::uuid as patient_id, p.name as patient_name, coalesce(a.start_time, a.appointment_time, now()) as activity_date, jsonb_build_object(''notes'', a.notes) as activity_data from public.appointments a join patients p on p.id = a.patient_id'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_achievements') then q := 'select ''achievement''::text as activity_type, ua.id::text as activity_id, ua.user_id::uuid as patient_id, p.name as patient_name, ua.achieved_at as activity_date, jsonb_build_object(''achievement_id'', ua.achievement_id) as activity_data from public.user_achievements ua join patients p on p.id = ua.user_id'; queries := array_append(queries, q); end if; if array_length(queries, 1) is null then return; end if; q := 'with patients as (select id, name from public.user_profiles where nutritionist_id = $1) select * from (' || array_to_string(queries, ' union all ') || ') feed order by activity_date desc nulls last limit $2'; return query execute q using p_nutritionist_id, p_limit; end; $_$;


ALTER FUNCTION "private"."get_comprehensive_activity_feed_optimized"("p_nutritionist_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_daily_adherence"("p_nutritionist_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    total_patients_with_plan INTEGER;
    patients_registered_today INTEGER;
    adherence_percentage NUMERIC;
BEGIN
    -- 1. Conta quantos pacientes ATIVOS do nutri têm uma prescrição ATIVA HOJE
    SELECT COUNT(DISTINCT id)
    INTO total_patients_with_plan
    FROM public.user_profiles p
    WHERE p.nutritionist_id = p_nutritionist_id
      AND p.is_active = true
      AND EXISTS (
        SELECT 1 FROM public.prescriptions pr
        WHERE pr.patient_id = p.id
          AND CURRENT_DATE >= pr.start_date
          AND CURRENT_DATE <= pr.end_date
      );

    -- 2. Desses pacientes, conta quantos registraram PELO MENOS UMA refeição hoje
    SELECT COUNT(DISTINCT m.patient_id)
    INTO patients_registered_today
    FROM public.meals m
    JOIN public.user_profiles p ON m.patient_id = p.id
    WHERE p.nutritionist_id = p_nutritionist_id
      AND m.meal_date = CURRENT_DATE;

    -- 3. Calcula a porcentagem
    IF total_patients_with_plan > 0 THEN
        adherence_percentage := (patients_registered_today::NUMERIC / total_patients_with_plan::NUMERIC) * 100;
    ELSE
        adherence_percentage := 0; -- Evita divisão por zero
    END IF;

    RETURN COALESCE(adherence_percentage, 0);
END;
$$;


ALTER FUNCTION "private"."get_daily_adherence"("p_nutritionist_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_financial_summary"("start_date" "date", "end_date" "date") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    total_income NUMERIC;
    total_expense NUMERIC;
    total_pending NUMERIC;
    records_count INT;
BEGIN
    -- Calcular Receitas (Pagas)
    SELECT COALESCE(SUM(amount), 0) INTO total_income
    FROM financial_records
    WHERE nutritionist_id = auth.uid()
    AND type = 'income'
    AND status = 'paid'
    AND date BETWEEN start_date AND end_date;

    -- Calcular Despesas (Pagas)
    SELECT COALESCE(SUM(amount), 0) INTO total_expense
    FROM financial_records
    WHERE nutritionist_id = auth.uid()
    AND type = 'expense'
    AND status = 'paid'
    AND date BETWEEN start_date AND end_date;

    -- Calcular Valores Pendentes (A Receber/Pagar no período)
    SELECT COALESCE(SUM(amount), 0) INTO total_pending
    FROM financial_records
    WHERE nutritionist_id = auth.uid()
    AND status = 'pending'
    AND date BETWEEN start_date AND end_date;

    -- Contagem de registros
    SELECT COUNT(*) INTO records_count
    FROM financial_records
    WHERE nutritionist_id = auth.uid()
    AND date BETWEEN start_date AND end_date;

    RETURN json_build_object(
        'income', total_income,
        'expense', total_expense,
        'balance', (total_income - total_expense),
        'pending', total_pending,
        'count', records_count
    );
END;
$$;


ALTER FUNCTION "private"."get_financial_summary"("start_date" "date", "end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_invite_details"("p_invite_code" "text") RETURNS TABLE("patient_name" "text", "nutritionist_name" "text", "nutritionist_gender" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."get_invite_details"("p_invite_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_meal_plan_with_foods_optimized"("p_meal_plan_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_build_object(
        'id', mp.id,
        'name', mp.name,
        'patient_id', mp.patient_id,
        'nutritionist_id', mp.nutritionist_id,
        'is_active', mp.is_active,
        'start_date', mp.start_date,
        'end_date', mp.end_date,
        'description', mp.description,
        'created_at', mp.created_at,
        'updated_at', mp.updated_at,
        'meals', COALESCE(
            (
                SELECT json_agg(
                    json_build_object(
                        'id', m.id,
                        'name', m.name,
                        'meal_type', m.meal_type,
                        'time', m.time,
                        'description', m.description,
                        'sequence_order', m.sequence_order,
                        'foods', COALESCE(
                            (
                                SELECT json_agg(
                                    json_build_object(
                                        'id', mpf.id,
                                        'food_id', mpf.food_id,
                                        'food_name', f.name,
                                        'food_category', f.category,
                                        'quantity', mpf.quantity,
                                        'measure_unit', mpf.measure_unit,
                                        'calories', mpf.calories,
                                        'protein', mpf.protein,
                                        'carbs', mpf.carbs,
                                        'fats', mpf.fats,
                                        'sequence_order', mpf.sequence_order
                                    )
                                    ORDER BY mpf.sequence_order
                                )
                                FROM meal_plan_foods mpf
                                LEFT JOIN foods f ON f.id = mpf.food_id
                                WHERE mpf.meal_plan_meal_id = m.id
                            ),
                            '[]'::json
                        )
                    )
                    ORDER BY m.sequence_order
                )
                FROM meal_plan_meals m
                WHERE m.meal_plan_id = mp.id
            ),
            '[]'::json
        )
    ) INTO v_result
    FROM meal_plans mp
    WHERE mp.id = p_meal_plan_id;

    RETURN v_result;
END;
$$;


ALTER FUNCTION "private"."get_meal_plan_with_foods_optimized"("p_meal_plan_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_nutritionist_conversations"("p_nutritionist_id" "uuid") RETURNS TABLE("recipient_id" "uuid", "recipient_name" "text", "recipient_avatar" "text", "last_message_content" "text", "last_message_at" timestamp with time zone, "unread_count" bigint, "is_active" boolean, "last_seen_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
BEGIN
    RETURN QUERY
    WITH last_messages AS (
        SELECT DISTINCT ON (
            CASE WHEN from_id = p_nutritionist_id THEN to_id ELSE from_id END
        )
            from_id,
            to_id,
            message,
            message_type,
            media_url,
            created_at,
            CASE WHEN from_id = p_nutritionist_id THEN to_id ELSE from_id END as other_user_id
        FROM public.chats
        WHERE from_id = p_nutritionist_id OR to_id = p_nutritionist_id
        ORDER BY other_user_id, created_at DESC
    ),
    unread_counts AS (
        SELECT 
            (content->>'from_id')::uuid as other_user_id, 
            count(*) as count
        FROM public.notifications
        WHERE user_id = p_nutritionist_id AND type = 'new_message' AND (is_read = false OR is_read IS NULL)
        GROUP BY (content->>'from_id')::uuid
    )
    SELECT 
        up.id as recipient_id,
        up.name as recipient_name,
        up.avatar_url as recipient_avatar,
        CASE 
            WHEN lm.message_type = 'audio' THEN '🎤 Áudio'
            WHEN lm.message_type = 'image' THEN '📷 Imagem'
            WHEN lm.message_type = 'file' THEN '📁 Arquivo'
            ELSE lm.message
        END as last_message_content,
        lm.created_at as last_message_at,
        COALESCE(uc.count, 0) as unread_count,
        up.is_active,
        up.last_seen_at
    FROM public.user_profiles up
    JOIN last_messages lm ON up.id = lm.other_user_id
    LEFT JOIN unread_counts uc ON up.id = uc.other_user_id
    ORDER BY lm.created_at DESC;
END;
$$;


ALTER FUNCTION "private"."get_nutritionist_conversations"("p_nutritionist_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_nutritionist_detail"("p_nutritionist_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_result JSON;
  v_nutritionist RECORD;
BEGIN
  -- Fetch nutritionist profile
  SELECT 
    up.id,
    up.name,
    up.email,
    up.phone,
    up.bio,
    up.crn,
    up.specialties,
    up.education,
    up.avatar_url,
    up.is_active,
    up.is_admin,
    up.created_at,
    up.user_type,
    au.last_sign_in_at,
    (SELECT COUNT(*) FROM user_profiles WHERE nutritionist_id = up.id AND user_type = 'patient') as patients_count,
    (SELECT COUNT(*) FROM user_profiles WHERE nutritionist_id = up.id AND user_type = 'patient' AND created_at >= NOW() - INTERVAL '30 days') as new_patients_30d
  INTO v_nutritionist
  FROM user_profiles up
  LEFT JOIN auth.users au ON au.id = up.id
  WHERE up.id = p_nutritionist_id AND up.user_type = 'nutritionist';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Build result with patients list
  SELECT json_build_object(
    'id', v_nutritionist.id,
    'name', v_nutritionist.name,
    'email', v_nutritionist.email,
    'phone', v_nutritionist.phone,
    'bio', v_nutritionist.bio,
    'crn', v_nutritionist.crn,
    'specialties', v_nutritionist.specialties,
    'education', v_nutritionist.education,
    'avatar_url', v_nutritionist.avatar_url,
    'is_active', v_nutritionist.is_active,
    'is_admin', v_nutritionist.is_admin,
    'created_at', v_nutritionist.created_at,
    'last_sign_in_at', v_nutritionist.last_sign_in_at,
    'patients_count', v_nutritionist.patients_count,
    'new_patients_30d', v_nutritionist.new_patients_30d,
    'patients', (
      SELECT json_agg(
        json_build_object(
          'id', p.id,
          'name', p.name,
          'email', p.email,
          'avatar_url', p.avatar_url,
          'gender', p.gender,
          'goal', p.goal,
          'patient_category', p.patient_category,
          'created_at', p.created_at,
          'is_active', p.is_active,
          'last_sign_in_at', au2.last_sign_in_at
        )
        ORDER BY p.created_at DESC
      )
      FROM user_profiles p
      LEFT JOIN auth.users au2 ON au2.id = p.id
      WHERE p.nutritionist_id = v_nutritionist.id AND p.user_type = 'patient'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "private"."get_nutritionist_detail"("p_nutritionist_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_nutritionists_list"() RETURNS TABLE("id" "uuid", "name" "text", "email" "text", "created_at" timestamp with time zone, "is_active" boolean, "patients_count" bigint, "last_activity" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Need to ensure only admins can run this
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT 
    n.id,
    n.name,
    n.email,
    n.created_at,
    n.is_active,
    (SELECT count(*) FROM user_profiles p WHERE p.nutritionist_id = n.id AND p.user_type = 'patient') as patients_count,
    (SELECT max(occurred_at) FROM activity_log a WHERE a.nutritionist_id = n.id) as last_activity
  FROM user_profiles n
  WHERE n.user_type = 'nutritionist'
  ORDER BY n.created_at DESC;
END;
$$;


ALTER FUNCTION "private"."get_nutritionists_list"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_operational_health_summary"("p_nutritionist_id" "uuid" DEFAULT "auth"."uid"(), "p_window_hours" integer DEFAULT 24) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."get_operational_health_summary"("p_nutritionist_id" "uuid", "p_window_hours" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_own_profile_attrs"() RETURNS TABLE("is_admin" boolean, "user_type" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select up.is_admin, up.user_type
  from public.user_profiles up
  where up.id = auth.uid()
  limit 1;
$$;


ALTER FUNCTION "private"."get_own_profile_attrs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_patients_for_new_chat"("p_nutritionist_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "avatar_url" "text", "is_active" boolean, "last_seen_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        up.id,
        up.name,
        up.avatar_url,
        up.is_active,
        up.last_seen_at
    FROM public.user_profiles up
    WHERE up.nutritionist_id = p_nutritionist_id
    ORDER BY up.is_active DESC, up.name ASC;
END;
$$;


ALTER FUNCTION "private"."get_patients_for_new_chat"("p_nutritionist_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_patients_low_adherence_optimized"("p_nutritionist_id" "uuid", "p_days_threshold" integer DEFAULT 7) RETURNS TABLE("patient_id" "uuid", "patient_name" "text", "last_meal_date" timestamp with time zone, "days_since_last_meal" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    WITH patient_last_meals AS (
        SELECT
            up.id AS patient_id,
            up.name AS patient_name,
            MAX(m.created_at) AS last_meal_date
        FROM user_profiles up
        LEFT JOIN meals m ON m.patient_id = up.id
        WHERE
            up.nutritionist_id = p_nutritionist_id
            AND up.user_type = 'patient'
            AND up.is_active = true
        GROUP BY up.id, up.name
    )
    SELECT
        plm.patient_id,
        plm.patient_name,
        plm.last_meal_date,
        CASE
            WHEN plm.last_meal_date IS NULL THEN 9999
            ELSE EXTRACT(DAY FROM NOW() - plm.last_meal_date)::INT
        END AS days_since_last_meal
    FROM patient_last_meals plm
    WHERE
        plm.last_meal_date IS NULL
        OR EXTRACT(DAY FROM NOW() - plm.last_meal_date) >= p_days_threshold
    ORDER BY days_since_last_meal DESC;
END;
$$;


ALTER FUNCTION "private"."get_patients_low_adherence_optimized"("p_nutritionist_id" "uuid", "p_days_threshold" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_patients_pending_data_optimized"("p_nutritionist_id" "uuid") RETURNS TABLE("patient_id" "uuid", "patient_name" "text", "has_anamnese" boolean, "has_anthropometry" boolean, "has_meal_plan" boolean, "has_prescription" boolean, "pending_items" "text"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    WITH active_patients AS (
        SELECT
            id AS patient_id,
            name AS patient_name
        FROM user_profiles
        WHERE
            nutritionist_id = p_nutritionist_id
            AND user_type = 'patient'
            AND is_active = true
    ),
    patient_anamnese AS (
        SELECT DISTINCT ar.patient_id
        FROM anamnesis_records ar
        INNER JOIN active_patients ap ON ap.patient_id = ar.patient_id
    ),
    patient_anthropometry AS (
        SELECT DISTINCT gr.patient_id
        FROM growth_records gr
        INNER JOIN active_patients ap ON ap.patient_id = gr.patient_id
    ),
    patient_meal_plans AS (
        SELECT DISTINCT mp.patient_id
        FROM meal_plans mp
        INNER JOIN active_patients ap ON ap.patient_id = mp.patient_id
        WHERE mp.is_active = true
    ),
    patient_prescriptions AS (
        SELECT DISTINCT pr.patient_id
        FROM prescriptions pr
        INNER JOIN active_patients ap ON ap.patient_id = pr.patient_id
        WHERE CURRENT_DATE BETWEEN pr.start_date AND pr.end_date
    )
    SELECT
        ap.patient_id,
        ap.patient_name,
        (pa.patient_id IS NOT NULL) AS has_anamnese,
        (pant.patient_id IS NOT NULL) AS has_anthropometry,
        (pmp.patient_id IS NOT NULL) AS has_meal_plan,
        (pp.patient_id IS NOT NULL) AS has_prescription,
        ARRAY_REMOVE(ARRAY[
            CASE WHEN pa.patient_id IS NULL THEN 'anamnese' END,
            CASE WHEN pant.patient_id IS NULL THEN 'anthropometry' END,
            CASE WHEN pmp.patient_id IS NULL THEN 'meal_plan' END,
            CASE WHEN pp.patient_id IS NULL THEN 'prescription' END
        ], NULL) AS pending_items
    FROM active_patients ap
    LEFT JOIN patient_anamnese pa ON pa.patient_id = ap.patient_id
    LEFT JOIN patient_anthropometry pant ON pant.patient_id = ap.patient_id
    LEFT JOIN patient_meal_plans pmp ON pmp.patient_id = ap.patient_id
    LEFT JOIN patient_prescriptions pp ON pp.patient_id = ap.patient_id
    WHERE
        -- Apenas pacientes com pelo menos 1 item pendente
        pa.patient_id IS NULL
        OR pant.patient_id IS NULL
        OR pmp.patient_id IS NULL
        OR pp.patient_id IS NULL
    ORDER BY ap.patient_name;
END;
$$;


ALTER FUNCTION "private"."get_patients_pending_data_optimized"("p_nutritionist_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_system_live_logs"("limit_count" integer DEFAULT 50) RETURNS TABLE("id" "text", "type" "text", "message" "text", "user_name" "text", "event_timestamp" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT * FROM (
    -- Activity logs
    SELECT 
      a.id::text,
      'info' as type,
      a.event_name as message,
      COALESCE(u.name, 'Sistema') as user_name,
      a.occurred_at as event_timestamp
    FROM activity_log a
    LEFT JOIN user_profiles u ON u.id = a.actor_user_id

    UNION ALL

    -- Observability logs (errors/warnings)
    SELECT 
      o.id::text,
      CASE WHEN o.event_type = 'ERROR' THEN 'error' ELSE 'warning' END as type,
      COALESCE(o.error_message, o.operation) as message,
      COALESCE(u.name, 'Sistema') as user_name,
      o.created_at as event_timestamp
    FROM operational_observability_log o
    LEFT JOIN user_profiles u ON u.id = o.nutritionist_id
  ) combined_logs
  ORDER BY event_timestamp DESC
  LIMIT limit_count;
END;
$$;


ALTER FUNCTION "private"."get_system_live_logs"("limit_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_tcc_study_metrics"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_result jsonb;

  -- Platform overview
  v_total_nutritionists int;
  v_total_patients int;
  v_active_nutritionists_30d int;
  v_active_patients_30d int;
  v_new_users_7d int;
  v_new_users_30d int;

  -- Clinical: Goals
  v_total_goals int;
  v_active_goals int;
  v_completed_goals int;
  v_avg_progress numeric;
  v_avg_viability_score numeric;
  v_goal_type_dist jsonb;

  -- Clinical: Anamnesis
  v_total_anamnesis int;
  v_completed_anamnesis int;
  v_anamnesis_completion_rate numeric;
  v_avg_fields_per_record int;

  -- Clinical: Growth Records (Anthropometry)
  v_total_growth_records int;
  v_patients_with_records int;
  v_avg_records_per_patient numeric;
  v_records_last_30d int;
  v_patients_with_bmi jsonb;

  -- Clinical: Nutrition Diary
  v_total_meals int;
  v_meals_last_7d int;
  v_meals_last_30d int;
  v_avg_adherence_score numeric;
  v_active_diarists int;  -- patients who logged at least once in 30d

  -- Clinical: Energy Calculations (TMB)
  v_total_tmb_calcs int;
  v_protocol_distribution jsonb;

  -- Clinical: Appointments
  v_total_appointments int;
  v_completed_appointments int;
  v_cancelled_appointments int;
  v_no_show_appointments int;
  v_attendance_rate numeric;
  v_appointment_type_dist jsonb;

  -- Engagement: Chat
  v_total_chat_messages int;
  v_chat_messages_30d int;
  v_active_chat_pairs int;

  -- Engagement: Platform modules
  v_module_usage jsonb;
  v_module_error_rates jsonb;
  v_avg_latency_ms numeric;

  -- Engagement: Notifications
  v_total_notifications int;
  v_read_notifications int;
  v_notification_read_rate numeric;

  -- Engagement: Achievements
  v_total_achievements_earned int;
  v_patients_with_achievements int;

  -- Engagement: Meal Plans
  v_total_meal_plans int;
  v_patients_with_plan int;

  -- Weekly activity
  v_activity_by_day jsonb;

BEGIN

  -- ── Platform Overview ────────────────────────────────────────
  SELECT COUNT(*) INTO v_total_nutritionists
  FROM user_profiles WHERE user_type = 'nutritionist';

  SELECT COUNT(*) INTO v_total_patients
  FROM user_profiles WHERE user_type = 'patient';

  SELECT COUNT(DISTINCT nutritionist_id) INTO v_active_nutritionists_30d
  FROM operational_observability_log
  WHERE created_at >= NOW() - INTERVAL '30 days' AND nutritionist_id IS NOT NULL;

  SELECT COUNT(DISTINCT patient_id) INTO v_active_patients_30d
  FROM meals
  WHERE created_at >= NOW() - INTERVAL '30 days';

  SELECT COUNT(*) INTO v_new_users_7d
  FROM user_profiles WHERE created_at >= NOW() - INTERVAL '7 days';

  SELECT COUNT(*) INTO v_new_users_30d
  FROM user_profiles WHERE created_at >= NOW() - INTERVAL '30 days';

  -- ── Clinical: Goals ─────────────────────────────────────────
  SELECT COUNT(*) INTO v_total_goals FROM patient_goals;
  SELECT COUNT(*) INTO v_active_goals FROM patient_goals WHERE status = 'active';
  SELECT COUNT(*) INTO v_completed_goals FROM patient_goals WHERE status = 'completed';
  SELECT ROUND(AVG(progress_percentage)::numeric, 1) INTO v_avg_progress FROM patient_goals WHERE progress_percentage IS NOT NULL;
  SELECT ROUND(AVG(viability_score)::numeric, 2) INTO v_avg_viability_score FROM patient_goals WHERE viability_score IS NOT NULL;

  SELECT jsonb_object_agg(goal_type, cnt) INTO v_goal_type_dist
  FROM (
    SELECT goal_type, COUNT(*) AS cnt
    FROM patient_goals
    GROUP BY goal_type
  ) t;

  -- ── Clinical: Anamnesis ─────────────────────────────────────
  SELECT COUNT(*) INTO v_total_anamnesis FROM anamnesis_records;
  SELECT COUNT(*) INTO v_completed_anamnesis FROM anamnesis_records WHERE status = 'completed';
  v_anamnesis_completion_rate := CASE WHEN v_total_anamnesis > 0
    THEN ROUND((v_completed_anamnesis::numeric / v_total_anamnesis * 100), 1)
    ELSE 0 END;

  SELECT ROUND(AVG(field_cnt)::numeric, 0) INTO v_avg_fields_per_record
  FROM (
    SELECT ar.id, COUNT(aa.id) AS field_cnt
    FROM anamnesis_records ar
    LEFT JOIN anamnese_answers aa ON aa.patient_id = ar.patient_id
    GROUP BY ar.id
  ) t;

  -- ── Clinical: Growth Records ────────────────────────────────
  SELECT COUNT(*) INTO v_total_growth_records FROM growth_records WHERE is_latest_revision = true;
  SELECT COUNT(DISTINCT patient_id) INTO v_patients_with_records FROM growth_records;
  SELECT ROUND(AVG(cnt)::numeric, 1) INTO v_avg_records_per_patient
  FROM (SELECT patient_id, COUNT(*) AS cnt FROM growth_records GROUP BY patient_id) t;
  SELECT COUNT(*) INTO v_records_last_30d FROM growth_records WHERE created_at >= NOW() - INTERVAL '30 days';

  -- BMI distribution: count patients with calculated BMI ranges from latest record
  SELECT jsonb_build_object(
    'underweight', COUNT(*) FILTER (WHERE bmi < 18.5),
    'normal',      COUNT(*) FILTER (WHERE bmi BETWEEN 18.5 AND 24.9),
    'overweight',  COUNT(*) FILTER (WHERE bmi BETWEEN 25.0 AND 29.9),
    'obese',       COUNT(*) FILTER (WHERE bmi >= 30)
  ) INTO v_patients_with_bmi
  FROM (
    SELECT patient_id,
      ROUND((weight / ((height/100) * (height/100)))::numeric, 1) AS bmi
    FROM growth_records
    WHERE is_latest_revision = true
      AND weight IS NOT NULL AND height IS NOT NULL AND height > 0
  ) t;

  -- ── Clinical: Nutrition Diary ────────────────────────────────
  SELECT COUNT(*) INTO v_total_meals FROM meals WHERE deleted_at IS NULL;
  SELECT COUNT(*) INTO v_meals_last_7d FROM meals WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '7 days';
  SELECT COUNT(*) INTO v_meals_last_30d FROM meals WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '30 days';
  SELECT ROUND(AVG(adherence_score)::numeric, 1) INTO v_avg_adherence_score FROM meals WHERE adherence_score IS NOT NULL AND deleted_at IS NULL;
  SELECT COUNT(DISTINCT patient_id) INTO v_active_diarists FROM meals WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '30 days';

  -- ── Clinical: Energy Calculations ────────────────────────────
  SELECT COUNT(*) INTO v_total_tmb_calcs FROM energy_expenditure_calculations;
  SELECT jsonb_object_agg(proto, cnt) INTO v_protocol_distribution
  FROM (
    SELECT COALESCE(protocol, 'unknown') AS proto, COUNT(*) AS cnt
    FROM energy_expenditure_calculations
    GROUP BY protocol
  ) t;

  -- ── Clinical: Appointments ───────────────────────────────────
  SELECT COUNT(*) INTO v_total_appointments FROM appointments;
  SELECT COUNT(*) INTO v_completed_appointments FROM appointments WHERE status = 'completed';
  SELECT COUNT(*) INTO v_cancelled_appointments FROM appointments WHERE status = 'cancelled';
  SELECT COUNT(*) INTO v_no_show_appointments FROM appointments WHERE status = 'no_show';
  v_attendance_rate := CASE WHEN v_total_appointments > 0
    THEN ROUND((v_completed_appointments::numeric / v_total_appointments * 100), 1)
    ELSE 0 END;

  SELECT jsonb_object_agg(appointment_type, cnt) INTO v_appointment_type_dist
  FROM (
    SELECT COALESCE(appointment_type, 'unknown') AS appointment_type, COUNT(*) AS cnt
    FROM appointments
    GROUP BY appointment_type
  ) t;

  -- ── Engagement: Chat ─────────────────────────────────────────
  SELECT COUNT(*) INTO v_total_chat_messages FROM chats;
  SELECT COUNT(*) INTO v_chat_messages_30d FROM chats WHERE created_at >= NOW() - INTERVAL '30 days';
  SELECT COUNT(*) INTO v_active_chat_pairs
  FROM (
    SELECT DISTINCT LEAST(from_id, to_id), GREATEST(from_id, to_id)
    FROM chats WHERE created_at >= NOW() - INTERVAL '30 days'
  ) t;

  -- ── Engagement: Module Usage ─────────────────────────────────
  SELECT jsonb_object_agg(module, cnt) INTO v_module_usage
  FROM (
    SELECT module, COUNT(*) AS cnt
    FROM operational_observability_log
    WHERE created_at >= NOW() - INTERVAL '30 days'
    GROUP BY module
    ORDER BY cnt DESC
  ) t;

  SELECT jsonb_object_agg(module, error_rate) INTO v_module_error_rates
  FROM (
    SELECT module,
      ROUND(100.0 * COUNT(*) FILTER (WHERE event_type = 'error') / NULLIF(COUNT(*), 0), 1) AS error_rate
    FROM operational_observability_log
    WHERE created_at >= NOW() - INTERVAL '30 days'
    GROUP BY module
  ) t;

  SELECT ROUND(AVG(latency_ms)::numeric, 0) INTO v_avg_latency_ms
  FROM operational_observability_log WHERE created_at >= NOW() - INTERVAL '30 days';

  -- ── Engagement: Notifications ─────────────────────────────────
  SELECT COUNT(*) INTO v_total_notifications FROM notifications;
  SELECT COUNT(*) INTO v_read_notifications FROM notifications WHERE is_read = true;
  v_notification_read_rate := CASE WHEN v_total_notifications > 0
    THEN ROUND((v_read_notifications::numeric / v_total_notifications * 100), 1)
    ELSE 0 END;

  -- ── Engagement: Achievements ─────────────────────────────────
  SELECT COUNT(*) INTO v_total_achievements_earned FROM user_achievements;
  SELECT COUNT(DISTINCT user_id) INTO v_patients_with_achievements FROM user_achievements;

  -- ── Engagement: Meal Plans ────────────────────────────────────
  SELECT COUNT(*) INTO v_total_meal_plans FROM meal_plans WHERE is_template = false;
  SELECT COUNT(DISTINCT patient_id) INTO v_patients_with_plan FROM meal_plans WHERE is_template = false AND patient_id IS NOT NULL;

  -- ── Weekly activity (last 7 days) ─────────────────────────────
  SELECT jsonb_agg(row_to_json(t) ORDER BY day_date) INTO v_activity_by_day
  FROM (
    SELECT
      TO_CHAR(d, 'YYYY-MM-DD') AS day_date,
      TO_CHAR(d, 'Dy') AS day_name,
      COUNT(DISTINCT ol.id) AS platform_events,
      COUNT(DISTINCT m.id) AS meal_logs,
      COUNT(DISTINCT gr.id) AS growth_records
    FROM generate_series(NOW() - INTERVAL '6 days', NOW(), INTERVAL '1 day') AS d
    LEFT JOIN operational_observability_log ol ON ol.created_at::date = d::date
    LEFT JOIN meals m ON m.created_at::date = d::date AND m.deleted_at IS NULL
    LEFT JOIN growth_records gr ON gr.created_at::date = d::date
    GROUP BY d
  ) t;

  -- ── Build final JSON ─────────────────────────────────────────
  v_result := jsonb_build_object(
    -- Platform
    'platform', jsonb_build_object(
      'total_nutritionists', v_total_nutritionists,
      'total_patients', v_total_patients,
      'active_nutritionists_30d', v_active_nutritionists_30d,
      'active_patients_30d', v_active_patients_30d,
      'new_users_7d', v_new_users_7d,
      'new_users_30d', v_new_users_30d
    ),
    -- Goals
    'goals', jsonb_build_object(
      'total', v_total_goals,
      'active', v_active_goals,
      'completed', v_completed_goals,
      'avg_progress_pct', v_avg_progress,
      'avg_viability_score', v_avg_viability_score,
      'type_distribution', v_goal_type_dist
    ),
    -- Anamnesis
    'anamnesis', jsonb_build_object(
      'total_records', v_total_anamnesis,
      'completed', v_completed_anamnesis,
      'completion_rate_pct', v_anamnesis_completion_rate,
      'avg_fields_per_record', v_avg_fields_per_record
    ),
    -- Anthropometry
    'anthropometry', jsonb_build_object(
      'total_records', v_total_growth_records,
      'patients_with_records', v_patients_with_records,
      'avg_records_per_patient', v_avg_records_per_patient,
      'records_last_30d', v_records_last_30d,
      'bmi_distribution', v_patients_with_bmi
    ),
    -- Nutrition diary
    'nutrition_diary', jsonb_build_object(
      'total_meals', v_total_meals,
      'meals_last_7d', v_meals_last_7d,
      'meals_last_30d', v_meals_last_30d,
      'avg_adherence_score', v_avg_adherence_score,
      'active_diarists_30d', v_active_diarists
    ),
    -- Energy calculations
    'energy_calcs', jsonb_build_object(
      'total', v_total_tmb_calcs,
      'protocol_distribution', v_protocol_distribution
    ),
    -- Appointments
    'appointments', jsonb_build_object(
      'total', v_total_appointments,
      'completed', v_completed_appointments,
      'cancelled', v_cancelled_appointments,
      'no_show', v_no_show_appointments,
      'attendance_rate_pct', v_attendance_rate,
      'type_distribution', v_appointment_type_dist
    ),
    -- Chat
    'chat', jsonb_build_object(
      'total_messages', v_total_chat_messages,
      'messages_last_30d', v_chat_messages_30d,
      'active_chat_pairs_30d', v_active_chat_pairs
    ),
    -- Modules
    'modules', jsonb_build_object(
      'usage_30d', v_module_usage,
      'error_rates_pct_30d', v_module_error_rates,
      'avg_latency_ms_30d', v_avg_latency_ms
    ),
    -- Notifications
    'notifications', jsonb_build_object(
      'total', v_total_notifications,
      'read', v_read_notifications,
      'read_rate_pct', v_notification_read_rate
    ),
    -- Gamification
    'gamification', jsonb_build_object(
      'total_achievements_earned', v_total_achievements_earned,
      'patients_with_achievements', v_patients_with_achievements
    ),
    -- Meal plans
    'meal_plans', jsonb_build_object(
      'total', v_total_meal_plans,
      'patients_with_plan', v_patients_with_plan
    ),
    -- Activity timeline
    'activity_by_day', v_activity_by_day
  );

  RETURN v_result;
END;
$$;


ALTER FUNCTION "private"."get_tcc_study_metrics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_user_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT auth.uid();
$$;


ALTER FUNCTION "private"."get_user_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."handle_new_chat_message_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO notifications(user_id, type, content)
  VALUES(
      NEW.to_id, 
      'new_message', 
      jsonb_build_object(
          'from_id', NEW.from_id,
          'message', LEFT(NEW.message, 50)
      )
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "private"."handle_new_chat_message_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_type text;
  v_name text;
  v_needs_password_reset boolean;
begin
  v_name := nullif(new.raw_user_meta_data->>'name', '');
  if v_name is null then
    v_name := nullif(new.raw_user_meta_data->>'full_name', '');
  end if;
  if v_name is null then
    v_name := nullif(new.raw_user_meta_data->>'display_name', '');
  end if;
  if v_name is null then
    v_name := 'Usuário';
  end if;

  v_user_type := lower(nullif(new.raw_user_meta_data->>'user_type', ''));
  if v_user_type not in ('patient', 'nutritionist') then
    v_user_type := 'patient';
  end if;

  v_needs_password_reset := (new.raw_user_meta_data->>'needs_password_reset')::boolean;
  if v_needs_password_reset is null then
    v_needs_password_reset := false;
  end if;

  insert into public.user_profiles (
    id,
    email,
    name,
    user_type,
    crn,
    birth_date,
    gender,
    height,
    weight,
    goal,
    nutritionist_id,
    phone,
    cpf,
    occupation,
    civil_status,
    observations,
    address,
    needs_password_reset
  )
  values (
    new.id,
    new.email,
    v_name,
    v_user_type,
    nullif(new.raw_user_meta_data->>'crn', ''),
    nullif(new.raw_user_meta_data->>'birth_date', '')::date,
    nullif(new.raw_user_meta_data->>'gender', ''),
    nullif(new.raw_user_meta_data->>'height', '')::numeric,
    nullif(new.raw_user_meta_data->>'weight', '')::numeric,
    nullif(new.raw_user_meta_data->>'goal', ''),
    nullif(new.raw_user_meta_data->>'nutritionist_id', '')::uuid,
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'cpf', ''),
    nullif(new.raw_user_meta_data->>'occupation', ''),
    nullif(new.raw_user_meta_data->>'civil_status', ''),
    nullif(new.raw_user_meta_data->>'observations', ''),
    new.raw_user_meta_data->'address',
    v_needs_password_reset
  );
  return new;
end;
$$;


ALTER FUNCTION "private"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."increment_checkin_streak"("p_patient_id" "uuid", "p_nutritionist_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
  last_checkin TIMESTAMPTZ;
  current_streak INTEGER;
  best_streak INTEGER;
BEGIN
  SELECT last_checkin_at, checkin_streak_current, checkin_streak_best
  INTO last_checkin, current_streak, best_streak
  FROM nutritionist_patients
  WHERE patient_id = p_patient_id AND nutritionist_id = p_nutritionist_id;
  
  IF last_checkin IS NULL OR last_checkin < now() - INTERVAL '2 days' THEN
    UPDATE nutritionist_patients SET
      checkin_streak_current = 1,
      last_checkin_at = now()
    WHERE patient_id = p_patient_id AND nutritionist_id = p_nutritionist_id;
  ELSE
    UPDATE nutritionist_patients SET
      checkin_streak_current = COALESCE(current_streak, 0) + 1,
      checkin_streak_best = GREATEST(COALESCE(best_streak, 0), COALESCE(current_streak, 0) + 1),
      last_checkin_at = now()
    WHERE patient_id = p_patient_id AND nutritionist_id = p_nutritionist_id;
  END IF;
END;
$$;


ALTER FUNCTION "private"."increment_checkin_streak"("p_patient_id" "uuid", "p_nutritionist_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."interact_notification"("p_notification_id" "uuid", "p_delete_if_message" boolean DEFAULT true) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."interact_notification"("p_notification_id" "uuid", "p_delete_if_message" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select exists (select 1 from public.user_profiles where id = auth.uid() and is_admin = true);
$$;


ALTER FUNCTION "private"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_nutritionist"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and user_type = 'nutritionist'
  );
$$;


ALTER FUNCTION "private"."is_nutritionist"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_patient"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and user_type = 'patient'
  );
$$;


ALTER FUNCTION "private"."is_patient"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."log_activity_event"("p_event_name" "text", "p_event_version" integer DEFAULT 1, "p_source_module" "text" DEFAULT NULL::"text", "p_patient_id" "uuid" DEFAULT NULL::"uuid", "p_nutritionist_id" "uuid" DEFAULT NULL::"uuid", "p_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.activity_log (
    event_name,
    event_version,
    source_module,
    patient_id,
    nutritionist_id,
    actor_user_id,
    occurred_at,
    payload
  )
  VALUES (
    COALESCE(NULLIF(trim(p_event_name), ''), 'unknown.event'),
    GREATEST(COALESCE(p_event_version, 1), 1),
    p_source_module,
    p_patient_id,
    p_nutritionist_id,
    (SELECT auth.uid()),
    now(),
    COALESCE(p_payload, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


ALTER FUNCTION "private"."log_activity_event"("p_event_name" "text", "p_event_version" integer, "p_source_module" "text", "p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."log_bug_report"("p_error_type" character varying DEFAULT 'Error'::character varying, "p_error_message" "text" DEFAULT NULL::"text", "p_stack_trace" "text" DEFAULT NULL::"text", "p_route" "text" DEFAULT NULL::"text", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_user_email" "text" DEFAULT NULL::"text", "p_user_name" "text" DEFAULT NULL::"text", "p_user_type" character varying DEFAULT NULL::character varying, "p_user_agent" "text" DEFAULT NULL::"text", "p_console_log" "jsonb" DEFAULT '[]'::"jsonb", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_component_stack" "text" DEFAULT NULL::"text", "p_source_file" "text" DEFAULT NULL::"text", "p_line_number" integer DEFAULT NULL::integer, "p_column_number" integer DEFAULT NULL::integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_id uuid;
    v_severity varchar(20);
begin
    if p_error_type in ('TypeError', 'ReferenceError', 'SyntaxError', 'RangeError') then
        v_severity := 'critical';
    elsif p_error_message ilike '%warning%' or p_error_message ilike '%deprecated%' then
        v_severity := 'warning';
    else
        v_severity := 'error';
    end if;

    insert into public.bug_reports (
        error_type,
        error_message,
        stack_trace,
        route,
        user_id,
        user_email,
        user_name,
        user_type,
        user_agent,
        console_log,
        metadata,
        component_stack,
        source_file,
        line_number,
        column_number,
        severity,
        bug_type
    ) values (
        p_error_type,
        p_error_message,
        p_stack_trace,
        p_route,
        p_user_id,
        p_user_email,
        p_user_name,
        p_user_type,
        p_user_agent,
        p_console_log,
        p_metadata,
        p_component_stack,
        p_source_file,
        p_line_number,
        p_column_number,
        v_severity,
        case
            when p_source_file like '%/api/%' or p_source_file like '%supabase%' then 'api'
            else 'frontend'
        end
    )
    returning id into v_id;

    return v_id;
end;
$$;


ALTER FUNCTION "private"."log_bug_report"("p_error_type" character varying, "p_error_message" "text", "p_stack_trace" "text", "p_route" "text", "p_user_id" "uuid", "p_user_email" "text", "p_user_name" "text", "p_user_type" character varying, "p_user_agent" "text", "p_console_log" "jsonb", "p_metadata" "jsonb", "p_component_stack" "text", "p_source_file" "text", "p_line_number" integer, "p_column_number" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."log_meal_action"("p_patient_id" "uuid", "p_meal_id" bigint, "p_action" "text", "p_meal_type" "text" DEFAULT NULL::"text", "p_meal_date" "date" DEFAULT NULL::"date", "p_meal_time" time without time zone DEFAULT NULL::time without time zone, "p_details" "jsonb" DEFAULT NULL::"jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_log_id BIGINT;
BEGIN
    INSERT INTO meal_audit_log (
        patient_id,
        meal_id,
        action,
        meal_type,
        meal_date,
        meal_time,
        details
    ) VALUES (
        p_patient_id,
        p_meal_id,
        p_action,
        p_meal_type,
        p_meal_date,
        p_meal_time,
        p_details
    ) RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;


ALTER FUNCTION "private"."log_meal_action"("p_patient_id" "uuid", "p_meal_id" bigint, "p_action" "text", "p_meal_type" "text", "p_meal_date" "date", "p_meal_time" time without time zone, "p_details" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "private"."log_meal_action"("p_patient_id" "uuid", "p_meal_id" bigint, "p_action" "text", "p_meal_type" "text", "p_meal_date" "date", "p_meal_time" time without time zone, "p_details" "jsonb") IS 'Função helper para registrar ações de auditoria em refeições';



CREATE OR REPLACE FUNCTION "private"."log_meal_action_secure"("p_meal_id" "text", "p_action" "text", "p_details" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."log_meal_action_secure"("p_meal_id" "text", "p_action" "text", "p_details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."log_operational_event"("p_module" "text", "p_operation" "text", "p_event_type" "text" DEFAULT 'success'::"text", "p_latency_ms" integer DEFAULT 0, "p_nutritionist_id" "uuid" DEFAULT NULL::"uuid", "p_patient_id" "uuid" DEFAULT NULL::"uuid", "p_error_message" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."log_operational_event"("p_module" "text", "p_operation" "text", "p_event_type" "text", "p_latency_ms" integer, "p_nutritionist_id" "uuid", "p_patient_id" "uuid", "p_error_message" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."process_patient_reminders"("p_patient_id" "uuid" DEFAULT "auth"."uid"()) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_patient_id uuid;
  v_now timestamptz := now();
  v_today date := (now())::date;
  v_now_time time := (now())::time;
  v_prefs record;
  v_daily_due boolean := false;
  v_measurement_due boolean := false;
  v_has_meal_today boolean := false;
  v_last_measurement_date date;
  v_notification_id bigint;
  v_daily_sent int := 0;
  v_measurement_sent int := 0;
begin
  v_patient_id := coalesce(p_patient_id, auth.uid());
  if v_patient_id is null then
    return jsonb_build_object('processed', false, 'reason', 'missing_patient_id');
  end if;

  select *
    into v_prefs
  from public.patient_reminder_preferences
  where patient_id = v_patient_id;

  if not found then
    insert into public.patient_reminder_preferences (patient_id)
    values (v_patient_id)
    on conflict (patient_id) do nothing;

    select *
      into v_prefs
    from public.patient_reminder_preferences
    where patient_id = v_patient_id;
  end if;

  if v_prefs is null then
    return jsonb_build_object('processed', false, 'reason', 'missing_preferences');
  end if;

  select exists (
    select 1
    from public.meals m
    where m.patient_id = v_patient_id
      and m.meal_date = v_today
      and m.deleted_at is null
  )
  into v_has_meal_today;

  select max(gr.record_date)
    into v_last_measurement_date
  from public.growth_records gr
  where gr.patient_id = v_patient_id;

  if coalesce(v_prefs.channel_in_app, true) then
    if coalesce(v_prefs.daily_log_enabled, true)
      and v_now_time >= coalesce(v_prefs.daily_log_time, '20:00'::time)
      and not v_has_meal_today then
      v_daily_due := true;
    end if;

    if coalesce(v_prefs.measurement_enabled, true)
      and v_now_time >= coalesce(v_prefs.measurement_time, '09:00'::time)
      and (v_last_measurement_date is null or v_last_measurement_date <= (v_today - interval '7 days')::date) then
      v_measurement_due := true;
    end if;
  end if;

  if v_daily_due then
    if not exists (
      select 1
      from public.reminder_delivery_log r
      where r.patient_id = v_patient_id
        and r.reminder_type = 'daily_log_reminder'
        and r.delivery_channel = 'in_app'
        and r.reminder_date = v_today
    ) then
      insert into public.notifications(user_id, type, content, is_read)
      values (
        v_patient_id,
        'daily_log_reminder',
        jsonb_build_object(
          'title', 'Lembrete Diário',
          'message', 'Não se esqueça de registrar suas refeições hoje!',
          'source_module', 'reminder_engine'
        ),
        false
      )
      returning id into v_notification_id;

      insert into public.reminder_delivery_log(
        patient_id, reminder_type, delivery_channel, reminder_date, reminder_time, status, notification_id
      )
      values (
        v_patient_id, 'daily_log_reminder', 'in_app', v_today, coalesce(v_prefs.daily_log_time, '20:00'::time), 'sent', v_notification_id
      );

      begin
        perform public.log_activity_event(
          'reminder_sent',
          1,
          'reminder_engine',
          v_patient_id,
          null,
          jsonb_build_object(
            'reminder_type', 'daily_log_reminder',
            'delivery_channel', 'in_app',
            'notification_id', v_notification_id
          )
        );
      exception when undefined_function then
        null;
      end;

      v_daily_sent := 1;
    end if;
  end if;

  if v_measurement_due then
    if not exists (
      select 1
      from public.reminder_delivery_log r
      where r.patient_id = v_patient_id
        and r.reminder_type = 'measurement_reminder'
        and r.delivery_channel = 'in_app'
        and r.reminder_date = v_today
    ) then
      insert into public.notifications(user_id, type, content, is_read)
      values (
        v_patient_id,
        'measurement_reminder',
        jsonb_build_object(
          'title', 'Atualizar Medidas',
          'message', 'Atualize suas medidas para manter seu plano calibrado.',
          'source_module', 'reminder_engine'
        ),
        false
      )
      returning id into v_notification_id;

      insert into public.reminder_delivery_log(
        patient_id, reminder_type, delivery_channel, reminder_date, reminder_time, status, notification_id
      )
      values (
        v_patient_id, 'measurement_reminder', 'in_app', v_today, coalesce(v_prefs.measurement_time, '09:00'::time), 'sent', v_notification_id
      );

      begin
        perform public.log_activity_event(
          'reminder_sent',
          1,
          'reminder_engine',
          v_patient_id,
          null,
          jsonb_build_object(
            'reminder_type', 'measurement_reminder',
            'delivery_channel', 'in_app',
            'notification_id', v_notification_id
          )
        );
      exception when undefined_function then
        null;
      end;

      v_measurement_sent := 1;
    end if;
  end if;

  return jsonb_build_object(
    'processed', true,
    'patient_id', v_patient_id,
    'daily_sent', v_daily_sent,
    'measurement_sent', v_measurement_sent,
    'timestamp', v_now
  );
end;
$$;


ALTER FUNCTION "private"."process_patient_reminders"("p_patient_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."promote_draft_to_active"("p_draft_id" bigint, "p_patient_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Atomicamente: desativa planos ativos não-rascunho
    UPDATE meal_plans
        SET is_active = false
        WHERE patient_id = p_patient_id
            AND is_active = true
            AND is_draft = false;

    -- Atomicamente: promove o draft para plano ativo
    UPDATE meal_plans
        SET is_draft = false,
            is_active = true,
            updated_at = NOW()
        WHERE id = p_draft_id;
END;
$$;


ALTER FUNCTION "private"."promote_draft_to_active"("p_draft_id" bigint, "p_patient_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."redeem_invite_code"("input_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user_id uuid;
    v_nutritionist_id uuid;
    v_target_profile_id uuid;
    v_target_profile_data record;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Usuário não autenticado');
    END IF;

    -- 1. Try to find a nutritionist with this code (Case-insensitive)
    SELECT id INTO v_nutritionist_id 
    FROM public.user_profiles 
    WHERE lower(invite_code) = lower(input_code) AND user_type = 'nutritionist';

    IF v_nutritionist_id IS NOT NULL THEN
        -- Link patient to nutritionist with PENDING status for global code
        INSERT INTO public.nutritionist_patients (nutritionist_id, patient_id, status)
        VALUES (v_nutritionist_id, v_user_id, 'pending')
        ON CONFLICT (nutritionist_id, patient_id) DO UPDATE SET status = 'pending'
        WHERE public.nutritionist_patients.status IS NULL;
        
        -- Update nutritionist_id in profile if not set
        UPDATE public.user_profiles 
        SET nutritionist_id = v_nutritionist_id 
        WHERE id = v_user_id AND (nutritionist_id IS NULL OR nutritionist_id::text = '');

        RETURN jsonb_build_object('success', true, 'type', 'link_pending', 'message', 'Solicitação de vínculo enviada. Aguarde a aprovação do seu nutricionista.');
    END IF;

    -- 2. Try to find a patient profile with this code (Claiming/Offline, Case-insensitive)
    SELECT * INTO v_target_profile_data
    FROM public.user_profiles 
    WHERE lower(patient_invite_code) = lower(input_code) AND user_type = 'patient';

    IF v_target_profile_data.id IS NOT NULL THEN
        IF v_target_profile_data.id = v_user_id THEN
            RETURN jsonb_build_object('success', false, 'message', 'Você já é o dono deste perfil');
        END IF;

        -- Claim profile: Update the profile ID to match the current auth user
        BEGIN
            -- Ensure any existing link created by nutritionists for this profile is set to 'active'
            UPDATE public.nutritionist_patients 
            SET patient_id = v_user_id, status = 'active'
            WHERE patient_id = v_target_profile_data.id;

            DELETE FROM public.user_profiles WHERE id = v_user_id;
            
            UPDATE public.user_profiles 
            SET id = v_user_id, 
                patient_invite_code = NULL,
                email = COALESCE(email, v_target_profile_data.email)
            WHERE id = v_target_profile_data.id;

            RETURN jsonb_build_object('success', true, 'type', 'profile_claimed', 'message', 'Cadastro vinculado ao perfil clínico com sucesso');
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('success', false, 'message', 'Erro ao vincular perfil: ' || SQLERRM);
        END;
    END IF;

    RETURN jsonb_build_object('success', false, 'message', 'Código inválido ou não encontrado');
END;
$$;


ALTER FUNCTION "private"."redeem_invite_code"("input_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."reject_patient_link"("p_patient_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_nutri_id uuid;
BEGIN
    v_nutri_id := auth.uid();
    
    -- Remove the link request
    DELETE FROM public.nutritionist_patients 
    WHERE nutritionist_id = v_nutri_id AND patient_id = p_patient_id;

    IF FOUND THEN
        -- Optional: Clear nutritionist_id from patient's profile if they were linked to this nutri
        UPDATE public.user_profiles 
        SET nutritionist_id = NULL 
        WHERE id = p_patient_id AND nutritionist_id = v_nutri_id;

        RETURN jsonb_build_object('success', true, 'message', 'Solicitação recusada e removida');
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'Solicitação não encontrada');
    END IF;
END;
$$;


ALTER FUNCTION "private"."reject_patient_link"("p_patient_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."set_active_meal_plan"("p_plan_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_patient_id UUID;
BEGIN
    -- Obtém o patient_id do plano alvo
    SELECT patient_id INTO v_patient_id
    FROM meal_plans WHERE id = p_plan_id;

    IF v_patient_id IS NULL THEN
        RAISE EXCEPTION 'Plano % não encontrado', p_plan_id;
    END IF;

    -- Atomicamente: desativa todos os planos ativos do paciente
    UPDATE meal_plans
        SET is_active = false
        WHERE patient_id = v_patient_id AND is_active = true;

    -- Atomicamente: ativa o plano alvo
    UPDATE meal_plans
        SET is_active = true
        WHERE id = p_plan_id;
END;
$$;


ALTER FUNCTION "private"."set_active_meal_plan"("p_plan_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."soft_delete_meal"("p_meal_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    UPDATE meals
    SET deleted_at = NOW()
    WHERE id = p_meal_id
    AND deleted_at IS NULL;

    RETURN FOUND;
END;
$$;


ALTER FUNCTION "private"."soft_delete_meal"("p_meal_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "private"."soft_delete_meal"("p_meal_id" bigint) IS 'Marca uma refeição como deletada (soft delete) ao invés de remover do banco';



CREATE OR REPLACE FUNCTION "private"."sync_notification_read_state"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."sync_notification_read_state"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."transition_appointment_status"("p_appointment_id" bigint, "p_next_status" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_appt record;
  v_actor uuid := auth.uid();
  v_result jsonb;
  v_next text := p_next_status;
begin
  if p_appointment_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_appointment_id');
  end if;

  select * into v_appt from public.appointments where id = p_appointment_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'appointment_not_found');
  end if;

  if v_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_actor');
  end if;

  if v_actor <> v_appt.nutritionist_id and (v_appt.patient_id is null or v_actor <> v_appt.patient_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  if v_next = 'cancelled' then
    v_next := 'canceled';
  end if;

  if v_next = v_appt.status::text or (v_next = 'canceled' and v_appt.status::text = 'cancelled') then
    return jsonb_build_object('ok', true, 'appointment_id', p_appointment_id, 'status', v_appt.status, 'no_change', true);
  end if;

  if v_appt.status::text = 'scheduled' and v_next not in ('confirmed', 'canceled') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_transition');
  end if;
  if v_appt.status::text = 'confirmed' and v_next not in ('completed', 'canceled', 'no_show') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_transition');
  end if;
  if v_appt.status::text in ('completed', 'canceled', 'no_show') then
    return jsonb_build_object('ok', false, 'reason', 'terminal_status_locked');
  end if;

  update public.appointments set status = v_next where id = p_appointment_id;
  select to_jsonb(a.*) into v_result from public.appointments a where a.id = p_appointment_id;
  return jsonb_build_object('ok', true, 'appointment', v_result);
end;
$$;


ALTER FUNCTION "private"."transition_appointment_status"("p_appointment_id" bigint, "p_next_status" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."transition_appointment_status"("p_appointment_id" "uuid", "p_next_status" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_appt record;
  v_actor uuid := auth.uid();
  v_result jsonb;
  v_next text := p_next_status;
begin
  if p_appointment_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_appointment_id');
  end if;

  select * into v_appt
  from public.appointments
  where id = p_appointment_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'appointment_not_found');
  end if;

  if v_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_actor');
  end if;

  if v_actor <> v_appt.nutritionist_id and (v_appt.patient_id is null or v_actor <> v_appt.patient_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  if v_next = 'cancelled' then
    v_next := 'canceled';
  end if;

  if v_next = v_appt.status::text or (v_next = 'canceled' and v_appt.status::text = 'cancelled') then
    return jsonb_build_object('ok', true, 'appointment_id', p_appointment_id, 'status', v_appt.status, 'no_change', true);
  end if;

  -- Validações de transição
  if v_appt.status::text = 'scheduled' and v_next not in ('confirmed', 'canceled') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_transition', 'from', v_appt.status, 'to', v_next);
  end if;
  if v_appt.status::text = 'confirmed' and v_next not in ('completed', 'canceled', 'no_show') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_transition', 'from', v_appt.status, 'to', v_next);
  end if;
  if v_appt.status::text in ('completed', 'canceled', 'no_show') then
    return jsonb_build_object('ok', false, 'reason', 'terminal_status_locked', 'from', v_appt.status, 'to', v_next);
  end if;

  -- Update do status
  update public.appointments
  set status = v_next
  where id = p_appointment_id;

  select to_jsonb(a.*) into v_result
  from public.appointments a
  where a.id = p_appointment_id;

  return jsonb_build_object('ok', true, 'appointment', v_result);
end;
$$;


ALTER FUNCTION "private"."transition_appointment_status"("p_appointment_id" "uuid", "p_next_status" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."upsert_full_meal_plan"("p_plan_id" bigint, "p_plan_data" "jsonb", "p_meals" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
      (v_meal->>'meal_time')::TIME,
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
$$;


ALTER FUNCTION "private"."upsert_full_meal_plan"("p_plan_id" bigint, "p_plan_data" "jsonb", "p_meals" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_validate_growth_record_json_section"("p_section" "jsonb", "p_section_name" "text", "p_default_min" numeric, "p_default_max" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."_validate_growth_record_json_section"("p_section" "jsonb", "p_section_name" "text", "p_default_min" numeric, "p_default_max" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_patient_xp"("p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_xp" integer, "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.add_patient_xp($1, $2, $3, $4); $_$;


ALTER FUNCTION "public"."add_patient_xp"("p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_xp" integer, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_patient_link"("p_patient_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.approve_patient_link($1); $_$;


ALTER FUNCTION "public"."approve_patient_link"("p_patient_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_role"() RETURNS "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select auth.role();
$$;


ALTER FUNCTION "public"."auth_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_setting"("p_name" "text") RETURNS "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select current_setting(p_name, true);
$$;


ALTER FUNCTION "public"."auth_setting"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_uid"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select auth.uid();
$$;


ALTER FUNCTION "public"."auth_uid"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_goal_progress"("goal_id" bigint) RETURNS numeric
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$

DECLARE

    goal_record RECORD;

    weight_change_achieved NUMERIC;

    total_weight_change_needed NUMERIC;

    progress NUMERIC;

BEGIN

    -- Buscar dados da meta

    SELECT * INTO goal_record

    FROM public.patient_goals

    WHERE id = goal_id;

 

    IF NOT FOUND THEN

        RETURN 0;

    END IF;

 

    -- Se não tiver peso atual, retornar 0

    IF goal_record.current_weight IS NULL THEN

        RETURN 0;

    END IF;

 

    -- Calcular mudança de peso alcançada

    weight_change_achieved = goal_record.initial_weight - goal_record.current_weight;

 

    -- Calcular mudança total necessária

    total_weight_change_needed = goal_record.initial_weight - goal_record.target_weight;

 

    -- Evitar divisão por zero

    IF total_weight_change_needed = 0 THEN

        RETURN 100;

    END IF;

 

    -- Calcular progresso percentual

    progress = (weight_change_achieved / total_weight_change_needed) * 100;

 

    -- Limitar entre 0 e 100

    IF progress < 0 THEN

        progress = 0;

    ELSIF progress > 100 THEN

        progress = 100;

    END IF;

 

    RETURN ROUND(progress, 2);

END;

$$;


ALTER FUNCTION "public"."calculate_goal_progress"("goal_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_lab_status"("test_value_text" "text", "ref_min" numeric, "ref_max" numeric) RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
DECLARE
    test_value_numeric NUMERIC;
BEGIN
    -- Tentar converter para numérico
    BEGIN
        test_value_numeric := test_value_text::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
        -- Se não for numérico, retornar 'pending'
        RETURN 'pending';
    END;

    -- Se não há valores de referência, retornar 'pending'
    IF ref_min IS NULL OR ref_max IS NULL THEN
        RETURN 'pending';
    END IF;

    -- Calcular status
    IF test_value_numeric < ref_min THEN
        RETURN 'low';
    ELSIF test_value_numeric > ref_max THEN
        RETURN 'high';
    ELSE
        RETURN 'normal';
    END IF;
END;
$$;


ALTER FUNCTION "public"."calculate_lab_status"("test_value_text" "text", "ref_min" numeric, "ref_max" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calculate_lab_status"("test_value_text" "text", "ref_min" numeric, "ref_max" numeric) IS 'Calcula automaticamente o status de um exame baseado no valor e referências';



CREATE OR REPLACE FUNCTION "public"."calculate_macro_targets"("p_meal_plan_id" bigint) RETURNS TABLE("protein_g" numeric, "carbs_g" numeric, "fat_g" numeric)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_ref RECORD;
BEGIN
    -- Buscar valores de referência
    SELECT * INTO v_ref
    FROM public.meal_plan_reference_values
    WHERE meal_plan_id = p_meal_plan_id;

    IF v_ref IS NULL THEN
        RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;

    IF v_ref.macro_mode = 'percentage' THEN
        -- Calcular com base em percentuais
        RETURN QUERY SELECT
            ((v_ref.total_energy_kcal * v_ref.protein_percentage) / 4)::NUMERIC AS protein_g,
            ((v_ref.total_energy_kcal * v_ref.carbs_percentage) / 4)::NUMERIC AS carbs_g,
            ((v_ref.total_energy_kcal * v_ref.fat_percentage) / 9)::NUMERIC AS fat_g;
    ELSE
        -- Calcular com base em g/kg
        RETURN QUERY SELECT
            (v_ref.weight_kg * v_ref.protein_g_per_kg)::NUMERIC AS protein_g,
            (v_ref.weight_kg * v_ref.carbs_g_per_kg)::NUMERIC AS carbs_g,
            (v_ref.weight_kg * v_ref.fat_g_per_kg)::NUMERIC AS fat_g;
    END IF;
END;
$$;


ALTER FUNCTION "public"."calculate_macro_targets"("p_meal_plan_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calculate_macro_targets"("p_meal_plan_id" bigint) IS 'Calcula valores alvo de macronutrientes baseado nas configurações';



CREATE OR REPLACE FUNCTION "public"."calculate_net_amount"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Líquido = Bruto - (Bruto * (Taxa / 100))
    NEW.net_amount := NEW.amount - (NEW.amount * COALESCE(NEW.fee_percentage, 0) / 100);
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calculate_net_amount"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_delete_user"("p_target_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select is_admin()
  or exists (
    select 1 from public.user_profiles p
    where p.id = p_target_id
      and p.nutritionist_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."can_delete_user"("p_target_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_and_grant_achievements"("p_user_id" "uuid") RETURNS TABLE("name" "text", "description" "text", "icon_name" "text")
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select * from private.check_and_grant_achievements($1); $_$;


ALTER FUNCTION "public"."check_and_grant_achievements"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_is_admin"() RETURNS boolean
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$ select private.check_is_admin(); $$;


ALTER FUNCTION "public"."check_is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_message_notifications_from_sender"("p_sender_id" "uuid") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.clear_message_notifications_from_sender($1); $_$;


ALTER FUNCTION "public"."clear_message_notifications_from_sender"("p_sender_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clone_diet_template_to_patient"("p_template_id" "uuid", "p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_name" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.clone_diet_template_to_patient($1, $2, $3, $4); $_$;


ALTER FUNCTION "public"."clone_diet_template_to_patient"("p_template_id" "uuid", "p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clone_meal_template_to_plan"("p_meal_template_id" "uuid", "p_meal_plan_id" bigint, "p_meal_type" "text", "p_meal_time" time without time zone DEFAULT NULL::time without time zone) RETURNS bigint
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.clone_meal_template_to_plan($1, $2, $3, $4); $_$;


ALTER FUNCTION "public"."clone_meal_template_to_plan"("p_meal_template_id" "uuid", "p_meal_plan_id" bigint, "p_meal_type" "text", "p_meal_time" time without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_custom_measure_to_grams"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Converter meal_plan_foods
  UPDATE public.meal_plan_foods
  SET
    quantity = quantity * OLD.grams_equivalent,
    unit     = 'gram'
  WHERE unit = OLD.code;

  -- Converter meal_plan_food_substitutions
  UPDATE public.meal_plan_food_substitutions
  SET
    quantity = quantity * OLD.grams_equivalent,
    unit     = 'gram'
  WHERE unit = OLD.code;

  -- Converter diet_template_foods
  UPDATE public.diet_template_foods
  SET
    quantity = quantity * OLD.grams_equivalent,
    unit     = 'gram'
  WHERE unit = OLD.code;

  -- Converter diet_template_food_substitutions
  UPDATE public.diet_template_food_substitutions
  SET
    quantity = quantity * OLD.grams_equivalent,
    unit     = 'gram'
  WHERE unit = OLD.code;

  -- Converter meal_template_foods
  UPDATE public.meal_template_foods
  SET
    quantity = quantity * OLD.grams_equivalent,
    unit     = 'gram'
  WHERE unit = OLD.code;

  -- Converter meal_template_food_substitutions
  UPDATE public.meal_template_food_substitutions
  SET
    quantity = quantity * OLD.grams_equivalent,
    unit     = 'gram'
  WHERE unit = OLD.code;

  -- Converter recipe_ingredients
  UPDATE public.recipe_ingredients
  SET
    quantity = quantity * OLD.grams_equivalent,
    unit     = 'gram'
  WHERE unit = OLD.code;

  -- Converter meal_items (Diário do paciente)
  UPDATE public.meal_items
  SET
    quantity = quantity * OLD.grams_equivalent,
    unit     = 'gram'
  WHERE unit = OLD.code;

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."convert_custom_measure_to_grams"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_appointment_reminders"() RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$ select private.create_appointment_reminders(); $$;


ALTER FUNCTION "public"."create_appointment_reminders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_daily_log_reminders"() RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$ select private.create_daily_log_reminders(); $$;


ALTER FUNCTION "public"."create_daily_log_reminders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_diet_template"("p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_tags" "text"[], "p_meals" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_template_id uuid;
  v_meal record;
  v_meal_id uuid;
  v_food record;
BEGIN
  INSERT INTO diet_templates (nutritionist_id, name, description, tags)
  VALUES (p_user_id, p_name, p_description, p_tags)
  RETURNING id INTO v_template_id;
  
  FOR v_meal IN SELECT * FROM jsonb_array_elements(p_meals)
  LOOP
    INSERT INTO diet_template_meals (diet_template_id, name, meal_time, order_index)
    VALUES (v_template_id, v_meal.value->>'name', v_meal.value->>'time', (v_meal.value->>'order_index')::int)
    RETURNING id INTO v_meal_id;
    
    FOR v_food IN SELECT * FROM jsonb_array_elements(v_meal.value->'foods')
    LOOP
      INSERT INTO diet_template_foods (diet_template_meal_id, food_id, quantity, unit, observation, order_index)
      VALUES (
        v_meal_id,
        (v_food.value->>'food_id')::uuid,
        (v_food.value->>'quantity')::numeric,
        v_food.value->>'unit',
        v_food.value->>'observation',
        (v_food.value->>'order_index')::int
      );
    END LOOP;
  END LOOP;
  
  RETURN v_template_id;
END;
$$;


ALTER FUNCTION "public"."create_diet_template"("p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_tags" "text"[], "p_meals" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_diet_template"("p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_tags" "jsonb", "p_meals" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_template_id uuid;
  v_meal_record jsonb;
  v_meal_id uuid;
  v_food_record jsonb;
BEGIN
  -- 1. Insert Template
  INSERT INTO diet_templates (user_id, name, description, tags)
  VALUES (p_user_id, p_name, p_description, p_tags)
  RETURNING id INTO v_template_id;

  -- 2. Loop through meals
  IF p_meals IS NOT NULL AND jsonb_array_length(p_meals) > 0 THEN
    FOR v_meal_record IN SELECT * FROM jsonb_array_elements(p_meals)
    LOOP
      INSERT INTO diet_template_meals (template_id, name, time, order_index)
      VALUES (
        v_template_id,
        v_meal_record->>'name',
        v_meal_record->>'time',
        (v_meal_record->>'order_index')::integer
      )
      RETURNING id INTO v_meal_id;

      -- 3. Loop through foods for this meal
      IF v_meal_record->'foods' IS NOT NULL AND jsonb_array_length(v_meal_record->'foods') > 0 THEN
        FOR v_food_record IN SELECT * FROM jsonb_array_elements(v_meal_record->'foods')
        LOOP
          INSERT INTO diet_template_foods (meal_id, food_id, quantity, unit, observation, order_index)
          VALUES (
            v_meal_id,
            (v_food_record->>'food_id')::uuid,
            (v_food_record->>'quantity')::numeric,
            v_food_record->>'unit',
            COALESCE(v_food_record->>'observation', ''),
            (v_food_record->>'order_index')::integer
          );
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  RETURN v_template_id;
END;
$$;


ALTER FUNCTION "public"."create_diet_template"("p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_tags" "jsonb", "p_meals" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_type" "text" DEFAULT 'info'::"text", "p_title" "text" DEFAULT NULL::"text", "p_message" "text" DEFAULT NULL::"text", "p_link_url" "text" DEFAULT NULL::"text", "p_content" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.create_notification($1, $2, $3, $4, $5, $6); $_$;


ALTER FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_type" "text", "p_title" "text", "p_message" "text", "p_link_url" "text", "p_content" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_patient"("patient_id" "uuid") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.delete_patient($1); $_$;


ALTER FUNCTION "public"."delete_patient"("patient_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_read_notifications"() RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  DELETE FROM notifications
  WHERE is_read = true AND created_at < now() - interval '3 days';
$$;


ALTER FUNCTION "public"."delete_read_notifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."extract_and_inject_clinical_flags"("p_record_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_record RECORD;
    v_template RECORD;
    v_new_flags JSONB := '{}'::jsonb;
    v_field RECORD;
    v_section RECORD;
    v_answer TEXT;
BEGIN
    -- Buscar o record
    SELECT r.*, t.sections INTO v_record
    FROM public.anamnesis_records r
    LEFT JOIN public.anamnesis_templates t ON t.id = r.template_id
    WHERE r.id = p_record_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Record not found');
    END IF;

    -- Iterar sobre as seções e campos que tenham a tag 'clinical_flag'
    FOR v_section IN SELECT * FROM jsonb_array_elements(COALESCE(v_record.sections, '[]'::jsonb)) AS s
    LOOP
        FOR v_field IN SELECT * FROM jsonb_array_elements(COALESCE(v_section.value->'fields', '[]'::jsonb)) AS f
        LOOP
            -- Verificar se o campo tem flag clínica configurada
            IF v_field.value->>'clinical_flag_key' IS NOT NULL THEN
                v_answer := v_record.content->>(v_field.value->>'id');
                IF v_answer IS NOT NULL AND v_answer != '' AND v_answer != 'false' AND v_answer != 'nao' AND v_answer != 'não' THEN
                    v_new_flags := v_new_flags || jsonb_build_object(
                        v_field.value->>'clinical_flag_key',
                        jsonb_build_object(
                            'value', v_answer,
                            'label', v_field.value->>'label',
                            'captured_at', now()::text,
                            'source', 'anamnesis',
                            'record_id', p_record_id::text
                        )
                    );
                END IF;
            END IF;
        END LOOP;
    END LOOP;

    -- Merge das flags no perfil do paciente
    IF v_new_flags != '{}'::jsonb THEN
        UPDATE public.user_profiles
        SET clinical_flags = COALESCE(clinical_flags, '{}'::jsonb) || v_new_flags
        WHERE id = v_record.patient_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'flags_injected', v_new_flags);
END;
$$;


ALTER FUNCTION "public"."extract_and_inject_clinical_flags"("p_record_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_anamnesis_link"("p_record_id" "uuid", "p_nutritionist_id" "uuid", "p_expires_days" integer DEFAULT 7) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_token UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- Verificar ownership
    IF NOT EXISTS (
        SELECT 1 FROM public.anamnesis_records
        WHERE id = p_record_id AND nutritionist_id = p_nutritionist_id
    ) THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    v_token := gen_random_uuid();
    v_expires_at := now() + (p_expires_days || ' days')::interval;

    UPDATE public.anamnesis_records
    SET
        public_access_token = v_token,
        token_expires_at = v_expires_at,
        status = CASE WHEN status = 'draft' THEN 'awaiting_patient' ELSE status END,
        updated_at = now()
    WHERE id = p_record_id;

    RETURN jsonb_build_object(
        'success', true,
        'token', v_token,
        'expires_at', v_expires_at,
        'status', 'awaiting_patient'
    );
END;
$$;


ALTER FUNCTION "public"."generate_anamnesis_link"("p_record_id" "uuid", "p_nutritionist_id" "uuid", "p_expires_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_random_invite_code"("length" integer DEFAULT 6) RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."generate_random_invite_code"("length" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_unique_invite_code"("col_name" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."generate_unique_invite_code"("col_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_dashboard_stats"() RETURNS json
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$ select private.get_admin_dashboard_stats(); $$;


ALTER FUNCTION "public"."get_admin_dashboard_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_anamnesis_by_token"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_record RECORD;
    v_template RECORD;
    v_nutritionist_name TEXT;
BEGIN
    SELECT * INTO v_record
    FROM public.anamnesis_records
    WHERE public_access_token = p_token;

    -- Token não encontrado
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'error', 'TOKEN_NOT_FOUND',
            'message', 'Questionário não encontrado ou link inválido.'
        );
    END IF;

    -- Token expirado
    IF v_record.token_expires_at IS NOT NULL AND v_record.token_expires_at < now() THEN
        RETURN jsonb_build_object(
            'error', 'TOKEN_EXPIRED',
            'message', 'Este link expirou. Solicite um novo link ao seu nutricionista.'
        );
    END IF;

    -- Já foi respondido (token foi revogado após submissão)
    IF v_record.status IN ('completed', 'validated') THEN
        RETURN jsonb_build_object(
            'error', 'ALREADY_COMPLETED',
            'message', 'Este questionário já foi respondido. Obrigado!'
        );
    END IF;

    -- Busca template (prioriza snapshot imutável se disponível)
    IF v_record.template_snapshot IS NOT NULL THEN
        v_template := NULL; -- usa snapshot abaixo
    ELSE
        SELECT title, description, sections
        INTO v_template
        FROM public.anamnesis_templates
        WHERE id = v_record.template_id;
    END IF;

    SELECT name INTO v_nutritionist_name
    FROM public.user_profiles
    WHERE id = v_record.nutritionist_id;

    RETURN jsonb_build_object(
        'id', v_record.id,
        'date', v_record.date,
        'status', v_record.status,
        'content', v_record.content,
        'attachments', v_record.attachments,
        'lgpd_consented', v_record.lgpd_consented,
        'nutritionist_name', v_nutritionist_name,
        'template', CASE
            WHEN v_record.template_snapshot IS NOT NULL THEN v_record.template_snapshot
            ELSE jsonb_build_object(
                'title', v_template.title,
                'description', v_template.description,
                'sections', v_template.sections
            )
        END
    );
END;
$$;


ALTER FUNCTION "public"."get_anamnesis_by_token"("p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_anthropometry_longitudinal_score"("p_patient_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_anthropometry_longitudinal_score"("p_patient_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_chat_recipient_profile"("recipient_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "avatar_url" "text", "user_type" "text", "is_active" boolean, "nutritionist_id" "uuid", "last_seen_at" timestamp with time zone)
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select * from private.get_chat_recipient_profile($1); $_$;


ALTER FUNCTION "public"."get_chat_recipient_profile"("recipient_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_comprehensive_activity_feed_optimized"("p_nutritionist_id" "uuid", "p_limit" integer DEFAULT 30) RETURNS TABLE("activity_type" "text", "activity_id" "text", "patient_id" "uuid", "patient_name" "text", "activity_date" timestamp with time zone, "activity_data" "jsonb")
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select * from private.get_comprehensive_activity_feed_optimized($1, $2); $_$;


ALTER FUNCTION "public"."get_comprehensive_activity_feed_optimized"("p_nutritionist_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_daily_adherence"("p_nutritionist_id" "uuid") RETURNS numeric
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.get_daily_adherence($1); $_$;


ALTER FUNCTION "public"."get_daily_adherence"("p_nutritionist_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_financial_summary"("start_date" "date", "end_date" "date") RETURNS json
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.get_financial_summary($1, $2); $_$;


ALTER FUNCTION "public"."get_financial_summary"("start_date" "date", "end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_food_stats"("p_nutritionist_id" "uuid") RETURNS json
    LANGUAGE "sql" STABLE
    AS $$
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
$$;


ALTER FUNCTION "public"."get_food_stats"("p_nutritionist_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_formatted_address"("address_jsonb" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
BEGIN
    IF address_jsonb IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN CONCAT_WS(', ',
        address_jsonb->>'street',
        address_jsonb->>'number',
        address_jsonb->>'neighborhood',
        address_jsonb->>'city',
        address_jsonb->>'state',
        address_jsonb->>'zipcode'
    );
END;
$$;


ALTER FUNCTION "public"."get_formatted_address"("address_jsonb" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_grams_from_measure"("p_food_id" bigint, "p_measure_code" "text", "p_quantity" numeric DEFAULT 1) RETURNS numeric
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_grams NUMERIC;
BEGIN
    -- Primeiro, tentar buscar conversão específica do alimento
    SELECT grams_equivalent INTO v_grams
    FROM public.food_measure_conversions
    WHERE food_id = p_food_id AND measure_code = p_measure_code;

    -- Se não encontrou conversão específica, usar conversão padrão da medida
    IF v_grams IS NULL THEN
        SELECT grams_equivalent INTO v_grams
        FROM public.household_measures
        WHERE code = p_measure_code;
    END IF;

    -- Se ainda for NULL (medidas unitárias), retornar NULL
    IF v_grams IS NULL THEN
        RETURN NULL;
    END IF;

    -- Multiplicar pela quantidade
    RETURN v_grams * p_quantity;
END;
$$;


ALTER FUNCTION "public"."get_grams_from_measure"("p_food_id" bigint, "p_measure_code" "text", "p_quantity" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_grams_from_measure"("p_food_id" bigint, "p_measure_code" "text", "p_quantity" numeric) IS 'Converte medida caseira para gramas para um alimento específico';



CREATE OR REPLACE FUNCTION "public"."get_invite_details"("p_invite_code" "text") RETURNS TABLE("patient_name" "text", "nutritionist_name" "text", "nutritionist_gender" "text")
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select * from private.get_invite_details($1); $_$;


ALTER FUNCTION "public"."get_invite_details"("p_invite_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_meal_plan_with_foods_optimized"("p_meal_plan_id" "uuid") RETURNS json
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.get_meal_plan_with_foods_optimized($1); $_$;


ALTER FUNCTION "public"."get_meal_plan_with_foods_optimized"("p_meal_plan_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_nutritionist_conversations"("p_nutritionist_id" "uuid") RETURNS TABLE("recipient_id" "uuid", "recipient_name" "text", "recipient_avatar" "text", "last_message_content" "text", "last_message_at" timestamp with time zone, "unread_count" bigint, "is_active" boolean, "last_seen_at" timestamp with time zone)
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select * from private.get_nutritionist_conversations($1); $_$;


ALTER FUNCTION "public"."get_nutritionist_conversations"("p_nutritionist_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_nutritionist_detail"("p_nutritionist_id" "uuid") RETURNS json
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.get_nutritionist_detail($1); $_$;


ALTER FUNCTION "public"."get_nutritionist_detail"("p_nutritionist_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_nutritionists_list"() RETURNS TABLE("id" "uuid", "name" "text", "email" "text", "created_at" timestamp with time zone, "is_active" boolean, "patients_count" bigint, "last_activity" timestamp with time zone)
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$ select * from private.get_nutritionists_list(); $$;


ALTER FUNCTION "public"."get_nutritionists_list"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_operational_health_summary"("p_nutritionist_id" "uuid" DEFAULT "auth"."uid"(), "p_window_hours" integer DEFAULT 24) RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.get_operational_health_summary($1, $2); $_$;


ALTER FUNCTION "public"."get_operational_health_summary"("p_nutritionist_id" "uuid", "p_window_hours" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_own_profile_attrs"() RETURNS TABLE("is_admin" boolean, "user_type" "text")
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$ select * from private.get_own_profile_attrs(); $$;


ALTER FUNCTION "public"."get_own_profile_attrs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_patients_for_new_chat"("p_nutritionist_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "avatar_url" "text", "is_active" boolean, "last_seen_at" timestamp with time zone)
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select * from private.get_patients_for_new_chat($1); $_$;


ALTER FUNCTION "public"."get_patients_for_new_chat"("p_nutritionist_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_patients_low_adherence_optimized"("p_nutritionist_id" "uuid", "p_days_threshold" integer DEFAULT 7) RETURNS TABLE("patient_id" "uuid", "patient_name" "text", "last_meal_date" timestamp with time zone, "days_since_last_meal" integer)
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select * from private.get_patients_low_adherence_optimized($1, $2); $_$;


ALTER FUNCTION "public"."get_patients_low_adherence_optimized"("p_nutritionist_id" "uuid", "p_days_threshold" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_patients_pending_data_optimized"("p_nutritionist_id" "uuid") RETURNS TABLE("patient_id" "uuid", "patient_name" "text", "has_anamnese" boolean, "has_anthropometry" boolean, "has_meal_plan" boolean, "has_prescription" boolean, "pending_items" "text"[])
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select * from private.get_patients_pending_data_optimized($1); $_$;


ALTER FUNCTION "public"."get_patients_pending_data_optimized"("p_nutritionist_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_recent_patient_activity"("nutritionist_id_param" "uuid", "limit_param" integer) RETURNS TABLE("meal_id" bigint, "patient_name" "text", "meal_type" "text", "total_calories" numeric, "created_at" timestamp with time zone)
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  SELECT 
    m.id as meal_id,
    p.name as patient_name,
    m.meal_type,
    m.total_calories,
    m.created_at
  FROM 
    public.meals m
  JOIN 
    public.user_profiles p ON m.patient_id = p.id
  WHERE 
    p.nutritionist_id = nutritionist_id_param
  ORDER BY 
    m.created_at DESC
  LIMIT 
    limit_param;
$$;


ALTER FUNCTION "public"."get_recent_patient_activity"("nutritionist_id_param" "uuid", "limit_param" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_system_live_logs"("limit_count" integer DEFAULT 50) RETURNS TABLE("id" "text", "type" "text", "message" "text", "user_name" "text", "event_timestamp" timestamp with time zone)
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select * from private.get_system_live_logs($1); $_$;


ALTER FUNCTION "public"."get_system_live_logs"("limit_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tcc_study_metrics"() RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$ select private.get_tcc_study_metrics(); $$;


ALTER FUNCTION "public"."get_tcc_study_metrics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unread_senders"("p_user_id" "uuid") RETURNS TABLE("from_id" "uuid")
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT (n.content->>'from_id')::uuid
    FROM notifications n
    WHERE n.user_id = p_user_id 
      AND n.type = 'new_message' 
      AND n.is_read = false;
END;
$$;


ALTER FUNCTION "public"."get_unread_senders"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_id"() RETURNS "uuid"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$ select private.get_user_id(); $$;


ALTER FUNCTION "public"."get_user_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_checkin_streak"("p_patient_id" "uuid", "p_nutritionist_id" "uuid") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.increment_checkin_streak($1, $2); $_$;


ALTER FUNCTION "public"."increment_checkin_streak"("p_patient_id" "uuid", "p_nutritionist_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."interact_notification"("p_notification_id" "uuid", "p_delete_if_message" boolean DEFAULT true) RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.interact_notification($1, $2); $_$;


ALTER FUNCTION "public"."interact_notification"("p_notification_id" "uuid", "p_delete_if_message" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$ select private.is_admin(); $$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_nutritionist"() RETURNS boolean
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$ select private.is_nutritionist(); $$;


ALTER FUNCTION "public"."is_nutritionist"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_patient"() RETURNS boolean
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$ select private.is_patient(); $$;


ALTER FUNCTION "public"."is_patient"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_activity_event"("p_event_name" "text", "p_event_version" integer DEFAULT 1, "p_source_module" "text" DEFAULT NULL::"text", "p_patient_id" "uuid" DEFAULT NULL::"uuid", "p_nutritionist_id" "uuid" DEFAULT NULL::"uuid", "p_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.log_activity_event($1, $2, $3, $4, $5, $6); $_$;


ALTER FUNCTION "public"."log_activity_event"("p_event_name" "text", "p_event_version" integer, "p_source_module" "text", "p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_bug_report"("p_error_type" character varying DEFAULT 'Error'::character varying, "p_error_message" "text" DEFAULT NULL::"text", "p_stack_trace" "text" DEFAULT NULL::"text", "p_route" "text" DEFAULT NULL::"text", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_user_email" "text" DEFAULT NULL::"text", "p_user_name" "text" DEFAULT NULL::"text", "p_user_type" character varying DEFAULT NULL::character varying, "p_user_agent" "text" DEFAULT NULL::"text", "p_console_log" "jsonb" DEFAULT '[]'::"jsonb", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_component_stack" "text" DEFAULT NULL::"text", "p_source_file" "text" DEFAULT NULL::"text", "p_line_number" integer DEFAULT NULL::integer, "p_column_number" integer DEFAULT NULL::integer) RETURNS "uuid"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.log_bug_report($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15); $_$;


ALTER FUNCTION "public"."log_bug_report"("p_error_type" character varying, "p_error_message" "text", "p_stack_trace" "text", "p_route" "text", "p_user_id" "uuid", "p_user_email" "text", "p_user_name" "text", "p_user_type" character varying, "p_user_agent" "text", "p_console_log" "jsonb", "p_metadata" "jsonb", "p_component_stack" "text", "p_source_file" "text", "p_line_number" integer, "p_column_number" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_meal_action"("p_patient_id" "uuid", "p_meal_id" bigint, "p_action" "text", "p_meal_type" "text" DEFAULT NULL::"text", "p_meal_date" "date" DEFAULT NULL::"date", "p_meal_time" time without time zone DEFAULT NULL::time without time zone, "p_details" "jsonb" DEFAULT NULL::"jsonb") RETURNS bigint
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.log_meal_action($1, $2, $3, $4, $5, $6, $7); $_$;


ALTER FUNCTION "public"."log_meal_action"("p_patient_id" "uuid", "p_meal_id" bigint, "p_action" "text", "p_meal_type" "text", "p_meal_date" "date", "p_meal_time" time without time zone, "p_details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_meal_action_secure"("p_meal_id" "text", "p_action" "text", "p_details" "jsonb") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.log_meal_action_secure($1, $2, $3); $_$;


ALTER FUNCTION "public"."log_meal_action_secure"("p_meal_id" "text", "p_action" "text", "p_details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_meal_edit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO meal_edit_history(meal_id, patient_id, original_data, new_data)
  VALUES(OLD.id, OLD.patient_id, to_jsonb(OLD), to_jsonb(NEW));
  NEW.is_edited = true;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_meal_edit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_operational_event"("p_module" "text", "p_operation" "text", "p_event_type" "text" DEFAULT 'success'::"text", "p_latency_ms" integer DEFAULT 0, "p_nutritionist_id" "uuid" DEFAULT NULL::"uuid", "p_patient_id" "uuid" DEFAULT NULL::"uuid", "p_error_message" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS bigint
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.log_operational_event($1, $2, $3, $4, $5, $6, $7, $8); $_$;


ALTER FUNCTION "public"."log_operational_event"("p_module" "text", "p_operation" "text", "p_event_type" "text", "p_latency_ms" integer, "p_nutritionist_id" "uuid", "p_patient_id" "uuid", "p_error_message" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_chat_notifications_as_read"("p_user_id" "uuid", "p_sender_id" "uuid") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  UPDATE notifications
  SET is_read = true
  WHERE 
    user_id = p_user_id AND
    type = 'new_message' AND
    is_read = false AND
    (content->>'from_id')::uuid = p_sender_id;
$$;


ALTER FUNCTION "public"."mark_chat_notifications_as_read"("p_user_id" "uuid", "p_sender_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_messages_as_read"("p_user_id" "uuid", "p_sender_id" "uuid") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  UPDATE notifications
  SET is_read = true
  WHERE 
    user_id = p_user_id AND
    type = 'new_message' AND
    is_read = false AND
    (content->>'from_id')::uuid = p_sender_id;
$$;


ALTER FUNCTION "public"."mark_messages_as_read"("p_user_id" "uuid", "p_sender_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_nutritionist_anamnesis_completed"("p_record_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_record RECORD;
    v_patient_name TEXT;
    v_template_title TEXT;
BEGIN
    SELECT r.nutritionist_id, r.patient_id, r.template_id
    INTO v_record
    FROM public.anamnesis_records r
    WHERE r.id = p_record_id;

    IF NOT FOUND THEN RETURN; END IF;

    SELECT name INTO v_patient_name FROM public.user_profiles WHERE id = v_record.patient_id;
    SELECT title INTO v_template_title FROM public.anamnesis_templates WHERE id = v_record.template_id;

    INSERT INTO public.notifications (
        user_id, type, title, message, link_url, is_read, content
    ) VALUES (
        v_record.nutritionist_id,
        'anamnesis_completed',
        'Anamnese Respondida',
        COALESCE(v_patient_name, 'Paciente') || ' respondeu ' || COALESCE(v_template_title, 'o questionário') || ' via link externo.',
        '/nutritionist/patients/' || v_record.patient_id::text || '/anamnesis',
        false,
        jsonb_build_object(
            'record_id', p_record_id,
            'patient_id', v_record.patient_id,
            'patient_name', v_patient_name,
            'template_title', v_template_title,
            'submitted_via', 'external_link'
        )
    );
END;
$$;


ALTER FUNCTION "public"."notify_nutritionist_anamnesis_completed"("p_record_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_patient_reminders"("p_patient_id" "uuid" DEFAULT "auth"."uid"()) RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.process_patient_reminders($1); $_$;


ALTER FUNCTION "public"."process_patient_reminders"("p_patient_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."promote_draft_to_active"("p_draft_id" bigint, "p_patient_id" "uuid") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.promote_draft_to_active($1, $2); $_$;


ALTER FUNCTION "public"."promote_draft_to_active"("p_draft_id" bigint, "p_patient_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_invite_code"("input_code" "text") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.redeem_invite_code($1); $_$;


ALTER FUNCTION "public"."redeem_invite_code"("input_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_patient_link"("p_patient_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.reject_patient_link($1); $_$;


ALTER FUNCTION "public"."reject_patient_link"("p_patient_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_foods"("p_search_term" "text", "p_limit" integer DEFAULT 50, "p_source" "text" DEFAULT NULL::"text") RETURNS TABLE("id" bigint, "name" "text", "group" "text", "description" "text", "source" "text", "calories" real, "protein" real, "carbs" real, "fat" real)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id,
        f.name,
        f."group",
        f.description,
        f.source,
        f.calories,
        f.protein,
        f.carbs,
        f.fat
    FROM public.foods f
    WHERE
        f.is_active = true
        AND f.name ILIKE '%' || p_search_term || '%'
        AND (p_source IS NULL OR f.source = p_source)
    ORDER BY
        -- Priorizar matches exatos no início do nome
        CASE WHEN f.name ILIKE p_search_term || '%' THEN 1 ELSE 2 END,
        f.name
    LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."search_foods"("p_search_term" "text", "p_limit" integer, "p_source" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."search_foods"("p_search_term" "text", "p_limit" integer, "p_source" "text") IS 'Busca alimentos por nome com opção de filtrar por fonte';



CREATE OR REPLACE FUNCTION "public"."set_active_meal_plan"("p_plan_id" bigint) RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.set_active_meal_plan($1); $_$;


ALTER FUNCTION "public"."set_active_meal_plan"("p_plan_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_communication_automations_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin new.updated_at = now(); return new; end;
$$;


ALTER FUNCTION "public"."set_communication_automations_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_lab_risk_rules_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin new.updated_at = now(); return new; end;
$$;


ALTER FUNCTION "public"."set_lab_risk_rules_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_message_templates_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin new.updated_at = now(); return new; end;
$$;


ALTER FUNCTION "public"."set_message_templates_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_patient_reminder_preferences_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin new.updated_at = now(); return new; end;
$$;


ALTER FUNCTION "public"."set_patient_reminder_preferences_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at_ncm"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at_ncm"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."slugify_name"("p_name" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."slugify_name"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."soft_delete_meal"("p_meal_id" bigint) RETURNS boolean
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.soft_delete_meal($1); $_$;


ALTER FUNCTION "public"."soft_delete_meal"("p_meal_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_anamnesis_by_token"("p_token" "uuid", "p_content" "jsonb", "p_status" "text", "p_lgpd_consented" boolean DEFAULT NULL::boolean, "p_ip" "text" DEFAULT NULL::"text", "p_clinical_flags" "jsonb" DEFAULT NULL::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_record_id UUID;
    v_patient_id UUID;
    v_result JSONB;
BEGIN
    SELECT id, patient_id INTO v_record_id, v_patient_id FROM public.anamnesis_records WHERE public_access_token = p_token;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Anamnese não encontrada ou token inválido.';
    END IF;

    UPDATE public.anamnesis_records
    SET 
        content = p_content,
        status = p_status,
        lgpd_consented = COALESCE(p_lgpd_consented, lgpd_consented),
        lgpd_consented_at = CASE WHEN p_lgpd_consented = TRUE AND lgpd_consented_at IS NULL THEN now() ELSE lgpd_consented_at END,
        lgpd_ip_address = COALESCE(p_ip, lgpd_ip_address),
        updated_at = now()
    WHERE id = v_record_id
    RETURNING jsonb_build_object('success', true, 'status', status) INTO v_result;

    -- Se concluído e houver flags clínicas, atualiza o perfil do paciente
    IF p_status = 'completed' AND p_clinical_flags IS NOT NULL AND jsonb_typeof(p_clinical_flags) = 'object' THEN
        UPDATE public.user_profiles
        SET clinical_flags = COALESCE(clinical_flags, '{}'::jsonb) || p_clinical_flags,
            updated_at = now()
        WHERE id = v_patient_id;
    END IF;

    RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."submit_anamnesis_by_token"("p_token" "uuid", "p_content" "jsonb", "p_status" "text", "p_lgpd_consented" boolean, "p_ip" "text", "p_clinical_flags" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_anthropometry_on_profile_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Só processa se for paciente e tiver peso E altura
    IF NEW.user_type = 'patient' AND NEW.weight IS NOT NULL AND NEW.height IS NOT NULL THEN

        -- Caso INSERT: Criar primeiro registro automaticamente
        IF (TG_OP = 'INSERT') THEN
            INSERT INTO public.growth_records (
                patient_id,
                weight,
                height,
                record_date
            ) VALUES (
                NEW.id,
                NEW.weight,
                NEW.height,
                CURRENT_DATE
            )
            ON CONFLICT DO NOTHING; -- Evita duplicatas se já existir

        -- Caso UPDATE: Só cria se não existir nenhum registro ainda
        ELSIF (TG_OP = 'UPDATE') THEN
            -- Verificar se mudou peso ou altura e ainda não tem registro
            IF (OLD.weight IS DISTINCT FROM NEW.weight OR OLD.height IS DISTINCT FROM NEW.height) THEN
                -- Só insere se não existir nenhum registro para este paciente
                INSERT INTO public.growth_records (
                    patient_id,
                    weight,
                    height,
                    record_date
                )
                SELECT
                    NEW.id,
                    NEW.weight,
                    NEW.height,
                    CURRENT_DATE
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.growth_records
                    WHERE patient_id = NEW.id
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_anthropometry_on_profile_change"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_anthropometry_on_profile_change"() IS 'Cria automaticamente registro antropométrico quando paciente é cadastrado com peso e altura, ou quando esses dados são atualizados pela primeira vez.';



CREATE OR REPLACE FUNCTION "public"."transition_appointment_status"("p_appointment_id" bigint, "p_next_status" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.transition_appointment_status($1, $2, $3); $_$;


ALTER FUNCTION "public"."transition_appointment_status"("p_appointment_id" bigint, "p_next_status" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transition_appointment_status"("p_appointment_id" "uuid", "p_next_status" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.transition_appointment_status($1, $2, $3); $_$;


ALTER FUNCTION "public"."transition_appointment_status"("p_appointment_id" "uuid", "p_next_status" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_growth_records_apply_versioning"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."trg_growth_records_apply_versioning"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_growth_records_mark_previous_not_latest"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."trg_growth_records_mark_previous_not_latest"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_growth_records_sync_modules"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."trg_growth_records_sync_modules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_growth_records_validate_clinical"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."trg_growth_records_validate_clinical"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_set_invite_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.user_type = 'nutritionist' AND NEW.invite_code IS NULL THEN
    NEW.invite_code := generate_random_invite_code(6);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_set_invite_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_bug_reports_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
    new.updated_at = now();
    return new;
end;
$$;


ALTER FUNCTION "public"."update_bug_reports_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_diet_template"("p_template_id" "uuid", "p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_tags" "text"[], "p_meals" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_meal record;
  v_meal_id uuid;
  v_food record;
BEGIN
  -- Verificar propriedade e atualizar o diet_template
  UPDATE diet_templates 
  SET name = p_name, description = p_description, tags = p_tags, updated_at = NOW()
  WHERE id = p_template_id AND nutritionist_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template não encontrado ou sem permissão.';
  END IF;

  -- Deletar as antigas refeições (que via CASCADE deletam os foods)
  DELETE FROM diet_template_meals WHERE diet_template_id = p_template_id;
  
  -- Inserir as novas refeições
  FOR v_meal IN SELECT * FROM jsonb_array_elements(p_meals)
  LOOP
    INSERT INTO diet_template_meals (diet_template_id, name, meal_time, order_index)
    VALUES (p_template_id, v_meal.value->>'name', v_meal.value->>'time', (v_meal.value->>'order_index')::int)
    RETURNING id INTO v_meal_id;
    
    FOR v_food IN SELECT * FROM jsonb_array_elements(v_meal.value->'foods')
    LOOP
      INSERT INTO diet_template_foods (diet_template_meal_id, food_id, quantity, unit, observation, order_index)
      VALUES (
        v_meal_id,
        (v_food.value->>'food_id')::uuid,
        (v_food.value->>'quantity')::numeric,
        v_food.value->>'unit',
        v_food.value->>'observation',
        (v_food.value->>'order_index')::int
      );
    END LOOP;
  END LOOP;
  
END;
$$;


ALTER FUNCTION "public"."update_diet_template"("p_template_id" "uuid", "p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_tags" "text"[], "p_meals" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_diet_template"("p_template_id" "uuid", "p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_tags" "jsonb", "p_meals" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_meal_record jsonb;
  v_meal_id uuid;
  v_food_record jsonb;
BEGIN
  -- 1. Update Template
  UPDATE diet_templates
  SET name = p_name,
      description = p_description,
      tags = p_tags,
      updated_at = NOW()
  WHERE id = p_template_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found or unauthorized';
  END IF;

  -- 2. Delete existing meals (will cascade to foods)
  DELETE FROM diet_template_meals WHERE template_id = p_template_id;

  -- 3. Loop through meals and insert
  IF p_meals IS NOT NULL AND jsonb_array_length(p_meals) > 0 THEN
    FOR v_meal_record IN SELECT * FROM jsonb_array_elements(p_meals)
    LOOP
      INSERT INTO diet_template_meals (template_id, name, time, order_index)
      VALUES (
        p_template_id,
        v_meal_record->>'name',
        v_meal_record->>'time',
        (v_meal_record->>'order_index')::integer
      )
      RETURNING id INTO v_meal_id;

      -- 4. Loop through foods for this meal
      IF v_meal_record->'foods' IS NOT NULL AND jsonb_array_length(v_meal_record->'foods') > 0 THEN
        FOR v_food_record IN SELECT * FROM jsonb_array_elements(v_meal_record->'foods')
        LOOP
          INSERT INTO diet_template_foods (meal_id, food_id, quantity, unit, observation, order_index)
          VALUES (
            v_meal_id,
            (v_food_record->>'food_id')::uuid,
            (v_food_record->>'quantity')::numeric,
            v_food_record->>'unit',
            COALESCE(v_food_record->>'observation', ''),
            (v_food_record->>'order_index')::integer
          );
        END LOOP;
      END IF;
    END LOOP;
  END IF;

END;
$$;


ALTER FUNCTION "public"."update_diet_template"("p_template_id" "uuid", "p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_tags" "jsonb", "p_meals" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_energy_calc_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_energy_calc_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_foods_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_foods_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_lab_results_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_lab_results_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_meal_plan_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_meal_plan_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_modified_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
        BEGIN
            NEW.updated_at = timezone('utc'::text, now());
            RETURN NEW;
        END;
        $$;


ALTER FUNCTION "public"."update_modified_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_patient_goals_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$

BEGIN

    NEW.updated_at = NOW();

    RETURN NEW;

END;

$$;


ALTER FUNCTION "public"."update_patient_goals_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_reference_values_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_reference_values_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_full_meal_plan"("p_plan_id" bigint, "p_plan_data" "jsonb", "p_meals" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $_$ select private.upsert_full_meal_plan($1, $2, $3); $_$;


ALTER FUNCTION "public"."upsert_full_meal_plan"("p_plan_id" bigint, "p_plan_data" "jsonb", "p_meals" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_profiles_sync_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."user_profiles_sync_slug"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."achievements" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "icon_name" "text" NOT NULL,
    "criteria" "jsonb" NOT NULL
);


ALTER TABLE "public"."achievements" OWNER TO "postgres";


ALTER TABLE "public"."achievements" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."achievements_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_name" "text" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb",
    "patient_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "event_version" integer DEFAULT 1,
    "source_module" "text",
    "nutritionist_id" "uuid",
    "actor_user_id" "uuid"
);


ALTER TABLE "public"."activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."anamnesis_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "nutritionist_id" "uuid" NOT NULL,
    "version" integer DEFAULT 1,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "content" "jsonb" NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'draft'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "template_snapshot" "jsonb",
    "public_access_token" "uuid",
    "token_expires_at" timestamp with time zone,
    "lgpd_consented" boolean DEFAULT false,
    "lgpd_consented_at" timestamp with time zone,
    "lgpd_ip_address" "text",
    "history_log" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "attachments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "filled_by" "text" DEFAULT 'nutritionist'::"text",
    "appointment_id" bigint,
    CONSTRAINT "anamnesis_records_filled_by_check" CHECK (("filled_by" = ANY (ARRAY['nutritionist'::"text", 'patient'::"text"]))),
    CONSTRAINT "anamnesis_records_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending_patient'::"text", 'in_progress'::"text", 'submitted'::"text", 'validated'::"text"])))
);


ALTER TABLE "public"."anamnesis_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."anamnesis_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "sections" "jsonb" NOT NULL,
    "is_system_default" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "version" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."anamnesis_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" bigint NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "patient_id" "uuid",
    "appointment_time" timestamp with time zone NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "reminder_sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "duration" integer DEFAULT 60,
    "appointment_type" "text" DEFAULT 'first_appointment'::"text",
    "start_time" timestamp with time zone NOT NULL,
    "unregistered_patient_name" "text",
    CONSTRAINT "appointments_appointment_type_check" CHECK (("appointment_type" = ANY (ARRAY['first_appointment'::"text", 'return'::"text", 'evaluation'::"text", 'online'::"text", 'in_person'::"text"]))),
    CONSTRAINT "appointments_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'confirmed'::"text", 'awaiting_confirmation'::"text", 'completed'::"text", 'cancelled'::"text", 'no_show'::"text"])))
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."appointments"."status" IS 'Status do agendamento: agendada, confirmada, aguardando confirmação, realizada, cancelada ou faltou';



COMMENT ON COLUMN "public"."appointments"."duration" IS 'Duração da consulta em minutos';



COMMENT ON COLUMN "public"."appointments"."appointment_type" IS 'Tipo de consulta: primeira consulta, retorno, avaliação, online ou presencial';



ALTER TABLE "public"."appointments" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."appointments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."archived_patient_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "patient_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "archived_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."archived_patient_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bug_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "error_type" character varying(100) DEFAULT 'Error'::character varying,
    "error_message" "text",
    "stack_trace" "text",
    "route" "text",
    "source_file" "text",
    "line_number" integer,
    "column_number" integer,
    "user_id" "uuid",
    "user_email" "text",
    "user_name" "text",
    "user_type" character varying(50),
    "user_agent" "text",
    "bug_type" character varying(50) DEFAULT 'frontend'::character varying,
    "severity" character varying(20) DEFAULT 'error'::character varying,
    "console_log" "jsonb" DEFAULT '[]'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "component_stack" "text",
    "is_resolved" boolean DEFAULT false,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bug_reports" OWNER TO "postgres";


COMMENT ON TABLE "public"."bug_reports" IS 'Tabela para armazenar relatórios de bugs e erros do sistema';



COMMENT ON COLUMN "public"."bug_reports"."error_type" IS 'Tipo do erro JavaScript (Error, TypeError, etc)';



COMMENT ON COLUMN "public"."bug_reports"."error_message" IS 'Mensagem do erro';



COMMENT ON COLUMN "public"."bug_reports"."stack_trace" IS 'Stack trace completo do erro';



COMMENT ON COLUMN "public"."bug_reports"."route" IS 'Rota/URL onde o erro ocorreu';



COMMENT ON COLUMN "public"."bug_reports"."bug_type" IS 'Tipo: frontend, backend, api';



COMMENT ON COLUMN "public"."bug_reports"."severity" IS 'Severidade: critical, error, warning, info';



COMMENT ON COLUMN "public"."bug_reports"."console_log" IS 'Buffer de logs do console JavaScript';



COMMENT ON COLUMN "public"."bug_reports"."metadata" IS 'Metadados adicionais do erro';



COMMENT ON COLUMN "public"."bug_reports"."is_resolved" IS 'Se o bug foi marcado como resolvido';



CREATE TABLE IF NOT EXISTS "public"."chats" (
    "id" bigint NOT NULL,
    "from_id" "uuid" NOT NULL,
    "to_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "message_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "media_url" "text"
);

ALTER TABLE ONLY "public"."chats" REPLICA IDENTITY FULL;


ALTER TABLE "public"."chats" OWNER TO "postgres";


ALTER TABLE "public"."chats" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."chats_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."checkin_fields" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "field_type" "text" NOT NULL,
    "options" "jsonb" DEFAULT '[]'::"jsonb",
    "score_weight" numeric DEFAULT 1.0,
    "unit" "text",
    "is_required" boolean DEFAULT true,
    "order_index" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "checkin_fields_field_type_check" CHECK (("field_type" = ANY (ARRAY['scale_1_10'::"text", 'yes_no'::"text", 'number'::"text", 'text'::"text", 'multiple_choice'::"text", 'photo'::"text"])))
);


ALTER TABLE "public"."checkin_fields" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checkin_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true,
    "next_send_at" timestamp with time zone,
    "last_sent_at" timestamp with time zone,
    "channel" "text" DEFAULT 'in_app'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "checkin_schedules_channel_check" CHECK (("channel" = ANY (ARRAY['in_app'::"text", 'whatsapp'::"text", 'email'::"text"])))
);


ALTER TABLE "public"."checkin_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checkin_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "schedule_id" "uuid",
    "patient_id" "uuid" NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "token" "text" DEFAULT "substring"("replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text"), 1, 32) NOT NULL,
    "responses" "jsonb" DEFAULT '{}'::"jsonb",
    "score_total" numeric DEFAULT 0,
    "score_max" numeric DEFAULT 0,
    "adherence_percentage" numeric DEFAULT 0,
    "status" "text" DEFAULT 'pending'::"text",
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '48:00:00'::interval),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "checkin_sessions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."checkin_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checkin_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "frequency" "text" DEFAULT 'weekly'::"text" NOT NULL,
    "send_time" time without time zone DEFAULT '09:00:00'::time without time zone,
    "send_days" integer[] DEFAULT '{1}'::integer[],
    "is_active" boolean DEFAULT true,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "channel" "text" DEFAULT 'in_app'::"text",
    CONSTRAINT "checkin_templates_frequency_check" CHECK (("frequency" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'biweekly'::"text", 'monthly'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."checkin_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."communication_automations" (
    "id" bigint NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "automation_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "trigger_event" "text" NOT NULL,
    "channel" "text" DEFAULT 'in_app'::"text" NOT NULL,
    "template_title" "text",
    "template_body" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "cooldown_hours" integer DEFAULT 24 NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "communication_automations_channel_check" CHECK (("channel" = 'in_app'::"text")),
    CONSTRAINT "communication_automations_cooldown_hours_check" CHECK ((("cooldown_hours" >= 0) AND ("cooldown_hours" <= 720)))
);


ALTER TABLE "public"."communication_automations" OWNER TO "postgres";


ALTER TABLE "public"."communication_automations" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."communication_automations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."diet_template_food_substitutions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_food_id" "uuid",
    "substitute_food_id" "uuid",
    "quantity" numeric,
    "unit" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."diet_template_food_substitutions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."diet_template_foods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "meal_id" "uuid",
    "food_id" "uuid",
    "quantity" numeric NOT NULL,
    "unit" "text",
    "observation" "text",
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."diet_template_foods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."diet_template_meals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid",
    "name" "text" NOT NULL,
    "time" time without time zone,
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."diet_template_meals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."diet_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "tags" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."diet_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."energy_expenditure_calculations" (
    "id" bigint NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "weight" numeric(5,2) NOT NULL,
    "height" numeric(5,2) NOT NULL,
    "age" integer NOT NULL,
    "gender" "text" NOT NULL,
    "protocol" "text",
    "activity_level" numeric(3,2),
    "tmb" numeric(7,2),
    "get" numeric(7,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "get_with_activities" numeric(7,2),
    "activities" "jsonb" DEFAULT '[]'::"jsonb",
    "target_weight" numeric(5,2),
    "venta_adjusted" numeric(7,2),
    "body_fat_percentage" numeric,
    "tmb_protocol" "text",
    "tmb_result" numeric,
    "injury_factor" numeric DEFAULT 1.0,
    "mets_activities" "jsonb" DEFAULT '[]'::"jsonb",
    "get_result" numeric,
    "venta_target_weight" numeric,
    "venta_timeframe_days" integer,
    "venta_adjustment_kcal" numeric,
    "final_planned_kcal" numeric,
    "activity_factor" numeric DEFAULT 1.55,
    "nutritionist_id" "uuid",
    CONSTRAINT "valid_activity_level" CHECK ((("activity_level" >= 1.0) AND ("activity_level" <= 3.0))),
    CONSTRAINT "valid_age" CHECK ((("age" >= 0) AND ("age" <= 120))),
    CONSTRAINT "valid_gender" CHECK ((("gender" IS NULL) OR ("gender" = ANY (ARRAY['M'::"text", 'F'::"text", 'Masculino'::"text", 'Feminino'::"text", 'male'::"text", 'female'::"text", 'masculino'::"text", 'feminino'::"text"])))),
    CONSTRAINT "valid_get_with_activities" CHECK ((("get_with_activities" IS NULL) OR ("get_with_activities" > (0)::numeric))),
    CONSTRAINT "valid_height" CHECK ((("height" >= (50)::numeric) AND ("height" <= (255)::numeric))),
    CONSTRAINT "valid_protocol" CHECK ((("protocol" IS NULL) OR ("protocol" = ANY (ARRAY['harris-benedict'::"text", 'mifflin-st-jeor'::"text", 'fao-who'::"text", 'fao-oms-2001'::"text", 'schofield'::"text", 'owen'::"text", 'cunningham'::"text", 'tinsley'::"text", 'katch-mcardle'::"text", 'de-lorenzo'::"text", 'mifflin'::"text", 'harris'::"text", 'fao'::"text", 'fao_1985'::"text", 'fao_2001'::"text", 'eer_iom'::"text"])))),
    CONSTRAINT "valid_target_weight" CHECK ((("target_weight" IS NULL) OR (("target_weight" >= (1)::numeric) AND ("target_weight" <= (300)::numeric)))),
    CONSTRAINT "valid_venta_adjusted" CHECK ((("venta_adjusted" IS NULL) OR ("venta_adjusted" > (0)::numeric))),
    CONSTRAINT "valid_weight" CHECK ((("weight" >= (1)::numeric) AND ("weight" <= (300)::numeric)))
);


ALTER TABLE "public"."energy_expenditure_calculations" OWNER TO "postgres";


COMMENT ON TABLE "public"."energy_expenditure_calculations" IS 'Armazena cálculos de gasto energético (TMB/GET) dos pacientes. FASE 2: suporte para atividades físicas específicas (MET-based) e cálculo VENTA para objetivos de peso.';



COMMENT ON COLUMN "public"."energy_expenditure_calculations"."protocol" IS 'Protocolo científico usado: harris-benedict, schofield, fao-oms-2001';



COMMENT ON COLUMN "public"."energy_expenditure_calculations"."activity_level" IS 'Nível de Atividade Física (NAF): 1.2 sedentário, 1.55 moderado, etc';



COMMENT ON COLUMN "public"."energy_expenditure_calculations"."tmb" IS 'Taxa Metabólica Basal - energia em repouso (kcal/dia)';



COMMENT ON COLUMN "public"."energy_expenditure_calculations"."get" IS 'Gasto Energético Total - TMB x NAF (kcal/dia)';



COMMENT ON COLUMN "public"."energy_expenditure_calculations"."get_with_activities" IS 'GET total incluindo atividades físicas específicas (kcal/dia)';



COMMENT ON COLUMN "public"."energy_expenditure_calculations"."activities" IS 'Array JSON de atividades físicas praticadas pelo paciente';



COMMENT ON COLUMN "public"."energy_expenditure_calculations"."target_weight" IS 'Peso objetivo para cálculo VENTA (kg)';



COMMENT ON COLUMN "public"."energy_expenditure_calculations"."venta_adjusted" IS 'Valor energético ajustado para atingir peso objetivo (kcal/dia)';



COMMENT ON COLUMN "public"."energy_expenditure_calculations"."tmb_protocol" IS 'Protocolo TMB: mifflin, harris, cunningham, fao, tinsley';



COMMENT ON COLUMN "public"."energy_expenditure_calculations"."mets_activities" IS 'Array de atividades extras [{name, met, duration_min, kcal}]';



COMMENT ON COLUMN "public"."energy_expenditure_calculations"."final_planned_kcal" IS 'Meta calórica final (GET + ajuste VENTA)';



CREATE SEQUENCE IF NOT EXISTS "public"."energy_expenditure_calculations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."energy_expenditure_calculations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."energy_expenditure_calculations_id_seq" OWNED BY "public"."energy_expenditure_calculations"."id";



CREATE TABLE IF NOT EXISTS "public"."external_api_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "api_name" "text" NOT NULL,
    "request_key" "text" NOT NULL,
    "response_data" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."external_api_cache" OWNER TO "postgres";


COMMENT ON TABLE "public"."external_api_cache" IS 'Cache para resultados de APIs externas (OpenFoodFacts, etc) para evitar rate limits e melhorar performance.';



CREATE TABLE IF NOT EXISTS "public"."feed_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "patient_id" "uuid",
    "source_type" "text" NOT NULL,
    "source_id" "text",
    "title" "text" NOT NULL,
    "description" "text",
    "priority_score" integer DEFAULT 0 NOT NULL,
    "priority_reason" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "snooze_until" timestamp with time zone,
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "feed_tasks_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'snoozed'::"text", 'resolved'::"text"])))
);


ALTER TABLE "public"."feed_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "patient_id" "uuid",
    "type" "text" NOT NULL,
    "category" "text" NOT NULL,
    "description" "text",
    "amount" numeric NOT NULL,
    "status" "text" DEFAULT 'paid'::"text",
    "date" "date" DEFAULT CURRENT_DATE,
    "due_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "service_id" "uuid",
    "appointment_id" "uuid",
    "installment_number" integer,
    "total_installments" integer,
    "is_recurring" boolean DEFAULT false,
    "payment_method" "text",
    "fee_percentage" numeric DEFAULT 0,
    "net_amount" numeric,
    "attachment_url" "text",
    CONSTRAINT "financial_records_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['pix'::"text", 'credit'::"text", 'debit'::"text", 'cash'::"text", 'transfer'::"text", 'boleto'::"text"]))),
    CONSTRAINT "financial_records_status_check" CHECK (("status" = ANY (ARRAY['paid'::"text", 'pending'::"text", 'overdue'::"text"]))),
    CONSTRAINT "financial_records_type_check" CHECK (("type" = ANY (ARRAY['income'::"text", 'expense'::"text"])))
);


ALTER TABLE "public"."financial_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_transactions" (
    "id" bigint NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "patient_id" "uuid",
    "type" "text" NOT NULL,
    "description" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "transaction_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "category" "text",
    "income_source" "text",
    "status" "text" DEFAULT 'paid'::"text",
    "due_date" "date",
    CONSTRAINT "financial_transactions_status_check" CHECK (("status" = ANY (ARRAY['paid'::"text", 'pending'::"text", 'overdue'::"text"])))
);


ALTER TABLE "public"."financial_transactions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."financial_transactions"."status" IS 'Status do pagamento: paid (pago), pending (pendente), overdue (vencido)';



COMMENT ON COLUMN "public"."financial_transactions"."due_date" IS 'Data de vencimento para transações pendentes';



ALTER TABLE "public"."financial_transactions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."financial_transactions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."food_household_measures" (
    "id" bigint NOT NULL,
    "measure_id" bigint,
    "quantity" numeric(10,2),
    "grams" numeric(10,2),
    "food_id" "uuid"
);


ALTER TABLE "public"."food_household_measures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."food_measures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reference_food_id" "uuid",
    "nutritionist_food_id" "uuid",
    "label" "text" NOT NULL,
    "weight_in_grams" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "food_measures_one_food" CHECK (((("reference_food_id" IS NOT NULL) AND ("nutritionist_food_id" IS NULL)) OR (("reference_food_id" IS NULL) AND ("nutritionist_food_id" IS NOT NULL))))
);


ALTER TABLE "public"."food_measures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nutritionist_foods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "brand" "text",
    "barcode" "text",
    "base_qty" numeric DEFAULT 100,
    "base_unit" "text" DEFAULT 'g'::"text",
    "energy_kcal" numeric DEFAULT 0,
    "protein_g" numeric DEFAULT 0,
    "carbohydrate_g" numeric DEFAULT 0,
    "lipid_g" numeric DEFAULT 0,
    "fiber_g" numeric DEFAULT 0,
    "calcium_mg" numeric,
    "iron_mg" numeric,
    "sodium_mg" numeric,
    "potassium_mg" numeric,
    "vitamin_c_mg" numeric,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "saturated_fat_g" numeric DEFAULT 0,
    "monounsaturated_fat_g" numeric DEFAULT 0,
    "polyunsaturated_fat_g" numeric DEFAULT 0,
    "trans_fat_g" numeric DEFAULT 0,
    "cholesterol_mg" numeric DEFAULT 0,
    "sugar_g" numeric DEFAULT 0,
    "magnesium_mg" numeric DEFAULT 0,
    "phosphorus_mg" numeric DEFAULT 0,
    "zinc_mg" numeric DEFAULT 0,
    "vitamin_a_mcg" numeric DEFAULT 0,
    "vitamin_d_mcg" numeric DEFAULT 0,
    "vitamin_e_mg" numeric DEFAULT 0,
    "vitamin_b12_mcg" numeric DEFAULT 0,
    "folate_mcg" numeric DEFAULT 0
);


ALTER TABLE "public"."nutritionist_foods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reference_foods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "source" "public"."food_source" NOT NULL,
    "source_id" "text" NOT NULL,
    "group" "text",
    "portion_size" numeric DEFAULT 100,
    "base_unit" "text" DEFAULT 'g'::"text",
    "calories" numeric DEFAULT 0,
    "protein" numeric DEFAULT 0,
    "carbs" numeric DEFAULT 0,
    "fat" numeric DEFAULT 0,
    "fiber" numeric DEFAULT 0,
    "calcium" numeric,
    "iron" numeric,
    "sodium" numeric,
    "potassium" numeric,
    "vitamin_c" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "saturated_fat" numeric DEFAULT 0,
    "monounsaturated_fat" numeric DEFAULT 0,
    "polyunsaturated_fat" numeric DEFAULT 0,
    "trans_fat" numeric DEFAULT 0,
    "cholesterol" numeric DEFAULT 0,
    "sugar" numeric DEFAULT 0,
    "magnesium" numeric DEFAULT 0,
    "phosphorus" numeric DEFAULT 0,
    "zinc" numeric DEFAULT 0,
    "vitamin_a" numeric DEFAULT 0,
    "vitamin_d" numeric DEFAULT 0,
    "vitamin_e" numeric DEFAULT 0,
    "vitamin_b12" numeric DEFAULT 0,
    "folate" numeric DEFAULT 0,
    "nutritionist_id" "text",
    "description" "text",
    "preparation" "text",
    "is_active" boolean DEFAULT true,
    "group_norm" "text"
);


ALTER TABLE "public"."reference_foods" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."foods" WITH ("security_invoker"='true') AS
 SELECT "rf"."id",
    "rf"."name",
    ("rf"."source")::"text" AS "source",
    "rf"."source_id",
    "rf"."group",
    "rf"."group_norm",
    "rf"."description",
    "rf"."preparation",
    "rf"."portion_size",
    "rf"."base_unit",
    "rf"."calories",
    "rf"."protein",
    "rf"."carbs",
    "rf"."fat",
    "rf"."fiber",
    "rf"."sodium",
    "rf"."saturated_fat",
    "rf"."trans_fat",
    "rf"."cholesterol",
    "rf"."sugar",
    "rf"."calcium",
    "rf"."iron",
    "rf"."magnesium",
    "rf"."phosphorus",
    "rf"."potassium",
    "rf"."zinc",
    "rf"."vitamin_a",
    "rf"."vitamin_c",
    "rf"."vitamin_d",
    "rf"."vitamin_e",
    "rf"."vitamin_b12",
    "rf"."folate",
    COALESCE("rf"."is_active", true) AS "is_active",
    "rf"."created_at",
    NULL::"uuid" AS "nutritionist_id"
   FROM "public"."reference_foods" "rf"
UNION ALL
 SELECT "nf"."id",
    "nf"."name",
    'custom'::"text" AS "source",
    "nf"."barcode" AS "source_id",
    NULL::"text" AS "group",
    NULL::"text" AS "group_norm",
    "nf"."brand" AS "description",
    NULL::"text" AS "preparation",
    "nf"."base_qty" AS "portion_size",
    "nf"."base_unit",
    "nf"."energy_kcal" AS "calories",
    "nf"."protein_g" AS "protein",
    "nf"."carbohydrate_g" AS "carbs",
    "nf"."lipid_g" AS "fat",
    "nf"."fiber_g" AS "fiber",
    "nf"."sodium_mg" AS "sodium",
    "nf"."saturated_fat_g" AS "saturated_fat",
    "nf"."trans_fat_g" AS "trans_fat",
    "nf"."cholesterol_mg" AS "cholesterol",
    "nf"."sugar_g" AS "sugar",
    "nf"."calcium_mg" AS "calcium",
    "nf"."iron_mg" AS "iron",
    "nf"."magnesium_mg" AS "magnesium",
    "nf"."phosphorus_mg" AS "phosphorus",
    "nf"."potassium_mg" AS "potassium",
    "nf"."zinc_mg" AS "zinc",
    "nf"."vitamin_a_mcg" AS "vitamin_a",
    "nf"."vitamin_c_mg" AS "vitamin_c",
    "nf"."vitamin_d_mcg" AS "vitamin_d",
    "nf"."vitamin_e_mg" AS "vitamin_e",
    "nf"."vitamin_b12_mcg" AS "vitamin_b12",
    "nf"."folate_mcg" AS "folate",
    COALESCE("nf"."is_active", true) AS "is_active",
    "nf"."created_at",
    "nf"."nutritionist_id"
   FROM "public"."nutritionist_foods" "nf";


ALTER VIEW "public"."foods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."glycemia_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "nutritionist_id" "uuid",
    "date" timestamp with time zone DEFAULT "now"(),
    "value" numeric NOT NULL,
    "condition" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "glycemia_records_condition_check" CHECK (("condition" = ANY (ARRAY['fasting'::"text", 'pre_prandial'::"text", 'post_prandial'::"text", 'random'::"text"])))
);


ALTER TABLE "public"."glycemia_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."growth_records" (
    "id" bigint NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "record_date" "date" NOT NULL,
    "weight" numeric,
    "height" numeric,
    "head_circumference" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text",
    "circumferences" "jsonb" DEFAULT '{}'::"jsonb",
    "skinfolds" "jsonb" DEFAULT '{}'::"jsonb",
    "bone_diameters" "jsonb" DEFAULT '{}'::"jsonb",
    "bioimpedance" "jsonb" DEFAULT '{}'::"jsonb",
    "photos" "text"[] DEFAULT ARRAY[]::"text"[],
    "supersedes_record_id" bigint,
    "revision_group_id" bigint,
    "revision_number" integer DEFAULT 1 NOT NULL,
    "is_latest_revision" boolean DEFAULT true NOT NULL,
    "change_reason" "text",
    "created_by_user_id" "uuid",
    "results" "jsonb" DEFAULT '{}'::"jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "peso_usual" numeric,
    CONSTRAINT "growth_records_height_positive_chk" CHECK ((("height" IS NULL) OR ("height" > (0)::numeric))),
    CONSTRAINT "growth_records_weight_positive_chk" CHECK ((("weight" IS NULL) OR ("weight" > (0)::numeric)))
);


ALTER TABLE "public"."growth_records" OWNER TO "postgres";


COMMENT ON COLUMN "public"."growth_records"."notes" IS 'Observações sobre o registro antropométrico (mudanças de dieta, exercícios, etc)';



ALTER TABLE "public"."growth_records" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."growth_records_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."household_measures" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "ml_equivalent" numeric(10,2),
    "grams_equivalent" numeric(10,2),
    "description" "text",
    "category" "text",
    "is_active" boolean DEFAULT true,
    "order_index" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."household_measures" OWNER TO "postgres";


COMMENT ON TABLE "public"."household_measures" IS 'Medidas caseiras brasileiras padrão (colheres, xícaras, copos, etc)';



CREATE SEQUENCE IF NOT EXISTS "public"."household_measures_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."household_measures_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."household_measures_id_seq" OWNED BY "public"."household_measures"."id";



CREATE TABLE IF NOT EXISTS "public"."lab_results" (
    "id" bigint NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "test_name" "text" NOT NULL,
    "test_value" "text",
    "test_unit" "text",
    "reference_min" numeric,
    "reference_max" numeric,
    "status" "text",
    "test_date" "date" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "pdf_url" "text",
    "pdf_filename" "text",
    CONSTRAINT "check_has_data" CHECK ((("test_value" IS NOT NULL) OR ("pdf_url" IS NOT NULL))),
    CONSTRAINT "lab_results_status_check" CHECK (("status" = ANY (ARRAY['normal'::"text", 'low'::"text", 'high'::"text", 'pending'::"text"]))),
    CONSTRAINT "valid_test_date" CHECK (("test_date" <= CURRENT_DATE)),
    CONSTRAINT "valid_test_name" CHECK (("char_length"("test_name") >= 2))
);


ALTER TABLE "public"."lab_results" OWNER TO "postgres";


COMMENT ON TABLE "public"."lab_results" IS 'Armazena resultados de exames laboratoriais dos pacientes';



COMMENT ON COLUMN "public"."lab_results"."test_name" IS 'Nome do exame (ex: Glicemia, Colesterol Total)';



COMMENT ON COLUMN "public"."lab_results"."test_value" IS 'Valor do resultado (pode ser numérico ou texto)';



COMMENT ON COLUMN "public"."lab_results"."test_unit" IS 'Unidade de medida (ex: mg/dL, mmol/L)';



COMMENT ON COLUMN "public"."lab_results"."reference_min" IS 'Valor mínimo de referência';



COMMENT ON COLUMN "public"."lab_results"."reference_max" IS 'Valor máximo de referência';



COMMENT ON COLUMN "public"."lab_results"."status" IS 'Status: normal, low (baixo), high (alto), pending (pendente)';



COMMENT ON COLUMN "public"."lab_results"."pdf_url" IS 'URL do PDF anexado no Supabase Storage (se entry_mode = pdf)';



COMMENT ON COLUMN "public"."lab_results"."pdf_filename" IS 'Nome original do arquivo PDF';



CREATE SEQUENCE IF NOT EXISTS "public"."lab_results_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."lab_results_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."lab_results_id_seq" OWNED BY "public"."lab_results"."id";



CREATE TABLE IF NOT EXISTS "public"."lab_risk_rules" (
    "id" bigint NOT NULL,
    "nutritionist_id" "uuid",
    "marker_key" "text" NOT NULL,
    "marker_label" "text" NOT NULL,
    "unit" "text",
    "low_threshold" numeric,
    "high_threshold" numeric,
    "risk_low" "text" DEFAULT 'none'::"text" NOT NULL,
    "risk_high" "text" DEFAULT 'high'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lab_risk_rules_risk_high_check" CHECK (("risk_high" = ANY (ARRAY['none'::"text", 'low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "lab_risk_rules_risk_low_check" CHECK (("risk_low" = ANY (ARRAY['none'::"text", 'low'::"text", 'medium'::"text", 'high'::"text"])))
);


ALTER TABLE "public"."lab_risk_rules" OWNER TO "postgres";


ALTER TABLE "public"."lab_risk_rules" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."lab_risk_rules_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."meal_audit_log" (
    "id" bigint NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "meal_id" bigint,
    "action" "text" NOT NULL,
    "meal_type" "text",
    "meal_date" "date",
    "meal_time" time without time zone,
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "meal_audit_log_action_check" CHECK (("action" = ANY (ARRAY['create'::"text", 'update'::"text", 'delete'::"text"])))
);


ALTER TABLE "public"."meal_audit_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."meal_audit_log" IS 'Log de auditoria de ações CRUD em refeições dos pacientes';



COMMENT ON COLUMN "public"."meal_audit_log"."meal_id" IS 'ID da refeição (NULL se foi deletada)';



COMMENT ON COLUMN "public"."meal_audit_log"."action" IS 'Tipo de ação: create, update, delete';



COMMENT ON COLUMN "public"."meal_audit_log"."details" IS 'JSON com detalhes da ação (alimentos, mudanças, etc.)';



CREATE SEQUENCE IF NOT EXISTS "public"."meal_audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."meal_audit_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."meal_audit_log_id_seq" OWNED BY "public"."meal_audit_log"."id";



CREATE TABLE IF NOT EXISTS "public"."meal_edit_history" (
    "id" bigint NOT NULL,
    "meal_id" bigint NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "edited_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "original_data" "jsonb" NOT NULL,
    "new_data" "jsonb" NOT NULL
);


ALTER TABLE "public"."meal_edit_history" OWNER TO "postgres";


ALTER TABLE "public"."meal_edit_history" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."meal_edit_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."meal_history" (
    "id" bigint NOT NULL,
    "meal_id" bigint NOT NULL,
    "action" "text" NOT NULL,
    "changed_by" "uuid",
    "before_data" "jsonb",
    "after_data" "jsonb",
    "timestamp" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."meal_history" OWNER TO "postgres";


COMMENT ON TABLE "public"."meal_history" IS 'Histórico de alterações nas refeições do paciente';



CREATE SEQUENCE IF NOT EXISTS "public"."meal_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."meal_history_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."meal_history_id_seq" OWNED BY "public"."meal_history"."id";



CREATE TABLE IF NOT EXISTS "public"."meal_items" (
    "id" bigint NOT NULL,
    "meal_id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "quantity" numeric NOT NULL,
    "calories" numeric NOT NULL,
    "protein" numeric NOT NULL,
    "fat" numeric NOT NULL,
    "carbs" numeric NOT NULL,
    "unit" "text",
    "reference_food_id" "uuid",
    "nutritionist_food_id" "uuid"
);


ALTER TABLE "public"."meal_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."meal_items"."unit" IS 'Unidade/medida caseira (code de household_measures): gram, large_glass, tablespoon, etc.';



ALTER TABLE "public"."meal_items" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."meal_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."meal_plan_food_substitutions" (
    "id" bigint NOT NULL,
    "meal_plan_food_id" bigint NOT NULL,
    "substitute_food_id" "uuid" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "quantity" numeric,
    "unit" "text"
);


ALTER TABLE "public"."meal_plan_food_substitutions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."meal_plan_food_substitutions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."meal_plan_food_substitutions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."meal_plan_food_substitutions_id_seq" OWNED BY "public"."meal_plan_food_substitutions"."id";



CREATE TABLE IF NOT EXISTS "public"."meal_plan_foods" (
    "id" bigint NOT NULL,
    "meal_plan_meal_id" bigint NOT NULL,
    "food_id" "uuid" NOT NULL,
    "quantity" numeric(10,2) NOT NULL,
    "unit" "text" NOT NULL,
    "calories" numeric(10,2) NOT NULL,
    "protein" numeric(10,2) NOT NULL,
    "carbs" numeric(10,2) NOT NULL,
    "fat" numeric(10,2) NOT NULL,
    "notes" "text",
    "order_index" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "patient_description" "text"
);


ALTER TABLE "public"."meal_plan_foods" OWNER TO "postgres";


COMMENT ON TABLE "public"."meal_plan_foods" IS 'Alimentos que compõem cada refeição do plano';



CREATE SEQUENCE IF NOT EXISTS "public"."meal_plan_foods_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."meal_plan_foods_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."meal_plan_foods_id_seq" OWNED BY "public"."meal_plan_foods"."id";



CREATE TABLE IF NOT EXISTS "public"."meal_plan_meals" (
    "id" bigint NOT NULL,
    "meal_plan_id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "meal_type" "public"."meal_type_enum" NOT NULL,
    "meal_time" time without time zone,
    "order_index" integer DEFAULT 0,
    "notes" "text",
    "total_calories" numeric(10,2) DEFAULT 0,
    "total_protein" numeric(10,2) DEFAULT 0,
    "total_carbs" numeric(10,2) DEFAULT 0,
    "total_fat" numeric(10,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."meal_plan_meals" OWNER TO "postgres";


COMMENT ON TABLE "public"."meal_plan_meals" IS 'Refeições que compõem um plano alimentar';



CREATE SEQUENCE IF NOT EXISTS "public"."meal_plan_meals_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."meal_plan_meals_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."meal_plan_meals_id_seq" OWNED BY "public"."meal_plan_meals"."id";



CREATE TABLE IF NOT EXISTS "public"."meal_plan_reference_values" (
    "id" bigint NOT NULL,
    "meal_plan_id" bigint NOT NULL,
    "weight_kg" numeric(6,2),
    "weight_type" "text" DEFAULT 'current'::"text",
    "total_energy_kcal" numeric(6,0),
    "energy_source" "text" DEFAULT 'manual'::"text",
    "macro_mode" "text" DEFAULT 'percentage'::"text",
    "protein_percentage" numeric(4,3),
    "carbs_percentage" numeric(4,3),
    "fat_percentage" numeric(4,3),
    "protein_g_per_kg" numeric(4,2),
    "carbs_g_per_kg" numeric(4,2),
    "fat_g_per_kg" numeric(4,2),
    "target_protein_g" numeric(6,1),
    "target_carbs_g" numeric(6,1),
    "target_fat_g" numeric(6,1),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."meal_plan_reference_values" OWNER TO "postgres";


COMMENT ON TABLE "public"."meal_plan_reference_values" IS 'Valores de referência para cálculo nutricional de planos alimentares';



COMMENT ON COLUMN "public"."meal_plan_reference_values"."weight_type" IS 'Tipo de peso: current (atual) ou desired (desejado)';



COMMENT ON COLUMN "public"."meal_plan_reference_values"."energy_source" IS 'Origem da energia: manual ou calculated (futuro módulo)';



COMMENT ON COLUMN "public"."meal_plan_reference_values"."macro_mode" IS 'Modo de cálculo de macros: percentage ou g_per_kg';



COMMENT ON COLUMN "public"."meal_plan_reference_values"."protein_percentage" IS 'Percentual de proteína em decimal (0.20 = 20%)';



CREATE SEQUENCE IF NOT EXISTS "public"."meal_plan_reference_values_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."meal_plan_reference_values_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."meal_plan_reference_values_id_seq" OWNED BY "public"."meal_plan_reference_values"."id";



CREATE TABLE IF NOT EXISTS "public"."meal_plan_versions" (
    "id" bigint NOT NULL,
    "meal_plan_id" bigint NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "version_number" integer DEFAULT 1 NOT NULL,
    "change_reason" "text",
    "snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_rollback" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."meal_plan_versions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."meal_plan_versions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."meal_plan_versions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."meal_plan_versions_id_seq" OWNED BY "public"."meal_plan_versions"."id";



CREATE TABLE IF NOT EXISTS "public"."meal_plans" (
    "id" bigint NOT NULL,
    "patient_id" "uuid",
    "nutritionist_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "active_days" "jsonb" DEFAULT '["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]'::"jsonb" NOT NULL,
    "start_date" "date" DEFAULT CURRENT_DATE,
    "end_date" "date",
    "is_active" boolean DEFAULT true,
    "daily_calories" numeric(10,2) DEFAULT 0,
    "daily_protein" numeric(10,2) DEFAULT 0,
    "daily_carbs" numeric(10,2) DEFAULT 0,
    "daily_fat" numeric(10,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_template" boolean DEFAULT false,
    "template_tags" "text"[] DEFAULT ARRAY[]::"text"[],
    "is_draft" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."meal_plans" OWNER TO "postgres";


COMMENT ON TABLE "public"."meal_plans" IS 'Planos alimentares criados pelo nutricionista para os pacientes';



COMMENT ON COLUMN "public"."meal_plans"."active_days" IS 'Array JSON dos dias da semana em que o plano está ativo';



COMMENT ON COLUMN "public"."meal_plans"."is_active" IS 'Indica se o plano está ativo ou foi arquivado';



COMMENT ON COLUMN "public"."meal_plans"."is_draft" IS 'When TRUE, this plan is a work-in-progress rascunho (draft). Drafts are not shown to patients and are not considered active plans. Promoted to is_draft=FALSE when nutritionist clicks "Aplicar Plano".';



CREATE SEQUENCE IF NOT EXISTS "public"."meal_plans_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."meal_plans_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."meal_plans_id_seq" OWNED BY "public"."meal_plans"."id";



CREATE TABLE IF NOT EXISTS "public"."meal_template_food_substitutions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_food_id" "uuid",
    "substitute_food_id" "uuid",
    "quantity" numeric,
    "unit" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."meal_template_food_substitutions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meal_template_foods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "meal_template_id" "uuid",
    "food_id" "uuid",
    "quantity" numeric NOT NULL,
    "unit" "text",
    "observation" "text",
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."meal_template_foods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meal_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "tags" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."meal_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meals" (
    "id" bigint NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "meal_date" "date" NOT NULL,
    "meal_time" time without time zone NOT NULL,
    "meal_type" "text" NOT NULL,
    "notes" "text",
    "total_calories" numeric NOT NULL,
    "total_protein" numeric NOT NULL,
    "total_fat" numeric NOT NULL,
    "total_carbs" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_edited" boolean DEFAULT false,
    "meal_plan_meal_id" bigint,
    "adherence_score" numeric(5,2),
    "meal_plan_id" bigint,
    "deleted_at" timestamp with time zone,
    "photo_url" "text"
);


ALTER TABLE "public"."meals" OWNER TO "postgres";


COMMENT ON COLUMN "public"."meals"."adherence_score" IS 'Porcentagem de aderência do paciente ao plano alimentar';



COMMENT ON COLUMN "public"."meals"."deleted_at" IS 'Timestamp de quando a refeição foi deletada (soft delete). NULL = ativa, NOT NULL = deletada';



ALTER TABLE "public"."meals" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."meals_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."message_templates" (
    "id" bigint NOT NULL,
    "nutritionist_id" "uuid",
    "template_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "context" "text" DEFAULT 'general'::"text" NOT NULL,
    "channel" "text" DEFAULT 'in_app'::"text" NOT NULL,
    "title_template" "text",
    "body_template" "text" NOT NULL,
    "variables" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "use_count" integer DEFAULT 0 NOT NULL,
    "last_used_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "message_templates_channel_check" CHECK (("channel" = ANY (ARRAY['in_app'::"text", 'whatsapp'::"text", 'sms'::"text", 'email'::"text", 'push'::"text", 'manual'::"text"]))),
    CONSTRAINT "message_templates_context_check" CHECK (("context" = ANY (ARRAY['general'::"text", 'low_adherence'::"text", 'goal_achieved'::"text", 'appointment_reminder'::"text", 'no_show_followup'::"text", 'lab_alert'::"text", 'meal_plan_updated'::"text", 'post_consultation'::"text"]))),
    CONSTRAINT "message_templates_use_count_check" CHECK (("use_count" >= 0))
);


ALTER TABLE "public"."message_templates" OWNER TO "postgres";


ALTER TABLE "public"."message_templates" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."message_templates_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."notification_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scope" "text" DEFAULT 'feed_priority'::"text" NOT NULL,
    "nutritionist_id" "uuid",
    "rule_key" "text" NOT NULL,
    "weight" numeric DEFAULT 1 NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "content" "jsonb",
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "title" "text",
    "message" "text",
    "link_url" "text",
    "read_at" timestamp with time zone
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


ALTER TABLE "public"."notifications" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."notifications_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."nutritionist_branding" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "clinic_name" "text",
    "logo_url" "text",
    "cover_image_url" "text",
    "primary_color" "text" DEFAULT '#22c55e'::"text",
    "accent_color" "text" DEFAULT '#16a34a'::"text",
    "welcome_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."nutritionist_branding" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nutritionist_custom_measures" (
    "id" bigint NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "grams_equivalent" numeric NOT NULL,
    "description" "text",
    "category" "text" DEFAULT 'volume'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "nutritionist_custom_measures_category_check" CHECK (("category" = ANY (ARRAY['volume'::"text", 'unit'::"text", 'weight'::"text", 'other'::"text"]))),
    CONSTRAINT "nutritionist_custom_measures_grams_equivalent_check" CHECK (("grams_equivalent" > (0)::numeric)),
    CONSTRAINT "nutritionist_custom_measures_name_check" CHECK ((("char_length"("name") >= 2) AND ("char_length"("name") <= 100)))
);


ALTER TABLE "public"."nutritionist_custom_measures" OWNER TO "postgres";


COMMENT ON TABLE "public"."nutritionist_custom_measures" IS 'Medidas caseiras personalizadas criadas por nutricionistas (máximo 20 por nutricionista). Cada medida define sua equivalência em gramas para uso nos cálculos nutricionais.';



CREATE SEQUENCE IF NOT EXISTS "public"."nutritionist_custom_measures_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."nutritionist_custom_measures_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."nutritionist_custom_measures_id_seq" OWNED BY "public"."nutritionist_custom_measures"."id";



CREATE TABLE IF NOT EXISTS "public"."nutritionist_patients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "app_settings" "jsonb" DEFAULT '{}'::"jsonb",
    "plan_expires_at" "date",
    "checkin_streak_current" integer DEFAULT 0,
    "checkin_streak_best" integer DEFAULT 0,
    "last_checkin_at" timestamp with time zone,
    "engagement_level" "text" DEFAULT 'new'::"text",
    "xp_points" integer DEFAULT 0,
    "level_name" "text" DEFAULT 'Iniciante'::"text",
    "onboarding_completed" boolean DEFAULT false,
    "status" "text" DEFAULT 'active'::"text",
    CONSTRAINT "nutritionist_patients_engagement_level_check" CHECK (("engagement_level" = ANY (ARRAY['new'::"text", 'engaged'::"text", 'at_risk'::"text", 'inactive'::"text"]))),
    CONSTRAINT "nutritionist_patients_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."nutritionist_patients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operational_observability_log" (
    "id" bigint NOT NULL,
    "nutritionist_id" "uuid",
    "patient_id" "uuid",
    "module" "text" NOT NULL,
    "operation" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "latency_ms" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "operational_observability_log_event_type_check" CHECK (("event_type" = ANY (ARRAY['success'::"text", 'error'::"text"]))),
    CONSTRAINT "operational_observability_log_latency_ms_check" CHECK (("latency_ms" >= 0)),
    CONSTRAINT "operational_observability_log_module_check" CHECK (("module" = ANY (ARRAY['feed'::"text", 'meal_plan'::"text", 'food_diary'::"text", 'agenda'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."operational_observability_log" OWNER TO "postgres";


ALTER TABLE "public"."operational_observability_log" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."operational_observability_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."patient_goals" (
    "id" bigint NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "goal_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "initial_weight" numeric(5,2) NOT NULL,
    "target_weight" numeric(5,2) NOT NULL,
    "current_weight" numeric(5,2),
    "start_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "target_date" "date" NOT NULL,
    "daily_calorie_goal" numeric(6,2),
    "required_daily_deficit" numeric(6,2),
    "energy_expenditure_id" bigint,
    "meal_plan_id" bigint,
    "is_realistic" boolean DEFAULT true,
    "viability_score" integer,
    "viability_notes" "text",
    "warnings" "jsonb",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "progress_percentage" numeric(5,2) DEFAULT 0,
    "completion_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "patient_goals_goal_type_check" CHECK (("goal_type" = ANY (ARRAY['weight_loss'::"text", 'weight_gain'::"text", 'weight_maintenance'::"text", 'body_composition'::"text", 'custom'::"text"]))),
    CONSTRAINT "patient_goals_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'cancelled'::"text", 'paused'::"text"]))),
    CONSTRAINT "patient_goals_viability_score_check" CHECK ((("viability_score" >= 1) AND ("viability_score" <= 5)))
);


ALTER TABLE "public"."patient_goals" OWNER TO "postgres";


COMMENT ON TABLE "public"."patient_goals" IS 'Metas nutricionais dos pacientes com validação de viabilidade';



COMMENT ON COLUMN "public"."patient_goals"."goal_type" IS 'Tipo de meta: perda, ganho, manutenção de peso, composição corporal ou customizada';



COMMENT ON COLUMN "public"."patient_goals"."required_daily_deficit" IS 'Déficit/superávit calórico necessário por dia em kcal';



COMMENT ON COLUMN "public"."patient_goals"."viability_score" IS 'Score de viabilidade: 1 (péssimo) a 5 (ótimo)';



COMMENT ON COLUMN "public"."patient_goals"."warnings" IS 'Alertas sobre a meta em formato JSON';



CREATE SEQUENCE IF NOT EXISTS "public"."patient_goals_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."patient_goals_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."patient_goals_id_seq" OWNED BY "public"."patient_goals"."id";



CREATE TABLE IF NOT EXISTS "public"."prescriptions" (
    "id" bigint NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "calories" numeric NOT NULL,
    "protein" numeric NOT NULL,
    "fat" numeric NOT NULL,
    "carbs" numeric NOT NULL,
    "diet_type" "text",
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "meal_plan" "jsonb"
);


ALTER TABLE "public"."prescriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_achievements" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "achievement_id" bigint NOT NULL,
    "achieved_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_achievements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "user_type" "text" NOT NULL,
    "crn" "text",
    "birth_date" "date",
    "gender" "text",
    "height" numeric,
    "weight" numeric,
    "goal" "text",
    "nutritionist_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "patient_category" "text" DEFAULT 'adult'::"text",
    "fiscal_data" "jsonb",
    "preferences" "jsonb" DEFAULT '{}'::"jsonb",
    "avatar_url" "text",
    "phone" "text",
    "address" "jsonb",
    "specialties" "text"[],
    "education" "text",
    "bio" "text",
    "is_active" boolean DEFAULT true,
    "cpf" "text",
    "occupation" "text",
    "civil_status" "text",
    "email" "text",
    "observations" "text",
    "is_admin" boolean DEFAULT false,
    "clinic_settings" "jsonb" DEFAULT '{"pix_key": "", "working_hours": {"end": "18:00", "days": [1, 2, 3, 4, 5], "start": "08:00"}, "address_footer": "", "default_tax_rate": 0, "appointment_duration": 60}'::"jsonb",
    "slug" "text",
    "needs_password_reset" boolean DEFAULT false,
    "ethnicity" "text" DEFAULT 'nao_informado'::"text",
    "last_seen_at" timestamp with time zone,
    "invite_code" "text",
    "patient_invite_code" "text",
    "clinical_flags" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."patient_hub_summary" AS
 SELECT "id" AS "patient_id",
    "name",
    "email",
    "phone",
    "birth_date",
    "goal",
    "avatar_url",
    "address",
    "public"."get_formatted_address"("address") AS "formatted_address",
    "nutritionist_id",
    "created_at",
    ( SELECT "jsonb_build_object"('weight', "gr"."weight", 'height', "gr"."height", 'record_date', "gr"."record_date") AS "jsonb_build_object"
           FROM "public"."growth_records" "gr"
          WHERE ("gr"."patient_id" = "p"."id")
          ORDER BY "gr"."record_date" DESC
         LIMIT 1) AS "latest_metrics",
    ( SELECT "a"."appointment_time"
           FROM "public"."appointments" "a"
          WHERE (("a"."patient_id" = "p"."id") AND ("a"."appointment_time" <= "now"()))
          ORDER BY "a"."appointment_time" DESC
         LIMIT 1) AS "last_appointment",
    ( SELECT "a"."appointment_time"
           FROM "public"."appointments" "a"
          WHERE (("a"."patient_id" = "p"."id") AND ("a"."appointment_time" > "now"()))
          ORDER BY "a"."appointment_time"
         LIMIT 1) AS "next_appointment",
    (( SELECT "count"(*) AS "count"
           FROM "public"."anamnesis_records"
          WHERE ("anamnesis_records"."patient_id" = "p"."id")) > 0) AS "has_anamnese",
    (( SELECT "count"(*) AS "count"
           FROM "public"."growth_records"
          WHERE ("growth_records"."patient_id" = "p"."id")) > 0) AS "has_anthropometry",
    (( SELECT "count"(*) AS "count"
           FROM "public"."prescriptions"
          WHERE ("prescriptions"."patient_id" = "p"."id")) > 0) AS "has_prescriptions",
    (( SELECT "count"(*) AS "count"
           FROM "public"."meals"
          WHERE ("meals"."patient_id" = "p"."id")) > 0) AS "has_meals",
    (( SELECT "count"(*) AS "count"
           FROM "public"."user_achievements"
          WHERE ("user_achievements"."user_id" = "p"."id")) > 0) AS "has_achievements"
   FROM "public"."user_profiles" "p"
  WHERE ("user_type" = 'patient'::"text");


ALTER VIEW "public"."patient_hub_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patient_module_sync_flags" (
    "patient_id" "uuid" NOT NULL,
    "anthropometry_updated_at" timestamp with time zone,
    "needs_energy_recalc" boolean DEFAULT false NOT NULL,
    "needs_meal_plan_review" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."patient_module_sync_flags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patient_reminder_preferences" (
    "id" bigint NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "daily_log_enabled" boolean DEFAULT true NOT NULL,
    "measurement_enabled" boolean DEFAULT true NOT NULL,
    "daily_log_time" time without time zone DEFAULT '20:00:00'::time without time zone NOT NULL,
    "measurement_time" time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    "channel_in_app" boolean DEFAULT true NOT NULL,
    "timezone" "text" DEFAULT 'America/Sao_Paulo'::"text" NOT NULL,
    "quiet_hours_start" time without time zone,
    "quiet_hours_end" time without time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."patient_reminder_preferences" OWNER TO "postgres";


COMMENT ON TABLE "public"."patient_reminder_preferences" IS 'Preferências de lembrete por paciente para canal in-app e horários.';



ALTER TABLE "public"."patient_reminder_preferences" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."patient_reminder_preferences_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."prescriptions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."prescriptions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."progress_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "photo_url" "text" NOT NULL,
    "photo_date" "date" NOT NULL,
    "uploaded_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."progress_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipe_ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipe_id" "uuid",
    "food_id" "uuid",
    "quantity" numeric NOT NULL,
    "unit" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."recipe_ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "preparation_method" "text",
    "yield_quantity" numeric NOT NULL,
    "yield_unit" "text" NOT NULL,
    "base_calories" numeric DEFAULT 0,
    "base_protein" numeric DEFAULT 0,
    "base_carbs" numeric DEFAULT 0,
    "base_fat" numeric DEFAULT 0,
    "is_deleted" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurring_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "day_of_month" integer NOT NULL,
    "category" "text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."recurring_expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reminder_delivery_log" (
    "id" bigint NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "reminder_type" "text" NOT NULL,
    "delivery_channel" "text" DEFAULT 'in_app'::"text" NOT NULL,
    "reminder_date" "date" NOT NULL,
    "reminder_time" time without time zone NOT NULL,
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "notification_id" bigint,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reminder_delivery_log_delivery_channel_check" CHECK (("delivery_channel" = 'in_app'::"text")),
    CONSTRAINT "reminder_delivery_log_reminder_type_check" CHECK (("reminder_type" = ANY (ARRAY['daily_log_reminder'::"text", 'measurement_reminder'::"text"]))),
    CONSTRAINT "reminder_delivery_log_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'skipped'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."reminder_delivery_log" OWNER TO "postgres";


ALTER TABLE "public"."reminder_delivery_log" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."reminder_delivery_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "price" numeric NOT NULL,
    "duration_minutes" integer DEFAULT 60,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplement_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "nutritionist_id" "uuid",
    "supplement_name" "text" NOT NULL,
    "dose_mg" numeric,
    "timing" "text",
    "taken_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "supplement_logs_timing_check" CHECK (("timing" = ANY (ARRAY['pre_workout'::"text", 'post_workout'::"text", 'morning'::"text", 'evening'::"text", 'with_meal'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."supplement_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."template_dispatch_log" (
    "id" bigint NOT NULL,
    "template_id" bigint NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "channel" "text" DEFAULT 'in_app'::"text" NOT NULL,
    "trigger_event" "text",
    "rendered_title" "text",
    "rendered_body" "text" NOT NULL,
    "variables_used" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "delivery_status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "template_dispatch_log_delivery_status_check" CHECK (("delivery_status" = ANY (ARRAY['sent'::"text", 'failed'::"text", 'pending'::"text"])))
);


ALTER TABLE "public"."template_dispatch_log" OWNER TO "postgres";


ALTER TABLE "public"."template_dispatch_log" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."template_dispatch_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."user_achievements" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."user_achievements_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."weekly_summaries" (
    "id" bigint NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "week_start_date" "date" NOT NULL,
    "notes" "text",
    "goals_met" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."weekly_summaries" OWNER TO "postgres";


ALTER TABLE "public"."weekly_summaries" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."weekly_summaries_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."energy_expenditure_calculations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."energy_expenditure_calculations_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."household_measures" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."household_measures_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."lab_results" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."lab_results_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."meal_audit_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."meal_audit_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."meal_history" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."meal_history_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."meal_plan_food_substitutions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."meal_plan_food_substitutions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."meal_plan_foods" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."meal_plan_foods_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."meal_plan_meals" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."meal_plan_meals_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."meal_plan_reference_values" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."meal_plan_reference_values_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."meal_plan_versions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."meal_plan_versions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."meal_plans" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."meal_plans_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."nutritionist_custom_measures" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."nutritionist_custom_measures_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."patient_goals" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."patient_goals_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anamnesis_records"
    ADD CONSTRAINT "anamnesis_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anamnesis_templates"
    ADD CONSTRAINT "anamnesis_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."archived_patient_links"
    ADD CONSTRAINT "archived_patient_links_nutritionist_id_patient_id_key" UNIQUE ("nutritionist_id", "patient_id");



ALTER TABLE ONLY "public"."archived_patient_links"
    ADD CONSTRAINT "archived_patient_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bug_reports"
    ADD CONSTRAINT "bug_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checkin_fields"
    ADD CONSTRAINT "checkin_fields_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checkin_schedules"
    ADD CONSTRAINT "checkin_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checkin_schedules"
    ADD CONSTRAINT "checkin_schedules_template_id_patient_id_key" UNIQUE ("template_id", "patient_id");



ALTER TABLE ONLY "public"."checkin_sessions"
    ADD CONSTRAINT "checkin_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checkin_sessions"
    ADD CONSTRAINT "checkin_sessions_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."checkin_templates"
    ADD CONSTRAINT "checkin_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."communication_automations"
    ADD CONSTRAINT "communication_automations_nutritionist_id_automation_key_key" UNIQUE ("nutritionist_id", "automation_key");



ALTER TABLE ONLY "public"."communication_automations"
    ADD CONSTRAINT "communication_automations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."diet_template_food_substitutions"
    ADD CONSTRAINT "diet_template_food_substitutions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."diet_template_foods"
    ADD CONSTRAINT "diet_template_foods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."diet_template_meals"
    ADD CONSTRAINT "diet_template_meals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."diet_templates"
    ADD CONSTRAINT "diet_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."energy_expenditure_calculations"
    ADD CONSTRAINT "energy_expenditure_calculations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."external_api_cache"
    ADD CONSTRAINT "external_api_cache_api_name_request_key_key" UNIQUE ("api_name", "request_key");



ALTER TABLE ONLY "public"."external_api_cache"
    ADD CONSTRAINT "external_api_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feed_tasks"
    ADD CONSTRAINT "feed_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_records"
    ADD CONSTRAINT "financial_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_transactions"
    ADD CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."food_household_measures"
    ADD CONSTRAINT "food_household_measures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."food_measures"
    ADD CONSTRAINT "food_measures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."glycemia_records"
    ADD CONSTRAINT "glycemia_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."growth_records"
    ADD CONSTRAINT "growth_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."household_measures"
    ADD CONSTRAINT "household_measures_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."household_measures"
    ADD CONSTRAINT "household_measures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lab_results"
    ADD CONSTRAINT "lab_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lab_risk_rules"
    ADD CONSTRAINT "lab_risk_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_audit_log"
    ADD CONSTRAINT "meal_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_edit_history"
    ADD CONSTRAINT "meal_edit_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_history"
    ADD CONSTRAINT "meal_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_items"
    ADD CONSTRAINT "meal_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_plan_food_substitutions"
    ADD CONSTRAINT "meal_plan_food_substitutions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_plan_foods"
    ADD CONSTRAINT "meal_plan_foods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_plan_meals"
    ADD CONSTRAINT "meal_plan_meals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_plan_reference_values"
    ADD CONSTRAINT "meal_plan_reference_values_meal_plan_id_key" UNIQUE ("meal_plan_id");



ALTER TABLE ONLY "public"."meal_plan_reference_values"
    ADD CONSTRAINT "meal_plan_reference_values_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_plan_versions"
    ADD CONSTRAINT "meal_plan_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_plans"
    ADD CONSTRAINT "meal_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_template_food_substitutions"
    ADD CONSTRAINT "meal_template_food_substitutions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_template_foods"
    ADD CONSTRAINT "meal_template_foods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_templates"
    ADD CONSTRAINT "meal_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meals"
    ADD CONSTRAINT "meals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_templates"
    ADD CONSTRAINT "message_templates_key_unique" UNIQUE ("nutritionist_id", "template_key");



ALTER TABLE ONLY "public"."message_templates"
    ADD CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_rules"
    ADD CONSTRAINT "notification_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutritionist_branding"
    ADD CONSTRAINT "nutritionist_branding_nutritionist_id_key" UNIQUE ("nutritionist_id");



ALTER TABLE ONLY "public"."nutritionist_branding"
    ADD CONSTRAINT "nutritionist_branding_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutritionist_custom_measures"
    ADD CONSTRAINT "nutritionist_custom_measures_nutritionist_id_code_key" UNIQUE ("nutritionist_id", "code");



ALTER TABLE ONLY "public"."nutritionist_custom_measures"
    ADD CONSTRAINT "nutritionist_custom_measures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutritionist_foods"
    ADD CONSTRAINT "nutritionist_foods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutritionist_patients"
    ADD CONSTRAINT "nutritionist_patients_nutritionist_id_patient_id_key" UNIQUE ("nutritionist_id", "patient_id");



ALTER TABLE ONLY "public"."nutritionist_patients"
    ADD CONSTRAINT "nutritionist_patients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operational_observability_log"
    ADD CONSTRAINT "operational_observability_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_goals"
    ADD CONSTRAINT "patient_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_module_sync_flags"
    ADD CONSTRAINT "patient_module_sync_flags_pkey" PRIMARY KEY ("patient_id");



ALTER TABLE ONLY "public"."patient_reminder_preferences"
    ADD CONSTRAINT "patient_reminder_preferences_patient_id_key" UNIQUE ("patient_id");



ALTER TABLE ONLY "public"."patient_reminder_preferences"
    ADD CONSTRAINT "patient_reminder_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_patient_id_start_date_key" UNIQUE ("patient_id", "start_date");



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."progress_photos"
    ADD CONSTRAINT "progress_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_expenses"
    ADD CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reference_foods"
    ADD CONSTRAINT "reference_foods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reminder_delivery_log"
    ADD CONSTRAINT "reminder_delivery_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplement_logs"
    ADD CONSTRAINT "supplement_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."template_dispatch_log"
    ADD CONSTRAINT "template_dispatch_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_user_id_achievement_id_key" UNIQUE ("user_id", "achievement_id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_cpf_key" UNIQUE ("cpf");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_patient_invite_code_key" UNIQUE ("patient_invite_code");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_summaries"
    ADD CONSTRAINT "weekly_summaries_patient_id_week_start_date_key" UNIQUE ("patient_id", "week_start_date");



ALTER TABLE ONLY "public"."weekly_summaries"
    ADD CONSTRAINT "weekly_summaries_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_activity_log_actor_user_id" ON "public"."activity_log" USING "btree" ("actor_user_id");



CREATE INDEX "idx_activity_log_event_name" ON "public"."activity_log" USING "btree" ("event_name");



CREATE INDEX "idx_activity_log_nutritionist_id" ON "public"."activity_log" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_activity_log_occurred_at" ON "public"."activity_log" USING "btree" ("occurred_at" DESC);



CREATE INDEX "idx_activity_log_patient_id" ON "public"."activity_log" USING "btree" ("patient_id");



CREATE INDEX "idx_anamnesis_records_anamnesis_records_template_id_fkey_fk" ON "public"."anamnesis_records" USING "btree" ("template_id");



CREATE INDEX "idx_anamnesis_records_appointment_id" ON "public"."anamnesis_records" USING "btree" ("appointment_id") WHERE ("appointment_id" IS NOT NULL);



CREATE INDEX "idx_anamnesis_records_awaiting" ON "public"."anamnesis_records" USING "btree" ("nutritionist_id", "status", "created_at") WHERE (("status" = 'awaiting_patient'::"text") AND ("public_access_token" IS NOT NULL));



CREATE INDEX "idx_anamnesis_records_content_gin" ON "public"."anamnesis_records" USING "gin" ("content");



CREATE INDEX "idx_anamnesis_records_nutritionist_id" ON "public"."anamnesis_records" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_anamnesis_records_patient" ON "public"."anamnesis_records" USING "btree" ("patient_id");



CREATE INDEX "idx_anamnesis_records_patient_created" ON "public"."anamnesis_records" USING "btree" ("patient_id", "created_at" DESC);



CREATE INDEX "idx_anamnesis_records_patient_status" ON "public"."anamnesis_records" USING "btree" ("patient_id", "status");



CREATE UNIQUE INDEX "idx_anamnesis_records_public_token" ON "public"."anamnesis_records" USING "btree" ("public_access_token") WHERE ("public_access_token" IS NOT NULL);



CREATE INDEX "idx_anamnesis_templates_nutri" ON "public"."anamnesis_templates" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_anamnesis_templates_nutritionist_id" ON "public"."anamnesis_templates" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_anamnesis_templates_sections_gin" ON "public"."anamnesis_templates" USING "gin" ("sections");



CREATE INDEX "idx_appointments_nutritionist_id" ON "public"."appointments" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_appointments_nutritionist_start" ON "public"."appointments" USING "btree" ("nutritionist_id", "start_time") WHERE ("start_time" IS NOT NULL);



CREATE INDEX "idx_appointments_patient_date" ON "public"."appointments" USING "btree" ("patient_id", "appointment_time" DESC);



CREATE INDEX "idx_appointments_start_time_status" ON "public"."appointments" USING "btree" ("start_time", "status");



CREATE INDEX "idx_appointments_time_status" ON "public"."appointments" USING "btree" ("appointment_time", "status") WHERE ("status" <> ALL (ARRAY['cancelled'::"text", 'completed'::"text", 'no_show'::"text"]));



CREATE INDEX "idx_archived_patient_links_patient_id" ON "public"."archived_patient_links" USING "btree" ("patient_id");



CREATE INDEX "idx_bug_reports_bug_type" ON "public"."bug_reports" USING "btree" ("bug_type");



CREATE INDEX "idx_bug_reports_created_at" ON "public"."bug_reports" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_bug_reports_created_resolved" ON "public"."bug_reports" USING "btree" ("created_at" DESC, "is_resolved");



CREATE INDEX "idx_bug_reports_is_resolved" ON "public"."bug_reports" USING "btree" ("is_resolved");



CREATE INDEX "idx_bug_reports_route" ON "public"."bug_reports" USING "btree" ("route");



CREATE INDEX "idx_bug_reports_severity" ON "public"."bug_reports" USING "btree" ("severity");



CREATE INDEX "idx_bug_reports_user_email" ON "public"."bug_reports" USING "btree" ("user_email");



CREATE INDEX "idx_bug_reports_user_id" ON "public"."bug_reports" USING "btree" ("user_id");



CREATE INDEX "idx_chats_from_to" ON "public"."chats" USING "btree" ("from_id", "to_id", "created_at" DESC);



CREATE INDEX "idx_chats_to_id" ON "public"."chats" USING "btree" ("to_id");



CREATE INDEX "idx_chats_to_id_created" ON "public"."chats" USING "btree" ("to_id", "created_at" DESC);



CREATE INDEX "idx_checkin_fields_template_id" ON "public"."checkin_fields" USING "btree" ("template_id");



CREATE INDEX "idx_checkin_schedules_nutritionist_id" ON "public"."checkin_schedules" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_checkin_schedules_patient_id" ON "public"."checkin_schedules" USING "btree" ("patient_id");



CREATE INDEX "idx_checkin_sessions_nutritionist_id" ON "public"."checkin_sessions" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_checkin_sessions_patient_id" ON "public"."checkin_sessions" USING "btree" ("patient_id");



CREATE INDEX "idx_checkin_sessions_schedule_id" ON "public"."checkin_sessions" USING "btree" ("schedule_id");



CREATE INDEX "idx_checkin_sessions_template_id" ON "public"."checkin_sessions" USING "btree" ("template_id");



CREATE INDEX "idx_checkin_templates_nutritionist_id" ON "public"."checkin_templates" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_communication_automations_nutritionist" ON "public"."communication_automations" USING "btree" ("nutritionist_id", "is_active");



CREATE INDEX "idx_diet_template_foods_meal_id" ON "public"."diet_template_foods" USING "btree" ("meal_id");



CREATE INDEX "idx_diet_template_meals_template_id" ON "public"."diet_template_meals" USING "btree" ("template_id");



CREATE INDEX "idx_diet_templates_user_id" ON "public"."diet_templates" USING "btree" ("user_id");



CREATE INDEX "idx_energy_calc_patient_recent" ON "public"."energy_expenditure_calculations" USING "btree" ("patient_id", "created_at" DESC);



CREATE INDEX "idx_energy_expenditure_nutritionist_id" ON "public"."energy_expenditure_calculations" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_external_api_cache_expires_at" ON "public"."external_api_cache" USING "btree" ("expires_at");



CREATE INDEX "idx_external_api_cache_key" ON "public"."external_api_cache" USING "btree" ("api_name", "request_key");



CREATE INDEX "idx_external_api_cache_request_key" ON "public"."external_api_cache" USING "btree" ("request_key");



CREATE INDEX "idx_feed_tasks_nutritionist_resolved" ON "public"."feed_tasks" USING "btree" ("nutritionist_id", "resolved_at") WHERE ("resolved_at" IS NULL);



CREATE INDEX "idx_feed_tasks_nutritionist_status" ON "public"."feed_tasks" USING "btree" ("nutritionist_id", "status") WHERE ("status" <> 'resolved'::"text");



CREATE INDEX "idx_feed_tasks_nutritionist_status_updated" ON "public"."feed_tasks" USING "btree" ("nutritionist_id", "status", "updated_at" DESC);



CREATE INDEX "idx_feed_tasks_patient_id" ON "public"."feed_tasks" USING "btree" ("patient_id");



CREATE INDEX "idx_feed_tasks_resolved_by" ON "public"."feed_tasks" USING "btree" ("resolved_by");



CREATE INDEX "idx_financial_records_financial_records_patient_id_fkey_fk" ON "public"."financial_records" USING "btree" ("patient_id");



CREATE INDEX "idx_financial_records_financial_records_service_id_fkey_fk" ON "public"."financial_records" USING "btree" ("service_id");



CREATE INDEX "idx_financial_records_nutritionist_id" ON "public"."financial_records" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_financial_transactions_nutritionist_id" ON "public"."financial_transactions" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_financial_transactions_patient_id" ON "public"."financial_transactions" USING "btree" ("patient_id");



CREATE INDEX "idx_food_household_measures_food_household_measures_measure_id_" ON "public"."food_household_measures" USING "btree" ("measure_id");



CREATE INDEX "idx_food_measures_nutritionist_food_id" ON "public"."food_measures" USING "btree" ("nutritionist_food_id");



CREATE INDEX "idx_food_measures_reference_food_id" ON "public"."food_measures" USING "btree" ("reference_food_id");



CREATE INDEX "idx_glycemia_records_glycemia_records_nutritionist_id_fkey_fk" ON "public"."glycemia_records" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_glycemia_records_glycemia_records_patient_id_fkey_fk" ON "public"."glycemia_records" USING "btree" ("patient_id");



CREATE INDEX "idx_growth_records_created_by_user_id" ON "public"."growth_records" USING "btree" ("created_by_user_id");



CREATE UNIQUE INDEX "idx_growth_records_latest_unique" ON "public"."growth_records" USING "btree" ("revision_group_id") WHERE ("is_latest_revision" = true);



CREATE INDEX "idx_growth_records_patient_date" ON "public"."growth_records" USING "btree" ("patient_id", "record_date" DESC);



CREATE INDEX "idx_growth_records_patient_id" ON "public"."growth_records" USING "btree" ("patient_id");



CREATE INDEX "idx_growth_records_revision_group" ON "public"."growth_records" USING "btree" ("revision_group_id", "revision_number" DESC);



CREATE INDEX "idx_growth_records_supersedes" ON "public"."growth_records" USING "btree" ("supersedes_record_id");



CREATE INDEX "idx_lab_results_patient_id" ON "public"."lab_results" USING "btree" ("patient_id");



CREATE INDEX "idx_lab_risk_rules_scope" ON "public"."lab_risk_rules" USING "btree" ("nutritionist_id", "marker_key", "is_active");



CREATE INDEX "idx_meal_audit_log_meal_id" ON "public"."meal_audit_log" USING "btree" ("meal_id");



CREATE INDEX "idx_meal_audit_log_patient_created" ON "public"."meal_audit_log" USING "btree" ("patient_id", "created_at" DESC);



CREATE INDEX "idx_meal_audit_log_patient_meal_date" ON "public"."meal_audit_log" USING "btree" ("patient_id", "meal_date" DESC);



CREATE INDEX "idx_meal_audit_patient" ON "public"."meal_audit_log" USING "btree" ("patient_id");



CREATE INDEX "idx_meal_edit_history_meal_edit_history_meal_id_fkey_fk" ON "public"."meal_edit_history" USING "btree" ("meal_id");



CREATE INDEX "idx_meal_edit_history_patient_id" ON "public"."meal_edit_history" USING "btree" ("patient_id");



CREATE INDEX "idx_meal_history_meal_history_changed_by_fkey_fk" ON "public"."meal_history" USING "btree" ("changed_by");



CREATE INDEX "idx_meal_history_meal_history_meal_id_fkey_fk" ON "public"."meal_history" USING "btree" ("meal_id");



CREATE INDEX "idx_meal_items_meal_id" ON "public"."meal_items" USING "btree" ("meal_id");



CREATE INDEX "idx_meal_plan_food_substitutions_food_id" ON "public"."meal_plan_food_substitutions" USING "btree" ("meal_plan_food_id");



CREATE INDEX "idx_meal_plan_food_substitutions_substitute_id" ON "public"."meal_plan_food_substitutions" USING "btree" ("substitute_food_id");



CREATE INDEX "idx_meal_plan_foods_food_id" ON "public"."meal_plan_foods" USING "btree" ("food_id");



CREATE INDEX "idx_meal_plan_foods_meal_plan_meal_id" ON "public"."meal_plan_foods" USING "btree" ("meal_plan_meal_id");



CREATE INDEX "idx_meal_plan_meals_meal_plan_id" ON "public"."meal_plan_meals" USING "btree" ("meal_plan_id");



CREATE INDEX "idx_meal_plan_versions_plan_id" ON "public"."meal_plan_versions" USING "btree" ("meal_plan_id", "version_number" DESC);



CREATE INDEX "idx_meal_plans_draft_lookup" ON "public"."meal_plans" USING "btree" ("patient_id", "nutritionist_id", "is_draft") WHERE ("is_draft" = true);



CREATE INDEX "idx_meal_plans_nutritionist_id" ON "public"."meal_plans" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_meal_plans_patient" ON "public"."meal_plans" USING "btree" ("patient_id");



CREATE INDEX "idx_meal_templates_user_id" ON "public"."meal_templates" USING "btree" ("user_id");



CREATE INDEX "idx_meals_meal_plan_meal_id" ON "public"."meals" USING "btree" ("meal_plan_meal_id");



CREATE INDEX "idx_meals_meals_meal_plan_id_fkey_fk" ON "public"."meals" USING "btree" ("meal_plan_id");



CREATE INDEX "idx_meals_patient_created" ON "public"."meals" USING "btree" ("patient_id", "created_at" DESC);



CREATE INDEX "idx_meals_patient_id" ON "public"."meals" USING "btree" ("patient_id");



CREATE INDEX "idx_meals_patient_meal_date" ON "public"."meals" USING "btree" ("patient_id", "meal_date" DESC);



CREATE INDEX "idx_ncm_nutritionist_active" ON "public"."nutritionist_custom_measures" USING "btree" ("nutritionist_id", "is_active");



CREATE INDEX "idx_notification_rules_nutritionist_id" ON "public"."notification_rules" USING "btree" ("nutritionist_id");



CREATE UNIQUE INDEX "idx_notification_rules_scope_owner_key" ON "public"."notification_rules" USING "btree" ("scope", COALESCE("nutritionist_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "rule_key");



CREATE INDEX "idx_notifications_content_gin" ON "public"."notifications" USING "gin" ("content");



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_notifications_user_type_created" ON "public"."notifications" USING "btree" ("user_id", "type", "created_at" DESC);



CREATE INDEX "idx_notifications_user_unread_created" ON "public"."notifications" USING "btree" ("user_id", "is_read", "created_at" DESC);



CREATE INDEX "idx_nutritionist_foods_name_trgm" ON "public"."nutritionist_foods" USING "gin" ("name" "extensions"."gin_trgm_ops");



CREATE INDEX "idx_nutritionist_foods_nutritionist_id" ON "public"."nutritionist_foods" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_nutritionist_patients_patient_id" ON "public"."nutritionist_patients" USING "btree" ("patient_id");



CREATE INDEX "idx_operational_observability_patient_id" ON "public"."operational_observability_log" USING "btree" ("patient_id");



CREATE INDEX "idx_patient_goals_nutritionist_id" ON "public"."patient_goals" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_patient_goals_patient_goals_energy_expenditure_id_fkey_fk" ON "public"."patient_goals" USING "btree" ("energy_expenditure_id");



CREATE INDEX "idx_patient_goals_patient_goals_meal_plan_id_fkey_fk" ON "public"."patient_goals" USING "btree" ("meal_plan_id");



CREATE INDEX "idx_patient_goals_patient_id" ON "public"."patient_goals" USING "btree" ("patient_id");



CREATE INDEX "idx_patient_reminder_preferences_patient" ON "public"."patient_reminder_preferences" USING "btree" ("patient_id");



CREATE INDEX "idx_prescriptions_nutritionist_id" ON "public"."prescriptions" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_prescriptions_patient_id" ON "public"."prescriptions" USING "btree" ("patient_id");



CREATE INDEX "idx_progress_photos_uploaded_by" ON "public"."progress_photos" USING "btree" ("uploaded_by");



CREATE INDEX "idx_recipes_user_id" ON "public"."recipes" USING "btree" ("user_id");



CREATE INDEX "idx_recurring_expenses_recurring_expenses_nutritionist_id_fkey_" ON "public"."recurring_expenses" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_reference_foods_is_active" ON "public"."reference_foods" USING "btree" ("is_active") WHERE (("is_active" = true) OR ("is_active" IS NULL));



CREATE INDEX "idx_reference_foods_name_trgm" ON "public"."reference_foods" USING "gin" ("name" "extensions"."gin_trgm_ops");



CREATE INDEX "idx_reminder_delivery_notification_id" ON "public"."reminder_delivery_log" USING "btree" ("notification_id");



CREATE INDEX "idx_reminder_delivery_patient_created" ON "public"."reminder_delivery_log" USING "btree" ("patient_id", "created_at" DESC);



CREATE INDEX "idx_services_services_nutritionist_id_fkey_fk" ON "public"."services" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_supplement_logs_nutritionist_id" ON "public"."supplement_logs" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_supplement_logs_patient_id" ON "public"."supplement_logs" USING "btree" ("patient_id");



CREATE INDEX "idx_template_dispatch_log_template_id" ON "public"."template_dispatch_log" USING "btree" ("template_id");



CREATE INDEX "idx_user_achievements_user_achievements_achievement_id_fkey_fk" ON "public"."user_achievements" USING "btree" ("achievement_id");



CREATE INDEX "idx_user_achievements_user_date" ON "public"."user_achievements" USING "btree" ("user_id", "achieved_at" DESC);



CREATE INDEX "idx_user_profiles_clinical_flags" ON "public"."user_profiles" USING "gin" ("clinical_flags");



CREATE INDEX "idx_user_profiles_nutritionist_id" ON "public"."user_profiles" USING "btree" ("nutritionist_id");



CREATE UNIQUE INDEX "idx_user_profiles_nutritionist_slug" ON "public"."user_profiles" USING "btree" ("nutritionist_id", "slug") WHERE (("nutritionist_id" IS NOT NULL) AND ("slug" IS NOT NULL));



CREATE INDEX "idx_weekly_summaries_nutritionist_id" ON "public"."weekly_summaries" USING "btree" ("nutritionist_id");



CREATE UNIQUE INDEX "message_templates_default_template_key_key" ON "public"."message_templates" USING "btree" ("template_key") WHERE ("nutritionist_id" IS NULL);



CREATE INDEX "message_templates_nutritionist_created_idx" ON "public"."message_templates" USING "btree" ("nutritionist_id", "created_at" DESC);



CREATE INDEX "operational_observability_log_nutritionist_created_idx" ON "public"."operational_observability_log" USING "btree" ("nutritionist_id", "created_at" DESC);



CREATE INDEX "progress_photos_patient_created_idx" ON "public"."progress_photos" USING "btree" ("patient_id", "created_at" DESC);



CREATE INDEX "progress_photos_patient_date_idx" ON "public"."progress_photos" USING "btree" ("patient_id", "photo_date" DESC);



CREATE INDEX "template_dispatch_log_nutritionist_created_idx" ON "public"."template_dispatch_log" USING "btree" ("nutritionist_id", "created_at" DESC);



CREATE INDEX "template_dispatch_log_patient_created_idx" ON "public"."template_dispatch_log" USING "btree" ("patient_id", "created_at" DESC);



CREATE UNIQUE INDEX "uq_lab_risk_rules_custom" ON "public"."lab_risk_rules" USING "btree" ("nutritionist_id", "marker_key") WHERE ("nutritionist_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_lab_risk_rules_global" ON "public"."lab_risk_rules" USING "btree" ("marker_key") WHERE ("nutritionist_id" IS NULL);



CREATE UNIQUE INDEX "uq_reminder_delivery_daily" ON "public"."reminder_delivery_log" USING "btree" ("patient_id", "reminder_type", "reminder_date", "delivery_channel");



CREATE OR REPLACE TRIGGER "on_meal_update" BEFORE UPDATE ON "public"."meals" FOR EACH ROW WHEN (("old".* IS DISTINCT FROM "new".*)) EXECUTE FUNCTION "public"."log_meal_edit"();



CREATE OR REPLACE TRIGGER "on_new_chat_message" AFTER INSERT ON "public"."chats" FOR EACH ROW EXECUTE FUNCTION "private"."handle_new_chat_message_notification"();



CREATE OR REPLACE TRIGGER "on_new_summary" AFTER INSERT ON "public"."weekly_summaries" FOR EACH ROW EXECUTE FUNCTION "private"."create_summary_notification"();



CREATE OR REPLACE TRIGGER "tr_set_invite_code" BEFORE INSERT ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_invite_code"();



CREATE OR REPLACE TRIGGER "trg_communication_automations_updated_at" BEFORE UPDATE ON "public"."communication_automations" FOR EACH ROW EXECUTE FUNCTION "public"."set_communication_automations_updated_at"();



CREATE OR REPLACE TRIGGER "trg_growth_records_apply_versioning" BEFORE INSERT ON "public"."growth_records" FOR EACH ROW EXECUTE FUNCTION "public"."trg_growth_records_apply_versioning"();



CREATE OR REPLACE TRIGGER "trg_growth_records_mark_previous_not_latest" AFTER INSERT ON "public"."growth_records" FOR EACH ROW EXECUTE FUNCTION "public"."trg_growth_records_mark_previous_not_latest"();



CREATE OR REPLACE TRIGGER "trg_growth_records_sync_modules" AFTER INSERT ON "public"."growth_records" FOR EACH ROW EXECUTE FUNCTION "public"."trg_growth_records_sync_modules"();



CREATE OR REPLACE TRIGGER "trg_growth_records_validate_clinical" BEFORE INSERT OR UPDATE ON "public"."growth_records" FOR EACH ROW EXECUTE FUNCTION "public"."trg_growth_records_validate_clinical"();



CREATE OR REPLACE TRIGGER "trg_lab_risk_rules_updated_at" BEFORE UPDATE ON "public"."lab_risk_rules" FOR EACH ROW EXECUTE FUNCTION "public"."set_lab_risk_rules_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ncm_before_delete" BEFORE DELETE ON "public"."nutritionist_custom_measures" FOR EACH ROW EXECUTE FUNCTION "public"."convert_custom_measure_to_grams"();



CREATE OR REPLACE TRIGGER "trg_ncm_updated_at" BEFORE UPDATE ON "public"."nutritionist_custom_measures" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_ncm"();



CREATE OR REPLACE TRIGGER "trg_patient_reminder_preferences_updated_at" BEFORE UPDATE ON "public"."patient_reminder_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."set_patient_reminder_preferences_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_message_templates_updated_at" BEFORE UPDATE ON "public"."message_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_message_templates_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sync_notification_read_state" BEFORE INSERT OR UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "private"."sync_notification_read_state"();



CREATE OR REPLACE TRIGGER "trg_user_profiles_sync_slug" BEFORE INSERT OR UPDATE OF "name" ON "public"."user_profiles" FOR EACH ROW WHEN ((("new"."user_type" = 'patient'::"text") AND ("new"."nutritionist_id" IS NOT NULL))) EXECUTE FUNCTION "public"."user_profiles_sync_slug"();



CREATE OR REPLACE TRIGGER "trigger_meal_plan_meal_updated" BEFORE UPDATE ON "public"."meal_plan_meals" FOR EACH ROW EXECUTE FUNCTION "public"."update_meal_plan_timestamp"();



CREATE OR REPLACE TRIGGER "trigger_meal_plan_updated" BEFORE UPDATE ON "public"."meal_plans" FOR EACH ROW EXECUTE FUNCTION "public"."update_meal_plan_timestamp"();



CREATE OR REPLACE TRIGGER "trigger_reference_values_updated" BEFORE UPDATE ON "public"."meal_plan_reference_values" FOR EACH ROW EXECUTE FUNCTION "public"."update_reference_values_timestamp"();



CREATE OR REPLACE TRIGGER "trigger_sync_anthropometry" AFTER INSERT OR UPDATE OF "weight", "height" ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_anthropometry_on_profile_change"();



COMMENT ON TRIGGER "trigger_sync_anthropometry" ON "public"."user_profiles" IS 'Trigger que sincroniza peso e altura do cadastro do paciente com a tabela de avaliação antropométrica (growth_records).';



CREATE OR REPLACE TRIGGER "trigger_update_bug_reports_updated_at" BEFORE UPDATE ON "public"."bug_reports" FOR EACH ROW EXECUTE FUNCTION "public"."update_bug_reports_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_update_energy_calc_timestamp" BEFORE UPDATE ON "public"."energy_expenditure_calculations" FOR EACH ROW EXECUTE FUNCTION "public"."update_energy_calc_timestamp"();



CREATE OR REPLACE TRIGGER "trigger_update_lab_results_timestamp" BEFORE UPDATE ON "public"."lab_results" FOR EACH ROW EXECUTE FUNCTION "public"."update_lab_results_timestamp"();



CREATE OR REPLACE TRIGGER "trigger_update_patient_goals_updated_at" BEFORE UPDATE ON "public"."patient_goals" FOR EACH ROW EXECUTE FUNCTION "public"."update_patient_goals_updated_at"();



CREATE OR REPLACE TRIGGER "update_anamnesis_records_updated_at" BEFORE UPDATE ON "public"."anamnesis_records" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "update_anamnesis_templates_updated_at" BEFORE UPDATE ON "public"."anamnesis_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "update_net_amount" BEFORE INSERT OR UPDATE ON "public"."financial_records" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_net_amount"();



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."anamnesis_records"
    ADD CONSTRAINT "anamnesis_records_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."anamnesis_records"
    ADD CONSTRAINT "anamnesis_records_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."anamnesis_records"
    ADD CONSTRAINT "anamnesis_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."anamnesis_records"
    ADD CONSTRAINT "anamnesis_records_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."anamnesis_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."anamnesis_templates"
    ADD CONSTRAINT "anamnesis_templates_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."archived_patient_links"
    ADD CONSTRAINT "archived_patient_links_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."archived_patient_links"
    ADD CONSTRAINT "archived_patient_links_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bug_reports"
    ADD CONSTRAINT "bug_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_from_id_fkey" FOREIGN KEY ("from_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_to_id_fkey" FOREIGN KEY ("to_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checkin_fields"
    ADD CONSTRAINT "checkin_fields_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."checkin_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checkin_schedules"
    ADD CONSTRAINT "checkin_schedules_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."checkin_schedules"
    ADD CONSTRAINT "checkin_schedules_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checkin_schedules"
    ADD CONSTRAINT "checkin_schedules_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."checkin_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checkin_sessions"
    ADD CONSTRAINT "checkin_sessions_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."checkin_sessions"
    ADD CONSTRAINT "checkin_sessions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."checkin_sessions"
    ADD CONSTRAINT "checkin_sessions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."checkin_schedules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checkin_sessions"
    ADD CONSTRAINT "checkin_sessions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."checkin_templates"("id");



ALTER TABLE ONLY "public"."checkin_templates"
    ADD CONSTRAINT "checkin_templates_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."communication_automations"
    ADD CONSTRAINT "communication_automations_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."diet_template_food_substitutions"
    ADD CONSTRAINT "diet_template_food_substitutions_template_food_id_fkey" FOREIGN KEY ("template_food_id") REFERENCES "public"."diet_template_foods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."diet_template_foods"
    ADD CONSTRAINT "diet_template_foods_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "public"."diet_template_meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."diet_template_meals"
    ADD CONSTRAINT "diet_template_meals_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."diet_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."diet_templates"
    ADD CONSTRAINT "diet_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."energy_expenditure_calculations"
    ADD CONSTRAINT "energy_expenditure_calculations_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."energy_expenditure_calculations"
    ADD CONSTRAINT "energy_expenditure_calculations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feed_tasks"
    ADD CONSTRAINT "feed_tasks_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feed_tasks"
    ADD CONSTRAINT "feed_tasks_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feed_tasks"
    ADD CONSTRAINT "feed_tasks_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_records"
    ADD CONSTRAINT "financial_records_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."financial_records"
    ADD CONSTRAINT "financial_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."financial_records"
    ADD CONSTRAINT "financial_records_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id");



ALTER TABLE ONLY "public"."financial_transactions"
    ADD CONSTRAINT "financial_transactions_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."financial_transactions"
    ADD CONSTRAINT "financial_transactions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_audit_log"
    ADD CONSTRAINT "fk_patient" FOREIGN KEY ("patient_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."food_household_measures"
    ADD CONSTRAINT "food_household_measures_measure_id_fkey" FOREIGN KEY ("measure_id") REFERENCES "public"."household_measures"("id");



ALTER TABLE ONLY "public"."food_measures"
    ADD CONSTRAINT "food_measures_nutritionist_food_id_fkey" FOREIGN KEY ("nutritionist_food_id") REFERENCES "public"."nutritionist_foods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_measures"
    ADD CONSTRAINT "food_measures_reference_food_id_fkey" FOREIGN KEY ("reference_food_id") REFERENCES "public"."reference_foods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."glycemia_records"
    ADD CONSTRAINT "glycemia_records_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."glycemia_records"
    ADD CONSTRAINT "glycemia_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."growth_records"
    ADD CONSTRAINT "growth_records_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."growth_records"
    ADD CONSTRAINT "growth_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."growth_records"
    ADD CONSTRAINT "growth_records_supersedes_record_id_fkey" FOREIGN KEY ("supersedes_record_id") REFERENCES "public"."growth_records"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lab_results"
    ADD CONSTRAINT "lab_results_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lab_risk_rules"
    ADD CONSTRAINT "lab_risk_rules_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_audit_log"
    ADD CONSTRAINT "meal_audit_log_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meal_audit_log"
    ADD CONSTRAINT "meal_audit_log_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_edit_history"
    ADD CONSTRAINT "meal_edit_history_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_edit_history"
    ADD CONSTRAINT "meal_edit_history_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_history"
    ADD CONSTRAINT "meal_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."meal_history"
    ADD CONSTRAINT "meal_history_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_items"
    ADD CONSTRAINT "meal_items_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_plan_food_substitutions"
    ADD CONSTRAINT "meal_plan_food_substitutions_meal_plan_food_id_fkey" FOREIGN KEY ("meal_plan_food_id") REFERENCES "public"."meal_plan_foods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_plan_foods"
    ADD CONSTRAINT "meal_plan_foods_meal_plan_meal_id_fkey" FOREIGN KEY ("meal_plan_meal_id") REFERENCES "public"."meal_plan_meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_plan_meals"
    ADD CONSTRAINT "meal_plan_meals_meal_plan_id_fkey" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_plan_reference_values"
    ADD CONSTRAINT "meal_plan_reference_values_meal_plan_id_fkey" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_plan_versions"
    ADD CONSTRAINT "meal_plan_versions_meal_plan_id_fkey" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_plans"
    ADD CONSTRAINT "meal_plans_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_plans"
    ADD CONSTRAINT "meal_plans_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_template_food_substitutions"
    ADD CONSTRAINT "meal_template_food_substitutions_template_food_id_fkey" FOREIGN KEY ("template_food_id") REFERENCES "public"."meal_template_foods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_template_foods"
    ADD CONSTRAINT "meal_template_foods_meal_template_id_fkey" FOREIGN KEY ("meal_template_id") REFERENCES "public"."meal_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_templates"
    ADD CONSTRAINT "meal_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meals"
    ADD CONSTRAINT "meals_meal_plan_id_fkey" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meals"
    ADD CONSTRAINT "meals_meal_plan_meal_id_fkey" FOREIGN KEY ("meal_plan_meal_id") REFERENCES "public"."meal_plan_meals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meals"
    ADD CONSTRAINT "meals_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_templates"
    ADD CONSTRAINT "message_templates_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_rules"
    ADD CONSTRAINT "notification_rules_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutritionist_branding"
    ADD CONSTRAINT "nutritionist_branding_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutritionist_custom_measures"
    ADD CONSTRAINT "nutritionist_custom_measures_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutritionist_foods"
    ADD CONSTRAINT "nutritionist_foods_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutritionist_patients"
    ADD CONSTRAINT "nutritionist_patients_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutritionist_patients"
    ADD CONSTRAINT "nutritionist_patients_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."operational_observability_log"
    ADD CONSTRAINT "operational_observability_log_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."operational_observability_log"
    ADD CONSTRAINT "operational_observability_log_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patient_goals"
    ADD CONSTRAINT "patient_goals_energy_expenditure_id_fkey" FOREIGN KEY ("energy_expenditure_id") REFERENCES "public"."energy_expenditure_calculations"("id");



ALTER TABLE ONLY "public"."patient_goals"
    ADD CONSTRAINT "patient_goals_meal_plan_id_fkey" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plans"("id");



ALTER TABLE ONLY "public"."patient_goals"
    ADD CONSTRAINT "patient_goals_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_goals"
    ADD CONSTRAINT "patient_goals_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_module_sync_flags"
    ADD CONSTRAINT "patient_module_sync_flags_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_reminder_preferences"
    ADD CONSTRAINT "patient_reminder_preferences_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."progress_photos"
    ADD CONSTRAINT "progress_photos_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."progress_photos"
    ADD CONSTRAINT "progress_photos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_expenses"
    ADD CONSTRAINT "recurring_expenses_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."reminder_delivery_log"
    ADD CONSTRAINT "reminder_delivery_log_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reminder_delivery_log"
    ADD CONSTRAINT "reminder_delivery_log_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."supplement_logs"
    ADD CONSTRAINT "supplement_logs_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."supplement_logs"
    ADD CONSTRAINT "supplement_logs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."template_dispatch_log"
    ADD CONSTRAINT "template_dispatch_log_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."template_dispatch_log"
    ADD CONSTRAINT "template_dispatch_log_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."template_dispatch_log"
    ADD CONSTRAINT "template_dispatch_log_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."weekly_summaries"
    ADD CONSTRAINT "weekly_summaries_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_summaries"
    ADD CONSTRAINT "weekly_summaries_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



CREATE POLICY "Access glycemia_records" ON "public"."glycemia_records" TO "authenticated" USING ((("patient_id" = ( SELECT "public"."auth_uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "glycemia_records"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "public"."auth_uid"() AS "uid"))))))) WITH CHECK ((("patient_id" = ( SELECT "public"."auth_uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "glycemia_records"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "public"."auth_uid"() AS "uid")))))));



CREATE POLICY "Access lab_results" ON "public"."lab_results" TO "authenticated" USING ((("patient_id" = ( SELECT "public"."auth_uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "lab_results"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "public"."auth_uid"() AS "uid"))))))) WITH CHECK ((("patient_id" = ( SELECT "public"."auth_uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "lab_results"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "public"."auth_uid"() AS "uid")))))));



CREATE POLICY "Access meal_audit_log" ON "public"."meal_audit_log" FOR SELECT TO "authenticated" USING ((("patient_id" = ( SELECT "public"."auth_uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "meal_audit_log"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "public"."auth_uid"() AS "uid")))))));



CREATE POLICY "Access meal_history" ON "public"."meal_history" FOR SELECT TO "authenticated" USING ((("changed_by" = ( SELECT "public"."auth_uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "meal_history"."changed_by") AND ("up"."nutritionist_id" = ( SELECT "public"."auth_uid"() AS "uid")))))));



CREATE POLICY "Access meal_items via meals" ON "public"."meal_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."meals" "m"
  WHERE (("m"."id" = "meal_items"."meal_id") AND (("m"."patient_id" = ( SELECT "public"."auth_uid"() AS "uid")) OR (EXISTS ( SELECT 1
           FROM "public"."user_profiles" "up"
          WHERE (("up"."id" = "m"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "public"."auth_uid"() AS "uid")))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."meals" "m"
  WHERE (("m"."id" = "meal_items"."meal_id") AND (("m"."patient_id" = ( SELECT "public"."auth_uid"() AS "uid")) OR (EXISTS ( SELECT 1
           FROM "public"."user_profiles" "up"
          WHERE (("up"."id" = "m"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "public"."auth_uid"() AS "uid"))))))))));



CREATE POLICY "Access meal_plan_food_substitutions via meal_plan_foods" ON "public"."meal_plan_food_substitutions" USING ((EXISTS ( SELECT 1
   FROM (("public"."meal_plan_foods" "mf"
     JOIN "public"."meal_plan_meals" "m" ON (("m"."id" = "mf"."meal_plan_meal_id")))
     JOIN "public"."meal_plans" "p" ON (("p"."id" = "m"."meal_plan_id")))
  WHERE (("mf"."id" = "meal_plan_food_substitutions"."meal_plan_food_id") AND (("p"."patient_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("p"."patient_id" IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM "public"."user_profiles" "up"
          WHERE (("up"."id" = "p"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (("p"."patient_id" IS NULL) AND ("p"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."meal_plan_foods" "mf"
     JOIN "public"."meal_plan_meals" "m" ON (("m"."id" = "mf"."meal_plan_meal_id")))
     JOIN "public"."meal_plans" "p" ON (("p"."id" = "m"."meal_plan_id")))
  WHERE (("mf"."id" = "meal_plan_food_substitutions"."meal_plan_food_id") AND ((("p"."patient_id" IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM "public"."user_profiles" "up"
          WHERE (("up"."id" = "p"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (("p"."patient_id" IS NULL) AND ("p"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "Access meal_plan_foods via meal_plan_meals" ON "public"."meal_plan_foods" USING ((EXISTS ( SELECT 1
   FROM ("public"."meal_plan_meals" "m"
     JOIN "public"."meal_plans" "p" ON (("p"."id" = "m"."meal_plan_id")))
  WHERE (("m"."id" = "meal_plan_foods"."meal_plan_meal_id") AND (("p"."patient_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("p"."patient_id" IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM "public"."user_profiles" "up"
          WHERE (("up"."id" = "p"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (("p"."patient_id" IS NULL) AND ("p"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."meal_plan_meals" "m"
     JOIN "public"."meal_plans" "p" ON (("p"."id" = "m"."meal_plan_id")))
  WHERE (("m"."id" = "meal_plan_foods"."meal_plan_meal_id") AND ((("p"."patient_id" IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM "public"."user_profiles" "up"
          WHERE (("up"."id" = "p"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (("p"."patient_id" IS NULL) AND ("p"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "Access meal_plan_meals via meal_plans" ON "public"."meal_plan_meals" USING ((EXISTS ( SELECT 1
   FROM "public"."meal_plans" "p"
  WHERE (("p"."id" = "meal_plan_meals"."meal_plan_id") AND (("p"."patient_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("p"."patient_id" IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM "public"."user_profiles" "up"
          WHERE (("up"."id" = "p"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (("p"."patient_id" IS NULL) AND ("p"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."meal_plans" "p"
  WHERE (("p"."id" = "meal_plan_meals"."meal_plan_id") AND ((("p"."patient_id" IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM "public"."user_profiles" "up"
          WHERE (("up"."id" = "p"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (("p"."patient_id" IS NULL) AND ("p"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "Access meal_plan_reference_values via meal_plans" ON "public"."meal_plan_reference_values" USING ((EXISTS ( SELECT 1
   FROM "public"."meal_plans" "p"
  WHERE (("p"."id" = "meal_plan_reference_values"."meal_plan_id") AND (("p"."patient_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("p"."patient_id" IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM "public"."user_profiles" "up"
          WHERE (("up"."id" = "p"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (("p"."patient_id" IS NULL) AND ("p"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."meal_plans" "p"
  WHERE (("p"."id" = "meal_plan_reference_values"."meal_plan_id") AND ((("p"."patient_id" IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM "public"."user_profiles" "up"
          WHERE (("up"."id" = "p"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (("p"."patient_id" IS NULL) AND ("p"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "Access meals for patient or nutritionist" ON "public"."meals" TO "authenticated" USING ((("patient_id" = ( SELECT "public"."auth_uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "meals"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "public"."auth_uid"() AS "uid"))))))) WITH CHECK ((("patient_id" = ( SELECT "public"."auth_uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "meals"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "public"."auth_uid"() AS "uid")))))));



CREATE POLICY "Acesso a sessoes" ON "public"."checkin_sessions" TO "authenticated" USING ((("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("patient_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Admins can delete bug reports" ON "public"."bug_reports" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("user_profiles"."is_admin" = true)))));



CREATE POLICY "Admins can update bug reports" ON "public"."bug_reports" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("user_profiles"."is_admin" = true)))));



CREATE POLICY "Admins can view all bug reports" ON "public"."bug_reports" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("user_profiles"."is_admin" = true)))));



CREATE POLICY "Chat participants can insert" ON "public"."chats" FOR INSERT TO "authenticated" WITH CHECK ((("from_id" = ( SELECT "public"."auth_uid"() AS "uid")) OR ("to_id" = ( SELECT "public"."auth_uid"() AS "uid"))));



CREATE POLICY "Chat participants can read" ON "public"."chats" FOR SELECT TO "authenticated" USING ((("from_id" = ( SELECT "public"."auth_uid"() AS "uid")) OR ("to_id" = ( SELECT "public"."auth_uid"() AS "uid"))));



CREATE POLICY "Delete branding" ON "public"."nutritionist_branding" FOR DELETE TO "authenticated" USING (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Delete fields" ON "public"."checkin_fields" FOR DELETE TO "authenticated" USING (("template_id" IN ( SELECT "checkin_templates"."id"
   FROM "public"."checkin_templates"
  WHERE ("checkin_templates"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Delete schedules" ON "public"."checkin_schedules" FOR DELETE TO "authenticated" USING (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Delete suplementos" ON "public"."supplement_logs" FOR DELETE TO "authenticated" USING (("patient_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Delete templates" ON "public"."checkin_templates" FOR DELETE TO "authenticated" USING (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Escrita branding" ON "public"."nutritionist_branding" FOR INSERT TO "authenticated" WITH CHECK (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Escrita fields" ON "public"."checkin_fields" FOR INSERT TO "authenticated" WITH CHECK (("template_id" IN ( SELECT "checkin_templates"."id"
   FROM "public"."checkin_templates"
  WHERE ("checkin_templates"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Escrita schedules" ON "public"."checkin_schedules" FOR INSERT TO "authenticated" WITH CHECK (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Escrita suplementos" ON "public"."supplement_logs" FOR INSERT TO "authenticated" WITH CHECK (("patient_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Escrita templates" ON "public"."checkin_templates" FOR INSERT TO "authenticated" WITH CHECK (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Leitura branding" ON "public"."nutritionist_branding" FOR SELECT TO "authenticated" USING ((("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("nutritionist_id" IN ( SELECT "nutritionist_patients"."nutritionist_id"
   FROM "public"."nutritionist_patients"
  WHERE ("nutritionist_patients"."patient_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Leitura fields" ON "public"."checkin_fields" FOR SELECT TO "authenticated" USING ((("template_id" IN ( SELECT "checkin_templates"."id"
   FROM "public"."checkin_templates"
  WHERE ("checkin_templates"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))) OR ("template_id" IN ( SELECT "checkin_schedules"."template_id"
   FROM "public"."checkin_schedules"
  WHERE ("checkin_schedules"."patient_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Leitura schedules" ON "public"."checkin_schedules" FOR SELECT TO "authenticated" USING ((("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("patient_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Leitura suplementos" ON "public"."supplement_logs" FOR SELECT TO "authenticated" USING ((("patient_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Leitura templates" ON "public"."checkin_templates" FOR SELECT TO "authenticated" USING ((("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("id" IN ( SELECT "checkin_schedules"."template_id"
   FROM "public"."checkin_schedules"
  WHERE ("checkin_schedules"."patient_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Nutri creates measures" ON "public"."food_measures" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("up"."user_type" = 'nutritionist'::"text")))));



CREATE POLICY "Nutri criar arquivados" ON "public"."archived_patient_links" FOR INSERT WITH CHECK (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Nutri deletar arquivados" ON "public"."archived_patient_links" FOR DELETE USING (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Nutri deletes own foods" ON "public"."nutritionist_foods" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "nutritionist_id"));



CREATE POLICY "Nutri deletes own measures" ON "public"."food_measures" FOR DELETE TO "authenticated" USING (((("nutritionist_food_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."nutritionist_foods" "nf"
  WHERE (("nf"."id" = "food_measures"."nutritionist_food_id") AND ("nf"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (("reference_food_id" IS NOT NULL) AND (( SELECT "private"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("up"."user_type" = 'nutritionist'::"text"))))))));



CREATE POLICY "Nutri manages own foods" ON "public"."nutritionist_foods" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "nutritionist_id"));



CREATE POLICY "Nutri or patient reads foods" ON "public"."nutritionist_foods" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "nutritionist_id") OR (EXISTS ( SELECT 1
   FROM "public"."nutritionist_patients" "np"
  WHERE (("np"."patient_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("np"."nutritionist_id" = "nutritionist_foods"."nutritionist_id"))))));



CREATE POLICY "Nutri updates own foods" ON "public"."nutritionist_foods" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "nutritionist_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "nutritionist_id"));



CREATE POLICY "Nutri updates own measures" ON "public"."food_measures" FOR UPDATE TO "authenticated" USING (((("nutritionist_food_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."nutritionist_foods" "nf"
  WHERE (("nf"."id" = "food_measures"."nutritionist_food_id") AND ("nf"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (("reference_food_id" IS NOT NULL) AND (( SELECT "private"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("up"."user_type" = 'nutritionist'::"text")))))))) WITH CHECK (((("nutritionist_food_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."nutritionist_foods" "nf"
  WHERE (("nf"."id" = "food_measures"."nutritionist_food_id") AND ("nf"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (("reference_food_id" IS NOT NULL) AND (( SELECT "private"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("up"."user_type" = 'nutritionist'::"text"))))))));



CREATE POLICY "Nutri ver arquivados" ON "public"."archived_patient_links" FOR SELECT USING (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Nutricionista gerencia versões dos seus planos" ON "public"."meal_plan_versions" USING ((EXISTS ( SELECT 1
   FROM "public"."meal_plans" "p"
  WHERE (("p"."id" = "meal_plan_versions"."meal_plan_id") AND (("p"."patient_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("p"."patient_id" IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM "public"."user_profiles" "up"
          WHERE (("up"."id" = "p"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (("p"."patient_id" IS NULL) AND ("p"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."meal_plans" "p"
  WHERE (("p"."id" = "meal_plan_versions"."meal_plan_id") AND ((("p"."patient_id" IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM "public"."user_profiles" "up"
          WHERE (("up"."id" = "p"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (("p"."patient_id" IS NULL) AND ("p"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "Nutricionista pode gerenciar seus templates" ON "public"."anamnesis_templates" USING (("auth"."uid"() = "nutritionist_id")) WITH CHECK ((("auth"."uid"() = "nutritionist_id") AND ("is_system_default" = false)));



CREATE POLICY "Nutricionista vê seus templates e os globais" ON "public"."anamnesis_templates" FOR SELECT USING ((("auth"."uid"() = "nutritionist_id") OR ("is_system_default" = true)));



CREATE POLICY "Nutricionistas podem atualizar cálculos dos seus pacientes" ON "public"."energy_expenditure_calculations" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "energy_expenditure_calculations"."patient_id") AND ("user_profiles"."nutritionist_id" = "public"."auth_uid"())))));



CREATE POLICY "Nutricionistas podem deletar cálculos dos seus pacientes" ON "public"."energy_expenditure_calculations" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "energy_expenditure_calculations"."patient_id") AND ("user_profiles"."nutritionist_id" = "public"."auth_uid"())))));



CREATE POLICY "Nutricionistas podem inserir cálculos para seus pacientes" ON "public"."energy_expenditure_calculations" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "energy_expenditure_calculations"."patient_id") AND ("user_profiles"."nutritionist_id" = "public"."auth_uid"())))));



CREATE POLICY "Nutricionistas podem ver cálculos dos seus pacientes" ON "public"."energy_expenditure_calculations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "energy_expenditure_calculations"."patient_id") AND ("user_profiles"."nutritionist_id" = "public"."auth_uid"())))));



CREATE POLICY "Nutricionists can create anamnesis for their patients" ON "public"."anamnesis_records" FOR INSERT WITH CHECK ((("public"."auth_uid"() = "nutritionist_id") AND ("patient_id" IN ( SELECT "user_profiles"."id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."nutritionist_id" = "public"."auth_uid"())))));



CREATE POLICY "Nutricionists can create their own templates" ON "public"."anamnesis_templates" FOR INSERT WITH CHECK (("public"."auth_uid"() = "nutritionist_id"));



CREATE POLICY "Nutricionists can delete anamnesis of their patients" ON "public"."anamnesis_records" FOR DELETE USING ((("public"."auth_uid"() = "nutritionist_id") OR ("patient_id" IN ( SELECT "user_profiles"."id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."nutritionist_id" = "public"."auth_uid"())))));



CREATE POLICY "Nutricionists can delete their own templates" ON "public"."anamnesis_templates" FOR DELETE USING ((("public"."auth_uid"() = "nutritionist_id") AND ("is_system_default" = false)));



CREATE POLICY "Nutricionists can update anamnesis of their patients" ON "public"."anamnesis_records" FOR UPDATE USING (((("public"."auth_uid"() = "nutritionist_id") OR ("patient_id" IN ( SELECT "user_profiles"."id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."nutritionist_id" = "public"."auth_uid"())))) AND ("status" <> 'awaiting_patient'::"text"))) WITH CHECK ((("public"."auth_uid"() = "nutritionist_id") OR ("patient_id" IN ( SELECT "user_profiles"."id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."nutritionist_id" = "public"."auth_uid"())))));



CREATE POLICY "Nutricionists can update their own templates" ON "public"."anamnesis_templates" FOR UPDATE USING ((("public"."auth_uid"() = "nutritionist_id") AND ("is_system_default" = false)));



CREATE POLICY "Nutricionists can view anamnesis of their patients" ON "public"."anamnesis_records" FOR SELECT USING ((("public"."auth_uid"() = "nutritionist_id") OR ("patient_id" IN ( SELECT "user_profiles"."id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."nutritionist_id" = "public"."auth_uid"())))));



CREATE POLICY "Nutricionists can view their own templates and system defaults" ON "public"."anamnesis_templates" FOR SELECT USING ((("public"."auth_uid"() = "nutritionist_id") OR ("is_system_default" = true)));



CREATE POLICY "Nutritionists can create prescriptions" ON "public"."prescriptions" FOR INSERT WITH CHECK (("private"."get_user_id"() = "nutritionist_id"));



CREATE POLICY "Nutritionists can delete patient goals" ON "public"."patient_goals" FOR DELETE USING ((("nutritionist_id" = "public"."auth_uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "public"."auth_uid"()) AND ("user_profiles"."user_type" = 'nutritionist'::"text"))))));



CREATE POLICY "Nutritionists can delete their own prescriptions" ON "public"."prescriptions" FOR DELETE TO "authenticated" USING (("private"."get_user_id"() = "nutritionist_id"));



CREATE POLICY "Nutritionists can insert activity_log for their patients" ON "public"."activity_log" FOR INSERT TO "authenticated" WITH CHECK (("patient_id" IN ( SELECT "user_profiles"."id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Nutritionists can insert patient goals" ON "public"."patient_goals" FOR INSERT WITH CHECK ((("nutritionist_id" = "public"."auth_uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "public"."auth_uid"()) AND ("user_profiles"."user_type" = 'nutritionist'::"text"))))));



CREATE POLICY "Nutritionists can read activity_log for their patients" ON "public"."activity_log" FOR SELECT TO "authenticated" USING (("patient_id" IN ( SELECT "user_profiles"."id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Nutritionists can update patient goals" ON "public"."patient_goals" FOR UPDATE USING ((("nutritionist_id" = "public"."auth_uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "public"."auth_uid"()) AND ("user_profiles"."user_type" = 'nutritionist'::"text"))))));



CREATE POLICY "Nutritionists can update their own prescriptions" ON "public"."prescriptions" FOR UPDATE TO "authenticated" USING (("private"."get_user_id"() = "nutritionist_id")) WITH CHECK (("private"."get_user_id"() = "nutritionist_id"));



CREATE POLICY "Nutritionists can view their patients meal edit history" ON "public"."meal_edit_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "p"
  WHERE (("p"."id" = "meal_edit_history"."patient_id") AND ("p"."nutritionist_id" = "public"."auth_uid"()) AND ("p"."is_active" = true)))));



CREATE POLICY "Nutritionists delete meal_plans" ON "public"."meal_plans" FOR DELETE USING (("private"."is_nutritionist"() AND ((("patient_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "meal_plans"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (("patient_id" IS NULL) AND ("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Nutritionists insert meal_plans" ON "public"."meal_plans" FOR INSERT WITH CHECK (("private"."is_nutritionist"() AND ((("patient_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "meal_plans"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (("patient_id" IS NULL) AND ("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Nutritionists manage financial_records" ON "public"."financial_records" TO "authenticated" USING (("nutritionist_id" = ( SELECT "public"."auth_uid"() AS "uid"))) WITH CHECK (("nutritionist_id" = ( SELECT "public"."auth_uid"() AS "uid")));



CREATE POLICY "Nutritionists manage financial_transactions" ON "public"."financial_transactions" TO "authenticated" USING (("nutritionist_id" = ( SELECT "public"."auth_uid"() AS "uid"))) WITH CHECK (("nutritionist_id" = ( SELECT "public"."auth_uid"() AS "uid")));



CREATE POLICY "Nutritionists manage recurring_expenses" ON "public"."recurring_expenses" TO "authenticated" USING (("nutritionist_id" = ( SELECT "public"."auth_uid"() AS "uid"))) WITH CHECK (("nutritionist_id" = ( SELECT "public"."auth_uid"() AS "uid")));



CREATE POLICY "Nutritionists manage services" ON "public"."services" TO "authenticated" USING (("nutritionist_id" = ( SELECT "public"."auth_uid"() AS "uid"))) WITH CHECK (("nutritionist_id" = ( SELECT "public"."auth_uid"() AS "uid")));



CREATE POLICY "Nutritionists update meal_plans" ON "public"."meal_plans" FOR UPDATE USING (("private"."is_nutritionist"() AND ((("patient_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "meal_plans"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (("patient_id" IS NULL) AND ("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK (("private"."is_nutritionist"() AND ((("patient_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "meal_plans"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (("patient_id" IS NULL) AND ("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Public can view all achievements definitions" ON "public"."achievements" FOR SELECT USING (true);



CREATE POLICY "Public read access" ON "public"."reference_foods" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Public read measures" ON "public"."food_measures" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Read food_household_measures" ON "public"."food_household_measures" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Read household_measures" ON "public"."household_measures" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Read meal_plans" ON "public"."meal_plans" FOR SELECT USING ((("patient_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("private"."is_nutritionist"() AND ("patient_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "meal_plans"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR ("private"."is_nutritionist"() AND ("patient_id" IS NULL) AND ("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Read patient_goals" ON "public"."patient_goals" FOR SELECT TO "authenticated" USING ((("patient_id" = "public"."auth_uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "public"."auth_uid"()) AND ("user_profiles"."user_type" = 'nutritionist'::"text") AND ("user_profiles"."id" = ( SELECT "user_profiles_1"."nutritionist_id"
           FROM "public"."user_profiles" "user_profiles_1"
          WHERE ("user_profiles_1"."id" = "patient_goals"."patient_id"))))))));



CREATE POLICY "Read user_profiles" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "public"."auth_uid"() AS "uid")) OR (( SELECT "private"."is_nutritionist"() AS "is_nutritionist") AND ("user_type" = 'patient'::"text") AND ("nutritionist_id" = ( SELECT "public"."auth_uid"() AS "uid")))));



CREATE POLICY "Service role can do everything" ON "public"."external_api_cache" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Update branding" ON "public"."nutritionist_branding" FOR UPDATE TO "authenticated" USING (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Update fields" ON "public"."checkin_fields" FOR UPDATE TO "authenticated" USING (("template_id" IN ( SELECT "checkin_templates"."id"
   FROM "public"."checkin_templates"
  WHERE ("checkin_templates"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Update schedules" ON "public"."checkin_schedules" FOR UPDATE TO "authenticated" USING (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Update suplementos" ON "public"."supplement_logs" FOR UPDATE TO "authenticated" USING (("patient_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Update templates" ON "public"."checkin_templates" FOR UPDATE TO "authenticated" USING (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can insert bug reports" ON "public"."bug_reports" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" IS NULL) OR ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users can insert meal edit history for their own meals" ON "public"."meal_edit_history" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."meals" "m"
  WHERE (("m"."id" = "meal_edit_history"."meal_id") AND ("m"."patient_id" = "private"."get_user_id"())))));



CREATE POLICY "Users can insert own profile (temporary)" ON "public"."user_profiles" FOR INSERT TO "authenticated" WITH CHECK ((("id" = ( SELECT "public"."auth_uid"() AS "uid")) AND ("user_type" = ANY (ARRAY['patient'::"text", 'nutritionist'::"text"])) AND ("is_admin" IS NOT TRUE)));



CREATE POLICY "Users can manage growth records for their patients/themselves" ON "public"."growth_records" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "p"
  WHERE (("p"."id" = "growth_records"."patient_id") AND (("p"."id" = "public"."auth_uid"()) OR ("p"."nutritionist_id" = "public"."auth_uid"())) AND ("p"."is_active" = true)))));



CREATE POLICY "Users can manage their own diet templates" ON "public"."diet_templates" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own meal template foods" ON "public"."meal_template_foods" USING ((EXISTS ( SELECT 1
   FROM "public"."meal_templates" "mt"
  WHERE (("mt"."id" = "meal_template_foods"."meal_template_id") AND ("mt"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can manage their own meal template substitutions" ON "public"."meal_template_food_substitutions" USING ((EXISTS ( SELECT 1
   FROM ("public"."meal_template_foods" "mtf"
     JOIN "public"."meal_templates" "mt" ON (("mt"."id" = "mtf"."meal_template_id")))
  WHERE (("mtf"."id" = "meal_template_food_substitutions"."template_food_id") AND ("mt"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can manage their own meal templates" ON "public"."meal_templates" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own notifications" ON "public"."notifications" USING (("private"."get_user_id"() = "user_id"));



CREATE POLICY "Users can manage their own recipe ingredients" ON "public"."recipe_ingredients" USING ((EXISTS ( SELECT 1
   FROM "public"."recipes" "r"
  WHERE (("r"."id" = "recipe_ingredients"."recipe_id") AND ("r"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can manage their own recipes" ON "public"."recipes" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own summaries" ON "public"."weekly_summaries" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "p"
  WHERE (("p"."id" = "weekly_summaries"."patient_id") AND (("p"."id" = "public"."auth_uid"()) OR ("p"."nutritionist_id" = "public"."auth_uid"())) AND ("p"."is_active" = true)))));



CREATE POLICY "Users can manage their own template foods" ON "public"."diet_template_foods" USING ((EXISTS ( SELECT 1
   FROM ("public"."diet_template_meals" "dtm"
     JOIN "public"."diet_templates" "dt" ON (("dt"."id" = "dtm"."template_id")))
  WHERE (("dtm"."id" = "diet_template_foods"."meal_id") AND ("dt"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can manage their own template meals" ON "public"."diet_template_meals" USING ((EXISTS ( SELECT 1
   FROM "public"."diet_templates" "dt"
  WHERE (("dt"."id" = "diet_template_meals"."template_id") AND ("dt"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can manage their own template substitutions" ON "public"."diet_template_food_substitutions" USING ((EXISTS ( SELECT 1
   FROM (("public"."diet_template_foods" "dtf"
     JOIN "public"."diet_template_meals" "dtm" ON (("dtm"."id" = "dtf"."meal_id")))
     JOIN "public"."diet_templates" "dt" ON (("dt"."id" = "dtm"."template_id")))
  WHERE (("dtf"."id" = "diet_template_food_substitutions"."template_food_id") AND ("dt"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can see their own prescriptions" ON "public"."prescriptions" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "p"
  WHERE ((("p"."id" = "prescriptions"."patient_id") OR ("p"."id" = "prescriptions"."nutritionist_id")) AND ("p"."id" = "public"."auth_uid"()) AND ("p"."is_active" = true)))) OR (EXISTS ( SELECT 1
   FROM ("public"."user_profiles" "p_patient"
     JOIN "public"."user_profiles" "p_nutri" ON (("p_patient"."nutritionist_id" = "p_nutri"."id")))
  WHERE (("p_patient"."id" = "prescriptions"."patient_id") AND ("p_nutri"."id" = "public"."auth_uid"()) AND ("p_patient"."is_active" = true))))));



CREATE POLICY "Users can update profile" ON "public"."user_profiles" FOR UPDATE TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR (("user_type" = 'patient'::"text") AND ("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (((("id" = ( SELECT "auth"."uid"() AS "uid")) AND (NOT ("is_admin" IS DISTINCT FROM ( SELECT "pa"."is_admin"
   FROM "private"."get_own_profile_attrs"() "pa"("is_admin", "user_type")))) AND (NOT ("user_type" IS DISTINCT FROM ( SELECT "pa"."user_type"
   FROM "private"."get_own_profile_attrs"() "pa"("is_admin", "user_type"))))) OR (("user_type" = 'patient'::"text") AND ("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Write household_measures delete (admin)" ON "public"."household_measures" FOR DELETE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "Write household_measures insert (admin)" ON "public"."household_measures" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "Write household_measures update (admin)" ON "public"."household_measures" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."achievements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."anamnesis_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."anamnesis_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "appointments_delete" ON "public"."appointments" FOR DELETE USING ((("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("patient_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."nutritionist_patients" "np"
  WHERE (("np"."patient_id" = "appointments"."patient_id") AND ("np"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "appointments"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "appointments_insert" ON "public"."appointments" FOR INSERT WITH CHECK ((("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("patient_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."nutritionist_patients" "np"
  WHERE (("np"."patient_id" = "appointments"."patient_id") AND ("np"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "appointments"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "appointments_select" ON "public"."appointments" FOR SELECT USING (((("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("patient_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."nutritionist_patients" "np"
  WHERE (("np"."patient_id" = "appointments"."patient_id") AND ("np"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "appointments"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))))))) OR ("patient_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "appointments_update" ON "public"."appointments" FOR UPDATE USING ((("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("patient_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."nutritionist_patients" "np"
  WHERE (("np"."patient_id" = "appointments"."patient_id") AND ("np"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "appointments"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))))) WITH CHECK ((("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("patient_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."nutritionist_patients" "np"
  WHERE (("np"."patient_id" = "appointments"."patient_id") AND ("np"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "appointments"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



ALTER TABLE "public"."archived_patient_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bug_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."checkin_fields" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."checkin_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."checkin_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."checkin_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."communication_automations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "communication_automations_delete_own" ON "public"."communication_automations" FOR DELETE USING (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "communication_automations_insert_own" ON "public"."communication_automations" FOR INSERT WITH CHECK (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "communication_automations_select_own" ON "public"."communication_automations" FOR SELECT USING (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "communication_automations_update_own" ON "public"."communication_automations" FOR UPDATE USING (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."diet_template_food_substitutions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."diet_template_foods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."diet_template_meals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."diet_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."energy_expenditure_calculations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."external_api_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feed_tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "feed_tasks_delete_owner" ON "public"."feed_tasks" FOR DELETE TO "authenticated" USING (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "feed_tasks_insert_owner" ON "public"."feed_tasks" FOR INSERT TO "authenticated" WITH CHECK (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "feed_tasks_select_owner" ON "public"."feed_tasks" FOR SELECT TO "authenticated" USING (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "feed_tasks_update_owner" ON "public"."feed_tasks" FOR UPDATE TO "authenticated" USING (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."financial_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."food_household_measures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."food_measures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."glycemia_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."growth_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."household_measures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lab_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lab_risk_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lab_risk_rules_delete_own" ON "public"."lab_risk_rules" FOR DELETE USING (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "lab_risk_rules_insert_own" ON "public"."lab_risk_rules" FOR INSERT WITH CHECK (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "lab_risk_rules_select_scoped" ON "public"."lab_risk_rules" FOR SELECT USING ((("nutritionist_id" IS NULL) OR ("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "lab_risk_rules_update_own" ON "public"."lab_risk_rules" FOR UPDATE USING (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."meal_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_edit_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_plan_food_substitutions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_plan_foods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_plan_meals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_plan_reference_values" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_plan_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_template_food_substitutions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_template_foods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "message_templates_delete_own" ON "public"."message_templates" FOR DELETE TO "authenticated" USING (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "message_templates_insert_own" ON "public"."message_templates" FOR INSERT TO "authenticated" WITH CHECK (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "message_templates_select" ON "public"."message_templates" FOR SELECT TO "authenticated" USING ((("nutritionist_id" IS NULL) OR ("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "message_templates_update_own" ON "public"."message_templates" FOR UPDATE TO "authenticated" USING (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."notification_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_rules_delete_owner_or_admin" ON "public"."notification_rules" FOR DELETE TO "authenticated" USING ((("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."is_admin"() AS "is_admin")));



CREATE POLICY "notification_rules_insert_owner_or_admin" ON "public"."notification_rules" FOR INSERT TO "authenticated" WITH CHECK ((("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."is_admin"() AS "is_admin")));



CREATE POLICY "notification_rules_select_owner_or_global" ON "public"."notification_rules" FOR SELECT TO "authenticated" USING ((("nutritionist_id" IS NULL) OR ("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."is_admin"() AS "is_admin")));



CREATE POLICY "notification_rules_update_owner_or_admin" ON "public"."notification_rules" FOR UPDATE TO "authenticated" USING ((("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."is_admin"() AS "is_admin")));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nutritionist_branding" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nutritionist_custom_measures" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nutritionist_custom_measures_delete" ON "public"."nutritionist_custom_measures" FOR DELETE USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "nutritionist_custom_measures_insert" ON "public"."nutritionist_custom_measures" FOR INSERT WITH CHECK ((("auth"."uid"() = "nutritionist_id") AND (( SELECT "count"(*) AS "count"
   FROM "public"."nutritionist_custom_measures" "nutritionist_custom_measures_1"
  WHERE ("nutritionist_custom_measures_1"."nutritionist_id" = "auth"."uid"())) < 20)));



CREATE POLICY "nutritionist_custom_measures_select" ON "public"."nutritionist_custom_measures" FOR SELECT USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "nutritionist_custom_measures_update" ON "public"."nutritionist_custom_measures" FOR UPDATE USING (("auth"."uid"() = "nutritionist_id")) WITH CHECK (("auth"."uid"() = "nutritionist_id"));



ALTER TABLE "public"."nutritionist_foods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nutritionist_patients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nutritionist_patients_delete_own" ON "public"."nutritionist_patients" FOR DELETE TO "authenticated" USING (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "nutritionist_patients_insert_own" ON "public"."nutritionist_patients" FOR INSERT TO "authenticated" WITH CHECK (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "nutritionist_patients_select" ON "public"."nutritionist_patients" FOR SELECT TO "authenticated" USING ((("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("patient_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "nutritionist_patients_update_own" ON "public"."nutritionist_patients" FOR UPDATE TO "authenticated" USING (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "operational_observability_insert_authenticated" ON "public"."operational_observability_log" FOR INSERT TO "authenticated" WITH CHECK ((("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."is_admin"() AS "is_admin")));



ALTER TABLE "public"."operational_observability_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "operational_observability_select_scoped" ON "public"."operational_observability_log" FOR SELECT TO "authenticated" USING ((("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."is_admin"() AS "is_admin")));



ALTER TABLE "public"."patient_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patient_module_sync_flags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "patient_module_sync_flags_delete_nutritionist" ON "public"."patient_module_sync_flags" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "patient_module_sync_flags"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "patient_module_sync_flags_insert_nutritionist" ON "public"."patient_module_sync_flags" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "patient_module_sync_flags"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "patient_module_sync_flags_select_involved" ON "public"."patient_module_sync_flags" FOR SELECT TO "authenticated" USING ((("patient_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "patient_module_sync_flags"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "patient_module_sync_flags_update_nutritionist_only" ON "public"."patient_module_sync_flags" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "patient_module_sync_flags"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "patient_module_sync_flags"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."patient_reminder_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "patient_reminder_preferences_insert_own" ON "public"."patient_reminder_preferences" FOR INSERT WITH CHECK (("patient_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "patient_reminder_preferences_select_own" ON "public"."patient_reminder_preferences" FOR SELECT USING (("patient_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "patient_reminder_preferences_update_own" ON "public"."patient_reminder_preferences" FOR UPDATE USING (("patient_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("patient_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."prescriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."progress_photos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "progress_photos_delete" ON "public"."progress_photos" FOR DELETE TO "authenticated" USING ((("patient_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "p"
  WHERE (("p"."id" = "progress_photos"."patient_id") AND ("p"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "progress_photos_insert" ON "public"."progress_photos" FOR INSERT TO "authenticated" WITH CHECK ((("patient_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "p"
  WHERE (("p"."id" = "progress_photos"."patient_id") AND ("p"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "progress_photos_select" ON "public"."progress_photos" FOR SELECT TO "authenticated" USING ((("patient_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "p"
  WHERE (("p"."id" = "progress_photos"."patient_id") AND ("p"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "progress_photos_update" ON "public"."progress_photos" FOR UPDATE TO "authenticated" USING ((("patient_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "p"
  WHERE (("p"."id" = "progress_photos"."patient_id") AND ("p"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK ((("patient_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "p"
  WHERE (("p"."id" = "progress_photos"."patient_id") AND ("p"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."recipe_ingredients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recurring_expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reference_foods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reminder_delivery_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reminder_delivery_log_insert_service_role" ON "public"."reminder_delivery_log" FOR INSERT WITH CHECK ((("patient_id" IS NOT NULL) AND ("reminder_type" = ANY (ARRAY['daily_log_reminder'::"text", 'measurement_reminder'::"text"])) AND ("delivery_channel" = 'in_app'::"text")));



CREATE POLICY "reminder_delivery_log_select" ON "public"."reminder_delivery_log" FOR SELECT USING ((("patient_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "reminder_delivery_log"."patient_id") AND ("up"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."supplement_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."template_dispatch_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "template_dispatch_log_insert_own" ON "public"."template_dispatch_log" FOR INSERT TO "authenticated" WITH CHECK (("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "template_dispatch_log_select_scoped" ON "public"."template_dispatch_log" FOR SELECT TO "authenticated" USING ((("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("patient_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."user_achievements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_achievements_select" ON "public"."user_achievements" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."nutritionist_patients" "np"
  WHERE (("np"."nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("np"."patient_id" = "user_achievements"."user_id"))))));



ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_summaries" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "private" TO "anon";
GRANT USAGE ON SCHEMA "private" TO "authenticated";
GRANT USAGE ON SCHEMA "private" TO "service_role";



REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT ALL ON SCHEMA "public" TO PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "private"."add_patient_xp"("p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_xp" integer, "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "private"."add_patient_xp"("p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_xp" integer, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."add_patient_xp"("p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_xp" integer, "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "private"."approve_patient_link"("p_patient_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "private"."approve_patient_link"("p_patient_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."approve_patient_link"("p_patient_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "private"."check_and_grant_achievements"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "private"."check_and_grant_achievements"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."check_and_grant_achievements"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "private"."check_is_admin"() TO "anon";
GRANT ALL ON FUNCTION "private"."check_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."check_is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "private"."clear_message_notifications_from_sender"("p_sender_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "private"."clear_message_notifications_from_sender"("p_sender_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."clear_message_notifications_from_sender"("p_sender_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "private"."clone_diet_template_to_patient"("p_template_id" "uuid", "p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."clone_diet_template_to_patient"("p_template_id" "uuid", "p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_name" "text") TO "service_role";
GRANT ALL ON FUNCTION "private"."clone_diet_template_to_patient"("p_template_id" "uuid", "p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_name" "text") TO "anon";



GRANT ALL ON FUNCTION "private"."clone_meal_template_to_plan"("p_meal_template_id" "uuid", "p_meal_plan_id" bigint, "p_meal_type" "text", "p_meal_time" time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "private"."clone_meal_template_to_plan"("p_meal_template_id" "uuid", "p_meal_plan_id" bigint, "p_meal_type" "text", "p_meal_time" time without time zone) TO "service_role";
GRANT ALL ON FUNCTION "private"."clone_meal_template_to_plan"("p_meal_template_id" "uuid", "p_meal_plan_id" bigint, "p_meal_type" "text", "p_meal_time" time without time zone) TO "anon";



GRANT ALL ON FUNCTION "private"."create_appointment_reminders"() TO "anon";
GRANT ALL ON FUNCTION "private"."create_appointment_reminders"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."create_appointment_reminders"() TO "service_role";



GRANT ALL ON FUNCTION "private"."create_daily_log_reminders"() TO "anon";
GRANT ALL ON FUNCTION "private"."create_daily_log_reminders"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."create_daily_log_reminders"() TO "service_role";



GRANT ALL ON FUNCTION "private"."create_notification"("p_user_id" "uuid", "p_type" "text", "p_title" "text", "p_message" "text", "p_link_url" "text", "p_content" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "private"."create_notification"("p_user_id" "uuid", "p_type" "text", "p_title" "text", "p_message" "text", "p_link_url" "text", "p_content" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "private"."create_notification"("p_user_id" "uuid", "p_type" "text", "p_title" "text", "p_message" "text", "p_link_url" "text", "p_content" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "private"."create_summary_notification"() TO "anon";
GRANT ALL ON FUNCTION "private"."create_summary_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."create_summary_notification"() TO "service_role";



GRANT ALL ON FUNCTION "private"."delete_patient"("patient_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "private"."delete_patient"("patient_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."delete_patient"("patient_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "private"."get_admin_dashboard_stats"() TO "anon";
GRANT ALL ON FUNCTION "private"."get_admin_dashboard_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."get_admin_dashboard_stats"() TO "service_role";



GRANT ALL ON FUNCTION "private"."get_chat_recipient_profile"("recipient_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "private"."get_chat_recipient_profile"("recipient_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."get_chat_recipient_profile"("recipient_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "private"."get_comprehensive_activity_feed_optimized"("p_nutritionist_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "private"."get_comprehensive_activity_feed_optimized"("p_nutritionist_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "private"."get_comprehensive_activity_feed_optimized"("p_nutritionist_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "private"."get_daily_adherence"("p_nutritionist_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "private"."get_daily_adherence"("p_nutritionist_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."get_daily_adherence"("p_nutritionist_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "private"."get_financial_summary"("start_date" "date", "end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "private"."get_financial_summary"("start_date" "date", "end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "private"."get_financial_summary"("start_date" "date", "end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "private"."get_invite_details"("p_invite_code" "text") TO "anon";
GRANT ALL ON FUNCTION "private"."get_invite_details"("p_invite_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."get_invite_details"("p_invite_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "private"."get_meal_plan_with_foods_optimized"("p_meal_plan_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "private"."get_meal_plan_with_foods_optimized"("p_meal_plan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."get_meal_plan_with_foods_optimized"("p_meal_plan_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "private"."get_nutritionist_conversations"("p_nutritionist_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "private"."get_nutritionist_conversations"("p_nutritionist_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."get_nutritionist_conversations"("p_nutritionist_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "private"."get_nutritionist_detail"("p_nutritionist_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "private"."get_nutritionist_detail"("p_nutritionist_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."get_nutritionist_detail"("p_nutritionist_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "private"."get_nutritionists_list"() TO "anon";
GRANT ALL ON FUNCTION "private"."get_nutritionists_list"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."get_nutritionists_list"() TO "service_role";



GRANT ALL ON FUNCTION "private"."get_operational_health_summary"("p_nutritionist_id" "uuid", "p_window_hours" integer) TO "anon";
GRANT ALL ON FUNCTION "private"."get_operational_health_summary"("p_nutritionist_id" "uuid", "p_window_hours" integer) TO "authenticated";
GRANT ALL ON FUNCTION "private"."get_operational_health_summary"("p_nutritionist_id" "uuid", "p_window_hours" integer) TO "service_role";



GRANT ALL ON FUNCTION "private"."get_own_profile_attrs"() TO "anon";
GRANT ALL ON FUNCTION "private"."get_own_profile_attrs"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."get_own_profile_attrs"() TO "service_role";



GRANT ALL ON FUNCTION "private"."get_patients_for_new_chat"("p_nutritionist_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "private"."get_patients_for_new_chat"("p_nutritionist_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."get_patients_for_new_chat"("p_nutritionist_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "private"."get_patients_low_adherence_optimized"("p_nutritionist_id" "uuid", "p_days_threshold" integer) TO "anon";
GRANT ALL ON FUNCTION "private"."get_patients_low_adherence_optimized"("p_nutritionist_id" "uuid", "p_days_threshold" integer) TO "authenticated";
GRANT ALL ON FUNCTION "private"."get_patients_low_adherence_optimized"("p_nutritionist_id" "uuid", "p_days_threshold" integer) TO "service_role";



GRANT ALL ON FUNCTION "private"."get_patients_pending_data_optimized"("p_nutritionist_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "private"."get_patients_pending_data_optimized"("p_nutritionist_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."get_patients_pending_data_optimized"("p_nutritionist_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "private"."get_system_live_logs"("limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "private"."get_system_live_logs"("limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "private"."get_system_live_logs"("limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "private"."get_tcc_study_metrics"() TO "anon";
GRANT ALL ON FUNCTION "private"."get_tcc_study_metrics"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."get_tcc_study_metrics"() TO "service_role";



GRANT ALL ON FUNCTION "private"."get_user_id"() TO "anon";
GRANT ALL ON FUNCTION "private"."get_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."get_user_id"() TO "service_role";



GRANT ALL ON FUNCTION "private"."handle_new_chat_message_notification"() TO "anon";
GRANT ALL ON FUNCTION "private"."handle_new_chat_message_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."handle_new_chat_message_notification"() TO "service_role";



GRANT ALL ON FUNCTION "private"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "private"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "private"."increment_checkin_streak"("p_patient_id" "uuid", "p_nutritionist_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "private"."increment_checkin_streak"("p_patient_id" "uuid", "p_nutritionist_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."increment_checkin_streak"("p_patient_id" "uuid", "p_nutritionist_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "private"."interact_notification"("p_notification_id" "uuid", "p_delete_if_message" boolean) TO "anon";
GRANT ALL ON FUNCTION "private"."interact_notification"("p_notification_id" "uuid", "p_delete_if_message" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "private"."interact_notification"("p_notification_id" "uuid", "p_delete_if_message" boolean) TO "service_role";



GRANT ALL ON FUNCTION "private"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "private"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "private"."is_nutritionist"() TO "anon";
GRANT ALL ON FUNCTION "private"."is_nutritionist"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."is_nutritionist"() TO "service_role";



GRANT ALL ON FUNCTION "private"."is_patient"() TO "anon";
GRANT ALL ON FUNCTION "private"."is_patient"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."is_patient"() TO "service_role";



GRANT ALL ON FUNCTION "private"."log_activity_event"("p_event_name" "text", "p_event_version" integer, "p_source_module" "text", "p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "private"."log_activity_event"("p_event_name" "text", "p_event_version" integer, "p_source_module" "text", "p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "private"."log_activity_event"("p_event_name" "text", "p_event_version" integer, "p_source_module" "text", "p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "private"."log_bug_report"("p_error_type" character varying, "p_error_message" "text", "p_stack_trace" "text", "p_route" "text", "p_user_id" "uuid", "p_user_email" "text", "p_user_name" "text", "p_user_type" character varying, "p_user_agent" "text", "p_console_log" "jsonb", "p_metadata" "jsonb", "p_component_stack" "text", "p_source_file" "text", "p_line_number" integer, "p_column_number" integer) TO "anon";
GRANT ALL ON FUNCTION "private"."log_bug_report"("p_error_type" character varying, "p_error_message" "text", "p_stack_trace" "text", "p_route" "text", "p_user_id" "uuid", "p_user_email" "text", "p_user_name" "text", "p_user_type" character varying, "p_user_agent" "text", "p_console_log" "jsonb", "p_metadata" "jsonb", "p_component_stack" "text", "p_source_file" "text", "p_line_number" integer, "p_column_number" integer) TO "authenticated";
GRANT ALL ON FUNCTION "private"."log_bug_report"("p_error_type" character varying, "p_error_message" "text", "p_stack_trace" "text", "p_route" "text", "p_user_id" "uuid", "p_user_email" "text", "p_user_name" "text", "p_user_type" character varying, "p_user_agent" "text", "p_console_log" "jsonb", "p_metadata" "jsonb", "p_component_stack" "text", "p_source_file" "text", "p_line_number" integer, "p_column_number" integer) TO "service_role";



GRANT ALL ON FUNCTION "private"."log_meal_action"("p_patient_id" "uuid", "p_meal_id" bigint, "p_action" "text", "p_meal_type" "text", "p_meal_date" "date", "p_meal_time" time without time zone, "p_details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "private"."log_meal_action"("p_patient_id" "uuid", "p_meal_id" bigint, "p_action" "text", "p_meal_type" "text", "p_meal_date" "date", "p_meal_time" time without time zone, "p_details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "private"."log_meal_action"("p_patient_id" "uuid", "p_meal_id" bigint, "p_action" "text", "p_meal_type" "text", "p_meal_date" "date", "p_meal_time" time without time zone, "p_details" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "private"."log_meal_action_secure"("p_meal_id" "text", "p_action" "text", "p_details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "private"."log_meal_action_secure"("p_meal_id" "text", "p_action" "text", "p_details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "private"."log_meal_action_secure"("p_meal_id" "text", "p_action" "text", "p_details" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "private"."log_operational_event"("p_module" "text", "p_operation" "text", "p_event_type" "text", "p_latency_ms" integer, "p_nutritionist_id" "uuid", "p_patient_id" "uuid", "p_error_message" "text", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "private"."log_operational_event"("p_module" "text", "p_operation" "text", "p_event_type" "text", "p_latency_ms" integer, "p_nutritionist_id" "uuid", "p_patient_id" "uuid", "p_error_message" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "private"."log_operational_event"("p_module" "text", "p_operation" "text", "p_event_type" "text", "p_latency_ms" integer, "p_nutritionist_id" "uuid", "p_patient_id" "uuid", "p_error_message" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "private"."process_patient_reminders"("p_patient_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "private"."process_patient_reminders"("p_patient_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."process_patient_reminders"("p_patient_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "private"."promote_draft_to_active"("p_draft_id" bigint, "p_patient_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "private"."promote_draft_to_active"("p_draft_id" bigint, "p_patient_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."promote_draft_to_active"("p_draft_id" bigint, "p_patient_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "private"."redeem_invite_code"("input_code" "text") TO "anon";
GRANT ALL ON FUNCTION "private"."redeem_invite_code"("input_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."redeem_invite_code"("input_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "private"."reject_patient_link"("p_patient_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "private"."reject_patient_link"("p_patient_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."reject_patient_link"("p_patient_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "private"."set_active_meal_plan"("p_plan_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "private"."set_active_meal_plan"("p_plan_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "private"."set_active_meal_plan"("p_plan_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "private"."soft_delete_meal"("p_meal_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "private"."soft_delete_meal"("p_meal_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "private"."soft_delete_meal"("p_meal_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "private"."sync_notification_read_state"() TO "anon";
GRANT ALL ON FUNCTION "private"."sync_notification_read_state"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."sync_notification_read_state"() TO "service_role";



GRANT ALL ON FUNCTION "private"."transition_appointment_status"("p_appointment_id" bigint, "p_next_status" "text", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "private"."transition_appointment_status"("p_appointment_id" bigint, "p_next_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."transition_appointment_status"("p_appointment_id" bigint, "p_next_status" "text", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "private"."transition_appointment_status"("p_appointment_id" "uuid", "p_next_status" "text", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "private"."transition_appointment_status"("p_appointment_id" "uuid", "p_next_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."transition_appointment_status"("p_appointment_id" "uuid", "p_next_status" "text", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "private"."upsert_full_meal_plan"("p_plan_id" bigint, "p_plan_data" "jsonb", "p_meals" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "private"."upsert_full_meal_plan"("p_plan_id" bigint, "p_plan_data" "jsonb", "p_meals" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "private"."upsert_full_meal_plan"("p_plan_id" bigint, "p_plan_data" "jsonb", "p_meals" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."_validate_growth_record_json_section"("p_section" "jsonb", "p_section_name" "text", "p_default_min" numeric, "p_default_max" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."_validate_growth_record_json_section"("p_section" "jsonb", "p_section_name" "text", "p_default_min" numeric, "p_default_max" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_validate_growth_record_json_section"("p_section" "jsonb", "p_section_name" "text", "p_default_min" numeric, "p_default_max" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."add_patient_xp"("p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_xp" integer, "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_patient_xp"("p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_xp" integer, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_patient_xp"("p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_xp" integer, "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_patient_link"("p_patient_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_patient_link"("p_patient_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_patient_link"("p_patient_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_setting"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."auth_setting"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_setting"("p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_uid"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_uid"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_uid"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_goal_progress"("goal_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_goal_progress"("goal_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_goal_progress"("goal_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_lab_status"("test_value_text" "text", "ref_min" numeric, "ref_max" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_lab_status"("test_value_text" "text", "ref_min" numeric, "ref_max" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_lab_status"("test_value_text" "text", "ref_min" numeric, "ref_max" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_macro_targets"("p_meal_plan_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_macro_targets"("p_meal_plan_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_macro_targets"("p_meal_plan_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_net_amount"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_net_amount"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_net_amount"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_delete_user"("p_target_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_delete_user"("p_target_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_delete_user"("p_target_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_and_grant_achievements"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_and_grant_achievements"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_and_grant_achievements"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."clear_message_notifications_from_sender"("p_sender_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."clear_message_notifications_from_sender"("p_sender_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_message_notifications_from_sender"("p_sender_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."clone_diet_template_to_patient"("p_template_id" "uuid", "p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."clone_diet_template_to_patient"("p_template_id" "uuid", "p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clone_diet_template_to_patient"("p_template_id" "uuid", "p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."clone_meal_template_to_plan"("p_meal_template_id" "uuid", "p_meal_plan_id" bigint, "p_meal_type" "text", "p_meal_time" time without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."clone_meal_template_to_plan"("p_meal_template_id" "uuid", "p_meal_plan_id" bigint, "p_meal_type" "text", "p_meal_time" time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."clone_meal_template_to_plan"("p_meal_template_id" "uuid", "p_meal_plan_id" bigint, "p_meal_type" "text", "p_meal_time" time without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."convert_custom_measure_to_grams"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_custom_measure_to_grams"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_appointment_reminders"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_appointment_reminders"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_appointment_reminders"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_daily_log_reminders"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_daily_log_reminders"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_daily_log_reminders"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_diet_template"("p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_tags" "text"[], "p_meals" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_diet_template"("p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_tags" "text"[], "p_meals" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_diet_template"("p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_tags" "text"[], "p_meals" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_diet_template"("p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_tags" "jsonb", "p_meals" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_diet_template"("p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_tags" "jsonb", "p_meals" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_diet_template"("p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_tags" "jsonb", "p_meals" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_type" "text", "p_title" "text", "p_message" "text", "p_link_url" "text", "p_content" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_type" "text", "p_title" "text", "p_message" "text", "p_link_url" "text", "p_content" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_type" "text", "p_title" "text", "p_message" "text", "p_link_url" "text", "p_content" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_patient"("patient_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_patient"("patient_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_patient"("patient_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_read_notifications"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_read_notifications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_read_notifications"() TO "service_role";



GRANT ALL ON FUNCTION "public"."extract_and_inject_clinical_flags"("p_record_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."extract_and_inject_clinical_flags"("p_record_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."extract_and_inject_clinical_flags"("p_record_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_anamnesis_link"("p_record_id" "uuid", "p_nutritionist_id" "uuid", "p_expires_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_anamnesis_link"("p_record_id" "uuid", "p_nutritionist_id" "uuid", "p_expires_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_anamnesis_link"("p_record_id" "uuid", "p_nutritionist_id" "uuid", "p_expires_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_random_invite_code"("length" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_random_invite_code"("length" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_random_invite_code"("length" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_unique_invite_code"("col_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_unique_invite_code"("col_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_unique_invite_code"("col_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_dashboard_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_dashboard_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_dashboard_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_anamnesis_by_token"("p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_anamnesis_by_token"("p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_anamnesis_by_token"("p_token" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_anthropometry_longitudinal_score"("p_patient_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_anthropometry_longitudinal_score"("p_patient_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_anthropometry_longitudinal_score"("p_patient_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_chat_recipient_profile"("recipient_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_chat_recipient_profile"("recipient_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_chat_recipient_profile"("recipient_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_comprehensive_activity_feed_optimized"("p_nutritionist_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_comprehensive_activity_feed_optimized"("p_nutritionist_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_comprehensive_activity_feed_optimized"("p_nutritionist_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_daily_adherence"("p_nutritionist_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_daily_adherence"("p_nutritionist_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_daily_adherence"("p_nutritionist_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_financial_summary"("start_date" "date", "end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_financial_summary"("start_date" "date", "end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_financial_summary"("start_date" "date", "end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_food_stats"("p_nutritionist_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_food_stats"("p_nutritionist_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_food_stats"("p_nutritionist_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_formatted_address"("address_jsonb" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."get_formatted_address"("address_jsonb" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_formatted_address"("address_jsonb" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_grams_from_measure"("p_food_id" bigint, "p_measure_code" "text", "p_quantity" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."get_grams_from_measure"("p_food_id" bigint, "p_measure_code" "text", "p_quantity" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_grams_from_measure"("p_food_id" bigint, "p_measure_code" "text", "p_quantity" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_invite_details"("p_invite_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_invite_details"("p_invite_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_invite_details"("p_invite_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_meal_plan_with_foods_optimized"("p_meal_plan_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_meal_plan_with_foods_optimized"("p_meal_plan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_meal_plan_with_foods_optimized"("p_meal_plan_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_nutritionist_conversations"("p_nutritionist_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_nutritionist_conversations"("p_nutritionist_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_nutritionist_conversations"("p_nutritionist_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_nutritionist_detail"("p_nutritionist_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_nutritionist_detail"("p_nutritionist_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_nutritionist_detail"("p_nutritionist_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_nutritionists_list"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_nutritionists_list"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_nutritionists_list"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_operational_health_summary"("p_nutritionist_id" "uuid", "p_window_hours" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_operational_health_summary"("p_nutritionist_id" "uuid", "p_window_hours" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_operational_health_summary"("p_nutritionist_id" "uuid", "p_window_hours" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_own_profile_attrs"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_own_profile_attrs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_own_profile_attrs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_patients_for_new_chat"("p_nutritionist_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_patients_for_new_chat"("p_nutritionist_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_patients_for_new_chat"("p_nutritionist_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_patients_low_adherence_optimized"("p_nutritionist_id" "uuid", "p_days_threshold" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_patients_low_adherence_optimized"("p_nutritionist_id" "uuid", "p_days_threshold" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_patients_low_adherence_optimized"("p_nutritionist_id" "uuid", "p_days_threshold" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_patients_pending_data_optimized"("p_nutritionist_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_patients_pending_data_optimized"("p_nutritionist_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_patients_pending_data_optimized"("p_nutritionist_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_recent_patient_activity"("nutritionist_id_param" "uuid", "limit_param" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_recent_patient_activity"("nutritionist_id_param" "uuid", "limit_param" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_recent_patient_activity"("nutritionist_id_param" "uuid", "limit_param" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_system_live_logs"("limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_system_live_logs"("limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_system_live_logs"("limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tcc_study_metrics"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_tcc_study_metrics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tcc_study_metrics"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_unread_senders"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_unread_senders"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unread_senders"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_checkin_streak"("p_patient_id" "uuid", "p_nutritionist_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_checkin_streak"("p_patient_id" "uuid", "p_nutritionist_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_checkin_streak"("p_patient_id" "uuid", "p_nutritionist_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."interact_notification"("p_notification_id" "uuid", "p_delete_if_message" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."interact_notification"("p_notification_id" "uuid", "p_delete_if_message" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."interact_notification"("p_notification_id" "uuid", "p_delete_if_message" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_nutritionist"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_nutritionist"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_nutritionist"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_patient"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_patient"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_patient"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_activity_event"("p_event_name" "text", "p_event_version" integer, "p_source_module" "text", "p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_activity_event"("p_event_name" "text", "p_event_version" integer, "p_source_module" "text", "p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_activity_event"("p_event_name" "text", "p_event_version" integer, "p_source_module" "text", "p_patient_id" "uuid", "p_nutritionist_id" "uuid", "p_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_bug_report"("p_error_type" character varying, "p_error_message" "text", "p_stack_trace" "text", "p_route" "text", "p_user_id" "uuid", "p_user_email" "text", "p_user_name" "text", "p_user_type" character varying, "p_user_agent" "text", "p_console_log" "jsonb", "p_metadata" "jsonb", "p_component_stack" "text", "p_source_file" "text", "p_line_number" integer, "p_column_number" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."log_bug_report"("p_error_type" character varying, "p_error_message" "text", "p_stack_trace" "text", "p_route" "text", "p_user_id" "uuid", "p_user_email" "text", "p_user_name" "text", "p_user_type" character varying, "p_user_agent" "text", "p_console_log" "jsonb", "p_metadata" "jsonb", "p_component_stack" "text", "p_source_file" "text", "p_line_number" integer, "p_column_number" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_bug_report"("p_error_type" character varying, "p_error_message" "text", "p_stack_trace" "text", "p_route" "text", "p_user_id" "uuid", "p_user_email" "text", "p_user_name" "text", "p_user_type" character varying, "p_user_agent" "text", "p_console_log" "jsonb", "p_metadata" "jsonb", "p_component_stack" "text", "p_source_file" "text", "p_line_number" integer, "p_column_number" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."log_meal_action"("p_patient_id" "uuid", "p_meal_id" bigint, "p_action" "text", "p_meal_type" "text", "p_meal_date" "date", "p_meal_time" time without time zone, "p_details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_meal_action"("p_patient_id" "uuid", "p_meal_id" bigint, "p_action" "text", "p_meal_type" "text", "p_meal_date" "date", "p_meal_time" time without time zone, "p_details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_meal_action"("p_patient_id" "uuid", "p_meal_id" bigint, "p_action" "text", "p_meal_type" "text", "p_meal_date" "date", "p_meal_time" time without time zone, "p_details" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_meal_action_secure"("p_meal_id" "text", "p_action" "text", "p_details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_meal_action_secure"("p_meal_id" "text", "p_action" "text", "p_details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_meal_action_secure"("p_meal_id" "text", "p_action" "text", "p_details" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_meal_edit"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_meal_edit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_meal_edit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_operational_event"("p_module" "text", "p_operation" "text", "p_event_type" "text", "p_latency_ms" integer, "p_nutritionist_id" "uuid", "p_patient_id" "uuid", "p_error_message" "text", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_operational_event"("p_module" "text", "p_operation" "text", "p_event_type" "text", "p_latency_ms" integer, "p_nutritionist_id" "uuid", "p_patient_id" "uuid", "p_error_message" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_operational_event"("p_module" "text", "p_operation" "text", "p_event_type" "text", "p_latency_ms" integer, "p_nutritionist_id" "uuid", "p_patient_id" "uuid", "p_error_message" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_chat_notifications_as_read"("p_user_id" "uuid", "p_sender_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_chat_notifications_as_read"("p_user_id" "uuid", "p_sender_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_chat_notifications_as_read"("p_user_id" "uuid", "p_sender_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_messages_as_read"("p_user_id" "uuid", "p_sender_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_messages_as_read"("p_user_id" "uuid", "p_sender_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_messages_as_read"("p_user_id" "uuid", "p_sender_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_nutritionist_anamnesis_completed"("p_record_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."notify_nutritionist_anamnesis_completed"("p_record_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_nutritionist_anamnesis_completed"("p_record_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_patient_reminders"("p_patient_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."process_patient_reminders"("p_patient_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_patient_reminders"("p_patient_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."promote_draft_to_active"("p_draft_id" bigint, "p_patient_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."promote_draft_to_active"("p_draft_id" bigint, "p_patient_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."promote_draft_to_active"("p_draft_id" bigint, "p_patient_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."redeem_invite_code"("input_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."redeem_invite_code"("input_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_invite_code"("input_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_patient_link"("p_patient_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_patient_link"("p_patient_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_patient_link"("p_patient_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."search_foods"("p_search_term" "text", "p_limit" integer, "p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_foods"("p_search_term" "text", "p_limit" integer, "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_foods"("p_search_term" "text", "p_limit" integer, "p_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_active_meal_plan"("p_plan_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."set_active_meal_plan"("p_plan_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_active_meal_plan"("p_plan_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_communication_automations_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_communication_automations_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_communication_automations_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_lab_risk_rules_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_lab_risk_rules_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_lab_risk_rules_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_message_templates_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_message_templates_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_message_templates_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_patient_reminder_preferences_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_patient_reminder_preferences_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_patient_reminder_preferences_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at_ncm"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at_ncm"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at_ncm"() TO "service_role";



GRANT ALL ON FUNCTION "public"."slugify_name"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."slugify_name"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."slugify_name"("p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."soft_delete_meal"("p_meal_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."soft_delete_meal"("p_meal_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."soft_delete_meal"("p_meal_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_anamnesis_by_token"("p_token" "uuid", "p_content" "jsonb", "p_status" "text", "p_lgpd_consented" boolean, "p_ip" "text", "p_clinical_flags" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_anamnesis_by_token"("p_token" "uuid", "p_content" "jsonb", "p_status" "text", "p_lgpd_consented" boolean, "p_ip" "text", "p_clinical_flags" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_anamnesis_by_token"("p_token" "uuid", "p_content" "jsonb", "p_status" "text", "p_lgpd_consented" boolean, "p_ip" "text", "p_clinical_flags" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_anthropometry_on_profile_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_anthropometry_on_profile_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_anthropometry_on_profile_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."transition_appointment_status"("p_appointment_id" bigint, "p_next_status" "text", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."transition_appointment_status"("p_appointment_id" bigint, "p_next_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transition_appointment_status"("p_appointment_id" bigint, "p_next_status" "text", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."transition_appointment_status"("p_appointment_id" "uuid", "p_next_status" "text", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."transition_appointment_status"("p_appointment_id" "uuid", "p_next_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transition_appointment_status"("p_appointment_id" "uuid", "p_next_status" "text", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_growth_records_apply_versioning"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_growth_records_apply_versioning"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_growth_records_apply_versioning"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_growth_records_mark_previous_not_latest"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_growth_records_mark_previous_not_latest"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_growth_records_mark_previous_not_latest"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_growth_records_sync_modules"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_growth_records_sync_modules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_growth_records_sync_modules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_growth_records_validate_clinical"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_growth_records_validate_clinical"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_growth_records_validate_clinical"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_set_invite_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_set_invite_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_set_invite_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_bug_reports_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_bug_reports_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_bug_reports_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_diet_template"("p_template_id" "uuid", "p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_tags" "text"[], "p_meals" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_diet_template"("p_template_id" "uuid", "p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_tags" "text"[], "p_meals" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_diet_template"("p_template_id" "uuid", "p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_tags" "text"[], "p_meals" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_diet_template"("p_template_id" "uuid", "p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_tags" "jsonb", "p_meals" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_diet_template"("p_template_id" "uuid", "p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_tags" "jsonb", "p_meals" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_diet_template"("p_template_id" "uuid", "p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_tags" "jsonb", "p_meals" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_energy_calc_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_energy_calc_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_energy_calc_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_foods_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_foods_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_foods_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_lab_results_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_lab_results_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_lab_results_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_meal_plan_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_meal_plan_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_meal_plan_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_modified_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_modified_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_modified_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_patient_goals_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_patient_goals_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_patient_goals_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_reference_values_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_reference_values_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_reference_values_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_full_meal_plan"("p_plan_id" bigint, "p_plan_data" "jsonb", "p_meals" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_full_meal_plan"("p_plan_id" bigint, "p_plan_data" "jsonb", "p_meals" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_full_meal_plan"("p_plan_id" bigint, "p_plan_data" "jsonb", "p_meals" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_profiles_sync_slug"() TO "anon";
GRANT ALL ON FUNCTION "public"."user_profiles_sync_slug"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_profiles_sync_slug"() TO "service_role";



GRANT ALL ON TABLE "public"."achievements" TO "anon";
GRANT ALL ON TABLE "public"."achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."achievements" TO "service_role";



GRANT ALL ON SEQUENCE "public"."achievements_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."achievements_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."achievements_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."activity_log" TO "anon";
GRANT ALL ON TABLE "public"."activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."anamnesis_records" TO "anon";
GRANT ALL ON TABLE "public"."anamnesis_records" TO "authenticated";
GRANT ALL ON TABLE "public"."anamnesis_records" TO "service_role";



GRANT ALL ON TABLE "public"."anamnesis_templates" TO "anon";
GRANT ALL ON TABLE "public"."anamnesis_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."anamnesis_templates" TO "service_role";



GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."appointments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."appointments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."appointments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."archived_patient_links" TO "anon";
GRANT ALL ON TABLE "public"."archived_patient_links" TO "authenticated";
GRANT ALL ON TABLE "public"."archived_patient_links" TO "service_role";



GRANT ALL ON TABLE "public"."bug_reports" TO "anon";
GRANT ALL ON TABLE "public"."bug_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."bug_reports" TO "service_role";



GRANT ALL ON TABLE "public"."chats" TO "anon";
GRANT ALL ON TABLE "public"."chats" TO "authenticated";
GRANT ALL ON TABLE "public"."chats" TO "service_role";



GRANT ALL ON SEQUENCE "public"."chats_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."chats_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."chats_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."checkin_fields" TO "anon";
GRANT ALL ON TABLE "public"."checkin_fields" TO "authenticated";
GRANT ALL ON TABLE "public"."checkin_fields" TO "service_role";



GRANT ALL ON TABLE "public"."checkin_schedules" TO "anon";
GRANT ALL ON TABLE "public"."checkin_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."checkin_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."checkin_sessions" TO "anon";
GRANT ALL ON TABLE "public"."checkin_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."checkin_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."checkin_templates" TO "anon";
GRANT ALL ON TABLE "public"."checkin_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."checkin_templates" TO "service_role";



GRANT ALL ON TABLE "public"."communication_automations" TO "anon";
GRANT ALL ON TABLE "public"."communication_automations" TO "authenticated";
GRANT ALL ON TABLE "public"."communication_automations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."communication_automations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."communication_automations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."communication_automations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."diet_template_food_substitutions" TO "anon";
GRANT ALL ON TABLE "public"."diet_template_food_substitutions" TO "authenticated";
GRANT ALL ON TABLE "public"."diet_template_food_substitutions" TO "service_role";



GRANT ALL ON TABLE "public"."diet_template_foods" TO "anon";
GRANT ALL ON TABLE "public"."diet_template_foods" TO "authenticated";
GRANT ALL ON TABLE "public"."diet_template_foods" TO "service_role";



GRANT ALL ON TABLE "public"."diet_template_meals" TO "anon";
GRANT ALL ON TABLE "public"."diet_template_meals" TO "authenticated";
GRANT ALL ON TABLE "public"."diet_template_meals" TO "service_role";



GRANT ALL ON TABLE "public"."diet_templates" TO "anon";
GRANT ALL ON TABLE "public"."diet_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."diet_templates" TO "service_role";



GRANT ALL ON TABLE "public"."energy_expenditure_calculations" TO "anon";
GRANT ALL ON TABLE "public"."energy_expenditure_calculations" TO "authenticated";
GRANT ALL ON TABLE "public"."energy_expenditure_calculations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."energy_expenditure_calculations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."energy_expenditure_calculations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."energy_expenditure_calculations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."external_api_cache" TO "anon";
GRANT ALL ON TABLE "public"."external_api_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."external_api_cache" TO "service_role";



GRANT ALL ON TABLE "public"."feed_tasks" TO "anon";
GRANT ALL ON TABLE "public"."feed_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."feed_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."financial_records" TO "anon";
GRANT ALL ON TABLE "public"."financial_records" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_records" TO "service_role";



GRANT ALL ON TABLE "public"."financial_transactions" TO "anon";
GRANT ALL ON TABLE "public"."financial_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_transactions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."financial_transactions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."financial_transactions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."financial_transactions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."food_household_measures" TO "anon";
GRANT ALL ON TABLE "public"."food_household_measures" TO "authenticated";
GRANT ALL ON TABLE "public"."food_household_measures" TO "service_role";



GRANT ALL ON TABLE "public"."food_measures" TO "anon";
GRANT ALL ON TABLE "public"."food_measures" TO "authenticated";
GRANT ALL ON TABLE "public"."food_measures" TO "service_role";



GRANT ALL ON TABLE "public"."nutritionist_foods" TO "anon";
GRANT ALL ON TABLE "public"."nutritionist_foods" TO "authenticated";
GRANT ALL ON TABLE "public"."nutritionist_foods" TO "service_role";



GRANT ALL ON TABLE "public"."reference_foods" TO "anon";
GRANT ALL ON TABLE "public"."reference_foods" TO "authenticated";
GRANT ALL ON TABLE "public"."reference_foods" TO "service_role";



GRANT ALL ON TABLE "public"."foods" TO "anon";
GRANT ALL ON TABLE "public"."foods" TO "authenticated";
GRANT ALL ON TABLE "public"."foods" TO "service_role";



GRANT ALL ON TABLE "public"."glycemia_records" TO "anon";
GRANT ALL ON TABLE "public"."glycemia_records" TO "authenticated";
GRANT ALL ON TABLE "public"."glycemia_records" TO "service_role";



GRANT ALL ON TABLE "public"."growth_records" TO "anon";
GRANT ALL ON TABLE "public"."growth_records" TO "authenticated";
GRANT ALL ON TABLE "public"."growth_records" TO "service_role";



GRANT ALL ON SEQUENCE "public"."growth_records_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."growth_records_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."growth_records_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."household_measures" TO "anon";
GRANT ALL ON TABLE "public"."household_measures" TO "authenticated";
GRANT ALL ON TABLE "public"."household_measures" TO "service_role";



GRANT ALL ON SEQUENCE "public"."household_measures_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."household_measures_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."household_measures_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."lab_results" TO "anon";
GRANT ALL ON TABLE "public"."lab_results" TO "authenticated";
GRANT ALL ON TABLE "public"."lab_results" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lab_results_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lab_results_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lab_results_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."lab_risk_rules" TO "anon";
GRANT ALL ON TABLE "public"."lab_risk_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."lab_risk_rules" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lab_risk_rules_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lab_risk_rules_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lab_risk_rules_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."meal_audit_log" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."meal_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_audit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."meal_audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."meal_audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."meal_audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."meal_edit_history" TO "anon";
GRANT ALL ON TABLE "public"."meal_edit_history" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_edit_history" TO "service_role";



GRANT ALL ON SEQUENCE "public"."meal_edit_history_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."meal_edit_history_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."meal_edit_history_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."meal_history" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."meal_history" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_history" TO "service_role";



GRANT ALL ON SEQUENCE "public"."meal_history_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."meal_history_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."meal_history_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."meal_items" TO "anon";
GRANT ALL ON TABLE "public"."meal_items" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."meal_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."meal_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."meal_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."meal_plan_food_substitutions" TO "anon";
GRANT ALL ON TABLE "public"."meal_plan_food_substitutions" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_plan_food_substitutions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."meal_plan_food_substitutions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."meal_plan_food_substitutions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."meal_plan_food_substitutions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."meal_plan_foods" TO "anon";
GRANT ALL ON TABLE "public"."meal_plan_foods" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_plan_foods" TO "service_role";



GRANT ALL ON SEQUENCE "public"."meal_plan_foods_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."meal_plan_foods_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."meal_plan_foods_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."meal_plan_meals" TO "anon";
GRANT ALL ON TABLE "public"."meal_plan_meals" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_plan_meals" TO "service_role";



GRANT ALL ON SEQUENCE "public"."meal_plan_meals_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."meal_plan_meals_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."meal_plan_meals_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."meal_plan_reference_values" TO "anon";
GRANT ALL ON TABLE "public"."meal_plan_reference_values" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_plan_reference_values" TO "service_role";



GRANT ALL ON SEQUENCE "public"."meal_plan_reference_values_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."meal_plan_reference_values_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."meal_plan_reference_values_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."meal_plan_versions" TO "anon";
GRANT ALL ON TABLE "public"."meal_plan_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_plan_versions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."meal_plan_versions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."meal_plan_versions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."meal_plan_versions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."meal_plans" TO "anon";
GRANT ALL ON TABLE "public"."meal_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_plans" TO "service_role";



GRANT ALL ON SEQUENCE "public"."meal_plans_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."meal_plans_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."meal_plans_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."meal_template_food_substitutions" TO "anon";
GRANT ALL ON TABLE "public"."meal_template_food_substitutions" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_template_food_substitutions" TO "service_role";



GRANT ALL ON TABLE "public"."meal_template_foods" TO "anon";
GRANT ALL ON TABLE "public"."meal_template_foods" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_template_foods" TO "service_role";



GRANT ALL ON TABLE "public"."meal_templates" TO "anon";
GRANT ALL ON TABLE "public"."meal_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_templates" TO "service_role";



GRANT ALL ON TABLE "public"."meals" TO "anon";
GRANT ALL ON TABLE "public"."meals" TO "authenticated";
GRANT ALL ON TABLE "public"."meals" TO "service_role";



GRANT ALL ON SEQUENCE "public"."meals_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."meals_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."meals_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."message_templates" TO "anon";
GRANT ALL ON TABLE "public"."message_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."message_templates" TO "service_role";



GRANT ALL ON SEQUENCE "public"."message_templates_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."message_templates_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."message_templates_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."notification_rules" TO "anon";
GRANT ALL ON TABLE "public"."notification_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_rules" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."nutritionist_branding" TO "anon";
GRANT ALL ON TABLE "public"."nutritionist_branding" TO "authenticated";
GRANT ALL ON TABLE "public"."nutritionist_branding" TO "service_role";



GRANT ALL ON TABLE "public"."nutritionist_custom_measures" TO "anon";
GRANT ALL ON TABLE "public"."nutritionist_custom_measures" TO "authenticated";
GRANT ALL ON TABLE "public"."nutritionist_custom_measures" TO "service_role";



GRANT ALL ON SEQUENCE "public"."nutritionist_custom_measures_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."nutritionist_custom_measures_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."nutritionist_custom_measures_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."nutritionist_patients" TO "anon";
GRANT ALL ON TABLE "public"."nutritionist_patients" TO "authenticated";
GRANT ALL ON TABLE "public"."nutritionist_patients" TO "service_role";



GRANT ALL ON TABLE "public"."operational_observability_log" TO "anon";
GRANT ALL ON TABLE "public"."operational_observability_log" TO "authenticated";
GRANT ALL ON TABLE "public"."operational_observability_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."operational_observability_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."operational_observability_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."operational_observability_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."patient_goals" TO "anon";
GRANT ALL ON TABLE "public"."patient_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_goals" TO "service_role";



GRANT ALL ON SEQUENCE "public"."patient_goals_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."patient_goals_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."patient_goals_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."prescriptions" TO "anon";
GRANT ALL ON TABLE "public"."prescriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."prescriptions" TO "service_role";



GRANT ALL ON TABLE "public"."user_achievements" TO "anon";
GRANT ALL ON TABLE "public"."user_achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."user_achievements" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."patient_hub_summary" TO "anon";
GRANT ALL ON TABLE "public"."patient_hub_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_hub_summary" TO "service_role";



GRANT ALL ON TABLE "public"."patient_module_sync_flags" TO "anon";
GRANT ALL ON TABLE "public"."patient_module_sync_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_module_sync_flags" TO "service_role";



GRANT ALL ON TABLE "public"."patient_reminder_preferences" TO "anon";
GRANT ALL ON TABLE "public"."patient_reminder_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_reminder_preferences" TO "service_role";



GRANT ALL ON SEQUENCE "public"."patient_reminder_preferences_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."patient_reminder_preferences_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."patient_reminder_preferences_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."prescriptions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."prescriptions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."prescriptions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."progress_photos" TO "anon";
GRANT ALL ON TABLE "public"."progress_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."progress_photos" TO "service_role";



GRANT ALL ON TABLE "public"."recipe_ingredients" TO "anon";
GRANT ALL ON TABLE "public"."recipe_ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."recipe_ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."recipes" TO "anon";
GRANT ALL ON TABLE "public"."recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."recipes" TO "service_role";



GRANT ALL ON TABLE "public"."recurring_expenses" TO "anon";
GRANT ALL ON TABLE "public"."recurring_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."recurring_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."reminder_delivery_log" TO "anon";
GRANT ALL ON TABLE "public"."reminder_delivery_log" TO "authenticated";
GRANT ALL ON TABLE "public"."reminder_delivery_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."reminder_delivery_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."reminder_delivery_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."reminder_delivery_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



GRANT ALL ON TABLE "public"."supplement_logs" TO "anon";
GRANT ALL ON TABLE "public"."supplement_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."supplement_logs" TO "service_role";



GRANT ALL ON TABLE "public"."template_dispatch_log" TO "anon";
GRANT ALL ON TABLE "public"."template_dispatch_log" TO "authenticated";
GRANT ALL ON TABLE "public"."template_dispatch_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."template_dispatch_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."template_dispatch_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."template_dispatch_log_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_achievements_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_achievements_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_achievements_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_summaries" TO "anon";
GRANT ALL ON TABLE "public"."weekly_summaries" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_summaries" TO "service_role";



GRANT ALL ON SEQUENCE "public"."weekly_summaries_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."weekly_summaries_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."weekly_summaries_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";





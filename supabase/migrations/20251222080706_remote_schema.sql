

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


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";








ALTER SCHEMA "public" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






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


CREATE OR REPLACE FUNCTION "public"."calculate_goal_progress"("goal_id" bigint) RETURNS numeric
    LANGUAGE "plpgsql"
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
    AS $$
BEGIN
    -- Líquido = Bruto - (Bruto * (Taxa / 100))
    NEW.net_amount := NEW.amount - (NEW.amount * COALESCE(NEW.fee_percentage, 0) / 100);
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calculate_net_amount"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_and_grant_achievements"("p_user_id" "uuid") RETURNS TABLE("name" "text", "description" "text", "icon_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."check_and_grant_achievements"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."check_is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_appointment_reminders"() RETURNS "void"
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


ALTER FUNCTION "public"."create_appointment_reminders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_daily_log_reminders"() RETURNS "void"
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


ALTER FUNCTION "public"."create_daily_log_reminders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_summary_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO notifications(user_id, type, content)
  VALUES(NEW.patient_id, 'new_weekly_summary', jsonb_build_object('week_start_date', NEW.week_start_date, 'nutritionist_id', NEW.nutritionist_id));
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_summary_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_patient"("patient_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  PERFORM auth.admin_delete_user(patient_id);
END;
$$;


ALTER FUNCTION "public"."delete_patient"("patient_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_read_notifications"() RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  DELETE FROM notifications
  WHERE is_read = true AND created_at < now() - interval '3 days';
$$;


ALTER FUNCTION "public"."delete_read_notifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_dashboard_stats"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  total_nutris int;
  total_patients int;
  total_meals int;
  active_patients int;
  
  recent_users json;
  growth_data json;
  goals_dist json;
begin
  -- 1. Contadores Básicos
  select count(*) into total_nutris from user_profiles where user_type = 'nutritionist';
  select count(*) into total_patients from user_profiles where user_type = 'patient';
  select count(*) into total_meals from meals;
  
  -- Pacientes Ativos (com login ou registro nos ultimos 30 dias - simplificado para is_active por enquanto)
  select count(*) into active_patients from user_profiles where user_type = 'patient' and is_active = true;

  -- 2. Usuários Recentes (Últimos 5)
  select json_agg(t) into recent_users from (
    select name, user_type, created_at, avatar_url 
    from user_profiles 
    order by created_at desc 
    limit 5
  ) t;

  -- 3. Dados de Crescimento (Últimos 6 meses agrupados por mês)
  select json_agg(t) into growth_data from (
    select 
      to_char(date_trunc('month', created_at), 'Mon') as name,
      count(*) as users
    from user_profiles
    where created_at > now() - interval '6 months'
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

  return json_build_object(
    'counts', json_build_object(
      'nutritionists', total_nutris,
      'patients', total_patients,
      'meals', total_meals,
      'active_rate', active_patients
    ),
    'recent_users', coalesce(recent_users, '[]'::json),
    'growth_chart', coalesce(growth_data, '[]'::json),
    'goals_chart', coalesce(goals_dist, '[]'::json)
  );
end;
$$;


ALTER FUNCTION "public"."get_admin_dashboard_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_chat_recipient_profile"("recipient_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "user_type" "text", "avatar_url" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_user_type text;
  caller_nutritionist_id uuid;
BEGIN
  -- 1. Pega as informações de quem está chamando a função
  SELECT
    p.user_type,
    p.nutritionist_id
  INTO
    caller_user_type,
    caller_nutritionist_id
  FROM
    public.user_profiles AS p
  WHERE
    p.id = caller_id;

  -- 2. Verifica as permissões
  IF caller_user_type = 'patient' AND caller_nutritionist_id = recipient_id THEN
    -- Se o CHAMADOR é um paciente E o RECIPIENTE é seu nutricionista, permite.
    RETURN QUERY
    SELECT
      up.id,
      up.name,
      up.user_type,
      up.avatar_url
    FROM
      public.user_profiles AS up
    WHERE
      up.id = recipient_id;
      
  ELSIF caller_user_type = 'nutritionist' THEN
    -- Se o CHAMADOR é um nutricionista, permite que ele veja o perfil do paciente
    -- (Assumindo que recipient_id é um paciente dele)
    RETURN QUERY
    SELECT
      up.id,
      up.name,
      up.user_type,
      up.avatar_url
    FROM
      public.user_profiles AS up
    WHERE
      up.id = recipient_id
      AND up.nutritionist_id = caller_id;
  END IF;

END;
$$;


ALTER FUNCTION "public"."get_chat_recipient_profile"("recipient_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_comprehensive_activity_feed_optimized"("p_nutritionist_id" "uuid", "p_limit" integer DEFAULT 50) RETURNS TABLE("activity_type" "text", "activity_id" "uuid", "patient_id" "uuid", "patient_name" "text", "activity_date" timestamp with time zone, "activity_data" json)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    WITH all_activities AS (
        -- Refeições
        SELECT
            'meal'::TEXT AS activity_type,
            m.id AS activity_id,
            m.patient_id,
            up.name AS patient_name,
            m.created_at AS activity_date,
            json_build_object(
                'meal_type', m.meal_type,
                'meal_date', m.meal_date,
                'total_calories', m.total_calories
            ) AS activity_data
        FROM meals m
        INNER JOIN user_profiles up ON up.id = m.patient_id
        WHERE up.nutritionist_id = p_nutritionist_id

        UNION ALL

        -- Antropometria
        SELECT
            'anthropometry'::TEXT,
            ar.id,
            ar.patient_id,
            up.name,
            ar.created_at,
            json_build_object(
                'weight', ar.weight,
                'height', ar.height,
                'record_date', ar.record_date
            )
        FROM growth_records ar
        INNER JOIN user_profiles up ON up.id = ar.patient_id
        WHERE up.nutritionist_id = p_nutritionist_id

        UNION ALL

        -- Anamnese
        SELECT
            'anamnesis'::TEXT,
            anr.id,
            anr.patient_id,
            up.name,
            anr.created_at,
            json_build_object(
                'form_type', anr.form_type
            )
        FROM anamnesis_records anr
        INNER JOIN user_profiles up ON up.id = anr.patient_id
        WHERE up.nutritionist_id = p_nutritionist_id

        UNION ALL

        -- Planos Alimentares
        SELECT
            'meal_plan'::TEXT,
            mp.id,
            mp.patient_id,
            up.name,
            mp.created_at,
            json_build_object(
                'name', mp.name,
                'is_active', mp.is_active,
                'start_date', mp.start_date
            )
        FROM meal_plans mp
        INNER JOIN user_profiles up ON up.id = mp.patient_id
        WHERE up.nutritionist_id = p_nutritionist_id

        UNION ALL

        -- Prescrições
        SELECT
            'prescription'::TEXT,
            p.id,
            p.patient_id,
            up.name,
            p.created_at,
            json_build_object(
                'calories', p.calories,
                'start_date', p.start_date,
                'end_date', p.end_date
            )
        FROM prescriptions p
        INNER JOIN user_profiles up ON up.id = p.patient_id
        WHERE up.nutritionist_id = p_nutritionist_id

        UNION ALL

        -- Agendamentos
        SELECT
            'appointment'::TEXT,
            a.id,
            a.patient_id,
            up.name,
            a.created_at,
            json_build_object(
                'appointment_time', a.appointment_time,
                'status', a.status,
                'notes', a.notes
            )
        FROM appointments a
        INNER JOIN user_profiles up ON up.id = a.patient_id
        WHERE a.nutritionist_id = p_nutritionist_id

        UNION ALL

        -- Mensagens (apenas do paciente para nutricionista)
        SELECT
            'chat'::TEXT,
            c.id,
            c.from_id AS patient_id,
            up.name,
            c.created_at,
            json_build_object(
                'message_preview', LEFT(c.message, 100),
                'message_type', c.message_type
            )
        FROM chats c
        INNER JOIN user_profiles up ON up.id = c.from_id
        WHERE
            c.to_id = p_nutritionist_id
            AND up.user_type = 'patient'

        UNION ALL

        -- Conquistas
        SELECT
            'achievement'::TEXT,
            ua.id,
            ua.user_id AS patient_id,
            up.name,
            ua.achieved_at,
            json_build_object(
                'achievement_name', a.name,
                'achievement_icon', a.icon
            )
        FROM user_achievements ua
        INNER JOIN achievements a ON a.id = ua.achievement_id
        INNER JOIN user_profiles up ON up.id = ua.user_id
        WHERE up.nutritionist_id = p_nutritionist_id
    )
    SELECT
        aa.activity_type,
        aa.activity_id,
        aa.patient_id,
        aa.patient_name,
        aa.activity_date,
        aa.activity_data
    FROM all_activities aa
    ORDER BY aa.activity_date DESC
    LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."get_comprehensive_activity_feed_optimized"("p_nutritionist_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_daily_adherence"("p_nutritionist_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."get_daily_adherence"("p_nutritionist_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_financial_summary"("start_date" "date", "end_date" "date") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."get_financial_summary"("start_date" "date", "end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_formatted_address"("address_jsonb" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
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



CREATE OR REPLACE FUNCTION "public"."get_meal_plan_with_foods_optimized"("p_meal_plan_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."get_meal_plan_with_foods_optimized"("p_meal_plan_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_patients_low_adherence_optimized"("p_nutritionist_id" "uuid", "p_days_threshold" integer DEFAULT 7) RETURNS TABLE("patient_id" "uuid", "patient_name" "text", "last_meal_date" timestamp with time zone, "days_since_last_meal" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."get_patients_low_adherence_optimized"("p_nutritionist_id" "uuid", "p_days_threshold" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_patients_pending_data_optimized"("p_nutritionist_id" "uuid") RETURNS TABLE("patient_id" "uuid", "patient_name" "text", "has_anamnese" boolean, "has_anthropometry" boolean, "has_meal_plan" boolean, "has_prescription" boolean, "pending_items" "text"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."get_patients_pending_data_optimized"("p_nutritionist_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_recent_patient_activity"("nutritionist_id_param" "uuid", "limit_param" integer) RETURNS TABLE("meal_id" bigint, "patient_name" "text", "meal_type" "text", "total_calories" numeric, "created_at" timestamp with time zone)
    LANGUAGE "sql"
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
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT auth.uid();
$$;


ALTER FUNCTION "public"."get_user_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_chat_message_notification"() RETURNS "trigger"
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


ALTER FUNCTION "public"."handle_new_chat_message_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
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
    cpf, -- O CAMPO PROBLEMÁTICO
    occupation,
    civil_status,
    observations,
    address
  )
  values (
    new.id, 
    new.email,
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'user_type',
    new.raw_user_meta_data->>'crn',
    
    -- Correções de tipo
    NULLIF(new.raw_user_meta_data->>'birth_date', '')::date,
    new.raw_user_meta_data->>'gender',
    NULLIF(new.raw_user_meta_data->>'height', '')::numeric,
    NULLIF(new.raw_user_meta_data->>'weight', '')::numeric,
    new.raw_user_meta_data->>'goal',
    NULLIF(new.raw_user_meta_data->>'nutritionist_id', '')::uuid,
    
    new.raw_user_meta_data->>'phone',
    
    -- === A CORREÇÃO FINAL ESTÁ AQUI ===
    -- Transforma '' em NULL para evitar o erro de UNIQUE constraint
    NULLIF(new.raw_user_meta_data->>'cpf', ''),
    
    new.raw_user_meta_data->>'occupation',
    new.raw_user_meta_data->>'civil_status',
    new.raw_user_meta_data->>'observations',
    
    new.raw_user_meta_data->'address' 
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_meal_action"("p_patient_id" "uuid", "p_meal_id" bigint, "p_action" "text", "p_meal_type" "text" DEFAULT NULL::"text", "p_meal_date" "date" DEFAULT NULL::"date", "p_meal_time" time without time zone DEFAULT NULL::time without time zone, "p_details" "jsonb" DEFAULT NULL::"jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."log_meal_action"("p_patient_id" "uuid", "p_meal_id" bigint, "p_action" "text", "p_meal_type" "text", "p_meal_date" "date", "p_meal_time" time without time zone, "p_details" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_meal_action"("p_patient_id" "uuid", "p_meal_id" bigint, "p_action" "text", "p_meal_type" "text", "p_meal_date" "date", "p_meal_time" time without time zone, "p_details" "jsonb") IS 'Função helper para registrar ações de auditoria em refeições';



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


CREATE OR REPLACE FUNCTION "public"."search_foods"("p_search_term" "text", "p_limit" integer DEFAULT 50, "p_source" "text" DEFAULT NULL::"text") RETURNS TABLE("id" bigint, "name" "text", "group" "text", "description" "text", "source" "text", "calories" real, "protein" real, "carbs" real, "fat" real)
    LANGUAGE "plpgsql"
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



CREATE OR REPLACE FUNCTION "public"."soft_delete_meal"("p_meal_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    UPDATE meals
    SET deleted_at = NOW()
    WHERE id = p_meal_id
    AND deleted_at IS NULL;

    RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."soft_delete_meal"("p_meal_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."soft_delete_meal"("p_meal_id" bigint) IS 'Marca uma refeição como deletada (soft delete) ao invés de remover do banco';



CREATE OR REPLACE FUNCTION "public"."sync_anthropometry_on_profile_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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



CREATE OR REPLACE FUNCTION "public"."update_energy_calc_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_energy_calc_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_foods_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_foods_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_lab_results_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_lab_results_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_meal_plan_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_meal_plan_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_patient_goals_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$

BEGIN

    NEW.updated_at = NOW();

    RETURN NEW;

END;

$$;


ALTER FUNCTION "public"."update_patient_goals_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_reference_values_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_reference_values_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

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



CREATE TABLE IF NOT EXISTS "public"."foods" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "group" "text",
    "calories" real NOT NULL,
    "protein" real NOT NULL,
    "fat" real NOT NULL,
    "carbs" real NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "nutritionist_id" "uuid",
    "fiber" numeric(10,2),
    "sodium" numeric(10,2),
    "saturated_fat" numeric(10,2),
    "trans_fat" numeric(10,2),
    "monounsaturated_fat" numeric(10,2),
    "polyunsaturated_fat" numeric(10,2),
    "cholesterol" numeric(10,2),
    "sugar" numeric(10,2),
    "calcium" numeric(10,2),
    "iron" numeric(10,2),
    "magnesium" numeric(10,2),
    "phosphorus" numeric(10,2),
    "potassium" numeric(10,2),
    "zinc" numeric(10,2),
    "vitamin_a" numeric(10,2),
    "vitamin_c" numeric(10,2),
    "vitamin_d" numeric(10,2),
    "vitamin_e" numeric(10,2),
    "vitamin_b12" numeric(10,2),
    "folate" numeric(10,2),
    "source" "text" DEFAULT 'custom'::"text",
    "source_id" "text",
    "description" "text",
    "preparation" "text",
    "portion_size" numeric(10,2) DEFAULT 100,
    "is_active" boolean DEFAULT true,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."foods" OWNER TO "postgres";


COMMENT ON COLUMN "public"."foods"."fiber" IS 'Fibra alimentar em gramas';



COMMENT ON COLUMN "public"."foods"."sodium" IS 'Sódio em miligramas';



COMMENT ON COLUMN "public"."foods"."saturated_fat" IS 'Gordura saturada em gramas';



COMMENT ON COLUMN "public"."foods"."trans_fat" IS 'Gordura trans em gramas';



COMMENT ON COLUMN "public"."foods"."cholesterol" IS 'Colesterol em miligramas';



COMMENT ON COLUMN "public"."foods"."sugar" IS 'Açúcares totais em gramas';



COMMENT ON COLUMN "public"."foods"."calcium" IS 'Cálcio em miligramas';



COMMENT ON COLUMN "public"."foods"."iron" IS 'Ferro em miligramas';



COMMENT ON COLUMN "public"."foods"."vitamin_c" IS 'Vitamina C em miligramas';



COMMENT ON COLUMN "public"."foods"."source" IS 'Fonte do dado: TACO, IBGE, USDA, Tucunduva, TBCA ou custom';



COMMENT ON COLUMN "public"."foods"."source_id" IS 'ID original no banco de dados de origem';



COMMENT ON COLUMN "public"."foods"."description" IS 'Descrição detalhada do alimento';



COMMENT ON COLUMN "public"."foods"."preparation" IS 'Modo de preparo (cru, cozido, grelhado, etc)';



COMMENT ON COLUMN "public"."foods"."portion_size" IS 'Tamanho da porção padrão em gramas (base 100g)';



COMMENT ON COLUMN "public"."foods"."is_active" IS 'Indica se o alimento está ativo para seleção';



CREATE OR REPLACE VIEW "public"."active_foods" AS
 SELECT "id",
    "name",
    "group",
    "description",
    "preparation",
    "source",
    "calories",
    "protein",
    "carbs",
    "fat",
    "fiber",
    "sodium",
    "portion_size"
   FROM "public"."foods"
  WHERE ("is_active" = true)
  ORDER BY "name";


ALTER VIEW "public"."active_foods" OWNER TO "postgres";


COMMENT ON VIEW "public"."active_foods" IS 'View com apenas alimentos ativos, para uso em seleções';



CREATE TABLE IF NOT EXISTS "public"."anamnese_answers" (
    "id" bigint NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "field_id" bigint NOT NULL,
    "answer_value" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."anamnese_answers" OWNER TO "postgres";


ALTER TABLE "public"."anamnese_answers" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."anamnese_answers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."anamnese_field_options" (
    "id" bigint NOT NULL,
    "field_id" bigint NOT NULL,
    "option_text" "text" NOT NULL,
    "option_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."anamnese_field_options" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."anamnese_field_options_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."anamnese_field_options_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."anamnese_field_options_id_seq" OWNED BY "public"."anamnese_field_options"."id";



CREATE TABLE IF NOT EXISTS "public"."anamnese_fields" (
    "id" bigint NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "field_label" "text" NOT NULL,
    "field_type" "text" NOT NULL,
    "options" "text"[],
    "order" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "category" character varying(50) DEFAULT 'geral'::character varying,
    "is_required" boolean DEFAULT false
);


ALTER TABLE "public"."anamnese_fields" OWNER TO "postgres";


COMMENT ON COLUMN "public"."anamnese_fields"."category" IS 'Categoria da pergunta: identificacao, historico_clinico, historico_familiar, habitos_vida, objetivos, habitos_alimentares, geral';



COMMENT ON COLUMN "public"."anamnese_fields"."is_required" IS 'Indica se o campo é obrigatório no preenchimento';



ALTER TABLE "public"."anamnese_fields" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."anamnese_fields_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



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
    CONSTRAINT "anamnesis_records_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."anamnesis_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."anamnesis_template_fields" (
    "id" bigint NOT NULL,
    "template_id" "uuid" NOT NULL,
    "field_id" bigint NOT NULL,
    "field_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."anamnesis_template_fields" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."anamnesis_template_fields_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."anamnesis_template_fields_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."anamnesis_template_fields_id_seq" OWNED BY "public"."anamnesis_template_fields"."id";



CREATE TABLE IF NOT EXISTS "public"."anamnesis_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "sections" "jsonb" NOT NULL,
    "is_system_default" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."anamnesis_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" bigint NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "appointment_time" timestamp with time zone NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "reminder_sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "duration" integer DEFAULT 60,
    "appointment_type" "text" DEFAULT 'first_appointment'::"text",
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



CREATE TABLE IF NOT EXISTS "public"."energy_expenditure_calculations" (
    "id" bigint NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "weight" numeric(5,2) NOT NULL,
    "height" numeric(5,2) NOT NULL,
    "age" integer NOT NULL,
    "gender" "text" NOT NULL,
    "protocol" "text" NOT NULL,
    "activity_level" numeric(3,2) NOT NULL,
    "tmb" numeric(7,2) NOT NULL,
    "get" numeric(7,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "get_with_activities" numeric(7,2),
    "activities" "jsonb" DEFAULT '[]'::"jsonb",
    "target_weight" numeric(5,2),
    "venta_adjusted" numeric(7,2),
    CONSTRAINT "valid_activity_level" CHECK ((("activity_level" >= 1.0) AND ("activity_level" <= 3.0))),
    CONSTRAINT "valid_age" CHECK ((("age" >= 0) AND ("age" <= 120))),
    CONSTRAINT "valid_gender" CHECK (("gender" = ANY (ARRAY['Masculino'::"text", 'Feminino'::"text"]))),
    CONSTRAINT "valid_get_with_activities" CHECK ((("get_with_activities" IS NULL) OR ("get_with_activities" > (0)::numeric))),
    CONSTRAINT "valid_height" CHECK ((("height" >= (50)::numeric) AND ("height" <= (255)::numeric))),
    CONSTRAINT "valid_protocol" CHECK (("protocol" = ANY (ARRAY['harris-benedict'::"text", 'schofield'::"text", 'fao-oms-2001'::"text"]))),
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



CREATE SEQUENCE IF NOT EXISTS "public"."energy_expenditure_calculations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."energy_expenditure_calculations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."energy_expenditure_calculations_id_seq" OWNED BY "public"."energy_expenditure_calculations"."id";



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
    "food_id" bigint,
    "measure_id" bigint,
    "quantity" numeric(10,2),
    "grams" numeric(10,2)
);


ALTER TABLE "public"."food_household_measures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."food_measures" (
    "id" bigint NOT NULL,
    "food_id" bigint NOT NULL,
    "measure_label" "text" NOT NULL,
    "quantity_grams" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."food_measures" OWNER TO "postgres";


COMMENT ON TABLE "public"."food_measures" IS 'Medidas caseiras específicas para cada alimento (ex: "1 Colher de Sopa de Arroz = 15g")';



CREATE SEQUENCE IF NOT EXISTS "public"."food_measures_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."food_measures_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."food_measures_id_seq" OWNED BY "public"."food_measures"."id";



ALTER TABLE "public"."foods" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."foods_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



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
    "photos" "text"[] DEFAULT ARRAY[]::"text"[]
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
    "food_id" bigint,
    "name" "text" NOT NULL,
    "quantity" numeric NOT NULL,
    "calories" numeric NOT NULL,
    "protein" numeric NOT NULL,
    "fat" numeric NOT NULL,
    "carbs" numeric NOT NULL,
    "unit" "text"
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



CREATE TABLE IF NOT EXISTS "public"."meal_plan_foods" (
    "id" bigint NOT NULL,
    "meal_plan_meal_id" bigint NOT NULL,
    "food_id" bigint NOT NULL,
    "quantity" numeric(10,2) NOT NULL,
    "unit" "text" NOT NULL,
    "calories" numeric(10,2) NOT NULL,
    "protein" numeric(10,2) NOT NULL,
    "carbs" numeric(10,2) NOT NULL,
    "fat" numeric(10,2) NOT NULL,
    "notes" "text",
    "order_index" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
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



CREATE TABLE IF NOT EXISTS "public"."meal_plans" (
    "id" bigint NOT NULL,
    "patient_id" "uuid",
    "nutritionist_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "active_days" "jsonb" DEFAULT '["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]'::"jsonb" NOT NULL,
    "start_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "end_date" "date",
    "is_active" boolean DEFAULT true,
    "daily_calories" numeric(10,2) DEFAULT 0,
    "daily_protein" numeric(10,2) DEFAULT 0,
    "daily_carbs" numeric(10,2) DEFAULT 0,
    "daily_fat" numeric(10,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_template" boolean DEFAULT false,
    "template_tags" "text"[] DEFAULT ARRAY[]::"text"[]
);


ALTER TABLE "public"."meal_plans" OWNER TO "postgres";


COMMENT ON TABLE "public"."meal_plans" IS 'Planos alimentares criados pelo nutricionista para os pacientes';



COMMENT ON COLUMN "public"."meal_plans"."active_days" IS 'Array JSON dos dias da semana em que o plano está ativo';



COMMENT ON COLUMN "public"."meal_plans"."is_active" IS 'Indica se o plano está ativo ou foi arquivado';



CREATE SEQUENCE IF NOT EXISTS "public"."meal_plans_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."meal_plans_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."meal_plans_id_seq" OWNED BY "public"."meal_plans"."id";



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
    "deleted_at" timestamp with time zone
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



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "content" "jsonb",
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
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
    "clinic_settings" "jsonb" DEFAULT '{"pix_key": "", "working_hours": {"end": "18:00", "days": [1, 2, 3, 4, 5], "start": "08:00"}, "address_footer": "", "default_tax_rate": 0, "appointment_duration": 60}'::"jsonb"
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
           FROM "public"."anamnese_answers"
          WHERE ("anamnese_answers"."patient_id" = "p"."id")) > 0) AS "has_anamnese",
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


ALTER TABLE "public"."prescriptions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."prescriptions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



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



ALTER TABLE ONLY "public"."anamnese_field_options" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."anamnese_field_options_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."anamnesis_template_fields" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."anamnesis_template_fields_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."energy_expenditure_calculations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."energy_expenditure_calculations_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."food_measures" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."food_measures_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."household_measures" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."household_measures_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."lab_results" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."lab_results_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."meal_audit_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."meal_audit_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."meal_history" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."meal_history_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."meal_plan_foods" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."meal_plan_foods_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."meal_plan_meals" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."meal_plan_meals_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."meal_plan_reference_values" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."meal_plan_reference_values_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."meal_plans" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."meal_plans_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."patient_goals" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."patient_goals_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anamnese_answers"
    ADD CONSTRAINT "anamnese_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anamnese_field_options"
    ADD CONSTRAINT "anamnese_field_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anamnese_fields"
    ADD CONSTRAINT "anamnese_fields_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anamnesis_records"
    ADD CONSTRAINT "anamnesis_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anamnesis_template_fields"
    ADD CONSTRAINT "anamnesis_template_fields_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anamnesis_template_fields"
    ADD CONSTRAINT "anamnesis_template_fields_template_id_field_id_key" UNIQUE ("template_id", "field_id");



ALTER TABLE ONLY "public"."anamnesis_templates"
    ADD CONSTRAINT "anamnesis_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."energy_expenditure_calculations"
    ADD CONSTRAINT "energy_expenditure_calculations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_records"
    ADD CONSTRAINT "financial_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_transactions"
    ADD CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."food_household_measures"
    ADD CONSTRAINT "food_household_measures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."food_measures"
    ADD CONSTRAINT "food_measures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."foods"
    ADD CONSTRAINT "foods_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."meal_audit_log"
    ADD CONSTRAINT "meal_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_edit_history"
    ADD CONSTRAINT "meal_edit_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_history"
    ADD CONSTRAINT "meal_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_items"
    ADD CONSTRAINT "meal_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_plan_foods"
    ADD CONSTRAINT "meal_plan_foods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_plan_meals"
    ADD CONSTRAINT "meal_plan_meals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_plan_reference_values"
    ADD CONSTRAINT "meal_plan_reference_values_meal_plan_id_key" UNIQUE ("meal_plan_id");



ALTER TABLE ONLY "public"."meal_plan_reference_values"
    ADD CONSTRAINT "meal_plan_reference_values_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_plans"
    ADD CONSTRAINT "meal_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meals"
    ADD CONSTRAINT "meals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_goals"
    ADD CONSTRAINT "patient_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_patient_id_start_date_key" UNIQUE ("patient_id", "start_date");



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_expenses"
    ADD CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anamnese_answers"
    ADD CONSTRAINT "unique_patient_field" UNIQUE ("patient_id", "field_id");



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_user_id_achievement_id_key" UNIQUE ("user_id", "achievement_id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_cpf_key" UNIQUE ("cpf");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_summaries"
    ADD CONSTRAINT "weekly_summaries_patient_id_week_start_date_key" UNIQUE ("patient_id", "week_start_date");



ALTER TABLE ONLY "public"."weekly_summaries"
    ADD CONSTRAINT "weekly_summaries_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_anamnese_answers_patient" ON "public"."anamnese_answers" USING "btree" ("patient_id");



CREATE INDEX "idx_anamnese_fields_category" ON "public"."anamnese_fields" USING "btree" ("category");



CREATE INDEX "idx_anamnesis_patient" ON "public"."anamnesis_records" USING "btree" ("patient_id") WHERE ("patient_id" IS NOT NULL);



CREATE INDEX "idx_anamnesis_records_date" ON "public"."anamnesis_records" USING "btree" ("date" DESC);



CREATE INDEX "idx_anamnesis_records_nutritionist" ON "public"."anamnesis_records" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_anamnesis_records_patient" ON "public"."anamnesis_records" USING "btree" ("patient_id");



CREATE INDEX "idx_anamnesis_templates_nutritionist" ON "public"."anamnesis_templates" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_anamnesis_templates_system" ON "public"."anamnesis_templates" USING "btree" ("is_system_default") WHERE ("is_system_default" = true);



CREATE INDEX "idx_anthropometry_nutritionist_feed" ON "public"."growth_records" USING "btree" ("patient_id", "created_at" DESC) INCLUDE ("weight", "height", "record_date");



CREATE INDEX "idx_anthropometry_patient" ON "public"."growth_records" USING "btree" ("patient_id") WHERE ("patient_id" IS NOT NULL);



CREATE INDEX "idx_appointments_nutritionist_id" ON "public"."appointments" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_appointments_patient_date" ON "public"."appointments" USING "btree" ("patient_id", "appointment_time" DESC);



CREATE INDEX "idx_appointments_patient_id" ON "public"."appointments" USING "btree" ("patient_id");



CREATE INDEX "idx_appointments_status" ON "public"."appointments" USING "btree" ("status");



CREATE INDEX "idx_appointments_time_nutritionist" ON "public"."appointments" USING "btree" ("nutritionist_id", "appointment_time");



CREATE INDEX "idx_appointments_type" ON "public"."appointments" USING "btree" ("appointment_type");



CREATE INDEX "idx_chats_from_id" ON "public"."chats" USING "btree" ("from_id");



CREATE INDEX "idx_chats_from_to" ON "public"."chats" USING "btree" ("from_id", "to_id", "created_at" DESC);



CREATE INDEX "idx_chats_to_created" ON "public"."chats" USING "btree" ("to_id", "created_at" DESC) INCLUDE ("from_id", "message_type");



CREATE INDEX "idx_chats_to_id" ON "public"."chats" USING "btree" ("to_id");



CREATE INDEX "idx_energy_calc_activities" ON "public"."energy_expenditure_calculations" USING "gin" ("activities");



CREATE INDEX "idx_energy_calc_created" ON "public"."energy_expenditure_calculations" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_energy_calc_patient" ON "public"."energy_expenditure_calculations" USING "btree" ("patient_id");



CREATE INDEX "idx_energy_calc_patient_recent" ON "public"."energy_expenditure_calculations" USING "btree" ("patient_id", "created_at" DESC);



CREATE INDEX "idx_field_options_field_id" ON "public"."anamnese_field_options" USING "btree" ("field_id");



CREATE INDEX "idx_financial_date" ON "public"."financial_records" USING "btree" ("date");



CREATE INDEX "idx_financial_nutritionist" ON "public"."financial_records" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_financial_transactions_due_date" ON "public"."financial_transactions" USING "btree" ("due_date");



CREATE INDEX "idx_financial_transactions_nutritionist_id" ON "public"."financial_transactions" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_financial_transactions_patient_id" ON "public"."financial_transactions" USING "btree" ("patient_id");



CREATE INDEX "idx_financial_transactions_status" ON "public"."financial_transactions" USING "btree" ("status");



CREATE INDEX "idx_financial_type" ON "public"."financial_records" USING "btree" ("type");



CREATE INDEX "idx_food_measures_food_id" ON "public"."food_measures" USING "btree" ("food_id");



CREATE INDEX "idx_foods_active" ON "public"."foods" USING "btree" ("is_active");



CREATE INDEX "idx_foods_group" ON "public"."foods" USING "btree" ("group");



CREATE INDEX "idx_foods_name_trgm" ON "public"."foods" USING "gin" ("name" "public"."gin_trgm_ops");



CREATE INDEX "idx_foods_nutritionist" ON "public"."foods" USING "btree" ("nutritionist_id") WHERE ("nutritionist_id" IS NOT NULL);



CREATE INDEX "idx_foods_nutritionist_id" ON "public"."foods" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_foods_source" ON "public"."foods" USING "btree" ("source");



CREATE INDEX "idx_foods_source_id" ON "public"."foods" USING "btree" ("source", "source_id");



CREATE INDEX "idx_growth_records_patient_date" ON "public"."growth_records" USING "btree" ("patient_id", "record_date" DESC);



CREATE INDEX "idx_growth_records_patient_id" ON "public"."growth_records" USING "btree" ("patient_id");



CREATE INDEX "idx_household_measures_active" ON "public"."household_measures" USING "btree" ("is_active", "order_index");



CREATE INDEX "idx_household_measures_code" ON "public"."household_measures" USING "btree" ("code");



CREATE INDEX "idx_lab_results_date" ON "public"."lab_results" USING "btree" ("test_date" DESC);



CREATE INDEX "idx_lab_results_patient" ON "public"."lab_results" USING "btree" ("patient_id");



CREATE INDEX "idx_lab_results_patient_date" ON "public"."lab_results" USING "btree" ("patient_id", "test_date" DESC);



CREATE INDEX "idx_meal_audit_action" ON "public"."meal_audit_log" USING "btree" ("action");



CREATE INDEX "idx_meal_audit_created" ON "public"."meal_audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_meal_audit_meal" ON "public"."meal_audit_log" USING "btree" ("meal_id");



CREATE INDEX "idx_meal_audit_patient" ON "public"."meal_audit_log" USING "btree" ("patient_id");



CREATE INDEX "idx_meal_edit_history_meal_id" ON "public"."meal_edit_history" USING "btree" ("meal_id");



CREATE INDEX "idx_meal_edit_history_patient_id" ON "public"."meal_edit_history" USING "btree" ("patient_id");



CREATE INDEX "idx_meal_history_meal" ON "public"."meal_history" USING "btree" ("meal_id");



CREATE INDEX "idx_meal_history_timestamp" ON "public"."meal_history" USING "btree" ("timestamp" DESC);



CREATE INDEX "idx_meal_items_food_id" ON "public"."meal_items" USING "btree" ("food_id");



CREATE INDEX "idx_meal_items_meal_id" ON "public"."meal_items" USING "btree" ("meal_id");



CREATE INDEX "idx_meal_plan_foods_food" ON "public"."meal_plan_foods" USING "btree" ("food_id");



CREATE INDEX "idx_meal_plan_foods_meal" ON "public"."meal_plan_foods" USING "btree" ("meal_plan_meal_id");



CREATE INDEX "idx_meal_plan_meals_order" ON "public"."meal_plan_meals" USING "btree" ("meal_plan_id", "order_index");



CREATE INDEX "idx_meal_plan_meals_plan" ON "public"."meal_plan_meals" USING "btree" ("meal_plan_id");



CREATE INDEX "idx_meal_plans_active" ON "public"."meal_plans" USING "btree" ("is_active", "patient_id");



CREATE INDEX "idx_meal_plans_nutritionist" ON "public"."meal_plans" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_meal_plans_patient" ON "public"."meal_plans" USING "btree" ("patient_id");



CREATE INDEX "idx_meal_plans_patient_active" ON "public"."meal_plans" USING "btree" ("patient_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_meal_plans_template" ON "public"."meal_plans" USING "btree" ("nutritionist_id", "is_template") WHERE ("is_template" = true);



CREATE INDEX "idx_meals_deleted_at" ON "public"."meals" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_meals_nutritionist_feed" ON "public"."meals" USING "btree" ("patient_id", "created_at" DESC) INCLUDE ("meal_type", "meal_date", "total_calories");



CREATE INDEX "idx_meals_patient_created" ON "public"."meals" USING "btree" ("patient_id", "created_at" DESC);



CREATE INDEX "idx_meals_patient_date" ON "public"."meals" USING "btree" ("patient_id", "created_at" DESC);



CREATE INDEX "idx_meals_patient_id" ON "public"."meals" USING "btree" ("patient_id");



CREATE INDEX "idx_meals_plan" ON "public"."meals" USING "btree" ("meal_plan_id");



CREATE INDEX "idx_meals_plan_meal" ON "public"."meals" USING "btree" ("meal_plan_meal_id");



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_patient_goals_dates" ON "public"."patient_goals" USING "btree" ("start_date", "target_date");



CREATE INDEX "idx_patient_goals_nutritionist" ON "public"."patient_goals" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_patient_goals_patient" ON "public"."patient_goals" USING "btree" ("patient_id");



CREATE INDEX "idx_patient_goals_status" ON "public"."patient_goals" USING "btree" ("status");



CREATE INDEX "idx_prescriptions_nutritionist_id" ON "public"."prescriptions" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_prescriptions_patient" ON "public"."prescriptions" USING "btree" ("patient_id");



CREATE INDEX "idx_prescriptions_patient_dates" ON "public"."prescriptions" USING "btree" ("patient_id", "start_date", "end_date");



CREATE INDEX "idx_prescriptions_patient_id" ON "public"."prescriptions" USING "btree" ("patient_id");



CREATE INDEX "idx_ref_values_plan" ON "public"."meal_plan_reference_values" USING "btree" ("meal_plan_id");



CREATE INDEX "idx_template_fields_field_id" ON "public"."anamnesis_template_fields" USING "btree" ("field_id");



CREATE INDEX "idx_template_fields_template_id" ON "public"."anamnesis_template_fields" USING "btree" ("template_id");



CREATE INDEX "idx_user_achievements_user_date" ON "public"."user_achievements" USING "btree" ("user_id", "achieved_at" DESC);



CREATE INDEX "idx_user_profiles_nutritionist_active" ON "public"."user_profiles" USING "btree" ("nutritionist_id", "user_type", "is_active") WHERE (("user_type" = 'patient'::"text") AND ("is_active" = true));



CREATE INDEX "idx_user_profiles_nutritionist_id" ON "public"."user_profiles" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_weekly_summaries_nutritionist_id" ON "public"."weekly_summaries" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_weekly_summaries_patient_id" ON "public"."weekly_summaries" USING "btree" ("patient_id");



CREATE OR REPLACE TRIGGER "on_meal_update" BEFORE UPDATE ON "public"."meals" FOR EACH ROW WHEN (("old".* IS DISTINCT FROM "new".*)) EXECUTE FUNCTION "public"."log_meal_edit"();



CREATE OR REPLACE TRIGGER "on_new_chat_message" AFTER INSERT ON "public"."chats" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_chat_message_notification"();



CREATE OR REPLACE TRIGGER "on_new_summary" AFTER INSERT ON "public"."weekly_summaries" FOR EACH ROW EXECUTE FUNCTION "public"."create_summary_notification"();



CREATE OR REPLACE TRIGGER "trigger_foods_updated" BEFORE UPDATE ON "public"."foods" FOR EACH ROW EXECUTE FUNCTION "public"."update_foods_timestamp"();



CREATE OR REPLACE TRIGGER "trigger_meal_plan_meal_updated" BEFORE UPDATE ON "public"."meal_plan_meals" FOR EACH ROW EXECUTE FUNCTION "public"."update_meal_plan_timestamp"();



CREATE OR REPLACE TRIGGER "trigger_meal_plan_updated" BEFORE UPDATE ON "public"."meal_plans" FOR EACH ROW EXECUTE FUNCTION "public"."update_meal_plan_timestamp"();



CREATE OR REPLACE TRIGGER "trigger_reference_values_updated" BEFORE UPDATE ON "public"."meal_plan_reference_values" FOR EACH ROW EXECUTE FUNCTION "public"."update_reference_values_timestamp"();



CREATE OR REPLACE TRIGGER "trigger_sync_anthropometry" AFTER INSERT OR UPDATE OF "weight", "height" ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_anthropometry_on_profile_change"();



COMMENT ON TRIGGER "trigger_sync_anthropometry" ON "public"."user_profiles" IS 'Trigger que sincroniza peso e altura do cadastro do paciente com a tabela de avaliação antropométrica (growth_records).';



CREATE OR REPLACE TRIGGER "trigger_update_energy_calc_timestamp" BEFORE UPDATE ON "public"."energy_expenditure_calculations" FOR EACH ROW EXECUTE FUNCTION "public"."update_energy_calc_timestamp"();



CREATE OR REPLACE TRIGGER "trigger_update_lab_results_timestamp" BEFORE UPDATE ON "public"."lab_results" FOR EACH ROW EXECUTE FUNCTION "public"."update_lab_results_timestamp"();



CREATE OR REPLACE TRIGGER "trigger_update_patient_goals_updated_at" BEFORE UPDATE ON "public"."patient_goals" FOR EACH ROW EXECUTE FUNCTION "public"."update_patient_goals_updated_at"();



CREATE OR REPLACE TRIGGER "update_anamnesis_records_updated_at" BEFORE UPDATE ON "public"."anamnesis_records" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_anamnesis_templates_updated_at" BEFORE UPDATE ON "public"."anamnesis_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_net_amount" BEFORE INSERT OR UPDATE ON "public"."financial_records" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_net_amount"();



ALTER TABLE ONLY "public"."anamnese_answers"
    ADD CONSTRAINT "anamnese_answers_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "public"."anamnese_fields"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."anamnese_answers"
    ADD CONSTRAINT "anamnese_answers_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."anamnese_field_options"
    ADD CONSTRAINT "anamnese_field_options_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "public"."anamnese_fields"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."anamnese_fields"
    ADD CONSTRAINT "anamnese_fields_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."anamnesis_records"
    ADD CONSTRAINT "anamnesis_records_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."anamnesis_records"
    ADD CONSTRAINT "anamnesis_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."anamnesis_records"
    ADD CONSTRAINT "anamnesis_records_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."anamnesis_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."anamnesis_template_fields"
    ADD CONSTRAINT "anamnesis_template_fields_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "public"."anamnese_fields"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."anamnesis_template_fields"
    ADD CONSTRAINT "anamnesis_template_fields_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."anamnesis_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."anamnesis_templates"
    ADD CONSTRAINT "anamnesis_templates_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_from_id_fkey" FOREIGN KEY ("from_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_to_id_fkey" FOREIGN KEY ("to_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."energy_expenditure_calculations"
    ADD CONSTRAINT "energy_expenditure_calculations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_records"
    ADD CONSTRAINT "financial_records_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."financial_records"
    ADD CONSTRAINT "financial_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."financial_records"
    ADD CONSTRAINT "financial_records_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id");



ALTER TABLE ONLY "public"."financial_transactions"
    ADD CONSTRAINT "financial_transactions_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."financial_transactions"
    ADD CONSTRAINT "financial_transactions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_audit_log"
    ADD CONSTRAINT "fk_patient" FOREIGN KEY ("patient_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."food_household_measures"
    ADD CONSTRAINT "food_household_measures_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id");



ALTER TABLE ONLY "public"."food_household_measures"
    ADD CONSTRAINT "food_household_measures_measure_id_fkey" FOREIGN KEY ("measure_id") REFERENCES "public"."household_measures"("id");



ALTER TABLE ONLY "public"."food_measures"
    ADD CONSTRAINT "food_measures_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."foods"
    ADD CONSTRAINT "foods_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."glycemia_records"
    ADD CONSTRAINT "glycemia_records_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."glycemia_records"
    ADD CONSTRAINT "glycemia_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."growth_records"
    ADD CONSTRAINT "growth_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lab_results"
    ADD CONSTRAINT "lab_results_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_audit_log"
    ADD CONSTRAINT "meal_audit_log_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meal_audit_log"
    ADD CONSTRAINT "meal_audit_log_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_edit_history"
    ADD CONSTRAINT "meal_edit_history_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_edit_history"
    ADD CONSTRAINT "meal_edit_history_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_history"
    ADD CONSTRAINT "meal_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."meal_history"
    ADD CONSTRAINT "meal_history_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_items"
    ADD CONSTRAINT "meal_items_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meal_items"
    ADD CONSTRAINT "meal_items_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_plan_foods"
    ADD CONSTRAINT "meal_plan_foods_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."meal_plan_foods"
    ADD CONSTRAINT "meal_plan_foods_meal_plan_meal_id_fkey" FOREIGN KEY ("meal_plan_meal_id") REFERENCES "public"."meal_plan_meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_plan_meals"
    ADD CONSTRAINT "meal_plan_meals_meal_plan_id_fkey" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_plan_reference_values"
    ADD CONSTRAINT "meal_plan_reference_values_meal_plan_id_fkey" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_plans"
    ADD CONSTRAINT "meal_plans_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_plans"
    ADD CONSTRAINT "meal_plans_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meals"
    ADD CONSTRAINT "meals_meal_plan_id_fkey" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meals"
    ADD CONSTRAINT "meals_meal_plan_meal_id_fkey" FOREIGN KEY ("meal_plan_meal_id") REFERENCES "public"."meal_plan_meals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meals"
    ADD CONSTRAINT "meals_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_goals"
    ADD CONSTRAINT "patient_goals_energy_expenditure_id_fkey" FOREIGN KEY ("energy_expenditure_id") REFERENCES "public"."energy_expenditure_calculations"("id");



ALTER TABLE ONLY "public"."patient_goals"
    ADD CONSTRAINT "patient_goals_meal_plan_id_fkey" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plans"("id");



ALTER TABLE ONLY "public"."patient_goals"
    ADD CONSTRAINT "patient_goals_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_goals"
    ADD CONSTRAINT "patient_goals_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_expenses"
    ADD CONSTRAINT "recurring_expenses_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."weekly_summaries"
    ADD CONSTRAINT "weekly_summaries_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_summaries"
    ADD CONSTRAINT "weekly_summaries_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can delete food measures" ON "public"."food_measures" FOR DELETE TO "authenticated" USING ((( SELECT "user_profiles"."is_admin"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"())) = true));



CREATE POLICY "Admins can delete profiles" ON "public"."user_profiles" FOR DELETE TO "authenticated" USING (("public"."check_is_admin"() = true));



CREATE POLICY "Admins can insert food measures" ON "public"."food_measures" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "user_profiles"."is_admin"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"())) = true));



CREATE POLICY "Admins can insert profiles" ON "public"."user_profiles" FOR INSERT TO "authenticated" WITH CHECK (("public"."check_is_admin"() = true));



CREATE POLICY "Admins can update food measures" ON "public"."food_measures" FOR UPDATE TO "authenticated" USING ((( SELECT "user_profiles"."is_admin"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"())) = true));



CREATE POLICY "Admins can update profiles" ON "public"."user_profiles" FOR UPDATE TO "authenticated" USING (("public"."check_is_admin"() = true));



CREATE POLICY "Admins can view all profiles" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING ((("public"."check_is_admin"() = true) OR ("auth"."uid"() = "id")));



CREATE POLICY "Authenticated users can view food measures" ON "public"."food_measures" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Manage own recurring expenses" ON "public"."recurring_expenses" TO "authenticated" USING (("nutritionist_id" = "auth"."uid"()));



CREATE POLICY "Nutricionistas podem atualizar cálculos dos seus pacientes" ON "public"."energy_expenditure_calculations" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "energy_expenditure_calculations"."patient_id") AND ("user_profiles"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutricionistas podem atualizar exames dos seus pacientes" ON "public"."lab_results" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "lab_results"."patient_id") AND ("user_profiles"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutricionistas podem atualizar opções dos seus campos" ON "public"."anamnese_field_options" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."anamnese_fields"
  WHERE (("anamnese_fields"."id" = "anamnese_field_options"."field_id") AND ("anamnese_fields"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutricionistas podem deletar associações dos seus templates" ON "public"."anamnesis_template_fields" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."anamnesis_templates"
  WHERE (("anamnesis_templates"."id" = "anamnesis_template_fields"."template_id") AND ("anamnesis_templates"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutricionistas podem deletar cálculos dos seus pacientes" ON "public"."energy_expenditure_calculations" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "energy_expenditure_calculations"."patient_id") AND ("user_profiles"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutricionistas podem deletar exames dos seus pacientes" ON "public"."lab_results" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "lab_results"."patient_id") AND ("user_profiles"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutricionistas podem deletar opções dos seus campos" ON "public"."anamnese_field_options" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."anamnese_fields"
  WHERE (("anamnese_fields"."id" = "anamnese_field_options"."field_id") AND ("anamnese_fields"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutricionistas podem inserir associações nos seus templates" ON "public"."anamnesis_template_fields" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."anamnesis_templates"
  WHERE (("anamnesis_templates"."id" = "anamnesis_template_fields"."template_id") AND ("anamnesis_templates"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutricionistas podem inserir cálculos para seus pacientes" ON "public"."energy_expenditure_calculations" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "energy_expenditure_calculations"."patient_id") AND ("user_profiles"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutricionistas podem inserir exames para seus pacientes" ON "public"."lab_results" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "lab_results"."patient_id") AND ("user_profiles"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutricionistas podem inserir opções nos seus campos" ON "public"."anamnese_field_options" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."anamnese_fields"
  WHERE (("anamnese_fields"."id" = "anamnese_field_options"."field_id") AND ("anamnese_fields"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutricionistas podem ver as refeições dos seus pacientes" ON "public"."meals" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "p"
  WHERE (("p"."id" = "meals"."patient_id") AND ("p"."nutritionist_id" = "auth"."uid"()) AND ("p"."is_active" = true)))));



CREATE POLICY "Nutricionistas podem ver associações dos seus templates" ON "public"."anamnesis_template_fields" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."anamnesis_templates"
  WHERE (("anamnesis_templates"."id" = "anamnesis_template_fields"."template_id") AND ("anamnesis_templates"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutricionistas podem ver cálculos dos seus pacientes" ON "public"."energy_expenditure_calculations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "energy_expenditure_calculations"."patient_id") AND ("user_profiles"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutricionistas podem ver exames dos seus pacientes" ON "public"."lab_results" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "lab_results"."patient_id") AND ("user_profiles"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutricionistas podem ver opções dos seus campos" ON "public"."anamnese_field_options" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."anamnese_fields"
  WHERE (("anamnese_fields"."id" = "anamnese_field_options"."field_id") AND ("anamnese_fields"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutricionistas podem ver os items das refeições dos seus paci" ON "public"."meal_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."meals" "m"
     JOIN "public"."user_profiles" "p" ON (("m"."patient_id" = "p"."id")))
  WHERE (("m"."id" = "meal_items"."meal_id") AND ("p"."nutritionist_id" = "auth"."uid"()) AND ("p"."is_active" = true)))));



CREATE POLICY "Nutricionistas podem ver os perfis dos seus pacientes" ON "public"."user_profiles" FOR SELECT USING ((("nutritionist_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("is_active" = true)));



CREATE POLICY "Nutricionists can create anamnesis for their patients" ON "public"."anamnesis_records" FOR INSERT WITH CHECK ((("auth"."uid"() = "nutritionist_id") AND ("patient_id" IN ( SELECT "user_profiles"."id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutricionists can create their own templates" ON "public"."anamnesis_templates" FOR INSERT WITH CHECK (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutricionists can delete anamnesis of their patients" ON "public"."anamnesis_records" FOR DELETE USING ((("auth"."uid"() = "nutritionist_id") OR ("patient_id" IN ( SELECT "user_profiles"."id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutricionists can delete their own templates" ON "public"."anamnesis_templates" FOR DELETE USING ((("auth"."uid"() = "nutritionist_id") AND ("is_system_default" = false)));



CREATE POLICY "Nutricionists can update anamnesis of their patients" ON "public"."anamnesis_records" FOR UPDATE USING ((("auth"."uid"() = "nutritionist_id") OR ("patient_id" IN ( SELECT "user_profiles"."id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutricionists can update their own templates" ON "public"."anamnesis_templates" FOR UPDATE USING ((("auth"."uid"() = "nutritionist_id") AND ("is_system_default" = false)));



CREATE POLICY "Nutricionists can view anamnesis of their patients" ON "public"."anamnesis_records" FOR SELECT USING ((("auth"."uid"() = "nutritionist_id") OR ("patient_id" IN ( SELECT "user_profiles"."id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutricionists can view their own templates and system defaults" ON "public"."anamnesis_templates" FOR SELECT USING ((("auth"."uid"() = "nutritionist_id") OR ("is_system_default" = true)));



CREATE POLICY "Nutris podem ver e gerenciar respostas dos seus pacientes" ON "public"."anamnese_answers" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "p"
  WHERE (("p"."id" = "anamnese_answers"."patient_id") AND ("p"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutris podem ver e gerenciar seus próprios campos de anamnese" ON "public"."anamnese_fields" USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutritionists can create prescriptions" ON "public"."prescriptions" FOR INSERT WITH CHECK (("public"."get_user_id"() = "nutritionist_id"));



CREATE POLICY "Nutritionists can delete patient goals" ON "public"."patient_goals" FOR DELETE USING ((("nutritionist_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."user_type" = 'nutritionist'::"text"))))));



CREATE POLICY "Nutritionists can delete their own foods" ON "public"."foods" FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."user_type" = 'nutritionist'::"text")))) AND ("nutritionist_id" = "auth"."uid"())));



CREATE POLICY "Nutritionists can delete their own prescriptions" ON "public"."prescriptions" FOR DELETE TO "authenticated" USING (("public"."get_user_id"() = "nutritionist_id"));



CREATE POLICY "Nutritionists can insert foods" ON "public"."foods" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."user_type" = 'nutritionist'::"text")))));



CREATE POLICY "Nutritionists can insert patient goals" ON "public"."patient_goals" FOR INSERT WITH CHECK ((("nutritionist_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."user_type" = 'nutritionist'::"text"))))));



CREATE POLICY "Nutritionists can manage their own financial transactions" ON "public"."financial_transactions" USING (("public"."get_user_id"() = "nutritionist_id"));



CREATE POLICY "Nutritionists can update patient goals" ON "public"."patient_goals" FOR UPDATE USING ((("nutritionist_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."user_type" = 'nutritionist'::"text"))))));



CREATE POLICY "Nutritionists can update their own foods" ON "public"."foods" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."user_type" = 'nutritionist'::"text")))) AND ("nutritionist_id" = "auth"."uid"()))) WITH CHECK (("nutritionist_id" = "auth"."uid"()));



CREATE POLICY "Nutritionists can update their own prescriptions" ON "public"."prescriptions" FOR UPDATE TO "authenticated" USING (("public"."get_user_id"() = "nutritionist_id")) WITH CHECK (("public"."get_user_id"() = "nutritionist_id"));



CREATE POLICY "Nutritionists can view patient goals" ON "public"."patient_goals" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."user_type" = 'nutritionist'::"text") AND ("user_profiles"."id" = ( SELECT "user_profiles_1"."nutritionist_id"
           FROM "public"."user_profiles" "user_profiles_1"
          WHERE ("user_profiles_1"."id" = "patient_goals"."patient_id")))))));



CREATE POLICY "Nutritionists can view their own foods" ON "public"."foods" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."user_type" = 'nutritionist'::"text")))) AND ("nutritionist_id" = "auth"."uid"())));



CREATE POLICY "Nutritionists can view their patients audit logs" ON "public"."meal_audit_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "meal_audit_log"."patient_id") AND ("user_profiles"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutritionists can view their patients meal edit history" ON "public"."meal_edit_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "p"
  WHERE (("p"."id" = "meal_edit_history"."patient_id") AND ("p"."nutritionist_id" = "auth"."uid"()) AND ("p"."is_active" = true)))));



CREATE POLICY "Nutritionists can view their patients meals" ON "public"."meals" FOR SELECT USING ((("deleted_at" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "meals"."patient_id") AND ("user_profiles"."nutritionist_id" = "auth"."uid"()))))));



CREATE POLICY "Nutritionists can view/manage own templates" ON "public"."meal_plans" TO "authenticated" USING ((("nutritionist_id" = "auth"."uid"()) AND (("patient_id" IS NULL) OR ("patient_id" IN ( SELECT "user_profiles"."id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."nutritionist_id" = "auth"."uid"()))))));



CREATE POLICY "Nutritionists manage own appointments" ON "public"."appointments" TO "authenticated" USING (("nutritionist_id" = "auth"."uid"()));



CREATE POLICY "Nutritionists manage own services" ON "public"."services" TO "authenticated" USING (("nutritionist_id" = "auth"."uid"()));



CREATE POLICY "Pacientes podem ver seus próprios exames" ON "public"."lab_results" FOR SELECT USING (("patient_id" = "auth"."uid"()));



CREATE POLICY "Patients can view their own audit logs" ON "public"."meal_audit_log" FOR SELECT USING (("patient_id" = "auth"."uid"()));



CREATE POLICY "Public can view all achievements definitions" ON "public"."achievements" FOR SELECT USING (true);



CREATE POLICY "System can insert audit logs" ON "public"."meal_audit_log" FOR INSERT WITH CHECK (true);



CREATE POLICY "Users can delete their own meals" ON "public"."meals" FOR UPDATE USING (("patient_id" = "auth"."uid"()));



CREATE POLICY "Users can insert meal edit history for their own meals" ON "public"."meal_edit_history" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."meals" "m"
  WHERE (("m"."id" = "meal_edit_history"."meal_id") AND ("m"."patient_id" = "public"."get_user_id"())))));



CREATE POLICY "Users can insert their own chats" ON "public"."chats" FOR INSERT WITH CHECK (("public"."get_user_id"() = "from_id"));



CREATE POLICY "Users can insert their own meals" ON "public"."meals" FOR INSERT WITH CHECK (("patient_id" = "auth"."uid"()));



CREATE POLICY "Users can manage growth records for their patients/themselves" ON "public"."growth_records" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "p"
  WHERE (("p"."id" = "growth_records"."patient_id") AND (("p"."id" = "auth"."uid"()) OR ("p"."nutritionist_id" = "auth"."uid"())) AND ("p"."is_active" = true)))));



CREATE POLICY "Users can manage own financial records" ON "public"."financial_records" TO "authenticated" USING (("nutritionist_id" = "auth"."uid"())) WITH CHECK (("nutritionist_id" = "auth"."uid"()));



CREATE POLICY "Users can manage their own appointments" ON "public"."appointments" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "p"
  WHERE ((("p"."id" = "appointments"."patient_id") OR ("p"."id" = "appointments"."nutritionist_id")) AND (("p"."id" = "auth"."uid"()) OR ("p"."nutritionist_id" = "auth"."uid"())) AND ("p"."is_active" = true)))));



CREATE POLICY "Users can manage their own notifications" ON "public"."notifications" USING (("public"."get_user_id"() = "user_id"));



CREATE POLICY "Users can manage their own summaries" ON "public"."weekly_summaries" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "p"
  WHERE (("p"."id" = "weekly_summaries"."patient_id") AND (("p"."id" = "auth"."uid"()) OR ("p"."nutritionist_id" = "auth"."uid"())) AND ("p"."is_active" = true)))));



CREATE POLICY "Users can read their own messages" ON "public"."chats" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "from_id") OR ("auth"."uid"() = "to_id")));



CREATE POLICY "Users can see their own prescriptions" ON "public"."prescriptions" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "p"
  WHERE ((("p"."id" = "prescriptions"."patient_id") OR ("p"."id" = "prescriptions"."nutritionist_id")) AND ("p"."id" = "auth"."uid"()) AND ("p"."is_active" = true)))) OR (EXISTS ( SELECT 1
   FROM ("public"."user_profiles" "p_patient"
     JOIN "public"."user_profiles" "p_nutri" ON (("p_patient"."nutritionist_id" = "p_nutri"."id")))
  WHERE (("p_patient"."id" = "prescriptions"."patient_id") AND ("p_nutri"."id" = "auth"."uid"()) AND ("p_patient"."is_active" = true))))));



CREATE POLICY "Users can update their own meals" ON "public"."meals" FOR UPDATE USING ((("patient_id" = "auth"."uid"()) AND ("deleted_at" IS NULL)));



CREATE POLICY "Users can view relevant foods" ON "public"."foods" FOR SELECT TO "authenticated" USING ((("nutritionist_id" IS NULL) OR ("nutritionist_id" = ( SELECT "user_profiles"."nutritionist_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can view their own achievements" ON "public"."user_achievements" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own goals" ON "public"."patient_goals" FOR SELECT USING (("patient_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own meal items" ON "public"."meal_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."meals" "m"
     JOIN "public"."user_profiles" "p" ON (("m"."patient_id" = "p"."id")))
  WHERE (("m"."id" = "meal_items"."meal_id") AND ("p"."id" = "auth"."uid"()) AND ("p"."is_active" = true)))));



CREATE POLICY "Users can view their own meals" ON "public"."meals" FOR SELECT USING ((("patient_id" = "auth"."uid"()) AND ("deleted_at" IS NULL)));



CREATE POLICY "Utilizadores podem gerir as suas próprias refeições" ON "public"."meals" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "patient_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "patient_id"));



CREATE POLICY "Utilizadores podem gerir os items das suas refeições" ON "public"."meal_items" TO "authenticated" USING ((( SELECT "meals"."patient_id"
   FROM "public"."meals"
  WHERE ("meals"."id" = "meal_items"."meal_id")) = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ((( SELECT "meals"."patient_id"
   FROM "public"."meals"
  WHERE ("meals"."id" = "meal_items"."meal_id")) = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Utilizadores podem gerir os seus próprios perfis" ON "public"."user_profiles" USING (((( SELECT "auth"."uid"() AS "uid") = "id") AND ("is_active" = true))) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



ALTER TABLE "public"."achievements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."anamnese_answers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."anamnese_field_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."anamnese_fields" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."anamnesis_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."anamnesis_template_fields" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."anamnesis_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."energy_expenditure_calculations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."food_measures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."foods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."growth_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lab_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_edit_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patient_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prescriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recurring_expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_achievements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_summaries" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chats";



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT ALL ON SCHEMA "public" TO PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































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



GRANT ALL ON FUNCTION "public"."check_and_grant_achievements"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_and_grant_achievements"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_and_grant_achievements"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_appointment_reminders"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_appointment_reminders"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_appointment_reminders"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_daily_log_reminders"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_daily_log_reminders"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_daily_log_reminders"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_summary_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_summary_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_summary_notification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_patient"("patient_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_patient"("patient_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_patient"("patient_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_read_notifications"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_read_notifications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_read_notifications"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_dashboard_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_dashboard_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_dashboard_stats"() TO "service_role";



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



GRANT ALL ON FUNCTION "public"."get_formatted_address"("address_jsonb" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."get_formatted_address"("address_jsonb" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_formatted_address"("address_jsonb" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_grams_from_measure"("p_food_id" bigint, "p_measure_code" "text", "p_quantity" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."get_grams_from_measure"("p_food_id" bigint, "p_measure_code" "text", "p_quantity" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_grams_from_measure"("p_food_id" bigint, "p_measure_code" "text", "p_quantity" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_meal_plan_with_foods_optimized"("p_meal_plan_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_meal_plan_with_foods_optimized"("p_meal_plan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_meal_plan_with_foods_optimized"("p_meal_plan_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_patients_low_adherence_optimized"("p_nutritionist_id" "uuid", "p_days_threshold" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_patients_low_adherence_optimized"("p_nutritionist_id" "uuid", "p_days_threshold" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_patients_low_adherence_optimized"("p_nutritionist_id" "uuid", "p_days_threshold" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_patients_pending_data_optimized"("p_nutritionist_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_patients_pending_data_optimized"("p_nutritionist_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_patients_pending_data_optimized"("p_nutritionist_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_recent_patient_activity"("nutritionist_id_param" "uuid", "limit_param" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_recent_patient_activity"("nutritionist_id_param" "uuid", "limit_param" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_recent_patient_activity"("nutritionist_id_param" "uuid", "limit_param" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_unread_senders"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_unread_senders"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unread_senders"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_chat_message_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_chat_message_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_chat_message_notification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_meal_action"("p_patient_id" "uuid", "p_meal_id" bigint, "p_action" "text", "p_meal_type" "text", "p_meal_date" "date", "p_meal_time" time without time zone, "p_details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_meal_action"("p_patient_id" "uuid", "p_meal_id" bigint, "p_action" "text", "p_meal_type" "text", "p_meal_date" "date", "p_meal_time" time without time zone, "p_details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_meal_action"("p_patient_id" "uuid", "p_meal_id" bigint, "p_action" "text", "p_meal_type" "text", "p_meal_date" "date", "p_meal_time" time without time zone, "p_details" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_meal_edit"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_meal_edit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_meal_edit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_chat_notifications_as_read"("p_user_id" "uuid", "p_sender_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_chat_notifications_as_read"("p_user_id" "uuid", "p_sender_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_chat_notifications_as_read"("p_user_id" "uuid", "p_sender_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_messages_as_read"("p_user_id" "uuid", "p_sender_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_messages_as_read"("p_user_id" "uuid", "p_sender_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_messages_as_read"("p_user_id" "uuid", "p_sender_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."search_foods"("p_search_term" "text", "p_limit" integer, "p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_foods"("p_search_term" "text", "p_limit" integer, "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_foods"("p_search_term" "text", "p_limit" integer, "p_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."soft_delete_meal"("p_meal_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."soft_delete_meal"("p_meal_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."soft_delete_meal"("p_meal_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_anthropometry_on_profile_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_anthropometry_on_profile_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_anthropometry_on_profile_change"() TO "service_role";



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



GRANT ALL ON FUNCTION "public"."update_patient_goals_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_patient_goals_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_patient_goals_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_reference_values_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_reference_values_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_reference_values_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";
























GRANT ALL ON TABLE "public"."achievements" TO "anon";
GRANT ALL ON TABLE "public"."achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."achievements" TO "service_role";



GRANT ALL ON SEQUENCE "public"."achievements_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."achievements_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."achievements_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."foods" TO "anon";
GRANT ALL ON TABLE "public"."foods" TO "authenticated";
GRANT ALL ON TABLE "public"."foods" TO "service_role";



GRANT ALL ON TABLE "public"."active_foods" TO "anon";
GRANT ALL ON TABLE "public"."active_foods" TO "authenticated";
GRANT ALL ON TABLE "public"."active_foods" TO "service_role";



GRANT ALL ON TABLE "public"."anamnese_answers" TO "anon";
GRANT ALL ON TABLE "public"."anamnese_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."anamnese_answers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."anamnese_answers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."anamnese_answers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."anamnese_answers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."anamnese_field_options" TO "anon";
GRANT ALL ON TABLE "public"."anamnese_field_options" TO "authenticated";
GRANT ALL ON TABLE "public"."anamnese_field_options" TO "service_role";



GRANT ALL ON SEQUENCE "public"."anamnese_field_options_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."anamnese_field_options_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."anamnese_field_options_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."anamnese_fields" TO "anon";
GRANT ALL ON TABLE "public"."anamnese_fields" TO "authenticated";
GRANT ALL ON TABLE "public"."anamnese_fields" TO "service_role";



GRANT ALL ON SEQUENCE "public"."anamnese_fields_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."anamnese_fields_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."anamnese_fields_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."anamnesis_records" TO "anon";
GRANT ALL ON TABLE "public"."anamnesis_records" TO "authenticated";
GRANT ALL ON TABLE "public"."anamnesis_records" TO "service_role";



GRANT ALL ON TABLE "public"."anamnesis_template_fields" TO "anon";
GRANT ALL ON TABLE "public"."anamnesis_template_fields" TO "authenticated";
GRANT ALL ON TABLE "public"."anamnesis_template_fields" TO "service_role";



GRANT ALL ON SEQUENCE "public"."anamnesis_template_fields_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."anamnesis_template_fields_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."anamnesis_template_fields_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."anamnesis_templates" TO "anon";
GRANT ALL ON TABLE "public"."anamnesis_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."anamnesis_templates" TO "service_role";



GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."appointments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."appointments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."appointments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."chats" TO "anon";
GRANT ALL ON TABLE "public"."chats" TO "authenticated";
GRANT ALL ON TABLE "public"."chats" TO "service_role";



GRANT ALL ON SEQUENCE "public"."chats_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."chats_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."chats_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."energy_expenditure_calculations" TO "anon";
GRANT ALL ON TABLE "public"."energy_expenditure_calculations" TO "authenticated";
GRANT ALL ON TABLE "public"."energy_expenditure_calculations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."energy_expenditure_calculations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."energy_expenditure_calculations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."energy_expenditure_calculations_id_seq" TO "service_role";



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



GRANT ALL ON SEQUENCE "public"."food_measures_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."food_measures_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."food_measures_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."foods_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."foods_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."foods_id_seq" TO "service_role";



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



GRANT ALL ON TABLE "public"."meal_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."meal_audit_log" TO "authenticated";
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
GRANT ALL ON TABLE "public"."meal_history" TO "authenticated";
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



GRANT ALL ON TABLE "public"."meal_plans" TO "anon";
GRANT ALL ON TABLE "public"."meal_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_plans" TO "service_role";



GRANT ALL ON SEQUENCE "public"."meal_plans_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."meal_plans_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."meal_plans_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."meals" TO "anon";
GRANT ALL ON TABLE "public"."meals" TO "authenticated";
GRANT ALL ON TABLE "public"."meals" TO "service_role";



GRANT ALL ON SEQUENCE "public"."meals_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."meals_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."meals_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "service_role";



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



GRANT ALL ON SEQUENCE "public"."prescriptions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."prescriptions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."prescriptions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."recurring_expenses" TO "anon";
GRANT ALL ON TABLE "public"."recurring_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."recurring_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



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




























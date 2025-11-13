

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



CREATE OR REPLACE FUNCTION "public"."update_foods_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_foods_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_meal_plan_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_meal_plan_timestamp"() OWNER TO "postgres";


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



CREATE TABLE IF NOT EXISTS "public"."anamnese_fields" (
    "id" bigint NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "field_label" "text" NOT NULL,
    "field_type" "text" NOT NULL,
    "options" "text"[],
    "order" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."anamnese_fields" OWNER TO "postgres";


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
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


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
    "income_source" "text"
);


ALTER TABLE "public"."financial_transactions" OWNER TO "postgres";


ALTER TABLE "public"."financial_transactions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."financial_transactions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."food_measure_conversions" (
    "id" bigint NOT NULL,
    "food_id" bigint NOT NULL,
    "measure_code" "text" NOT NULL,
    "grams_equivalent" numeric(10,2) NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."food_measure_conversions" OWNER TO "postgres";


COMMENT ON TABLE "public"."food_measure_conversions" IS 'Conversões específicas de medidas caseiras para cada alimento';



CREATE SEQUENCE IF NOT EXISTS "public"."food_measure_conversions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."food_measure_conversions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."food_measure_conversions_id_seq" OWNED BY "public"."food_measure_conversions"."id";



ALTER TABLE "public"."foods" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."foods_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."growth_records" (
    "id" bigint NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "record_date" "date" NOT NULL,
    "weight" numeric,
    "height" numeric,
    "head_circumference" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text"
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



CREATE TABLE IF NOT EXISTS "public"."meal_foods" (
    "id" bigint NOT NULL,
    "meal_id" bigint NOT NULL,
    "food_id" bigint NOT NULL,
    "quantity" numeric(10,2) NOT NULL,
    "unit" "text" NOT NULL,
    "calories" numeric(10,2) NOT NULL,
    "protein" numeric(10,2) NOT NULL,
    "carbs" numeric(10,2) NOT NULL,
    "fat" numeric(10,2) NOT NULL,
    "order_index" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."meal_foods" OWNER TO "postgres";


COMMENT ON TABLE "public"."meal_foods" IS 'Alimentos registrados pelo paciente em cada refeição';



CREATE SEQUENCE IF NOT EXISTS "public"."meal_foods_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."meal_foods_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."meal_foods_id_seq" OWNED BY "public"."meal_foods"."id";



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
    "carbs" numeric NOT NULL
);


ALTER TABLE "public"."meal_items" OWNER TO "postgres";


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
    "patient_id" "uuid" NOT NULL,
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
    "updated_at" timestamp with time zone DEFAULT "now"()
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
    "meal_plan_id" bigint
);


ALTER TABLE "public"."meals" OWNER TO "postgres";


COMMENT ON COLUMN "public"."meals"."adherence_score" IS 'Porcentagem de aderência do paciente ao plano alimentar';



ALTER TABLE "public"."meals" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."meals_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."measure_conversions" (
    "id" bigint NOT NULL,
    "food_id" bigint,
    "measure_name" "text" NOT NULL,
    "grams_equivalent" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."measure_conversions" OWNER TO "postgres";


ALTER TABLE "public"."measure_conversions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."measure_conversions_id_seq"
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
    "observations" "text"
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



ALTER TABLE ONLY "public"."food_measure_conversions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."food_measure_conversions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."household_measures" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."household_measures_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."meal_foods" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."meal_foods_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."meal_history" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."meal_history_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."meal_plan_foods" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."meal_plan_foods_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."meal_plan_meals" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."meal_plan_meals_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."meal_plan_reference_values" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."meal_plan_reference_values_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."meal_plans" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."meal_plans_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anamnese_answers"
    ADD CONSTRAINT "anamnese_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anamnese_fields"
    ADD CONSTRAINT "anamnese_fields_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anamnesis_records"
    ADD CONSTRAINT "anamnesis_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anamnesis_templates"
    ADD CONSTRAINT "anamnesis_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_transactions"
    ADD CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."food_measure_conversions"
    ADD CONSTRAINT "food_measure_conversions_food_id_measure_code_key" UNIQUE ("food_id", "measure_code");



ALTER TABLE ONLY "public"."food_measure_conversions"
    ADD CONSTRAINT "food_measure_conversions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."foods"
    ADD CONSTRAINT "foods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."growth_records"
    ADD CONSTRAINT "growth_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."household_measures"
    ADD CONSTRAINT "household_measures_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."household_measures"
    ADD CONSTRAINT "household_measures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_edit_history"
    ADD CONSTRAINT "meal_edit_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_foods"
    ADD CONSTRAINT "meal_foods_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."measure_conversions"
    ADD CONSTRAINT "measure_conversions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_patient_id_start_date_key" UNIQUE ("patient_id", "start_date");



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id");



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



CREATE INDEX "idx_anamnesis_records_date" ON "public"."anamnesis_records" USING "btree" ("date" DESC);



CREATE INDEX "idx_anamnesis_records_nutritionist" ON "public"."anamnesis_records" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_anamnesis_records_patient" ON "public"."anamnesis_records" USING "btree" ("patient_id");



CREATE INDEX "idx_anamnesis_templates_nutritionist" ON "public"."anamnesis_templates" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_anamnesis_templates_system" ON "public"."anamnesis_templates" USING "btree" ("is_system_default") WHERE ("is_system_default" = true);



CREATE INDEX "idx_appointments_nutritionist_id" ON "public"."appointments" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_appointments_patient_date" ON "public"."appointments" USING "btree" ("patient_id", "appointment_time" DESC);



CREATE INDEX "idx_appointments_patient_id" ON "public"."appointments" USING "btree" ("patient_id");



CREATE INDEX "idx_chats_from_id" ON "public"."chats" USING "btree" ("from_id");



CREATE INDEX "idx_chats_from_to" ON "public"."chats" USING "btree" ("from_id", "to_id", "created_at" DESC);



CREATE INDEX "idx_chats_to_id" ON "public"."chats" USING "btree" ("to_id");



CREATE INDEX "idx_financial_transactions_nutritionist_id" ON "public"."financial_transactions" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_financial_transactions_patient_id" ON "public"."financial_transactions" USING "btree" ("patient_id");



CREATE INDEX "idx_food_measure_conv_food" ON "public"."food_measure_conversions" USING "btree" ("food_id");



CREATE INDEX "idx_food_measure_conv_measure" ON "public"."food_measure_conversions" USING "btree" ("measure_code");



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



CREATE INDEX "idx_meal_edit_history_meal_id" ON "public"."meal_edit_history" USING "btree" ("meal_id");



CREATE INDEX "idx_meal_edit_history_patient_id" ON "public"."meal_edit_history" USING "btree" ("patient_id");



CREATE INDEX "idx_meal_foods_food" ON "public"."meal_foods" USING "btree" ("food_id");



CREATE INDEX "idx_meal_foods_meal" ON "public"."meal_foods" USING "btree" ("meal_id");



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



CREATE INDEX "idx_meals_patient_date" ON "public"."meals" USING "btree" ("patient_id", "created_at" DESC);



CREATE INDEX "idx_meals_patient_id" ON "public"."meals" USING "btree" ("patient_id");



CREATE INDEX "idx_meals_plan" ON "public"."meals" USING "btree" ("meal_plan_id");



CREATE INDEX "idx_meals_plan_meal" ON "public"."meals" USING "btree" ("meal_plan_meal_id");



CREATE INDEX "idx_measure_conversions_food_id" ON "public"."measure_conversions" USING "btree" ("food_id");



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_prescriptions_nutritionist_id" ON "public"."prescriptions" USING "btree" ("nutritionist_id");



CREATE INDEX "idx_prescriptions_patient" ON "public"."prescriptions" USING "btree" ("patient_id");



CREATE INDEX "idx_prescriptions_patient_id" ON "public"."prescriptions" USING "btree" ("patient_id");



CREATE INDEX "idx_ref_values_plan" ON "public"."meal_plan_reference_values" USING "btree" ("meal_plan_id");



CREATE INDEX "idx_user_achievements_user_date" ON "public"."user_achievements" USING "btree" ("user_id", "achieved_at" DESC);



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



CREATE OR REPLACE TRIGGER "update_anamnesis_records_updated_at" BEFORE UPDATE ON "public"."anamnesis_records" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_anamnesis_templates_updated_at" BEFORE UPDATE ON "public"."anamnesis_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."anamnese_answers"
    ADD CONSTRAINT "anamnese_answers_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "public"."anamnese_fields"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."anamnese_answers"
    ADD CONSTRAINT "anamnese_answers_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."anamnese_fields"
    ADD CONSTRAINT "anamnese_fields_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."anamnesis_records"
    ADD CONSTRAINT "anamnesis_records_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."anamnesis_records"
    ADD CONSTRAINT "anamnesis_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."anamnesis_records"
    ADD CONSTRAINT "anamnesis_records_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."anamnesis_templates"("id") ON DELETE SET NULL;



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



ALTER TABLE ONLY "public"."financial_transactions"
    ADD CONSTRAINT "financial_transactions_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."financial_transactions"
    ADD CONSTRAINT "financial_transactions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_measure_conversions"
    ADD CONSTRAINT "food_measure_conversions_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_measure_conversions"
    ADD CONSTRAINT "food_measure_conversions_measure_code_fkey" FOREIGN KEY ("measure_code") REFERENCES "public"."household_measures"("code") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."foods"
    ADD CONSTRAINT "foods_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."growth_records"
    ADD CONSTRAINT "growth_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_edit_history"
    ADD CONSTRAINT "meal_edit_history_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_edit_history"
    ADD CONSTRAINT "meal_edit_history_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_foods"
    ADD CONSTRAINT "meal_foods_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."meal_foods"
    ADD CONSTRAINT "meal_foods_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."measure_conversions"
    ADD CONSTRAINT "measure_conversions_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."weekly_summaries"
    ADD CONSTRAINT "weekly_summaries_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_summaries"
    ADD CONSTRAINT "weekly_summaries_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Nutricionistas podem ver as refeições dos seus pacientes" ON "public"."meals" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "p"
  WHERE (("p"."id" = "meals"."patient_id") AND ("p"."nutritionist_id" = "auth"."uid"()) AND ("p"."is_active" = true)))));



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



CREATE POLICY "Nutritionists can delete their own foods" ON "public"."foods" FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."user_type" = 'nutritionist'::"text")))) AND ("nutritionist_id" = "auth"."uid"())));



CREATE POLICY "Nutritionists can delete their own prescriptions" ON "public"."prescriptions" FOR DELETE TO "authenticated" USING (("public"."get_user_id"() = "nutritionist_id"));



CREATE POLICY "Nutritionists can insert foods" ON "public"."foods" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."user_type" = 'nutritionist'::"text")))));



CREATE POLICY "Nutritionists can manage their own financial transactions" ON "public"."financial_transactions" USING (("public"."get_user_id"() = "nutritionist_id"));



CREATE POLICY "Nutritionists can update their own foods" ON "public"."foods" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."user_type" = 'nutritionist'::"text")))) AND ("nutritionist_id" = "auth"."uid"()))) WITH CHECK (("nutritionist_id" = "auth"."uid"()));



CREATE POLICY "Nutritionists can update their own prescriptions" ON "public"."prescriptions" FOR UPDATE TO "authenticated" USING (("public"."get_user_id"() = "nutritionist_id")) WITH CHECK (("public"."get_user_id"() = "nutritionist_id"));



CREATE POLICY "Nutritionists can view their own foods" ON "public"."foods" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."user_type" = 'nutritionist'::"text")))) AND ("nutritionist_id" = "auth"."uid"())));



CREATE POLICY "Nutritionists can view their patients meal edit history" ON "public"."meal_edit_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "p"
  WHERE (("p"."id" = "meal_edit_history"."patient_id") AND ("p"."nutritionist_id" = "auth"."uid"()) AND ("p"."is_active" = true)))));



CREATE POLICY "Public can view all achievements definitions" ON "public"."achievements" FOR SELECT USING (true);



CREATE POLICY "Users can insert meal edit history for their own meals" ON "public"."meal_edit_history" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."meals" "m"
  WHERE (("m"."id" = "meal_edit_history"."meal_id") AND ("m"."patient_id" = "public"."get_user_id"())))));



CREATE POLICY "Users can insert their own chats" ON "public"."chats" FOR INSERT WITH CHECK (("public"."get_user_id"() = "from_id"));



CREATE POLICY "Users can manage growth records for their patients/themselves" ON "public"."growth_records" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "p"
  WHERE (("p"."id" = "growth_records"."patient_id") AND (("p"."id" = "auth"."uid"()) OR ("p"."nutritionist_id" = "auth"."uid"())) AND ("p"."is_active" = true)))));



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



CREATE POLICY "Users can view relevant foods" ON "public"."foods" FOR SELECT TO "authenticated" USING ((("nutritionist_id" IS NULL) OR ("nutritionist_id" = ( SELECT "user_profiles"."nutritionist_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can view relevant measure conversions" ON "public"."measure_conversions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."foods"
  WHERE ("foods"."id" = "measure_conversions"."food_id"))));



CREATE POLICY "Users can view their own achievements" ON "public"."user_achievements" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own meal items" ON "public"."meal_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."meals" "m"
     JOIN "public"."user_profiles" "p" ON (("m"."patient_id" = "p"."id")))
  WHERE (("m"."id" = "meal_items"."meal_id") AND ("p"."id" = "auth"."uid"()) AND ("p"."is_active" = true)))));



CREATE POLICY "Users can view their own meals" ON "public"."meals" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "p"
  WHERE (("p"."id" = "meals"."patient_id") AND ("p"."id" = "auth"."uid"()) AND ("p"."is_active" = true)))));



CREATE POLICY "Utilizadores podem gerir as suas próprias refeições" ON "public"."meals" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "patient_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "patient_id"));



CREATE POLICY "Utilizadores podem gerir os items das suas refeições" ON "public"."meal_items" TO "authenticated" USING ((( SELECT "meals"."patient_id"
   FROM "public"."meals"
  WHERE ("meals"."id" = "meal_items"."meal_id")) = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ((( SELECT "meals"."patient_id"
   FROM "public"."meals"
  WHERE ("meals"."id" = "meal_items"."meal_id")) = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Utilizadores podem gerir os seus próprios perfis" ON "public"."user_profiles" USING (((( SELECT "auth"."uid"() AS "uid") = "id") AND ("is_active" = true))) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



ALTER TABLE "public"."achievements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."anamnese_answers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."anamnese_fields" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."anamnesis_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."anamnesis_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."foods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."growth_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_edit_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."measure_conversions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prescriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_achievements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_summaries" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chats";



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."calculate_macro_targets"("p_meal_plan_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_macro_targets"("p_meal_plan_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_macro_targets"("p_meal_plan_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_and_grant_achievements"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_and_grant_achievements"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_and_grant_achievements"("p_user_id" "uuid") TO "service_role";



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



GRANT ALL ON FUNCTION "public"."get_chat_recipient_profile"("recipient_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_chat_recipient_profile"("recipient_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_chat_recipient_profile"("recipient_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_daily_adherence"("p_nutritionist_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_daily_adherence"("p_nutritionist_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_daily_adherence"("p_nutritionist_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_formatted_address"("address_jsonb" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."get_formatted_address"("address_jsonb" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_formatted_address"("address_jsonb" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_grams_from_measure"("p_food_id" bigint, "p_measure_code" "text", "p_quantity" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."get_grams_from_measure"("p_food_id" bigint, "p_measure_code" "text", "p_quantity" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_grams_from_measure"("p_food_id" bigint, "p_measure_code" "text", "p_quantity" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_recent_patient_activity"("nutritionist_id_param" "uuid", "limit_param" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_recent_patient_activity"("nutritionist_id_param" "uuid", "limit_param" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_recent_patient_activity"("nutritionist_id_param" "uuid", "limit_param" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_unread_senders"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_unread_senders"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unread_senders"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_chat_message_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_chat_message_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_chat_message_notification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



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



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_anthropometry_on_profile_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_anthropometry_on_profile_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_anthropometry_on_profile_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_foods_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_foods_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_foods_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_meal_plan_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_meal_plan_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_meal_plan_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_reference_values_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_reference_values_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_reference_values_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";
























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



GRANT ALL ON TABLE "public"."anamnese_fields" TO "anon";
GRANT ALL ON TABLE "public"."anamnese_fields" TO "authenticated";
GRANT ALL ON TABLE "public"."anamnese_fields" TO "service_role";



GRANT ALL ON SEQUENCE "public"."anamnese_fields_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."anamnese_fields_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."anamnese_fields_id_seq" TO "service_role";



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



GRANT ALL ON TABLE "public"."chats" TO "anon";
GRANT ALL ON TABLE "public"."chats" TO "authenticated";
GRANT ALL ON TABLE "public"."chats" TO "service_role";



GRANT ALL ON SEQUENCE "public"."chats_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."chats_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."chats_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."financial_transactions" TO "anon";
GRANT ALL ON TABLE "public"."financial_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_transactions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."financial_transactions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."financial_transactions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."financial_transactions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."food_measure_conversions" TO "anon";
GRANT ALL ON TABLE "public"."food_measure_conversions" TO "authenticated";
GRANT ALL ON TABLE "public"."food_measure_conversions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."food_measure_conversions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."food_measure_conversions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."food_measure_conversions_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."foods_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."foods_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."foods_id_seq" TO "service_role";



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



GRANT ALL ON TABLE "public"."meal_edit_history" TO "anon";
GRANT ALL ON TABLE "public"."meal_edit_history" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_edit_history" TO "service_role";



GRANT ALL ON SEQUENCE "public"."meal_edit_history_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."meal_edit_history_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."meal_edit_history_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."meal_foods" TO "anon";
GRANT ALL ON TABLE "public"."meal_foods" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_foods" TO "service_role";



GRANT ALL ON SEQUENCE "public"."meal_foods_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."meal_foods_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."meal_foods_id_seq" TO "service_role";



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



GRANT ALL ON TABLE "public"."measure_conversions" TO "anon";
GRANT ALL ON TABLE "public"."measure_conversions" TO "authenticated";
GRANT ALL ON TABLE "public"."measure_conversions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."measure_conversions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."measure_conversions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."measure_conversions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "service_role";



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






























drop extension if exists "pg_net";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


  create policy "Authenticated users can view avatars"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'avatars'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "Authenticated users can view chat media"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'chat_media'::text) AND (auth.role() = 'authenticated'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM public.chats
  WHERE ((chats.media_url = objects.name) AND (chats.to_id = auth.uid())))))));



  create policy "Users can insert their own chat media"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'chat_media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can manage their own avatar"
  on "storage"."objects"
  as permissive
  for all
  to public
using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)))
with check (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can manage their own chat media"
  on "storage"."objects"
  as permissive
  for all
  to public
using (((bucket_id = 'chat_media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)))
with check (((bucket_id = 'chat_media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));




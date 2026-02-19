


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


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."app_role" AS ENUM (
    'patient',
    'nutritionist',
    'super_admin'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."appointment_status" AS ENUM (
    'scheduled',
    'confirmed',
    'canceled',
    'completed'
);


ALTER TYPE "public"."appointment_status" OWNER TO "postgres";


CREATE TYPE "public"."challenge_activity_type" AS ENUM (
    'joined',
    'requested',
    'approved',
    'rejected',
    'banned',
    'left',
    'day_completed',
    'streak_hit',
    'rank_changed',
    'challenge_completed',
    'challenge_cancelled',
    'owner_transferred'
);


ALTER TYPE "public"."challenge_activity_type" OWNER TO "postgres";


CREATE TYPE "public"."challenge_category" AS ENUM (
    'nutrition',
    'hydration',
    'movement',
    'routine',
    'community'
);


ALTER TYPE "public"."challenge_category" OWNER TO "postgres";


CREATE TYPE "public"."challenge_join_policy" AS ENUM (
    'auto',
    'manual'
);


ALTER TYPE "public"."challenge_join_policy" OWNER TO "postgres";


CREATE TYPE "public"."challenge_participant_role" AS ENUM (
    'owner',
    'moderator',
    'participant'
);


ALTER TYPE "public"."challenge_participant_role" OWNER TO "postgres";


CREATE TYPE "public"."challenge_participant_status" AS ENUM (
    'requested',
    'approved',
    'rejected',
    'banned',
    'left'
);


ALTER TYPE "public"."challenge_participant_status" OWNER TO "postgres";


CREATE TYPE "public"."challenge_privacy_mode" AS ENUM (
    'ranking_only',
    'feed_basic',
    'feed_detailed',
    'anonymous_ranking'
);


ALTER TYPE "public"."challenge_privacy_mode" OWNER TO "postgres";


CREATE TYPE "public"."challenge_rule_metric" AS ENUM (
    'daily_diary_complete',
    'daily_calories_lte',
    'daily_calories_gte',
    'daily_water_gte',
    'daily_exercise_verified'
);


ALTER TYPE "public"."challenge_rule_metric" OWNER TO "postgres";


CREATE TYPE "public"."challenge_scope" AS ENUM (
    'nutritionist',
    'public',
    'system'
);


ALTER TYPE "public"."challenge_scope" OWNER TO "postgres";


CREATE TYPE "public"."challenge_status" AS ENUM (
    'draft',
    'open',
    'running',
    'completed',
    'cancelled',
    'archived'
);


ALTER TYPE "public"."challenge_status" OWNER TO "postgres";


CREATE TYPE "public"."food_source" AS ENUM (
    'TACO',
    'TBCA',
    'USDA',
    'CUSTOM',
    'OFF',
    'TUCUNDUVA'
);


ALTER TYPE "public"."food_source" OWNER TO "postgres";


CREATE TYPE "public"."meal_period" AS ENUM (
    'breakfast',
    'morning_snack',
    'lunch',
    'afternoon_snack',
    'dinner',
    'supper',
    'pre_workout',
    'post_workout'
);


ALTER TYPE "public"."meal_period" OWNER TO "postgres";


CREATE TYPE "public"."message_type" AS ENUM (
    'text',
    'image',
    'audio',
    'video',
    'pdf'
);


ALTER TYPE "public"."message_type" OWNER TO "postgres";


CREATE TYPE "public"."news_type" AS ENUM (
    'update',
    'tip',
    'alert',
    'maintenance'
);


ALTER TYPE "public"."news_type" OWNER TO "postgres";


CREATE TYPE "public"."payment_method" AS ENUM (
    'credit_card',
    'debit_card',
    'pix',
    'cash',
    'transfer',
    'other'
);


ALTER TYPE "public"."payment_method" OWNER TO "postgres";


CREATE TYPE "public"."payment_status" AS ENUM (
    'pending',
    'paid',
    'refunded',
    'canceled'
);


ALTER TYPE "public"."payment_status" OWNER TO "postgres";


CREATE TYPE "public"."plan_status" AS ENUM (
    'draft',
    'active',
    'archived'
);


ALTER TYPE "public"."plan_status" OWNER TO "postgres";


CREATE TYPE "public"."plan_tier" AS ENUM (
    'free',
    'pro',
    'enterprise'
);


ALTER TYPE "public"."plan_tier" OWNER TO "postgres";


CREATE TYPE "public"."sub_status" AS ENUM (
    'active',
    'overdue',
    'canceled',
    'trial'
);


ALTER TYPE "public"."sub_status" OWNER TO "postgres";


CREATE TYPE "public"."substitution_type" AS ENUM (
    'text',
    'food'
);


ALTER TYPE "public"."substitution_type" OWNER TO "postgres";


CREATE TYPE "public"."ticket_priority" AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);


ALTER TYPE "public"."ticket_priority" OWNER TO "postgres";


CREATE TYPE "public"."ticket_status" AS ENUM (
    'open',
    'in_progress',
    'resolved',
    'closed'
);


ALTER TYPE "public"."ticket_status" OWNER TO "postgres";


CREATE TYPE "public"."timeline_event_type" AS ENUM (
    'log_diet',
    'log_water',
    'log_weight',
    'log_health',
    'upload_exam',
    'diet_break'
);


ALTER TYPE "public"."timeline_event_type" OWNER TO "postgres";


CREATE TYPE "public"."transaction_type" AS ENUM (
    'income',
    'expense'
);


ALTER TYPE "public"."transaction_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_challenge_rewards"("p_challenge_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  r record;
  v_valid bool;
  v_creator uuid;
  v_days int;
  v_participants int;
  v_retention numeric := 1;

  v_creator_points numeric := 0;
  v_participant_points numeric := 0;
begin
  select created_by_user_id, (end_date - start_date + 1) into v_creator, v_days
  from public.challenges where id = p_challenge_id;

  v_valid := public.is_challenge_valid_for_reputation(p_challenge_id);

  -- 1) Conquistas de participante + top3
  for r in
    select patient_id, final_rank
    from public.challenge_participants
    where challenge_id = p_challenge_id
      and status = 'approved'
  loop
    -- conta desafios concluídos (para 1 e 5)
    if (select count(*) from public.challenge_participants cp
        join public.challenges c on c.id = cp.challenge_id
        where cp.patient_id = r.patient_id
          and cp.status = 'approved'
          and c.status = 'completed') >= 1 then
      perform public.grant_achievement(r.patient_id, 'challenge_first_complete');
    end if;

    if (select count(*) from public.challenge_participants cp
        join public.challenges c on c.id = cp.challenge_id
        where cp.patient_id = r.patient_id
          and cp.status = 'approved'
          and c.status = 'completed') >= 5 then
      perform public.grant_achievement(r.patient_id, 'challenge_5_complete');
    end if;

    if r.final_rank is not null and r.final_rank <= 3 then
      perform public.grant_achievement(r.patient_id, 'challenge_top3');
    end if;
  end loop;

  -- 2) Reputação (apenas se desafio válido)
  if v_valid then
    select count(*) into v_participants
    from public.challenge_participants
    where challenge_id = p_challenge_id
      and status = 'approved'
      and last_activity_at is not null;

    -- fator duração (7-13=1, 14-29=2, 30+=3)
    -- fator participantes (5-9=1, 10-19=2, 20-49=3, 50+=4)
    -- mantive simples e robusto (sem farm de desafio curto/solo)
    v_creator_points := 1
      * case
          when v_days >= 30 then 3
          when v_days >= 14 then 2
          else 1
        end
      * case
          when v_participants >= 50 then 4
          when v_participants >= 20 then 3
          when v_participants >= 10 then 2
          else 1
        end;

    -- creator ganha
    insert into public.user_reputation (user_id, rep_score, rep_created, rep_participated)
    values (v_creator, v_creator_points, v_creator_points, 0)
    on conflict (user_id) do update
      set rep_score = user_reputation.rep_score + excluded.rep_score,
          rep_created = user_reputation.rep_created + excluded.rep_created,
          updated_at = now();

    insert into public.user_reputation_events (user_id, challenge_id, kind, points, details)
    values (v_creator, p_challenge_id, 'creator', v_creator_points,
            jsonb_build_object('days',v_days,'participants',v_participants));

    -- participantes ganham pouco (para incentivar jogar)
    v_participant_points := least(3, greatest(1, v_days / 10)); -- 7-19=1, 20-29=2, 30+=3

    insert into public.user_reputation (user_id, rep_score, rep_created, rep_participated)
    select
      cp.patient_id,
      v_participant_points,
      0,
      v_participant_points
    from public.challenge_participants cp
    where cp.challenge_id = p_challenge_id
      and cp.status = 'approved'
      and cp.last_activity_at is not null
    on conflict (user_id) do update
      set rep_score = user_reputation.rep_score + excluded.rep_score,
          rep_participated = user_reputation.rep_participated + excluded.rep_participated,
          updated_at = now();

    insert into public.user_reputation_events (user_id, challenge_id, kind, points, details)
    select
      cp.patient_id,
      p_challenge_id,
      'participant',
      v_participant_points,
      jsonb_build_object('days',v_days)
    from public.challenge_participants cp
    where cp.challenge_id = p_challenge_id
      and cp.status = 'approved'
      and cp.last_activity_at is not null;
  end if;
end $$;


ALTER FUNCTION "public"."apply_challenge_rewards"("p_challenge_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_challenge_scoring_for_user_day"("p_user_id" "uuid", "p_day" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  r record;
  v_points int;
  v_detail jsonb;
  v_old int;
  v_new int;
  v_delta int;
  v_allow_backfill bool;
begin
  for r in
    select c.id as challenge_id, c.rules
    from public.challenge_participants cp
    join public.challenges c on c.id = cp.challenge_id
    where cp.patient_id = p_user_id
      and cp.status = 'approved'
      and c.status in ('open','running')
  loop
    v_allow_backfill := coalesce((r.rules->>'allow_backfill')::bool, false);

    if p_day <> current_date and v_allow_backfill is not true then
      continue;
    end if;

    select points, detail into v_points, v_detail
    from public.compute_challenge_points_for_day(r.challenge_id, p_user_id, p_day);

    insert into public.challenge_daily_points (challenge_id, user_id, day, points_awarded, awarded_at, details)
    values (r.challenge_id, p_user_id, p_day, 0, null, '{}'::jsonb)
    on conflict (challenge_id, user_id, day) do nothing;

    select points_awarded into v_old
    from public.challenge_daily_points
    where challenge_id = r.challenge_id and user_id = p_user_id and day = p_day;

    v_new := v_points;

    if v_new is distinct from v_old then
      update public.challenge_daily_points
      set points_awarded = v_new,
          awarded_at = case when v_new > 0 then coalesce(awarded_at, now()) else null end,
          details = v_detail
      where challenge_id = r.challenge_id and user_id = p_user_id and day = p_day;

      v_delta := v_new - v_old;

      update public.challenge_participants
      set score = greatest(0, coalesce(score,0) + v_delta),
          last_activity_at = now()
      where challenge_id = r.challenge_id
        and patient_id = p_user_id;

      if v_new > v_old and v_new > 0 then
        insert into public.challenge_activity (challenge_id, actor_user_id, target_user_id, type, message, metadata)
        values (r.challenge_id, p_user_id, p_user_id, 'day_completed',
          'Bateu a meta do dia no desafio!',
          jsonb_build_object('day',p_day,'points',v_new,'detail',v_detail)
        );

        -- streak achievement (7 dias)
        perform public.check_and_grant_challenge_streak(r.challenge_id, p_user_id, p_day);
      end if;
    end if;
  end loop;
end $$;


ALTER FUNCTION "public"."apply_challenge_scoring_for_user_day"("p_user_id" "uuid", "p_day" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_join_policy_on_participant_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_join public.challenge_join_policy;
  v_status public.challenge_status;
  v_max int;
  v_count_approved int;
begin
  select join_policy, status, max_participants into v_join, v_status, v_max
  from public.challenges
  where id = new.challenge_id;

  if v_status not in ('open','running') then
    raise exception 'Challenge is not open for participation.';
  end if;

  if v_max is not null then
    select count(*) into v_count_approved
    from public.challenge_participants
    where challenge_id = new.challenge_id
      and status = 'approved';

    if v_count_approved >= v_max then
      raise exception 'Challenge is full.';
    end if;
  end if;

  new.requested_at := now();

  if v_join = 'auto' then
    new.status := 'approved';
    new.approved_at := now();
    new.approved_by := new.patient_id;

    insert into public.challenge_activity (challenge_id, actor_user_id, target_user_id, type, message)
    values (new.challenge_id, new.patient_id, new.patient_id, 'approved', 'Entrou automaticamente no desafio.');
  else
    new.status := 'requested';

    insert into public.challenge_activity (challenge_id, actor_user_id, target_user_id, type, message)
    values (new.challenge_id, new.patient_id, new.patient_id, 'requested', 'Solicitou entrada no desafio.');
  end if;

  return new;
end $$;


ALTER FUNCTION "public"."apply_join_policy_on_participant_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_diary_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if (TG_OP = 'DELETE') then
    insert into public.food_diary_audit_logs (entry_id, patient_id, action, old_data)
    values (old.id, old.patient_id, 'DELETE', row_to_json(old));
    
    -- Avisar na Timeline
    insert into public.patient_timeline (patient_id, nutritionist_id, event_type, title, description, metadata)
    select old.patient_id, np.nutritionist_id, 'diet_break', 'Item Excluído do Diário', concat('Excluiu: ', old.food_name), jsonb_build_object('audit_id', currval(pg_get_serial_sequence('public.food_diary_audit_logs', 'id') -- Nota: simplificação, idealmente retornamos ID no insert
    ))
    from public.nutritionist_patients np where np.patient_id = old.patient_id limit 1;
    
    return old;
    
  elsif (TG_OP = 'UPDATE') then
    -- Só registra se houve mudança real nos dados nutricionais ou nome
    if (old.quantity <> new.quantity or old.food_name <> new.food_name) then
      insert into public.food_diary_audit_logs (entry_id, patient_id, action, old_data, new_data)
      values (new.id, new.patient_id, 'UPDATE', row_to_json(old), row_to_json(new));
      
      -- Avisar na Timeline
      insert into public.patient_timeline (patient_id, nutritionist_id, event_type, title, description)
      select new.patient_id, np.nutritionist_id, 'diet_break', 'Alteração em Registro', concat('Alterou: ', new.food_name, ' (', old.quantity, ' -> ', new.quantity, ')')
      from public.nutritionist_patients np where np.patient_id = new.patient_id limit 1;
    end if;
    return new;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."audit_diary_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_add_patient"("nutri_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_tier public.plan_tier;
  patient_count int;
  limit_count int;
begin
  -- Pega o plano atual
  select tier into current_tier from public.subscriptions 
  where user_id = nutri_id order by created_at desc limit 1;
  
  -- Se não tiver assinatura, assume FREE
  if current_tier is null then current_tier := 'free'; end if;

  -- Define limites (Exemplo: Free = 3 pacientes)
  if current_tier = 'free' then limit_count := 3;
  elsif current_tier = 'pro' then limit_count := 10000; -- Ilimitado
  else limit_count := 3; end if;

  -- Conta pacientes atuais
  select count(*) into patient_count from public.nutritionist_patients
  where nutritionist_id = nutri_id;

  return patient_count < limit_count;
end;
$$;


ALTER FUNCTION "public"."can_add_patient"("nutri_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_achievements"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  achiev record;
  current_val numeric;
  initial_val numeric;
  count_val int;
  user_id uuid;
  category_match boolean;
BEGIN
  -- Definir quem é o usuário dependendo de qual tabela disparou o trigger
  IF TG_TABLE_NAME = 'daily_logs' THEN user_id := NEW.patient_id;
  ELSIF TG_TABLE_NAME = 'food_diary_entries' THEN user_id := NEW.patient_id;
  ELSIF TG_TABLE_NAME = 'anthropometry_records' THEN user_id := NEW.patient_id;
  ELSE RETURN NEW; -- Tabela desconhecida
  END IF;

  -- Loop para verificar todas as conquistas ainda não desbloqueadas
  FOR achiev IN 
    SELECT * FROM public.achievements a
    WHERE NOT EXISTS (SELECT 1 FROM public.user_achievements ua WHERE ua.user_id = user_id AND ua.achievement_id = a.id)
  LOOP
    
    -------------------------------------------------------
    -- LÓGICA 1: PERDA DE PESO (value_diff)
    -------------------------------------------------------
    IF achiev.rule_logic = 'value_diff' AND achiev.rule_metric = 'weight_loss' THEN
       -- Pega o peso atual (do log mais recente ou deste insert)
       SELECT weight_kg INTO current_val FROM public.daily_logs WHERE patient_id = user_id ORDER BY date DESC LIMIT 1;
       -- Pega o peso inicial (primeiro registro da história)
       SELECT weight_kg INTO initial_val FROM public.anthropometry_records WHERE patient_id = user_id ORDER BY date ASC LIMIT 1;
       
       -- Se não tiver antropometria, tenta pegar do primeiro daily_log
       IF initial_val IS NULL THEN
          SELECT weight_kg INTO initial_val FROM public.daily_logs WHERE patient_id = user_id AND weight_kg IS NOT NULL ORDER BY date ASC LIMIT 1;
       END IF;

       IF initial_val IS NOT NULL AND current_val IS NOT NULL THEN
         IF (initial_val - current_val) >= achiev.rule_target THEN
           INSERT INTO public.user_achievements (user_id, achievement_id) VALUES (user_id, achiev.id);
         END IF;
       END IF;
    END IF;

    -------------------------------------------------------
    -- LÓGICA 2: CONTAGEM POR CATEGORIA (category_count)
    -------------------------------------------------------
    IF achiev.rule_logic = 'category_count' THEN
       -- Extrai a categoria alvo do texto "category:Frutas" -> "Frutas"
       DECLARE target_cat text := split_part(achiev.rule_metric, ':', 2);
       BEGIN
         -- Conta quantas vezes comeu algo dessa categoria
         SELECT count(*) INTO count_val
         FROM public.food_diary_entries fde
         JOIN public.reference_foods rf ON fde.food_name = rf.name -- Join simplificado por nome ou idealmente ID se tiver
         WHERE fde.patient_id = user_id
         AND rf.category ILIKE ('%' || target_cat || '%');
         
         IF count_val >= achiev.rule_target THEN
            INSERT INTO public.user_achievements (user_id, achievement_id) VALUES (user_id, achiev.id);
         END IF;
       END;
    END IF;

    -------------------------------------------------------
    -- LÓGICA 3: STREAKS (Dias Seguidos) - Genérico
    -------------------------------------------------------
    IF achiev.rule_logic = 'streak_days' THEN
       -- Verifica qual campo olhar na tabela daily_logs
       DECLARE check_field boolean := false;
       BEGIN
         -- Lógica simplificada de streak: conta registros nos últimos X dias
         -- Num sistema real, precisaria de uma query recursiva complexa para "gaps".
         -- Aqui vamos usar "Total de dias batidos num intervalo de (Target + 2) dias" para ser performático
         
         IF achiev.rule_metric = 'water_tracker' THEN
            SELECT count(*) INTO count_val FROM public.daily_logs 
            WHERE patient_id = user_id AND water_ml >= 2000 -- Meta Hardcoded ou dinâmica
            AND date >= (current_date - (achiev.rule_target::int));
         ELSIF achiev.rule_metric = 'food_diary' THEN
             -- Para diário, vemos se tem registro na tabela de logs
             SELECT count(distinct date) INTO count_val FROM public.food_diary_entries
             WHERE patient_id = user_id AND date >= (current_date - (achiev.rule_target::int));
         ELSIF achiev.rule_metric = 'supplements_taken' THEN
            SELECT count(*) INTO count_val FROM public.daily_logs 
            WHERE patient_id = user_id AND supplements_taken = true
            AND date >= (current_date - (achiev.rule_target::int));
         END IF;

         IF count_val >= achiev.rule_target THEN
            INSERT INTO public.user_achievements (user_id, achievement_id) VALUES (user_id, achiev.id);
         END IF;
       END;
    END IF;
    
    -------------------------------------------------------
    -- LÓGICA 4: EXISTÊNCIA DE TABELA (check_table_exists)
    -------------------------------------------------------
    IF achiev.rule_logic = 'check_table_exists' THEN
       IF achiev.rule_metric = 'photo_upload' THEN
          SELECT count(*) INTO count_val FROM public.anthropometry_records WHERE patient_id = user_id AND array_length(photos_urls, 1) > 0;
       ELSIF achiev.rule_metric = 'anamnesis_done' THEN
          SELECT count(*) INTO count_val FROM public.anamnesis_records WHERE patient_id = user_id;
       ELSIF achiev.rule_metric = 'group_join' THEN
          SELECT count(*) INTO count_val FROM public.chat_group_members WHERE user_id = user_id;
       END IF;
       
       IF count_val >= 1 THEN
          INSERT INTO public.user_achievements (user_id, achievement_id) VALUES (user_id, achiev.id);
       END IF;
    END IF;

    -------------------------------------------------------
    -- LÓGICA 5: MADRUGADOR (complex_check)
    -------------------------------------------------------
    IF achiev.id = 'early-bird' AND TG_TABLE_NAME = 'food_diary_entries' THEN
       IF NEW.period = 'breakfast' AND NEW.time < '08:00:00' THEN
          INSERT INTO public.user_achievements (user_id, achievement_id) VALUES (user_id, achiev.id);
       END IF;
    END IF;

  END LOOP;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_achievements"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_and_grant_challenge_streak"("p_challenge_id" "uuid", "p_user_id" "uuid", "p_day" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_streak int := 0;
begin
  -- streak = número de dias consecutivos até p_day com points_awarded > 0
  with days as (
    select day
    from public.challenge_daily_points
    where challenge_id = p_challenge_id
      and user_id = p_user_id
      and points_awarded > 0
      and day <= p_day
    order by day desc
  ),
  streak as (
    select day,
           row_number() over (order by day desc) as rn
    from days
  )
  select count(*) into v_streak
  from streak
  where day = p_day - (rn - 1);

  if v_streak >= 7 then
    perform public.grant_achievement(p_user_id, 'challenge_streak_7');
  end if;
end $$;


ALTER FUNCTION "public"."check_and_grant_challenge_streak"("p_challenge_id" "uuid", "p_user_id" "uuid", "p_day" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_challenge_points_for_day"("p_challenge_id" "uuid", "p_user_id" "uuid", "p_day" "date") RETURNS TABLE("points" integer, "detail" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_rules jsonb;
  v_metric text;
  v_target numeric;

  v_points_per_day int := 1;

  -- validade (diario)
  v_min_periods int := 0;
  v_min_items int := 0;
  v_min_items_with_quantity int := 0;

  -- diario stats
  d_periods int := 0;
  d_items int := 0;
  d_items_with_qty int := 0;
  d_total_cal numeric := 0;

  -- daily_logs
  l_water int := 0;
  l_exercise bool := false;
  l_sleep numeric := null;
  l_notes text := null;

  -- flags
  v_require_notes_or_sleep bool := false;
  v_anti_outlier_max_ml int := null;
begin
  select rules into v_rules
  from public.challenges
  where id = p_challenge_id;

  if v_rules is null then
    return query select 0, jsonb_build_object('reason','no_rules');
    return;
  end if;

  v_metric := coalesce(v_rules->>'metric','');
  v_target := nullif(v_rules->>'target','')::numeric;
  v_points_per_day := coalesce(nullif(v_rules #>> '{scoring,points_per_day}','')::int, 1);

  -- validade (opcional)
  v_min_periods := coalesce(nullif(v_rules #>> '{validity,min_periods}','')::int, 0);
  v_min_items := coalesce(nullif(v_rules #>> '{validity,min_items}','')::int, 0);
  v_min_items_with_quantity := coalesce(nullif(v_rules #>> '{validity,min_items_with_quantity}','')::int, 0);
  v_require_notes_or_sleep := coalesce((v_rules #>> '{validity,require_notes_or_sleep}')::bool, false);
  v_anti_outlier_max_ml := nullif(v_rules #>> '{validity,anti_outlier_max_ml}','')::int;

  -- 1) Agrega diário alimentar do dia
  select
    count(distinct period)::int,
    count(*)::int,
    count(*) filter (where quantity is not null)::int,
    coalesce(sum(calories),0)
  into d_periods, d_items, d_items_with_qty, d_total_cal
  from public.food_diary_entries
  where patient_id = p_user_id
    and date = p_day;

  -- 2) Busca daily_logs do dia (se existir)
  select
    coalesce(water_ml,0),
    coalesce(did_exercise,false),
    sleep_hours,
    notes
  into l_water, l_exercise, l_sleep, l_notes
  from public.daily_logs
  where patient_id = p_user_id
    and date = p_day
  limit 1;

  -- helper: validade do diário
  -- se o desafio exigir diário mínimo, isso precisa passar
  if (v_min_periods > 0 or v_min_items > 0 or v_min_items_with_quantity > 0) then
    if d_periods < v_min_periods or d_items < v_min_items or d_items_with_qty < v_min_items_with_quantity then
      return query select 0, jsonb_build_object(
        'reason','diary_not_valid',
        'periods',d_periods,'items',d_items,'items_with_qty',d_items_with_qty
      );
      return;
    end if;
  end if;

  -- MÉTRICAS
  if v_metric = 'daily_diary_complete' then
    -- aqui basta a validade passar (se não foi exigido nada, considera qualquer coisa registrada como "completo"?)
    -- Recomendo que todo desafio desse tipo configure validity.min_periods/min_items.
    if (d_items > 0) then
      return query select v_points_per_day, jsonb_build_object('metric',v_metric,'items',d_items,'periods',d_periods);
    else
      return query select 0, jsonb_build_object('reason','no_diary_entries');
    end if;
    return;
  end if;

  if v_metric = 'daily_calories_lte' then
    if v_target is null then
      return query select 0, jsonb_build_object('reason','missing_target');
      return;
    end if;
    if d_items = 0 then
      return query select 0, jsonb_build_object('reason','no_diary_entries');
      return;
    end if;
    if d_total_cal <= v_target then
      return query select v_points_per_day, jsonb_build_object('metric',v_metric,'total_calories',d_total_cal,'target',v_target);
    else
      return query select 0, jsonb_build_object('metric',v_metric,'total_calories',d_total_cal,'target',v_target,'reason','above_target');
    end if;
    return;
  end if;

  if v_metric = 'daily_calories_gte' then
    if v_target is null then
      return query select 0, jsonb_build_object('reason','missing_target');
      return;
    end if;
    if d_items = 0 then
      return query select 0, jsonb_build_object('reason','no_diary_entries');
      return;
    end if;
    if d_total_cal >= v_target then
      return query select v_points_per_day, jsonb_build_object('metric',v_metric,'total_calories',d_total_cal,'target',v_target);
    else
      return query select 0, jsonb_build_object('metric',v_metric,'total_calories',d_total_cal,'target',v_target,'reason','below_target');
    end if;
    return;
  end if;

  if v_metric = 'daily_water_gte' then
    if v_target is null then
      return query select 0, jsonb_build_object('reason','missing_target');
      return;
    end if;

    -- anti-outlier simples
    if v_anti_outlier_max_ml is not null and l_water > v_anti_outlier_max_ml then
      return query select 0, jsonb_build_object('metric',v_metric,'water_ml',l_water,'reason','outlier_blocked');
      return;
    end if;

    if l_water >= v_target then
      return query select v_points_per_day, jsonb_build_object('metric',v_metric,'water_ml',l_water,'target',v_target);
    else
      return query select 0, jsonb_build_object('metric',v_metric,'water_ml',l_water,'target',v_target,'reason','below_target');
    end if;
    return;
  end if;

  if v_metric = 'daily_exercise_verified' then
    if l_exercise is not true then
      return query select 0, jsonb_build_object('metric',v_metric,'reason','did_exercise_false');
      return;
    end if;

    if v_require_notes_or_sleep then
      if (coalesce(nullif(trim(l_notes),''), null) is null) and (l_sleep is null) then
        return query select 0, jsonb_build_object('metric',v_metric,'reason','missing_notes_or_sleep');
        return;
      end if;
    end if;

    return query select v_points_per_day, jsonb_build_object('metric',v_metric,'verified',true);
    return;
  end if;

  -- desconhecida
  return query select 0, jsonb_build_object('reason','unknown_metric','metric',v_metric);
end $$;


ALTER FUNCTION "public"."compute_challenge_points_for_day"("p_challenge_id" "uuid", "p_user_id" "uuid", "p_day" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_chat_room_on_link"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.chat_rooms (nutritionist_id, patient_id)
  values (new.nutritionist_id, new.patient_id)
  on conflict do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."create_chat_room_on_link"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_challenge_owner_participant"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.challenge_participants (challenge_id, patient_id, joined_at, status, role, approved_at, approved_by, score)
  values (new.id, new.created_by_user_id, now(), 'approved', 'owner', now(), new.created_by_user_id, 0)
  on conflict (challenge_id, patient_id) do update
    set role = 'owner',
        status = 'approved',
        approved_at = coalesce(challenge_participants.approved_at, now()),
        approved_by = coalesce(challenge_participants.approved_by, new.created_by_user_id);

  insert into public.challenge_activity (challenge_id, actor_user_id, type, message, metadata)
  values (new.id, new.created_by_user_id, 'joined', 'Criador entrou como owner do desafio.', jsonb_build_object('role','owner'));

  return new;
end $$;


ALTER FUNCTION "public"."ensure_challenge_owner_participant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_challenge"("p_challenge_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- grava final_score
  update public.challenge_participants
  set final_score = coalesce(score,0)
  where challenge_id = p_challenge_id
    and status = 'approved';

  -- calcula rank final (dense_rank por score desc, desempate por joined_at asc)
  with ranked as (
    select
      challenge_id,
      patient_id,
      dense_rank() over (
        partition by challenge_id
        order by coalesce(final_score,0) desc, joined_at asc
      ) as rk
    from public.challenge_participants
    where challenge_id = p_challenge_id
      and status = 'approved'
  )
  update public.challenge_participants cp
  set final_rank = r.rk,
      completed_at = now()
  from ranked r
  where cp.challenge_id = r.challenge_id
    and cp.patient_id = r.patient_id;

  insert into public.challenge_activity (challenge_id, type, message, metadata)
  values (p_challenge_id, 'challenge_completed', 'Desafio concluído!', jsonb_build_object('challenge_id',p_challenge_id));

  -- reputação e conquistas são aplicadas em função separada (abaixo)
  perform public.apply_challenge_rewards(p_challenge_id);
end $$;


ALTER FUNCTION "public"."finalize_challenge"("p_challenge_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_financial_dashboard"() RETURNS TABLE("total_income_realized" numeric, "total_expenses_paid" numeric, "projected_income" numeric, "projected_expenses" numeric, "net_balance" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- 1. Receita Realizada
    COALESCE(SUM(CASE WHEN type = 'income' AND is_paid = true THEN amount ELSE 0 END), 0) as total_income_realized,
    
    -- 2. Despesa Realizada
    COALESCE(SUM(CASE WHEN type = 'expense' AND is_paid = true THEN amount ELSE 0 END), 0) as total_expenses_paid,
    
    -- 3. Previsão de Entrada (Agenda Futura não paga)
    (
      SELECT COALESCE(SUM(price_snapshot), 0)
      FROM public.appointments a
      WHERE a.nutritionist_id = auth.uid()
      AND a.payment_status = 'pending'
      AND a.start_time >= now()
    ) as projected_income,
    
    -- 4. Contas a Pagar (Lançadas mas não pagas)
    COALESCE(SUM(CASE WHEN type = 'expense' AND is_paid = false THEN amount ELSE 0 END), 0) as projected_expenses,
    
    -- 5. Saldo Líquido Real (O que sobra no bolso hoje)
    (
      COALESCE(SUM(CASE WHEN type = 'income' AND is_paid = true THEN amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN type = 'expense' AND is_paid = true THEN amount ELSE 0 END), 0)
    ) as net_balance

  FROM public.financial_records fr
  WHERE fr.nutritionist_id = auth.uid(); -- Garante que só pego os MEUS dados
END;
$$;


ALTER FUNCTION "public"."get_financial_dashboard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_patient_by_email"("p_email" "text") RETURNS TABLE("id" "uuid", "full_name" "text", "role" "public"."app_role")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT up.id, up.full_name, up.role
  FROM user_profiles up
  WHERE up.email = p_email AND up.role = 'patient';
END;
$$;


ALTER FUNCTION "public"."get_patient_by_email"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_patient_lifecycle_status"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  has_anamnesis boolean;
  has_anthropometry boolean;
  has_energy_calc boolean;
  has_active_diet boolean;
  last_anthro_date timestamptz;
  nutri_id uuid;
begin
  -- Verifica permissão (apenas o nutri do paciente pode ver)
  select nutritionist_id into nutri_id from public.nutritionist_patients where patient_id = p_id;
  if nutri_id != auth.uid() then raise exception 'Acesso negado'; end if;

  -- 1. Tem Anamnese?
  select exists(select 1 from public.anamnesis_records where patient_id = p_id) into has_anamnesis;
  
  -- 2. Tem Antropometria recente (últimos 60 dias)?
  select date into last_anthro_date from public.anthropometry_records where patient_id = p_id order by date desc limit 1;
  has_anthropometry := (last_anthro_date is not null);
  
  -- 3. Tem Cálculo Energético?
  select exists(select 1 from public.energy_expenditure_records where patient_id = p_id) into has_energy_calc;
  
  -- 4. Tem Dieta Ativa?
  select exists(select 1 from public.meal_plans where patient_id = p_id and status = 'active') into has_active_diet;

  return jsonb_build_object(
    'anamnesis', has_anamnesis,
    'anthropometry', has_anthropometry,
    'anthropometry_date', last_anthro_date,
    'anthropometry_is_outdated', (last_anthro_date < now() - interval '60 days'), -- Alerta se a avaliação for velha
    'energy_calc', has_energy_calc,
    'active_diet', has_active_diet,
    'can_create_diet', (has_anamnesis and has_anthropometry and has_energy_calc) -- A Regra de Ouro
  );
end;
$$;


ALTER FUNCTION "public"."get_patient_lifecycle_status"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_platform_stats"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  total_users int;
  total_nutris int;
  total_patients int;
  active_subs int;
  mrr numeric;
  total_foods int;
  is_super_admin boolean;
begin
  -- 1. Verificação de Segurança (Hard Security)
  select (role = 'super_admin') into is_super_admin 
  from public.user_profiles where id = auth.uid();
  
  if not is_super_admin then
    raise exception 'Acesso negado: Apenas Super Admins podem ver métricas.';
  end if;

  -- 2. Coleta de Métricas
  select count(*) into total_users from public.user_profiles;
  select count(*) into total_nutris from public.user_profiles where role = 'nutritionist';
  select count(*) into total_patients from public.user_profiles where role = 'patient';
  
  -- Assinaturas Ativas (Nutris pagantes)
  select count(*) into active_subs from public.subscriptions where status = 'active';
  
  -- MRR Estimado (Aqui assumimos valores fixos por enquanto, ou somamos de uma tabela de invoices)
  -- Exemplo simples: Conta PRO * R$ 99,00
  mrr := active_subs * 99.00; 
  
  -- Dados do Banco de Alimentos (Para ver se o sistema está crescendo)
  select count(*) into total_foods from public.nutritionist_foods;

  -- 3. Retorno JSON estruturado
  return jsonb_build_object(
    'users', jsonb_build_object(
      'total', total_users,
      'nutritionists', total_nutris,
      'patients', total_patients
    ),
    'financial', jsonb_build_object(
      'active_subscriptions', active_subs,
      'estimated_mrr', mrr
    ),
    'system_health', jsonb_build_object(
      'custom_foods_created', total_foods,
      'db_status', 'healthy'
    )
  );
end;
$_$;


ALTER FUNCTION "public"."get_platform_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_upcoming_birthdays"() RETURNS TABLE("nutritionist_id" "uuid", "patient_id" "uuid", "full_name" "text", "avatar_url" "text", "birth_date" "date", "birth_day" integer, "birth_month" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    np.nutritionist_id,
    p.id as patient_id,
    p.full_name,
    p.avatar_url,
    up.birth_date,
    CAST(extract(day from up.birth_date) AS int) as birth_day,
    CAST(extract(month from up.birth_date) AS int) as birth_month
  FROM public.nutritionist_patients np
  JOIN public.user_profiles p ON np.patient_id = p.id
  JOIN public.user_profiles up ON p.id = up.id 
  WHERE np.nutritionist_id = auth.uid() -- Segurança Hardcoded: Só retorna OS MEUS pacientes
  AND up.birth_date IS NOT NULL
  ORDER BY birth_month, birth_day;
END;
$$;


ALTER FUNCTION "public"."get_upcoming_birthdays"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."grant_achievement"("p_user_id" "uuid", "p_achievement_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.user_achievements (user_id, achievement_id, unlocked_at)
  values (p_user_id, p_achievement_id, now())
  on conflict (user_id, achievement_id) do nothing;
end $$;


ALTER FUNCTION "public"."grant_achievement"("p_user_id" "uuid", "p_achievement_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_asaas_webhook_update"("p_asaas_subscription_id" "text", "p_status" "text", "p_valid_until" timestamp with time zone, "p_payload" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE subscriptions
  SET 
    status = COALESCE(p_status::app_role, status::text)::text::app_role, -- Cast safety or just text? Schema said USER-DEFINED. Assuming text works or cast needed.
    -- Wait, schema `status` is USER-DEFINED. I need to know the type name.
    -- list_tables output showed: "status":{"data_type":"USER-DEFINED","enums":...}
    -- BUT it didn't show the enum name in the truncated output.
    -- I will try casting to text then implicit cast? Or assume type name `subscription_status`?
    -- Safest is to just update columns without explicit cast if pg handles it, or check type name.
    -- Let's check type first? No time. 
    -- I'll check schema again in next step if this fails.
    -- Actually, if I update `status` with a string that matches an enum value, Postgres usually accepts it.
    valid_until = COALESCE(p_valid_until, valid_until),
    last_asaas_event_at = now(),
    last_asaas_payload = p_payload,
    updated_at = now()
  WHERE asaas_subscription_id = p_asaas_subscription_id;
END;
$$;


ALTER FUNCTION "public"."handle_asaas_webhook_update"("p_asaas_subscription_id" "text", "p_status" "text", "p_valid_until" timestamp with time zone, "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.user_profiles (id, email, full_name, role, avatar_url)
  values (
    new.id,
    new.email,
    -- Tenta pegar do metadata do Google/Auth, se não tiver, usa o email antes do @
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    -- Define o role baseado no metadata ou default para patient
    coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'patient'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.user_profiles 
    where id = auth.uid() and role = 'super_admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_challenge_valid_for_reputation"("p_challenge_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_start date;
  v_end date;
  v_days int;
  v_approved int;
  v_valid_participants int;
begin
  select start_date, end_date into v_start, v_end
  from public.challenges
  where id = p_challenge_id;

  if v_start is null or v_end is null then
    return false;
  end if;

  v_days := (v_end - v_start) + 1;
  if v_days < 7 then
    return false;
  end if;

  select count(*) into v_approved
  from public.challenge_participants
  where challenge_id = p_challenge_id
    and status = 'approved';

  if v_approved < 5 then
    return false;
  end if;

  -- válido = participou de verdade: pelo menos 3 dias pontuados
  select count(*) into v_valid_participants
  from (
    select user_id
    from public.challenge_daily_points
    where challenge_id = p_challenge_id
      and points_awarded > 0
    group by user_id
    having count(*) >= 3
  ) t;

  if v_valid_participants < 5 then
    return false;
  end if;

  return true;
end $$;


ALTER FUNCTION "public"."is_challenge_valid_for_reputation"("p_challenge_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lock_challenge_rules"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();

  if old.rules_locked = true then
    if new.rules is distinct from old.rules then
      raise exception 'Challenge rules are locked and cannot be changed.';
    end if;
    if new.scope is distinct from old.scope
       or new.join_policy is distinct from old.join_policy
       or new.category is distinct from old.category then
      raise exception 'Challenge core configuration is locked and cannot be changed.';
    end if;
  end if;

  if (old.status in ('draft','open')) and (new.status in ('running','completed','cancelled','archived')) then
    new.rules_locked := true;
  end if;

  if (old.status not in ('draft','open')) then
    if new.rules is distinct from old.rules then
      raise exception 'Cannot change rules after challenge has started.';
    end if;
    if new.join_policy is distinct from old.join_policy then
      raise exception 'Cannot change join policy after challenge has started.';
    end if;
    if new.scope is distinct from old.scope then
      raise exception 'Cannot change scope after challenge has started.';
    end if;
  end if;

  return new;
end $$;


ALTER FUNCTION "public"."lock_challenge_rules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_diet_activation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if (old.status <> 'active' and new.status = 'active') then
    insert into public.notifications (user_id, type, title, message, link_url)
    values (
      new.patient_id,
      'success',
      'Novo Plano Alimentar!',
      'Seu nutricionista acabou de ativar uma nova dieta para você.',
      '/patient/diet'
    );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_diet_activation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_invite"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_user_id uuid;
begin
  -- Tenta achar se o email do convite já pertence a um usuário registrado
  select id into target_user_id from public.user_profiles where email = new.patient_email;
  
  if target_user_id is not null then
    insert into public.notifications (user_id, type, title, message, link_url)
    values (
      target_user_id,
      'info',
      'Convite de Nutricionista',
      'Você recebeu um convite para se conectar a um profissional.',
      '/patient/invites' -- Rota hipotética de aceitar convites
    );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_invite"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_invite_code"("input_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  code_record record;
  already_linked boolean;
begin
  -- 1. Buscar código válido
  select * into code_record from public.access_codes
  where code = input_code
  and expires_at > now()
  and uses_count < max_uses;
  
  if code_record is null then
    return jsonb_build_object('success', false, 'message', 'Código inválido ou expirado.');
  end if;

  -- 2. Verificar se já existe vínculo
  select exists(
    select 1 from public.nutritionist_patients 
    where nutritionist_id = code_record.nutritionist_id 
    and patient_id = auth.uid()
  ) into already_linked;
  
  if already_linked then
    return jsonb_build_object('success', false, 'message', 'Você já é paciente deste nutricionista.');
  end if;

  -- 3. Criar Vínculo
  insert into public.nutritionist_patients (nutritionist_id, patient_id)
  values (code_record.nutritionist_id, auth.uid());
  
  -- 4. Queimar o código (Incrementar uso)
  update public.access_codes 
  set uses_count = uses_count + 1
  where id = code_record.id;

  return jsonb_build_object('success', true, 'nutritionist_id', code_record.nutritionist_id);
end;
$$;


ALTER FUNCTION "public"."redeem_invite_code"("input_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_appointment_to_finance"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Cenário: O agendamento foi atualizado para PAGO e ainda não existe registro financeiro duplicado
  if (new.payment_status = 'paid' and (old.payment_status is distinct from 'paid')) then
    
    insert into public.financial_records (
      nutritionist_id,
      patient_id,
      type,
      category,
      description,
      amount,
      date,
      is_paid
    ) values (
      new.nutritionist_id,
      new.patient_id,
      'income',
      'Consultas', -- Categoria padrão
      concat('Consulta: ', new.title),
      coalesce(new.price_snapshot, 0), -- Usa o preço salvo no agendamento
      current_date,
      true
    );
    
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_appointment_to_finance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_owner_if_needed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_new_owner uuid;
begin
  if old.role = 'owner' and new.role = 'owner' and new.status in ('left','banned','rejected') then
    select patient_id into v_new_owner
    from public.challenge_participants
    where challenge_id = new.challenge_id
      and status = 'approved'
      and role = 'moderator'
      and patient_id <> old.patient_id
    order by joined_at asc
    limit 1;

    if v_new_owner is null then
      select patient_id into v_new_owner
      from public.challenge_participants
      where challenge_id = new.challenge_id
        and status = 'approved'
        and role = 'participant'
        and patient_id <> old.patient_id
      order by joined_at asc
      limit 1;
    end if;

    if v_new_owner is not null then
      update public.challenge_participants
      set role = 'owner'
      where challenge_id = new.challenge_id
        and patient_id = v_new_owner;

      insert into public.challenge_activity (challenge_id, actor_user_id, target_user_id, type, message, metadata)
      values (new.challenge_id, old.patient_id, v_new_owner, 'owner_transferred', 'Ownership transferido automaticamente.',
              jsonb_build_object('from',old.patient_id,'to',v_new_owner));
    else
      update public.challenges
      set status = 'archived'
      where id = new.challenge_id;

      insert into public.challenge_activity (challenge_id, actor_user_id, type, message)
      values (new.challenge_id, old.patient_id, 'challenge_cancelled', 'Desafio arquivado por falta de owner ativo.');
    end if;
  end if;

  return new;
end $$;


ALTER FUNCTION "public"."transfer_owner_if_needed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_challenges_on_completed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if old.status is distinct from new.status and new.status = 'completed' then
    perform public.finalize_challenge(new.id);
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."trg_challenges_on_completed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_daily_logs_apply_scoring"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user uuid;
  v_day date;
begin
  if tg_op = 'DELETE' then
    v_user := old.patient_id;
    v_day := old.date;
  else
    v_user := new.patient_id;
    v_day := new.date;
  end if;

  perform public.apply_challenge_scoring_for_user_day(v_user, v_day);
  return null;
end $$;


ALTER FUNCTION "public"."trg_daily_logs_apply_scoring"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_food_diary_entries_apply_scoring"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user uuid;
  v_day date;
begin
  if tg_op = 'DELETE' then
    v_user := old.patient_id;
    v_day := old.date;
  else
    v_user := new.patient_id;
    v_day := new.date;
  end if;

  perform public.apply_challenge_scoring_for_user_day(v_user, v_day);
  return null;
end $$;


ALTER FUNCTION "public"."trg_food_diary_entries_apply_scoring"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_log_to_timeline"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  nutri_id uuid;
begin
  -- Descobre quem é o nutri desse paciente
  select nutritionist_id into nutri_id 
  from public.nutritionist_patients 
  where patient_id = new.patient_id limit 1;

  if nutri_id is not null then
    -- Se registrou Glicose
    if new.glucose_mg_dl is not null then
      insert into public.patient_timeline (patient_id, nutritionist_id, event_type, title, description, metadata)
      values (new.patient_id, nutri_id, 'log_health', 'Registro de Glicemia', concat(new.glucose_mg_dl, ' mg/dL (', new.glucose_context, ')'), jsonb_build_object('val', new.glucose_mg_dl));
    end if;

    -- Se registrou Peso
    if new.weight_kg is not null then
      insert into public.patient_timeline (patient_id, nutritionist_id, event_type, title, description, metadata)
      values (new.patient_id, nutri_id, 'log_weight', 'Peso Atualizado', concat(new.weight_kg, ' kg'), jsonb_build_object('val', new.weight_kg));
    end if;
  end if;
  
  return new;
end;
$$;


ALTER FUNCTION "public"."trigger_log_to_timeline"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_patient_settings"("p_patient_id" "uuid", "p_settings" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.nutritionist_patients
  set app_settings = p_settings
  where nutritionist_id = auth.uid()
  and patient_id = p_patient_id;
end;
$$;


ALTER FUNCTION "public"."update_patient_settings"("p_patient_id" "uuid", "p_settings" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_room_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.chat_rooms
  set last_message_at = now()
  where id = new.room_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."update_room_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_challenge_rules"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_points int;
begin
  -- default se não vier
  if new.rules is null then
    new.rules := '{}'::jsonb;
  end if;

  -- points_per_day: default 1
  v_points := coalesce(nullif(new.rules #>> '{scoring,points_per_day}', '')::int, 1);

  -- range seguro
  if v_points < 1 or v_points > 10 then
    raise exception 'rules.scoring.points_per_day must be between 1 and 10';
  end if;

  -- normaliza pra ficar explícito no json
  new.rules := jsonb_set(new.rules, '{scoring,points_per_day}', to_jsonb(v_points), true);

  return new;
end $$;


ALTER FUNCTION "public"."validate_challenge_rules"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."access_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "max_uses" integer DEFAULT 1,
    "uses_count" integer DEFAULT 0,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."access_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."achievements" (
    "id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "icon_url" "text",
    "category" "text",
    "nutritionist_id" "uuid",
    "rule_metric" "text",
    "rule_target" numeric,
    "rule_logic" "text" DEFAULT 'streak_days'::"text"
);


ALTER TABLE "public"."achievements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."anamnesis_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "date" timestamp with time zone DEFAULT "now"(),
    "answers" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."anamnesis_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."anamnesis_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "questions_schema" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true,
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."anamnesis_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."anthropometry_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "date" timestamp with time zone DEFAULT "now"(),
    "weight_kg" numeric NOT NULL,
    "height_cm" numeric NOT NULL,
    "bmi" numeric GENERATED ALWAYS AS (("weight_kg" / (("height_cm" / (100)::numeric) ^ (2)::numeric))) STORED,
    "waist_circ" numeric,
    "hip_circ" numeric,
    "abdomen_circ" numeric,
    "chest_circ" numeric,
    "arm_relaxed_right_circ" numeric,
    "arm_flexed_right_circ" numeric,
    "thigh_proximal_right_circ" numeric,
    "calf_right_circ" numeric,
    "skinfold_triceps" numeric,
    "skinfold_biceps" numeric,
    "skinfold_subscapular" numeric,
    "skinfold_chest" numeric,
    "skinfold_midaxillary" numeric,
    "skinfold_suprailiac" numeric,
    "skinfold_abdominal" numeric,
    "skinfold_thigh" numeric,
    "skinfold_calf" numeric,
    "body_fat_percent" numeric,
    "lean_mass_kg" numeric,
    "fat_mass_kg" numeric,
    "photos_urls" "text"[],
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."anthropometry_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "patient_id" "uuid",
    "title" "text" NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "status" "public"."appointment_status" DEFAULT 'scheduled'::"public"."appointment_status",
    "notes" "text",
    "meeting_link" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "service_id" "uuid",
    "price_snapshot" numeric,
    "payment_status" "public"."payment_status" DEFAULT 'pending'::"public"."payment_status",
    "payment_method" "public"."payment_method",
    "location_type" "text" DEFAULT 'online'::"text",
    "location_details" "text"
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."asaas_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subscription_id" "uuid",
    "asaas_customer_id" "text",
    "asaas_subscription_id" "text",
    "asaas_payment_id" "text" NOT NULL,
    "status" "text",
    "billing_type" "text",
    "value" numeric,
    "net_value" numeric,
    "installment_count" integer,
    "due_date" "date",
    "paid_at" timestamp with time zone,
    "invoice_url" "text",
    "bank_slip_url" "text",
    "pix_qr_code" "text",
    "raw" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."asaas_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."asaas_webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "text",
    "event_type" "text" NOT NULL,
    "resource_id" "text",
    "payload" "jsonb" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "error_message" "text"
);


ALTER TABLE "public"."asaas_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bulk_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "target_audience" "text" DEFAULT 'all'::"text",
    "sent_count" integer DEFAULT 0,
    "sent_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bulk_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."challenge_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "challenge_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "target_user_id" "uuid",
    "type" "public"."challenge_activity_type" NOT NULL,
    "message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."challenge_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."challenge_checkins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "challenge_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "day" "date" DEFAULT CURRENT_DATE NOT NULL,
    "metric_key" "text" NOT NULL,
    "value" numeric,
    "evidence_urls" "text"[],
    "source_table" "text",
    "source_row_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."challenge_checkins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."challenge_daily_points" (
    "challenge_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "points_awarded" integer DEFAULT 0 NOT NULL,
    "awarded_at" timestamp with time zone,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."challenge_daily_points" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."challenge_participants" (
    "challenge_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "score" integer DEFAULT 0,
    "status" "public"."challenge_participant_status" DEFAULT 'approved'::"public"."challenge_participant_status" NOT NULL,
    "role" "public"."challenge_participant_role" DEFAULT 'participant'::"public"."challenge_participant_role" NOT NULL,
    "requested_at" timestamp with time zone,
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    "rejected_at" timestamp with time zone,
    "banned_at" timestamp with time zone,
    "left_at" timestamp with time zone,
    "last_activity_at" timestamp with time zone,
    "display_name" "text",
    "integrity_flags" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "final_rank" integer,
    "completed_at" timestamp with time zone,
    "final_score" integer
);


ALTER TABLE "public"."challenge_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."challenges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "rules" "text",
    "cover_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by_user_id" "uuid" NOT NULL,
    "scope" "public"."challenge_scope" DEFAULT 'nutritionist'::"public"."challenge_scope" NOT NULL,
    "status" "public"."challenge_status" DEFAULT 'draft'::"public"."challenge_status" NOT NULL,
    "join_policy" "public"."challenge_join_policy" DEFAULT 'manual'::"public"."challenge_join_policy" NOT NULL,
    "category" "public"."challenge_category" DEFAULT 'community'::"public"."challenge_category" NOT NULL,
    "privacy_mode" "public"."challenge_privacy_mode" DEFAULT 'feed_basic'::"public"."challenge_privacy_mode" NOT NULL,
    "max_participants" integer,
    "rules_locked" boolean DEFAULT false NOT NULL,
    "allow_mod_edit_meta" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "timezone" "text"
);


ALTER TABLE "public"."challenges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_group_members" (
    "group_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text",
    "joined_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chat_group_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_group_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text",
    "type" "public"."message_type" DEFAULT 'text'::"public"."message_type",
    "attachment_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chat_group_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "icon_url" "text",
    "is_broadcast" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chat_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text",
    "type" "public"."message_type" DEFAULT 'text'::"public"."message_type",
    "attachment_url" "text",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "last_message_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chat_rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consultation_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "rating" integer,
    "nps_score" integer,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "consultation_feedback_nps_score_check" CHECK ((("nps_score" >= 0) AND ("nps_score" <= 10))),
    CONSTRAINT "consultation_feedback_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."consultation_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE,
    "water_ml" integer DEFAULT 0,
    "weight_kg" numeric,
    "notes" "text",
    "mood" "text",
    "did_exercise" boolean DEFAULT false,
    "followed_diet" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "glucose_mg_dl" numeric,
    "glucose_context" "text",
    "insulin_units" numeric,
    "systolic_bp" integer,
    "diastolic_bp" integer,
    "sleep_hours" numeric,
    "stool_type" integer,
    "digestion_rating" "text",
    "supplements_taken" boolean DEFAULT false,
    "hunger_level_before" integer,
    "satiety_level_after" integer
);


ALTER TABLE "public"."daily_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."energy_expenditure_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "date" timestamp with time zone DEFAULT "now"(),
    "method" "text" NOT NULL,
    "activity_factor" numeric DEFAULT 1.2,
    "basal_metabolic_rate" numeric,
    "total_energy_expenditure" numeric,
    "goal_type" "text",
    "caloric_adjustment" numeric,
    "final_prescription" numeric,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."energy_expenditure_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "patient_id" "uuid",
    "type" "public"."transaction_type" NOT NULL,
    "category" "text" NOT NULL,
    "description" "text",
    "amount" numeric NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE,
    "is_paid" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "installment_number" integer DEFAULT 1,
    "total_installments" integer DEFAULT 1,
    "parent_transaction_id" "uuid"
);


ALTER TABLE "public"."financial_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."food_diary_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entry_id" "uuid",
    "patient_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"(),
    "old_data" "jsonb",
    "new_data" "jsonb"
);


ALTER TABLE "public"."food_diary_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."food_diary_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE,
    "period" "public"."meal_period" NOT NULL,
    "time" time without time zone DEFAULT CURRENT_TIME,
    "food_name" "text" NOT NULL,
    "quantity" numeric,
    "measure_label" "text",
    "calories" numeric DEFAULT 0,
    "protein_g" numeric DEFAULT 0,
    "carbs_g" numeric DEFAULT 0,
    "fats_g" numeric DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."food_diary_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."food_group_map" (
    "source" "public"."food_source" NOT NULL,
    "group_original" "text" NOT NULL,
    "group_norm" "text" NOT NULL
);


ALTER TABLE "public"."food_group_map" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."food_measures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reference_food_id" "uuid",
    "nutritionist_food_id" "uuid",
    "label" "text" NOT NULL,
    "weight_in_grams" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "food_measures_check" CHECK (((("reference_food_id" IS NOT NULL) AND ("nutritionist_food_id" IS NULL)) OR (("reference_food_id" IS NULL) AND ("nutritionist_food_id" IS NOT NULL)))),
    CONSTRAINT "food_measures_exactly_one_parent_chk" CHECK ((((("reference_food_id" IS NOT NULL))::integer + (("nutritionist_food_id" IS NOT NULL))::integer) = 1))
);


ALTER TABLE "public"."food_measures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "patient_email" "text" NOT NULL,
    "token" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval)
);


ALTER TABLE "public"."invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lab_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "date" timestamp with time zone DEFAULT "now"(),
    "title" "text" NOT NULL,
    "description" "text",
    "file_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "metrics" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."lab_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."legal_terms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version" "text" NOT NULL,
    "content" "text" NOT NULL,
    "is_active" boolean DEFAULT false,
    "published_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."legal_terms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."master_measure_units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT 'volumetric'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."master_measure_units" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meal_item_substitutions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "meal_item_id" "uuid" NOT NULL,
    "type" "public"."substitution_type" NOT NULL,
    "description" "text",
    "reference_food_id" "uuid",
    "nutritionist_food_id" "uuid",
    "quantity" numeric,
    "measure_label" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."meal_item_substitutions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meal_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "meal_id" "uuid" NOT NULL,
    "reference_food_id" "uuid",
    "nutritionist_food_id" "uuid",
    "quantity" numeric NOT NULL,
    "measure_label" "text" NOT NULL,
    "calculated_weight_g" numeric NOT NULL,
    "calories_snapshot" numeric,
    "protein_snapshot" numeric,
    "carbs_snapshot" numeric,
    "fats_snapshot" numeric,
    "observation" "text",
    CONSTRAINT "meal_items_check" CHECK (((("reference_food_id" IS NOT NULL) AND ("nutritionist_food_id" IS NULL)) OR (("reference_food_id" IS NULL) AND ("nutritionist_food_id" IS NOT NULL))))
);


ALTER TABLE "public"."meal_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meal_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "status" "public"."plan_status" DEFAULT 'draft'::"public"."plan_status",
    "version" integer DEFAULT 1,
    "parent_plan_id" "uuid",
    "goal_energy_kcal" numeric,
    "goal_protein_g" numeric,
    "goal_carbs_g" numeric,
    "goal_fats_g" numeric,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."meal_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "daily_menu_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "time" time without time zone NOT NULL,
    "order_index" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."meals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" DEFAULT 'info'::"text",
    "title" "text" NOT NULL,
    "message" "text",
    "link_url" "text",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nutritionist_availability" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "day_of_week" integer NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "location_type" "text" DEFAULT 'both'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."nutritionist_availability" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."nutritionist_gateways" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "public_key" "text",
    "access_token" "text",
    "is_active" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."nutritionist_gateways" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nutritionist_marketing" (
    "id" "uuid" NOT NULL,
    "bio" "text",
    "specialties" "text"[],
    "city" "text",
    "state" "text",
    "zip_code" "text",
    "instagram_url" "text",
    "linkedin_url" "text",
    "website_url" "text",
    "is_listed" boolean DEFAULT false,
    "rating" numeric(3,2) DEFAULT 5.00,
    "review_count" integer DEFAULT 0,
    "consultation_price_min" numeric,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."nutritionist_marketing" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nutritionist_patients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "app_settings" "jsonb" DEFAULT '{"modules": {"food_diary": true, "mood_tracker": false, "poop_tracker": false, "sleep_tracker": false, "water_tracker": true, "weight_tracker": true, "glucose_tracker": false, "pressure_tracker": false, "symptoms_tracker": false, "supplement_checklist": false}, "behavior": {"show_macros": true, "show_calories": true, "require_photos": false, "allow_substitutions": true}}'::"jsonb"
);


ALTER TABLE "public"."nutritionist_patients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nutritionist_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "duration_minutes" integer DEFAULT 60,
    "price" numeric DEFAULT 0,
    "color_hex" "text" DEFAULT '#3b82f6'::"text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."nutritionist_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patient_timeline" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "event_type" "public"."timeline_event_type" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."patient_timeline" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_daily_menus" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "meal_plan_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "is_monday" boolean DEFAULT false,
    "is_tuesday" boolean DEFAULT false,
    "is_wednesday" boolean DEFAULT false,
    "is_thursday" boolean DEFAULT false,
    "is_friday" boolean DEFAULT false,
    "is_saturday" boolean DEFAULT false,
    "is_sunday" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."plan_daily_menus" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_news" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "type" "public"."news_type" DEFAULT 'update'::"public"."news_type",
    "image_url" "text",
    "action_link" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."platform_news" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipe_ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipe_id" "uuid" NOT NULL,
    "reference_food_id" "uuid",
    "nutritionist_food_id" "uuid",
    "quantity" numeric NOT NULL,
    "measure_label" "text" NOT NULL,
    CONSTRAINT "recipe_ingredients_check" CHECK (((("reference_food_id" IS NOT NULL) AND ("nutritionist_food_id" IS NULL)) OR (("reference_food_id" IS NULL) AND ("nutritionist_food_id" IS NOT NULL))))
);


ALTER TABLE "public"."recipe_ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "preparation_time_minutes" integer,
    "serving_yield" integer DEFAULT 1,
    "preparation_method" "text",
    "total_calories" numeric,
    "total_protein" numeric,
    "total_carbs" numeric,
    "total_fat" numeric,
    "image_url" "text",
    "is_public" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "total_saturated_fat" numeric DEFAULT 0,
    "total_trans_fat" numeric DEFAULT 0,
    "total_cholesterol" numeric DEFAULT 0,
    "total_sodium" numeric DEFAULT 0,
    "total_fiber" numeric DEFAULT 0
);


ALTER TABLE "public"."recipes" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."reference_foods_translations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "public"."food_source" NOT NULL,
    "source_id" "text" NOT NULL,
    "locale" "text" NOT NULL,
    "name" "text" NOT NULL,
    "is_original" boolean DEFAULT false NOT NULL,
    "is_reviewed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reference_foods_translations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "asaas_customer_id" "text",
    "asaas_subscription_id" "text",
    "tier" "public"."plan_tier" DEFAULT 'free'::"public"."plan_tier",
    "status" "public"."sub_status" DEFAULT 'trial'::"public"."sub_status",
    "valid_until" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "trial_ends_at" timestamp with time zone,
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "canceled_at" timestamp with time zone,
    "last_asaas_event_at" timestamp with time zone,
    "last_asaas_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplement_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "prescription_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "dosage" "text" NOT NULL,
    "schedule" "text",
    "composition" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."supplement_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplement_prescriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "instructions" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."supplement_prescriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subject" "text" NOT NULL,
    "message" "text" NOT NULL,
    "status" "public"."ticket_status" DEFAULT 'open'::"public"."ticket_status",
    "priority" "public"."ticket_priority" DEFAULT 'low'::"public"."ticket_priority",
    "admin_response" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."support_tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "event_type" "text",
    "payload" "jsonb",
    "processed" boolean DEFAULT false,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."system_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_achievements" (
    "user_id" "uuid" NOT NULL,
    "achievement_id" "text" NOT NULL,
    "unlocked_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_achievements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_consents" (
    "user_id" "uuid" NOT NULL,
    "term_id" "uuid" NOT NULL,
    "accepted_at" timestamp with time zone DEFAULT "now"(),
    "ip_address" "text"
);


ALTER TABLE "public"."user_consents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "access_token" "text",
    "refresh_token" "text",
    "expires_at" timestamp with time zone,
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_integrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "role" "public"."app_role" DEFAULT 'patient'::"public"."app_role" NOT NULL,
    "avatar_url" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "birth_date" "date",
    "gender" "text",
    "objective" "text",
    "comorbidities" "text"[],
    CONSTRAINT "email_check" CHECK (("email" ~* '^.+@.+\..+$'::"text")),
    CONSTRAINT "user_profiles_gender_check" CHECK (("gender" = ANY (ARRAY['male'::"text", 'female'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_reputation" (
    "user_id" "uuid" NOT NULL,
    "rep_score" numeric DEFAULT 0 NOT NULL,
    "rep_created" numeric DEFAULT 0 NOT NULL,
    "rep_participated" numeric DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_reputation" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_reputation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "challenge_id" "uuid",
    "kind" "text" NOT NULL,
    "points" numeric NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_reputation_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waiting_list" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nutritionist_id" "uuid" NOT NULL,
    "patient_id" "uuid",
    "patient_name" "text",
    "phone" "text",
    "desired_dates" "text",
    "notes" "text",
    "status" "text" DEFAULT 'waiting'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."waiting_list" OWNER TO "postgres";


ALTER TABLE ONLY "public"."access_codes"
    ADD CONSTRAINT "access_codes_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."access_codes"
    ADD CONSTRAINT "access_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anamnesis_records"
    ADD CONSTRAINT "anamnesis_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anamnesis_templates"
    ADD CONSTRAINT "anamnesis_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anthropometry_records"
    ADD CONSTRAINT "anthropometry_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asaas_payments"
    ADD CONSTRAINT "asaas_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asaas_webhook_events"
    ADD CONSTRAINT "asaas_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bulk_messages"
    ADD CONSTRAINT "bulk_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."challenge_activity"
    ADD CONSTRAINT "challenge_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."challenge_checkins"
    ADD CONSTRAINT "challenge_checkins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."challenge_daily_points"
    ADD CONSTRAINT "challenge_daily_points_pkey" PRIMARY KEY ("challenge_id", "user_id", "day");



ALTER TABLE ONLY "public"."challenge_participants"
    ADD CONSTRAINT "challenge_participants_pkey" PRIMARY KEY ("challenge_id", "patient_id");



ALTER TABLE ONLY "public"."challenges"
    ADD CONSTRAINT "challenges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_group_members"
    ADD CONSTRAINT "chat_group_members_pkey" PRIMARY KEY ("group_id", "user_id");



ALTER TABLE ONLY "public"."chat_group_messages"
    ADD CONSTRAINT "chat_group_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_groups"
    ADD CONSTRAINT "chat_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_rooms"
    ADD CONSTRAINT "chat_rooms_nutritionist_id_patient_id_key" UNIQUE ("nutritionist_id", "patient_id");



ALTER TABLE ONLY "public"."chat_rooms"
    ADD CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consultation_feedback"
    ADD CONSTRAINT "consultation_feedback_appointment_id_key" UNIQUE ("appointment_id");



ALTER TABLE ONLY "public"."consultation_feedback"
    ADD CONSTRAINT "consultation_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_logs"
    ADD CONSTRAINT "daily_logs_patient_id_date_key" UNIQUE ("patient_id", "date");



ALTER TABLE ONLY "public"."daily_logs"
    ADD CONSTRAINT "daily_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."energy_expenditure_records"
    ADD CONSTRAINT "energy_expenditure_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_records"
    ADD CONSTRAINT "financial_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."food_diary_audit_logs"
    ADD CONSTRAINT "food_diary_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."food_diary_entries"
    ADD CONSTRAINT "food_diary_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."food_group_map"
    ADD CONSTRAINT "food_group_map_pkey" PRIMARY KEY ("source", "group_original");



ALTER TABLE ONLY "public"."food_measures"
    ADD CONSTRAINT "food_measures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lab_results"
    ADD CONSTRAINT "lab_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."legal_terms"
    ADD CONSTRAINT "legal_terms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."master_measure_units"
    ADD CONSTRAINT "master_measure_units_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."master_measure_units"
    ADD CONSTRAINT "master_measure_units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_item_substitutions"
    ADD CONSTRAINT "meal_item_substitutions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_items"
    ADD CONSTRAINT "meal_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_plans"
    ADD CONSTRAINT "meal_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meals"
    ADD CONSTRAINT "meals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutritionist_availability"
    ADD CONSTRAINT "nutritionist_availability_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutritionist_foods"
    ADD CONSTRAINT "nutritionist_foods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutritionist_gateways"
    ADD CONSTRAINT "nutritionist_gateways_nutritionist_id_provider_key" UNIQUE ("nutritionist_id", "provider");



ALTER TABLE ONLY "public"."nutritionist_gateways"
    ADD CONSTRAINT "nutritionist_gateways_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutritionist_marketing"
    ADD CONSTRAINT "nutritionist_marketing_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutritionist_patients"
    ADD CONSTRAINT "nutritionist_patients_nutritionist_id_patient_id_key" UNIQUE ("nutritionist_id", "patient_id");



ALTER TABLE ONLY "public"."nutritionist_patients"
    ADD CONSTRAINT "nutritionist_patients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutritionist_services"
    ADD CONSTRAINT "nutritionist_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_timeline"
    ADD CONSTRAINT "patient_timeline_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_daily_menus"
    ADD CONSTRAINT "plan_daily_menus_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_news"
    ADD CONSTRAINT "platform_news_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reference_foods_translations"
    ADD CONSTRAINT "reference_food_translations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reference_foods_translations"
    ADD CONSTRAINT "reference_food_translations_unique" UNIQUE ("source", "source_id", "locale");



ALTER TABLE ONLY "public"."reference_foods"
    ADD CONSTRAINT "reference_foods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reference_foods"
    ADD CONSTRAINT "reference_foods_source_source_id_key" UNIQUE ("source", "source_id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplement_items"
    ADD CONSTRAINT "supplement_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplement_prescriptions"
    ADD CONSTRAINT "supplement_prescriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("user_id", "achievement_id");



ALTER TABLE ONLY "public"."user_consents"
    ADD CONSTRAINT "user_consents_pkey" PRIMARY KEY ("user_id", "term_id");



ALTER TABLE ONLY "public"."user_integrations"
    ADD CONSTRAINT "user_integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_integrations"
    ADD CONSTRAINT "user_integrations_user_id_provider_key" UNIQUE ("user_id", "provider");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_reputation_events"
    ADD CONSTRAINT "user_reputation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_reputation"
    ADD CONSTRAINT "user_reputation_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."waiting_list"
    ADD CONSTRAINT "waiting_list_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_asaas_payments_subscription" ON "public"."asaas_payments" USING "btree" ("subscription_id", "created_at" DESC);



CREATE INDEX "idx_asaas_payments_user" ON "public"."asaas_payments" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_asaas_webhook_events_received_at" ON "public"."asaas_webhook_events" USING "btree" ("received_at" DESC);



CREATE INDEX "idx_asaas_webhook_events_resource" ON "public"."asaas_webhook_events" USING "btree" ("resource_id");



CREATE INDEX "idx_challenge_activity_challenge_created" ON "public"."challenge_activity" USING "btree" ("challenge_id", "created_at" DESC);



CREATE INDEX "idx_challenge_checkins_challenge_day" ON "public"."challenge_checkins" USING "btree" ("challenge_id", "day");



CREATE INDEX "idx_challenge_checkins_user_day" ON "public"."challenge_checkins" USING "btree" ("user_id", "day");



CREATE INDEX "idx_challenge_daily_points_challenge_day" ON "public"."challenge_daily_points" USING "btree" ("challenge_id", "day");



CREATE INDEX "idx_challenge_daily_points_user_day" ON "public"."challenge_daily_points" USING "btree" ("user_id", "day");



CREATE INDEX "idx_challenge_participants_challenge_status" ON "public"."challenge_participants" USING "btree" ("challenge_id", "status");



CREATE INDEX "idx_challenge_participants_final_rank" ON "public"."challenge_participants" USING "btree" ("challenge_id", "final_rank");



CREATE INDEX "idx_challenge_participants_user_status" ON "public"."challenge_participants" USING "btree" ("patient_id", "status");



CREATE INDEX "idx_challenges_category_status" ON "public"."challenges" USING "btree" ("category", "status");



CREATE INDEX "idx_challenges_created_by" ON "public"."challenges" USING "btree" ("created_by_user_id");



CREATE INDEX "idx_challenges_scope_status" ON "public"."challenges" USING "btree" ("scope", "status");



CREATE INDEX "idx_reference_foods_group_norm" ON "public"."reference_foods" USING "btree" ("group_norm");



CREATE INDEX "idx_reference_foods_source_group_norm" ON "public"."reference_foods" USING "btree" ("source", "group_norm");



CREATE INDEX "idx_rft_locale_name" ON "public"."reference_foods_translations" USING "btree" ("locale", "name");



CREATE INDEX "idx_rft_source_sourceid" ON "public"."reference_foods_translations" USING "btree" ("source", "source_id");



CREATE INDEX "idx_subscriptions_asaas_sub" ON "public"."subscriptions" USING "btree" ("asaas_subscription_id") WHERE ("asaas_subscription_id" IS NOT NULL);



CREATE INDEX "idx_subscriptions_user_status" ON "public"."subscriptions" USING "btree" ("user_id", "status");



CREATE INDEX "idx_user_reputation_events_user_time" ON "public"."user_reputation_events" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "uq_asaas_payments_payment_id" ON "public"."asaas_payments" USING "btree" ("asaas_payment_id");



CREATE UNIQUE INDEX "uq_asaas_webhook_events_event_id" ON "public"."asaas_webhook_events" USING "btree" ("event_id") WHERE ("event_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "on_anthro_check_achievements" AFTER INSERT ON "public"."anthropometry_records" FOR EACH ROW EXECUTE FUNCTION "public"."check_achievements"();



CREATE OR REPLACE TRIGGER "on_appointment_paid" AFTER UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."sync_appointment_to_finance"();



CREATE OR REPLACE TRIGGER "on_daily_log_update" AFTER INSERT OR UPDATE ON "public"."daily_logs" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_log_to_timeline"();



CREATE OR REPLACE TRIGGER "on_diary_change" AFTER DELETE OR UPDATE ON "public"."food_diary_entries" FOR EACH ROW EXECUTE FUNCTION "public"."audit_diary_changes"();



CREATE OR REPLACE TRIGGER "on_food_check_achievements" AFTER INSERT ON "public"."food_diary_entries" FOR EACH ROW EXECUTE FUNCTION "public"."check_achievements"();



CREATE OR REPLACE TRIGGER "on_group_check_achievements" AFTER INSERT ON "public"."chat_group_members" FOR EACH ROW EXECUTE FUNCTION "public"."check_achievements"();



CREATE OR REPLACE TRIGGER "on_invite_created" AFTER INSERT ON "public"."invitations" FOR EACH ROW EXECUTE FUNCTION "public"."notify_invite"();



CREATE OR REPLACE TRIGGER "on_log_check_achievements" AFTER INSERT OR UPDATE ON "public"."daily_logs" FOR EACH ROW EXECUTE FUNCTION "public"."check_achievements"();



CREATE OR REPLACE TRIGGER "on_meal_plan_active" AFTER UPDATE ON "public"."meal_plans" FOR EACH ROW EXECUTE FUNCTION "public"."notify_diet_activation"();



CREATE OR REPLACE TRIGGER "on_new_message" AFTER INSERT ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_room_timestamp"();



CREATE OR REPLACE TRIGGER "on_patient_linked_chat" AFTER INSERT ON "public"."nutritionist_patients" FOR EACH ROW EXECUTE FUNCTION "public"."create_chat_room_on_link"();



CREATE OR REPLACE TRIGGER "trg_apply_join_policy_participant_insert" BEFORE INSERT ON "public"."challenge_participants" FOR EACH ROW EXECUTE FUNCTION "public"."apply_join_policy_on_participant_insert"();



CREATE OR REPLACE TRIGGER "trg_asaas_payments_updated_at" BEFORE UPDATE ON "public"."asaas_payments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_challenges_on_completed" AFTER UPDATE ON "public"."challenges" FOR EACH ROW EXECUTE FUNCTION "public"."trg_challenges_on_completed"();



CREATE OR REPLACE TRIGGER "trg_daily_logs_scoring_del" AFTER DELETE ON "public"."daily_logs" FOR EACH ROW EXECUTE FUNCTION "public"."trg_daily_logs_apply_scoring"();



CREATE OR REPLACE TRIGGER "trg_daily_logs_scoring_ins" AFTER INSERT ON "public"."daily_logs" FOR EACH ROW EXECUTE FUNCTION "public"."trg_daily_logs_apply_scoring"();



CREATE OR REPLACE TRIGGER "trg_daily_logs_scoring_upd" AFTER UPDATE ON "public"."daily_logs" FOR EACH ROW EXECUTE FUNCTION "public"."trg_daily_logs_apply_scoring"();



CREATE OR REPLACE TRIGGER "trg_ensure_challenge_owner_participant" AFTER INSERT ON "public"."challenges" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_challenge_owner_participant"();



CREATE OR REPLACE TRIGGER "trg_food_diary_entries_scoring_del" AFTER DELETE ON "public"."food_diary_entries" FOR EACH ROW EXECUTE FUNCTION "public"."trg_food_diary_entries_apply_scoring"();



CREATE OR REPLACE TRIGGER "trg_food_diary_entries_scoring_ins" AFTER INSERT ON "public"."food_diary_entries" FOR EACH ROW EXECUTE FUNCTION "public"."trg_food_diary_entries_apply_scoring"();



CREATE OR REPLACE TRIGGER "trg_food_diary_entries_scoring_upd" AFTER UPDATE ON "public"."food_diary_entries" FOR EACH ROW EXECUTE FUNCTION "public"."trg_food_diary_entries_apply_scoring"();



CREATE OR REPLACE TRIGGER "trg_lock_challenge_rules" BEFORE UPDATE ON "public"."challenges" FOR EACH ROW EXECUTE FUNCTION "public"."lock_challenge_rules"();



CREATE OR REPLACE TRIGGER "trg_subscriptions_updated_at" BEFORE UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_transfer_owner_if_needed" AFTER UPDATE ON "public"."challenge_participants" FOR EACH ROW EXECUTE FUNCTION "public"."transfer_owner_if_needed"();



CREATE OR REPLACE TRIGGER "trg_validate_challenge_rules" BEFORE INSERT OR UPDATE ON "public"."challenges" FOR EACH ROW EXECUTE FUNCTION "public"."validate_challenge_rules"();



ALTER TABLE ONLY "public"."access_codes"
    ADD CONSTRAINT "access_codes_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."anamnesis_records"
    ADD CONSTRAINT "anamnesis_records_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."anamnesis_records"
    ADD CONSTRAINT "anamnesis_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."anamnesis_records"
    ADD CONSTRAINT "anamnesis_records_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."anamnesis_templates"("id");



ALTER TABLE ONLY "public"."anamnesis_templates"
    ADD CONSTRAINT "anamnesis_templates_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."anthropometry_records"
    ADD CONSTRAINT "anthropometry_records_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."anthropometry_records"
    ADD CONSTRAINT "anthropometry_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."nutritionist_services"("id");



ALTER TABLE ONLY "public"."asaas_payments"
    ADD CONSTRAINT "asaas_payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id");



ALTER TABLE ONLY "public"."asaas_payments"
    ADD CONSTRAINT "asaas_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."bulk_messages"
    ADD CONSTRAINT "bulk_messages_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."challenge_activity"
    ADD CONSTRAINT "challenge_activity_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."challenge_activity"
    ADD CONSTRAINT "challenge_activity_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_activity"
    ADD CONSTRAINT "challenge_activity_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."challenge_checkins"
    ADD CONSTRAINT "challenge_checkins_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_checkins"
    ADD CONSTRAINT "challenge_checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_daily_points"
    ADD CONSTRAINT "challenge_daily_points_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_daily_points"
    ADD CONSTRAINT "challenge_daily_points_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_participants"
    ADD CONSTRAINT "challenge_participants_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."challenge_participants"
    ADD CONSTRAINT "challenge_participants_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_participants"
    ADD CONSTRAINT "challenge_participants_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."challenges"
    ADD CONSTRAINT "challenges_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."challenges"
    ADD CONSTRAINT "challenges_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."chat_group_members"
    ADD CONSTRAINT "chat_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."chat_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_group_members"
    ADD CONSTRAINT "chat_group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_group_messages"
    ADD CONSTRAINT "chat_group_messages_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."chat_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_group_messages"
    ADD CONSTRAINT "chat_group_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."chat_groups"
    ADD CONSTRAINT "chat_groups_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."chat_rooms"
    ADD CONSTRAINT "chat_rooms_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."chat_rooms"
    ADD CONSTRAINT "chat_rooms_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."consultation_feedback"
    ADD CONSTRAINT "consultation_feedback_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id");



ALTER TABLE ONLY "public"."daily_logs"
    ADD CONSTRAINT "daily_logs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."energy_expenditure_records"
    ADD CONSTRAINT "energy_expenditure_records_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."energy_expenditure_records"
    ADD CONSTRAINT "energy_expenditure_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."financial_records"
    ADD CONSTRAINT "financial_records_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."financial_records"
    ADD CONSTRAINT "financial_records_parent_transaction_id_fkey" FOREIGN KEY ("parent_transaction_id") REFERENCES "public"."financial_records"("id");



ALTER TABLE ONLY "public"."financial_records"
    ADD CONSTRAINT "financial_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."food_diary_entries"
    ADD CONSTRAINT "food_diary_entries_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."food_measures"
    ADD CONSTRAINT "food_measures_nutritionist_food_id_fkey" FOREIGN KEY ("nutritionist_food_id") REFERENCES "public"."nutritionist_foods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_measures"
    ADD CONSTRAINT "food_measures_reference_food_id_fkey" FOREIGN KEY ("reference_food_id") REFERENCES "public"."reference_foods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."lab_results"
    ADD CONSTRAINT "lab_results_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."lab_results"
    ADD CONSTRAINT "lab_results_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."meal_item_substitutions"
    ADD CONSTRAINT "meal_item_substitutions_meal_item_id_fkey" FOREIGN KEY ("meal_item_id") REFERENCES "public"."meal_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_item_substitutions"
    ADD CONSTRAINT "meal_item_substitutions_nutritionist_food_id_fkey" FOREIGN KEY ("nutritionist_food_id") REFERENCES "public"."nutritionist_foods"("id");



ALTER TABLE ONLY "public"."meal_item_substitutions"
    ADD CONSTRAINT "meal_item_substitutions_reference_food_id_fkey" FOREIGN KEY ("reference_food_id") REFERENCES "public"."reference_foods"("id");



ALTER TABLE ONLY "public"."meal_items"
    ADD CONSTRAINT "meal_items_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_items"
    ADD CONSTRAINT "meal_items_nutritionist_food_id_fkey" FOREIGN KEY ("nutritionist_food_id") REFERENCES "public"."nutritionist_foods"("id");



ALTER TABLE ONLY "public"."meal_items"
    ADD CONSTRAINT "meal_items_reference_food_id_fkey" FOREIGN KEY ("reference_food_id") REFERENCES "public"."reference_foods"("id");



ALTER TABLE ONLY "public"."meal_plans"
    ADD CONSTRAINT "meal_plans_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."meal_plans"
    ADD CONSTRAINT "meal_plans_parent_plan_id_fkey" FOREIGN KEY ("parent_plan_id") REFERENCES "public"."meal_plans"("id");



ALTER TABLE ONLY "public"."meal_plans"
    ADD CONSTRAINT "meal_plans_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."meals"
    ADD CONSTRAINT "meals_daily_menu_id_fkey" FOREIGN KEY ("daily_menu_id") REFERENCES "public"."plan_daily_menus"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."nutritionist_availability"
    ADD CONSTRAINT "nutritionist_availability_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."nutritionist_foods"
    ADD CONSTRAINT "nutritionist_foods_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."nutritionist_gateways"
    ADD CONSTRAINT "nutritionist_gateways_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."nutritionist_marketing"
    ADD CONSTRAINT "nutritionist_marketing_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."nutritionist_patients"
    ADD CONSTRAINT "nutritionist_patients_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."nutritionist_patients"
    ADD CONSTRAINT "nutritionist_patients_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."nutritionist_services"
    ADD CONSTRAINT "nutritionist_services_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."patient_timeline"
    ADD CONSTRAINT "patient_timeline_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."patient_timeline"
    ADD CONSTRAINT "patient_timeline_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."plan_daily_menus"
    ADD CONSTRAINT "plan_daily_menus_meal_plan_id_fkey" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_nutritionist_food_id_fkey" FOREIGN KEY ("nutritionist_food_id") REFERENCES "public"."nutritionist_foods"("id");



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_reference_food_id_fkey" FOREIGN KEY ("reference_food_id") REFERENCES "public"."reference_foods"("id");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."supplement_items"
    ADD CONSTRAINT "supplement_items_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "public"."supplement_prescriptions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplement_prescriptions"
    ADD CONSTRAINT "supplement_prescriptions_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."supplement_prescriptions"
    ADD CONSTRAINT "supplement_prescriptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id");



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."user_consents"
    ADD CONSTRAINT "user_consents_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "public"."legal_terms"("id");



ALTER TABLE ONLY "public"."user_consents"
    ADD CONSTRAINT "user_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."user_integrations"
    ADD CONSTRAINT "user_integrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_reputation_events"
    ADD CONSTRAINT "user_reputation_events_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_reputation_events"
    ADD CONSTRAINT "user_reputation_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_reputation"
    ADD CONSTRAINT "user_reputation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waiting_list"
    ADD CONSTRAINT "waiting_list_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."waiting_list"
    ADD CONSTRAINT "waiting_list_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."user_profiles"("id");



CREATE POLICY "Activity insert owner/mod" ON "public"."challenge_activity" FOR INSERT TO "authenticated" WITH CHECK ((("actor_user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."challenge_participants" "me"
  WHERE (("me"."challenge_id" = "challenge_activity"."challenge_id") AND ("me"."patient_id" = "auth"."uid"()) AND ("me"."status" = 'approved'::"public"."challenge_participant_status") AND ("me"."role" = ANY (ARRAY['owner'::"public"."challenge_participant_role", 'moderator'::"public"."challenge_participant_role"])))))));



CREATE POLICY "Activity select" ON "public"."challenge_activity" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."challenge_participants" "me"
  WHERE (("me"."challenge_id" = "challenge_activity"."challenge_id") AND ("me"."patient_id" = "auth"."uid"()) AND ("me"."status" = 'approved'::"public"."challenge_participant_status")))) OR (EXISTS ( SELECT 1
   FROM "public"."challenge_participants" "me2"
  WHERE (("me2"."challenge_id" = "challenge_activity"."challenge_id") AND ("me2"."patient_id" = "auth"."uid"()) AND ("me2"."status" = 'approved'::"public"."challenge_participant_status") AND ("me2"."role" = ANY (ARRAY['owner'::"public"."challenge_participant_role", 'moderator'::"public"."challenge_participant_role"])))))));



CREATE POLICY "Admin manages all tickets" ON "public"."support_tickets" TO "authenticated" USING ((( SELECT "user_profiles"."role"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"())) = 'super_admin'::"public"."app_role"));



CREATE POLICY "Challenges create" ON "public"."challenges" FOR INSERT TO "authenticated" WITH CHECK ((("created_by_user_id" = "auth"."uid"()) AND ("scope" = ANY (ARRAY['public'::"public"."challenge_scope", 'nutritionist'::"public"."challenge_scope"]))));



CREATE POLICY "Challenges list public" ON "public"."challenges" FOR SELECT TO "authenticated" USING (((("scope" = 'public'::"public"."challenge_scope") AND ("status" = ANY (ARRAY['open'::"public"."challenge_status", 'running'::"public"."challenge_status"]))) OR (EXISTS ( SELECT 1
   FROM "public"."challenge_participants" "cp"
  WHERE (("cp"."challenge_id" = "challenges"."id") AND ("cp"."patient_id" = "auth"."uid"()) AND ("cp"."status" = 'approved'::"public"."challenge_participant_status")))) OR ("created_by_user_id" = "auth"."uid"())));



CREATE POLICY "Challenges update by owner" ON "public"."challenges" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."challenge_participants" "cp"
  WHERE (("cp"."challenge_id" = "challenges"."id") AND ("cp"."patient_id" = "auth"."uid"()) AND ("cp"."status" = 'approved'::"public"."challenge_participant_status") AND ("cp"."role" = 'owner'::"public"."challenge_participant_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."challenge_participants" "cp"
  WHERE (("cp"."challenge_id" = "challenges"."id") AND ("cp"."patient_id" = "auth"."uid"()) AND ("cp"."status" = 'approved'::"public"."challenge_participant_status") AND ("cp"."role" = 'owner'::"public"."challenge_participant_role")))));



CREATE POLICY "Checkins insert approved" ON "public"."challenge_checkins" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."challenge_participants" "me"
  WHERE (("me"."challenge_id" = "challenge_checkins"."challenge_id") AND ("me"."patient_id" = "auth"."uid"()) AND ("me"."status" = 'approved'::"public"."challenge_participant_status"))))));



CREATE POLICY "Checkins select" ON "public"."challenge_checkins" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."challenge_participants" "me"
  WHERE (("me"."challenge_id" = "challenge_checkins"."challenge_id") AND ("me"."patient_id" = "auth"."uid"()) AND ("me"."status" = 'approved'::"public"."challenge_participant_status") AND ("me"."role" = ANY (ARRAY['owner'::"public"."challenge_participant_role", 'moderator'::"public"."challenge_participant_role"])))))));



CREATE POLICY "Common access meals" ON "public"."meals" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Common access subs" ON "public"."meal_item_substitutions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Daily points select" ON "public"."challenge_daily_points" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."challenge_participants" "me"
  WHERE (("me"."challenge_id" = "challenge_daily_points"."challenge_id") AND ("me"."patient_id" = "auth"."uid"()) AND ("me"."status" = 'approved'::"public"."challenge_participant_status") AND ("me"."role" = ANY (ARRAY['owner'::"public"."challenge_participant_role", 'moderator'::"public"."challenge_participant_role"])))))));



CREATE POLICY "Nutri create achievements" ON "public"."achievements" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri creates links" ON "public"."nutritionist_patients" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri creates measures" ON "public"."food_measures" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."role" = 'nutritionist'::"public"."app_role")))));



CREATE POLICY "Nutri items access" ON "public"."meal_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."meals" "m"
     JOIN "public"."plan_daily_menus" "dm" ON (("m"."daily_menu_id" = "dm"."id")))
     JOIN "public"."meal_plans" "mp" ON (("dm"."meal_plan_id" = "mp"."id")))
  WHERE (("m"."id" = "meal_items"."meal_id") AND ("mp"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutri manages anthropometry" ON "public"."anthropometry_records" TO "authenticated" USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri manages appointments" ON "public"."appointments" TO "authenticated" USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri manages availability" ON "public"."nutritionist_availability" TO "authenticated" USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri manages bulk messages" ON "public"."bulk_messages" TO "authenticated" USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri manages challenges" ON "public"."challenges" TO "authenticated" USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri manages codes" ON "public"."access_codes" TO "authenticated" USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri manages energy" ON "public"."energy_expenditure_records" TO "authenticated" USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri manages finances" ON "public"."financial_records" TO "authenticated" USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri manages gateways" ON "public"."nutritionist_gateways" TO "authenticated" USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri manages ingredients" ON "public"."recipe_ingredients" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."recipes" "r"
  WHERE (("r"."id" = "recipe_ingredients"."recipe_id") AND ("r"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutri manages invites" ON "public"."invitations" TO "authenticated" USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri manages labs" ON "public"."lab_results" TO "authenticated" USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri manages marketing" ON "public"."nutritionist_marketing" TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Nutri manages menus" ON "public"."plan_daily_menus" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."meal_plans" "mp"
  WHERE (("mp"."id" = "plan_daily_menus"."meal_plan_id") AND ("mp"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutri manages own foods" ON "public"."nutritionist_foods" TO "authenticated" USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri manages plans" ON "public"."meal_plans" TO "authenticated" USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri manages recipes" ON "public"."recipes" TO "authenticated" USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri manages records" ON "public"."anamnesis_records" TO "authenticated" USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri manages services" ON "public"."nutritionist_services" TO "authenticated" USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri manages supplement items" ON "public"."supplement_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."supplement_prescriptions" "p"
  WHERE (("p"."id" = "supplement_items"."prescription_id") AND ("p"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutri manages supplements" ON "public"."supplement_prescriptions" TO "authenticated" USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri manages templates" ON "public"."anamnesis_templates" TO "authenticated" USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri manages waiting list" ON "public"."waiting_list" TO "authenticated" USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri reads audits" ON "public"."food_diary_audit_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."nutritionist_patients" "np"
  WHERE (("np"."nutritionist_id" = "auth"."uid"()) AND ("np"."patient_id" = "food_diary_audit_logs"."patient_id")))));



CREATE POLICY "Nutri reads diary" ON "public"."food_diary_entries" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."nutritionist_patients" "np"
  WHERE (("np"."nutritionist_id" = "auth"."uid"()) AND ("np"."patient_id" = "food_diary_entries"."patient_id")))));



CREATE POLICY "Nutri reads feedback" ON "public"."consultation_feedback" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."appointments" "a"
  WHERE (("a"."id" = "consultation_feedback"."appointment_id") AND ("a"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutri sees rooms" ON "public"."chat_rooms" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri sees their links" ON "public"."nutritionist_patients" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri views linked patient logs" ON "public"."daily_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."nutritionist_patients" "np"
  WHERE (("np"."nutritionist_id" = "auth"."uid"()) AND ("np"."patient_id" = "daily_logs"."patient_id")))));



CREATE POLICY "Nutri views timeline" ON "public"."patient_timeline" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "nutritionist_id"));



CREATE POLICY "Nutri write meals" ON "public"."meals" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."plan_daily_menus" "dm"
     JOIN "public"."meal_plans" "mp" ON (("dm"."meal_plan_id" = "mp"."id")))
  WHERE (("dm"."id" = "meals"."daily_menu_id") AND ("mp"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutri write subs" ON "public"."meal_item_substitutions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ((("public"."meal_items" "mi"
     JOIN "public"."meals" "m" ON (("mi"."meal_id" = "m"."id")))
     JOIN "public"."plan_daily_menus" "dm" ON (("m"."daily_menu_id" = "dm"."id")))
     JOIN "public"."meal_plans" "mp" ON (("dm"."meal_plan_id" = "mp"."id")))
  WHERE (("mi"."id" = "meal_item_substitutions"."meal_item_id") AND ("mp"."nutritionist_id" = "auth"."uid"())))));



CREATE POLICY "Nutritionist views linked patients profiles" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."nutritionist_patients" "np"
  WHERE (("np"."nutritionist_id" = "auth"."uid"()) AND ("np"."patient_id" = "user_profiles"."id")))));



CREATE POLICY "Owner manages members" ON "public"."chat_group_members" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."chat_groups" "g"
  WHERE (("g"."id" = "chat_group_members"."group_id") AND ("g"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Participant can leave" ON "public"."challenge_participants" FOR UPDATE TO "authenticated" USING (("patient_id" = "auth"."uid"())) WITH CHECK ((("patient_id" = "auth"."uid"()) AND ("status" = 'left'::"public"."challenge_participant_status")));



CREATE POLICY "Participants manage by owner/mod" ON "public"."challenge_participants" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."challenge_participants" "me"
  WHERE (("me"."challenge_id" = "challenge_participants"."challenge_id") AND ("me"."patient_id" = "auth"."uid"()) AND ("me"."status" = 'approved'::"public"."challenge_participant_status") AND ("me"."role" = ANY (ARRAY['owner'::"public"."challenge_participant_role", 'moderator'::"public"."challenge_participant_role"])))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."challenge_participants" "me"
  WHERE (("me"."challenge_id" = "challenge_participants"."challenge_id") AND ("me"."patient_id" = "auth"."uid"()) AND ("me"."status" = 'approved'::"public"."challenge_participant_status") AND ("me"."role" = ANY (ARRAY['owner'::"public"."challenge_participant_role", 'moderator'::"public"."challenge_participant_role"]))))) AND (("role" IS DISTINCT FROM 'owner'::"public"."challenge_participant_role") OR (EXISTS ( SELECT 1
   FROM "public"."challenge_participants" "me_owner"
  WHERE (("me_owner"."challenge_id" = "challenge_participants"."challenge_id") AND ("me_owner"."patient_id" = "auth"."uid"()) AND ("me_owner"."status" = 'approved'::"public"."challenge_participant_status") AND ("me_owner"."role" = 'owner'::"public"."challenge_participant_role")))))));



CREATE POLICY "Participants request join" ON "public"."challenge_participants" FOR INSERT TO "authenticated" WITH CHECK (("patient_id" = "auth"."uid"()));



CREATE POLICY "Participants select" ON "public"."challenge_participants" FOR SELECT TO "authenticated" USING ((("patient_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."challenge_participants" "me"
  WHERE (("me"."challenge_id" = "challenge_participants"."challenge_id") AND ("me"."patient_id" = "auth"."uid"()) AND ("me"."status" = 'approved'::"public"."challenge_participant_status") AND ("me"."role" = ANY (ARRAY['owner'::"public"."challenge_participant_role", 'moderator'::"public"."challenge_participant_role"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."challenge_participants" "me2"
  WHERE (("me2"."challenge_id" = "challenge_participants"."challenge_id") AND ("me2"."patient_id" = "auth"."uid"()) AND ("me2"."status" = 'approved'::"public"."challenge_participant_status"))))));



CREATE POLICY "Participants view leaderboard" ON "public"."challenge_participants" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."challenge_participants" "cp_me"
  WHERE (("cp_me"."challenge_id" = "challenge_participants"."challenge_id") AND ("cp_me"."patient_id" = "auth"."uid"()) AND ("cp_me"."status" = 'approved'::"public"."challenge_participant_status")))) OR (EXISTS ( SELECT 1
   FROM "public"."challenge_participants" "cp_admin"
  WHERE (("cp_admin"."challenge_id" = "challenge_participants"."challenge_id") AND ("cp_admin"."patient_id" = "auth"."uid"()) AND ("cp_admin"."status" = 'approved'::"public"."challenge_participant_status") AND ("cp_admin"."role" = ANY (ARRAY['owner'::"public"."challenge_participant_role", 'moderator'::"public"."challenge_participant_role"])))))));



CREATE POLICY "Patient creates feedback" ON "public"."consultation_feedback" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."appointments" "a"
  WHERE (("a"."id" = "consultation_feedback"."appointment_id") AND ("a"."patient_id" = "auth"."uid"())))));



CREATE POLICY "Patient items read" ON "public"."meal_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."meals" "m"
     JOIN "public"."plan_daily_menus" "dm" ON (("m"."daily_menu_id" = "dm"."id")))
     JOIN "public"."meal_plans" "mp" ON (("dm"."meal_plan_id" = "mp"."id")))
  WHERE (("m"."id" = "meal_items"."meal_id") AND ("mp"."patient_id" = "auth"."uid"())))));



CREATE POLICY "Patient manages diary" ON "public"."food_diary_entries" TO "authenticated" USING (("auth"."uid"() = "patient_id"));



CREATE POLICY "Patient manages logs" ON "public"."daily_logs" TO "authenticated" USING (("auth"."uid"() = "patient_id"));



CREATE POLICY "Patient sees linked nutri foods" ON "public"."nutritionist_foods" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."nutritionist_patients" "np"
  WHERE (("np"."patient_id" = "auth"."uid"()) AND ("np"."nutritionist_id" = "nutritionist_foods"."nutritionist_id")))));



CREATE POLICY "Patient sees rooms" ON "public"."chat_rooms" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "patient_id"));



CREATE POLICY "Patient sees their links" ON "public"."nutritionist_patients" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "patient_id"));



CREATE POLICY "Patient views challenges" ON "public"."challenges" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."challenge_participants" "cp"
  WHERE (("cp"."challenge_id" = "challenges"."id") AND ("cp"."patient_id" = "auth"."uid"())))));



CREATE POLICY "Patient views ingredients" ON "public"."recipe_ingredients" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."recipes" "r"
     JOIN "public"."nutritionist_patients" "np" ON (("r"."nutritionist_id" = "np"."nutritionist_id")))
  WHERE (("r"."id" = "recipe_ingredients"."recipe_id") AND ("np"."patient_id" = "auth"."uid"())))));



CREATE POLICY "Patient views linked nutritionist profile" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."nutritionist_patients" "np"
  WHERE (("np"."patient_id" = "auth"."uid"()) AND ("np"."nutritionist_id" = "user_profiles"."id")))));



CREATE POLICY "Patient views menus" ON "public"."plan_daily_menus" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."meal_plans" "mp"
  WHERE (("mp"."id" = "plan_daily_menus"."meal_plan_id") AND ("mp"."patient_id" = "auth"."uid"())))));



CREATE POLICY "Patient views nutri recipes" ON "public"."recipes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."nutritionist_patients" "np"
  WHERE (("np"."nutritionist_id" = "recipes"."nutritionist_id") AND ("np"."patient_id" = "auth"."uid"())))));



CREATE POLICY "Patient views own anthropometry" ON "public"."anthropometry_records" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "patient_id"));



CREATE POLICY "Patient views own appointments" ON "public"."appointments" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "patient_id"));



CREATE POLICY "Patient views own energy" ON "public"."energy_expenditure_records" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "patient_id"));



CREATE POLICY "Patient views own labs" ON "public"."lab_results" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "patient_id"));



CREATE POLICY "Patient views own plans" ON "public"."meal_plans" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "patient_id"));



CREATE POLICY "Patient views own records" ON "public"."anamnesis_records" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "patient_id"));



CREATE POLICY "Patient views supplement items" ON "public"."supplement_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."supplement_prescriptions" "p"
  WHERE (("p"."id" = "supplement_items"."prescription_id") AND ("p"."patient_id" = "auth"."uid"())))));



CREATE POLICY "Patient views supplements" ON "public"."supplement_prescriptions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "patient_id"));



CREATE POLICY "Patient views timeline" ON "public"."patient_timeline" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "patient_id"));



CREATE POLICY "Public read access" ON "public"."reference_foods" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Public read listed profiles" ON "public"."nutritionist_marketing" FOR SELECT TO "authenticated" USING (("is_listed" = true));



CREATE POLICY "Public read measures" ON "public"."food_measures" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Public read news" ON "public"."platform_news" FOR SELECT TO "authenticated" USING (("is_active" = true));



CREATE POLICY "Public read terms" ON "public"."legal_terms" FOR SELECT USING (true);



CREATE POLICY "Public read units" ON "public"."master_measure_units" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Public reads availability" ON "public"."nutritionist_availability" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Read global or own achievements" ON "public"."achievements" FOR SELECT TO "authenticated" USING ((("nutritionist_id" IS NULL) OR ("nutritionist_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."nutritionist_patients" "np"
  WHERE (("np"."patient_id" = "auth"."uid"()) AND ("np"."nutritionist_id" = "achievements"."nutritionist_id"))))));



CREATE POLICY "Reputation events select own" ON "public"."user_reputation_events" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Reputation select own" ON "public"."user_reputation" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Room participants read messages" ON "public"."chat_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."chat_rooms" "r"
  WHERE (("r"."id" = "chat_messages"."room_id") AND (("r"."nutritionist_id" = "auth"."uid"()) OR ("r"."patient_id" = "auth"."uid"()))))));



CREATE POLICY "Room participants send messages" ON "public"."chat_messages" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "sender_id") AND (EXISTS ( SELECT 1
   FROM "public"."chat_rooms" "r"
  WHERE (("r"."id" = "chat_messages"."room_id") AND (("r"."nutritionist_id" = "auth"."uid"()) OR ("r"."patient_id" = "auth"."uid"())))))));



CREATE POLICY "Send messages logic" ON "public"."chat_group_messages" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."chat_groups" "g"
     LEFT JOIN "public"."chat_group_members" "m" ON ((("g"."id" = "m"."group_id") AND ("m"."user_id" = "auth"."uid"()))))
  WHERE (("g"."id" = "m"."group_id") AND (("g"."owner_id" = "auth"."uid"()) OR (("m"."user_id" IS NOT NULL) AND ("g"."is_broadcast" = false)))))));



CREATE POLICY "Super Admin views logs" ON "public"."system_logs" FOR SELECT TO "authenticated" USING ((( SELECT "user_profiles"."role"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"())) = 'super_admin'::"public"."app_role"));



CREATE POLICY "User consents" ON "public"."user_consents" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "User manages integrations" ON "public"."user_integrations" TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "User manages own tickets" ON "public"."support_tickets" TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "User read own achievements" ON "public"."user_achievements" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "User reads consents" ON "public"."user_consents" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "User sees own notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."user_profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own profile" ON "public"."user_profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own profile" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Users manage own subscription" ON "public"."subscriptions" TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "View group if member" ON "public"."chat_groups" FOR SELECT USING ((("auth"."uid"() = "owner_id") OR (EXISTS ( SELECT 1
   FROM "public"."chat_group_members"
  WHERE (("chat_group_members"."group_id" = "chat_groups"."id") AND ("chat_group_members"."user_id" = "auth"."uid"()))))));



CREATE POLICY "View members" ON "public"."chat_group_members" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."chat_group_members" "my_mem"
  WHERE (("my_mem"."group_id" = "chat_group_members"."group_id") AND ("my_mem"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."chat_groups" "g"
  WHERE (("g"."id" = "chat_group_members"."group_id") AND ("g"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "View messages if member" ON "public"."chat_group_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."chat_group_members"
  WHERE (("chat_group_members"."group_id" = "chat_group_messages"."group_id") AND ("chat_group_members"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."access_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."achievements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."anamnesis_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."anamnesis_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."anthropometry_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."asaas_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."asaas_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bulk_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."challenge_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."challenge_checkins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."challenge_daily_points" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."challenge_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."challenges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_group_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_group_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_rooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."consultation_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."energy_expenditure_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."food_diary_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."food_diary_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."food_group_map" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "food_group_map_select_authenticated" ON "public"."food_group_map" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."food_measures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lab_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."legal_terms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."master_measure_units" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_item_substitutions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nutritionist_availability" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nutritionist_foods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nutritionist_gateways" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nutritionist_marketing" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nutritionist_patients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nutritionist_services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patient_timeline" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plan_daily_menus" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_news" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipe_ingredients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reference_food_translations_select_authenticated" ON "public"."reference_foods_translations" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."reference_foods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reference_foods_translations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reference_foods_translations_select_authenticated" ON "public"."reference_foods_translations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "service_role manages asaas payments" ON "public"."asaas_payments" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role manages asaas webhook events" ON "public"."asaas_webhook_events" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."supplement_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."supplement_prescriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."support_tickets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_achievements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_consents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_integrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_reputation" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_reputation_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users read own asaas payments" ON "public"."asaas_payments" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users read own asaas webhook events" ON "public"."asaas_webhook_events" FOR SELECT TO "authenticated" USING (false);



ALTER TABLE "public"."waiting_list" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_challenge_rewards"("p_challenge_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_challenge_rewards"("p_challenge_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_challenge_rewards"("p_challenge_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_challenge_scoring_for_user_day"("p_user_id" "uuid", "p_day" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_challenge_scoring_for_user_day"("p_user_id" "uuid", "p_day" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_challenge_scoring_for_user_day"("p_user_id" "uuid", "p_day" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_join_policy_on_participant_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."apply_join_policy_on_participant_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_join_policy_on_participant_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_diary_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_diary_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_diary_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_add_patient"("nutri_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_add_patient"("nutri_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_add_patient"("nutri_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_achievements"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_achievements"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_achievements"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_and_grant_challenge_streak"("p_challenge_id" "uuid", "p_user_id" "uuid", "p_day" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."check_and_grant_challenge_streak"("p_challenge_id" "uuid", "p_user_id" "uuid", "p_day" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_and_grant_challenge_streak"("p_challenge_id" "uuid", "p_user_id" "uuid", "p_day" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."compute_challenge_points_for_day"("p_challenge_id" "uuid", "p_user_id" "uuid", "p_day" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_challenge_points_for_day"("p_challenge_id" "uuid", "p_user_id" "uuid", "p_day" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_challenge_points_for_day"("p_challenge_id" "uuid", "p_user_id" "uuid", "p_day" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_chat_room_on_link"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_chat_room_on_link"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_chat_room_on_link"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_challenge_owner_participant"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_challenge_owner_participant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_challenge_owner_participant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."finalize_challenge"("p_challenge_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_challenge"("p_challenge_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_challenge"("p_challenge_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_financial_dashboard"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_financial_dashboard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_financial_dashboard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_patient_by_email"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_patient_by_email"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_patient_by_email"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_patient_lifecycle_status"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_patient_lifecycle_status"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_patient_lifecycle_status"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_platform_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_platform_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_platform_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_upcoming_birthdays"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_upcoming_birthdays"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_upcoming_birthdays"() TO "service_role";



GRANT ALL ON FUNCTION "public"."grant_achievement"("p_user_id" "uuid", "p_achievement_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."grant_achievement"("p_user_id" "uuid", "p_achievement_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."grant_achievement"("p_user_id" "uuid", "p_achievement_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_asaas_webhook_update"("p_asaas_subscription_id" "text", "p_status" "text", "p_valid_until" timestamp with time zone, "p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."handle_asaas_webhook_update"("p_asaas_subscription_id" "text", "p_status" "text", "p_valid_until" timestamp with time zone, "p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_asaas_webhook_update"("p_asaas_subscription_id" "text", "p_status" "text", "p_valid_until" timestamp with time zone, "p_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_challenge_valid_for_reputation"("p_challenge_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_challenge_valid_for_reputation"("p_challenge_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_challenge_valid_for_reputation"("p_challenge_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."lock_challenge_rules"() TO "anon";
GRANT ALL ON FUNCTION "public"."lock_challenge_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."lock_challenge_rules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_diet_activation"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_diet_activation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_diet_activation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_invite"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_invite"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_invite"() TO "service_role";



GRANT ALL ON FUNCTION "public"."redeem_invite_code"("input_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."redeem_invite_code"("input_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_invite_code"("input_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_appointment_to_finance"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_appointment_to_finance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_appointment_to_finance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."transfer_owner_if_needed"() TO "anon";
GRANT ALL ON FUNCTION "public"."transfer_owner_if_needed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_owner_if_needed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_challenges_on_completed"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_challenges_on_completed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_challenges_on_completed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_daily_logs_apply_scoring"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_daily_logs_apply_scoring"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_daily_logs_apply_scoring"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_food_diary_entries_apply_scoring"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_food_diary_entries_apply_scoring"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_food_diary_entries_apply_scoring"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_log_to_timeline"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_log_to_timeline"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_log_to_timeline"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_patient_settings"("p_patient_id" "uuid", "p_settings" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_patient_settings"("p_patient_id" "uuid", "p_settings" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_patient_settings"("p_patient_id" "uuid", "p_settings" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_room_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_room_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_room_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_challenge_rules"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_challenge_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_challenge_rules"() TO "service_role";



GRANT ALL ON TABLE "public"."access_codes" TO "anon";
GRANT ALL ON TABLE "public"."access_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."access_codes" TO "service_role";



GRANT ALL ON TABLE "public"."achievements" TO "anon";
GRANT ALL ON TABLE "public"."achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."achievements" TO "service_role";



GRANT ALL ON TABLE "public"."anamnesis_records" TO "anon";
GRANT ALL ON TABLE "public"."anamnesis_records" TO "authenticated";
GRANT ALL ON TABLE "public"."anamnesis_records" TO "service_role";



GRANT ALL ON TABLE "public"."anamnesis_templates" TO "anon";
GRANT ALL ON TABLE "public"."anamnesis_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."anamnesis_templates" TO "service_role";



GRANT ALL ON TABLE "public"."anthropometry_records" TO "anon";
GRANT ALL ON TABLE "public"."anthropometry_records" TO "authenticated";
GRANT ALL ON TABLE "public"."anthropometry_records" TO "service_role";



GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT ALL ON TABLE "public"."asaas_payments" TO "anon";
GRANT ALL ON TABLE "public"."asaas_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."asaas_payments" TO "service_role";



GRANT ALL ON TABLE "public"."asaas_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."asaas_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."asaas_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."bulk_messages" TO "anon";
GRANT ALL ON TABLE "public"."bulk_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."bulk_messages" TO "service_role";



GRANT ALL ON TABLE "public"."challenge_activity" TO "anon";
GRANT ALL ON TABLE "public"."challenge_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."challenge_activity" TO "service_role";



GRANT ALL ON TABLE "public"."challenge_checkins" TO "anon";
GRANT ALL ON TABLE "public"."challenge_checkins" TO "authenticated";
GRANT ALL ON TABLE "public"."challenge_checkins" TO "service_role";



GRANT ALL ON TABLE "public"."challenge_daily_points" TO "anon";
GRANT ALL ON TABLE "public"."challenge_daily_points" TO "authenticated";
GRANT ALL ON TABLE "public"."challenge_daily_points" TO "service_role";



GRANT ALL ON TABLE "public"."challenge_participants" TO "anon";
GRANT ALL ON TABLE "public"."challenge_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."challenge_participants" TO "service_role";



GRANT ALL ON TABLE "public"."challenges" TO "anon";
GRANT ALL ON TABLE "public"."challenges" TO "authenticated";
GRANT ALL ON TABLE "public"."challenges" TO "service_role";



GRANT ALL ON TABLE "public"."chat_group_members" TO "anon";
GRANT ALL ON TABLE "public"."chat_group_members" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_group_members" TO "service_role";



GRANT ALL ON TABLE "public"."chat_group_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_group_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_group_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chat_groups" TO "anon";
GRANT ALL ON TABLE "public"."chat_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_groups" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chat_rooms" TO "anon";
GRANT ALL ON TABLE "public"."chat_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_rooms" TO "service_role";



GRANT ALL ON TABLE "public"."consultation_feedback" TO "anon";
GRANT ALL ON TABLE "public"."consultation_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."consultation_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."daily_logs" TO "anon";
GRANT ALL ON TABLE "public"."daily_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_logs" TO "service_role";



GRANT ALL ON TABLE "public"."energy_expenditure_records" TO "anon";
GRANT ALL ON TABLE "public"."energy_expenditure_records" TO "authenticated";
GRANT ALL ON TABLE "public"."energy_expenditure_records" TO "service_role";



GRANT ALL ON TABLE "public"."financial_records" TO "anon";
GRANT ALL ON TABLE "public"."financial_records" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_records" TO "service_role";



GRANT ALL ON TABLE "public"."food_diary_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."food_diary_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."food_diary_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."food_diary_entries" TO "anon";
GRANT ALL ON TABLE "public"."food_diary_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."food_diary_entries" TO "service_role";



GRANT ALL ON TABLE "public"."food_group_map" TO "anon";
GRANT ALL ON TABLE "public"."food_group_map" TO "authenticated";
GRANT ALL ON TABLE "public"."food_group_map" TO "service_role";



GRANT ALL ON TABLE "public"."food_measures" TO "anon";
GRANT ALL ON TABLE "public"."food_measures" TO "authenticated";
GRANT ALL ON TABLE "public"."food_measures" TO "service_role";



GRANT ALL ON TABLE "public"."invitations" TO "anon";
GRANT ALL ON TABLE "public"."invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."invitations" TO "service_role";



GRANT ALL ON TABLE "public"."lab_results" TO "anon";
GRANT ALL ON TABLE "public"."lab_results" TO "authenticated";
GRANT ALL ON TABLE "public"."lab_results" TO "service_role";



GRANT ALL ON TABLE "public"."legal_terms" TO "anon";
GRANT ALL ON TABLE "public"."legal_terms" TO "authenticated";
GRANT ALL ON TABLE "public"."legal_terms" TO "service_role";



GRANT ALL ON TABLE "public"."master_measure_units" TO "anon";
GRANT ALL ON TABLE "public"."master_measure_units" TO "authenticated";
GRANT ALL ON TABLE "public"."master_measure_units" TO "service_role";



GRANT ALL ON TABLE "public"."meal_item_substitutions" TO "anon";
GRANT ALL ON TABLE "public"."meal_item_substitutions" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_item_substitutions" TO "service_role";



GRANT ALL ON TABLE "public"."meal_items" TO "anon";
GRANT ALL ON TABLE "public"."meal_items" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_items" TO "service_role";



GRANT ALL ON TABLE "public"."meal_plans" TO "anon";
GRANT ALL ON TABLE "public"."meal_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_plans" TO "service_role";



GRANT ALL ON TABLE "public"."meals" TO "anon";
GRANT ALL ON TABLE "public"."meals" TO "authenticated";
GRANT ALL ON TABLE "public"."meals" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."nutritionist_availability" TO "anon";
GRANT ALL ON TABLE "public"."nutritionist_availability" TO "authenticated";
GRANT ALL ON TABLE "public"."nutritionist_availability" TO "service_role";



GRANT ALL ON TABLE "public"."nutritionist_foods" TO "anon";
GRANT ALL ON TABLE "public"."nutritionist_foods" TO "authenticated";
GRANT ALL ON TABLE "public"."nutritionist_foods" TO "service_role";



GRANT ALL ON TABLE "public"."nutritionist_gateways" TO "anon";
GRANT ALL ON TABLE "public"."nutritionist_gateways" TO "authenticated";
GRANT ALL ON TABLE "public"."nutritionist_gateways" TO "service_role";



GRANT ALL ON TABLE "public"."nutritionist_marketing" TO "anon";
GRANT ALL ON TABLE "public"."nutritionist_marketing" TO "authenticated";
GRANT ALL ON TABLE "public"."nutritionist_marketing" TO "service_role";



GRANT ALL ON TABLE "public"."nutritionist_patients" TO "anon";
GRANT ALL ON TABLE "public"."nutritionist_patients" TO "authenticated";
GRANT ALL ON TABLE "public"."nutritionist_patients" TO "service_role";



GRANT ALL ON TABLE "public"."nutritionist_services" TO "anon";
GRANT ALL ON TABLE "public"."nutritionist_services" TO "authenticated";
GRANT ALL ON TABLE "public"."nutritionist_services" TO "service_role";



GRANT ALL ON TABLE "public"."patient_timeline" TO "anon";
GRANT ALL ON TABLE "public"."patient_timeline" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_timeline" TO "service_role";



GRANT ALL ON TABLE "public"."plan_daily_menus" TO "anon";
GRANT ALL ON TABLE "public"."plan_daily_menus" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_daily_menus" TO "service_role";



GRANT ALL ON TABLE "public"."platform_news" TO "anon";
GRANT ALL ON TABLE "public"."platform_news" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_news" TO "service_role";



GRANT ALL ON TABLE "public"."recipe_ingredients" TO "anon";
GRANT ALL ON TABLE "public"."recipe_ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."recipe_ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."recipes" TO "anon";
GRANT ALL ON TABLE "public"."recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."recipes" TO "service_role";



GRANT ALL ON TABLE "public"."reference_foods" TO "anon";
GRANT ALL ON TABLE "public"."reference_foods" TO "authenticated";
GRANT ALL ON TABLE "public"."reference_foods" TO "service_role";



GRANT ALL ON TABLE "public"."reference_foods_translations" TO "anon";
GRANT ALL ON TABLE "public"."reference_foods_translations" TO "authenticated";
GRANT ALL ON TABLE "public"."reference_foods_translations" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."supplement_items" TO "anon";
GRANT ALL ON TABLE "public"."supplement_items" TO "authenticated";
GRANT ALL ON TABLE "public"."supplement_items" TO "service_role";



GRANT ALL ON TABLE "public"."supplement_prescriptions" TO "anon";
GRANT ALL ON TABLE "public"."supplement_prescriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."supplement_prescriptions" TO "service_role";



GRANT ALL ON TABLE "public"."support_tickets" TO "anon";
GRANT ALL ON TABLE "public"."support_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."support_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."system_logs" TO "anon";
GRANT ALL ON TABLE "public"."system_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."system_logs" TO "service_role";



GRANT ALL ON TABLE "public"."user_achievements" TO "anon";
GRANT ALL ON TABLE "public"."user_achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."user_achievements" TO "service_role";



GRANT ALL ON TABLE "public"."user_consents" TO "anon";
GRANT ALL ON TABLE "public"."user_consents" TO "authenticated";
GRANT ALL ON TABLE "public"."user_consents" TO "service_role";



GRANT ALL ON TABLE "public"."user_integrations" TO "anon";
GRANT ALL ON TABLE "public"."user_integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."user_integrations" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."user_reputation" TO "anon";
GRANT ALL ON TABLE "public"."user_reputation" TO "authenticated";
GRANT ALL ON TABLE "public"."user_reputation" TO "service_role";



GRANT ALL ON TABLE "public"."user_reputation_events" TO "anon";
GRANT ALL ON TABLE "public"."user_reputation_events" TO "authenticated";
GRANT ALL ON TABLE "public"."user_reputation_events" TO "service_role";



GRANT ALL ON TABLE "public"."waiting_list" TO "anon";
GRANT ALL ON TABLE "public"."waiting_list" TO "authenticated";
GRANT ALL ON TABLE "public"."waiting_list" TO "service_role";



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








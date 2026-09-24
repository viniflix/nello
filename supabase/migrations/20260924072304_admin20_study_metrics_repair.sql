CREATE OR REPLACE FUNCTION private.get_tcc_study_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
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
  SELECT COUNT(*) INTO v_completed_anamnesis FROM anamnesis_records WHERE status IN ('validated', 'completed');
  v_anamnesis_completion_rate := CASE WHEN v_total_anamnesis > 0
    THEN ROUND((v_completed_anamnesis::numeric / v_total_anamnesis * 100), 1)
    ELSE 0 END;

  SELECT ROUND(AVG(field_cnt)::numeric, 0) INTO v_avg_fields_per_record
  FROM (
    SELECT CASE
      WHEN jsonb_typeof(content) = 'object' THEN (SELECT COUNT(*) FROM jsonb_object_keys(content))
      WHEN jsonb_typeof(content) = 'array' THEN jsonb_array_length(content)
      ELSE 0
    END AS field_cnt
    FROM anamnesis_records
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
$function$;

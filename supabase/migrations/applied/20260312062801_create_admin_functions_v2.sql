CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.get_nutritionists_list()
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  created_at timestamptz,
  is_active boolean,
  patients_count bigint,
  last_activity timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.get_system_live_logs(limit_count integer DEFAULT 50)
RETURNS TABLE (
  id text,
  type text,
  message text,
  user_name text,
  event_timestamp timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

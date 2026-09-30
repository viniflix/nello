
-- RPC: Busca detalhes completos de um nutricionista para o painel admin
CREATE OR REPLACE FUNCTION get_nutritionist_detail(p_nutritionist_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Grant to authenticated users (admin check is done at application level)
GRANT EXECUTE ON FUNCTION get_nutritionist_detail(UUID) TO authenticated;

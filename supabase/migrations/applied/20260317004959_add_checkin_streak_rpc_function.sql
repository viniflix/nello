
-- Função para incrementar streak de check-in
CREATE OR REPLACE FUNCTION increment_checkin_streak(p_patient_id UUID, p_nutritionist_id UUID)
RETURNS VOID AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para adicionar XP ao paciente
CREATE OR REPLACE FUNCTION add_patient_xp(
  p_patient_id UUID,
  p_nutritionist_id UUID,
  p_xp INTEGER,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

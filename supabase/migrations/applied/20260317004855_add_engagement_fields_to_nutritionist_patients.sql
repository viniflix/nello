
ALTER TABLE public.nutritionist_patients
  ADD COLUMN IF NOT EXISTS plan_expires_at DATE,
  ADD COLUMN IF NOT EXISTS checkin_streak_current INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checkin_streak_best INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_checkin_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS engagement_level TEXT DEFAULT 'new' CHECK (engagement_level IN ('new', 'engaged', 'at_risk', 'inactive')),
  ADD COLUMN IF NOT EXISTS xp_points INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level_name TEXT DEFAULT 'Iniciante';

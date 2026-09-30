
-- Tabela 1: Templates de Check-in
CREATE TABLE IF NOT EXISTS public.checkin_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nutritionist_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly', 'custom')),
  send_time TIME DEFAULT '09:00:00',
  send_days INTEGER[] DEFAULT '{1}',
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela 2: Campos dos Templates
CREATE TABLE IF NOT EXISTS public.checkin_fields (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.checkin_templates(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('scale_1_10', 'yes_no', 'number', 'text', 'multiple_choice', 'photo')),
  options JSONB DEFAULT '[]',
  score_weight NUMERIC DEFAULT 1.0,
  unit TEXT,
  is_required BOOLEAN DEFAULT true,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela 3: Schedules de Check-in
CREATE TABLE IF NOT EXISTS public.checkin_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.checkin_templates(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  nutritionist_id UUID NOT NULL REFERENCES public.user_profiles(id),
  is_active BOOLEAN DEFAULT true,
  next_send_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  channel TEXT DEFAULT 'in_app' CHECK (channel IN ('in_app', 'whatsapp', 'email')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (template_id, patient_id)
);

-- Tabela 4: Sessões de Check-in
CREATE TABLE IF NOT EXISTS public.checkin_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID REFERENCES public.checkin_schedules(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.user_profiles(id),
  nutritionist_id UUID NOT NULL REFERENCES public.user_profiles(id),
  template_id UUID NOT NULL REFERENCES public.checkin_templates(id),
  token TEXT UNIQUE NOT NULL DEFAULT substring(replace(gen_random_uuid()::text, '-', ''), 1, 32),
  responses JSONB DEFAULT '{}',
  score_total NUMERIC DEFAULT 0,
  score_max NUMERIC DEFAULT 0,
  adherence_percentage NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  sent_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '48 hours'),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela 5: Branding por Nutricionista
CREATE TABLE IF NOT EXISTS public.nutritionist_branding (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nutritionist_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE UNIQUE,
  clinic_name TEXT,
  logo_url TEXT,
  cover_image_url TEXT,
  primary_color TEXT DEFAULT '#22c55e',
  accent_color TEXT DEFAULT '#16a34a',
  welcome_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);


-- Tabela de Suplementação
CREATE TABLE IF NOT EXISTS public.supplement_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.user_profiles(id),
  nutritionist_id UUID REFERENCES public.user_profiles(id),
  supplement_name TEXT NOT NULL,
  dose_mg NUMERIC,
  timing TEXT CHECK (timing IN ('pre_workout', 'post_workout', 'morning', 'evening', 'with_meal', 'other')),
  taken_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Campo de foto de refeição
ALTER TABLE public.meals ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Campo de onboarding no relacionamento nutri-paciente  
ALTER TABLE public.nutritionist_patients 
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

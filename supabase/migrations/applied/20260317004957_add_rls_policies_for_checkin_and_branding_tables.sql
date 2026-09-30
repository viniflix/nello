
-- RLS: checkin_templates
ALTER TABLE public.checkin_templates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'checkin_templates' AND policyname = 'Nutricionista gerencia seus templates') THEN
    CREATE POLICY "Nutricionista gerencia seus templates" ON public.checkin_templates
      USING (nutritionist_id = auth.uid());
  END IF;
END $$;

-- RLS: checkin_fields
ALTER TABLE public.checkin_fields ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'checkin_fields' AND policyname = 'Acesso via template do nutricionista') THEN
    CREATE POLICY "Acesso via template do nutricionista" ON public.checkin_fields
      USING (template_id IN (SELECT id FROM public.checkin_templates WHERE nutritionist_id = auth.uid()));
  END IF;
END $$;

-- RLS: checkin_schedules
ALTER TABLE public.checkin_schedules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'checkin_schedules' AND policyname = 'Nutricionista gerencia schedules') THEN
    CREATE POLICY "Nutricionista gerencia schedules" ON public.checkin_schedules
      USING (nutritionist_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'checkin_schedules' AND policyname = 'Paciente ve seus schedules') THEN
    CREATE POLICY "Paciente ve seus schedules" ON public.checkin_schedules
      FOR SELECT USING (patient_id = auth.uid());
  END IF;
END $$;

-- RLS: checkin_sessions
ALTER TABLE public.checkin_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'checkin_sessions' AND policyname = 'Paciente ve suas sessoes') THEN
    CREATE POLICY "Paciente ve suas sessoes" ON public.checkin_sessions
      USING (patient_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'checkin_sessions' AND policyname = 'Nutricionista ve sessoes dos seus pacientes') THEN
    CREATE POLICY "Nutricionista ve sessoes dos seus pacientes" ON public.checkin_sessions
      USING (nutritionist_id = auth.uid());
  END IF;
END $$;

-- RLS: nutritionist_branding
ALTER TABLE public.nutritionist_branding ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nutritionist_branding' AND policyname = 'Nutricionista gerencia seu branding') THEN
    CREATE POLICY "Nutricionista gerencia seu branding" ON public.nutritionist_branding
      USING (nutritionist_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nutritionist_branding' AND policyname = 'Paciente le branding do seu nutricionista') THEN
    CREATE POLICY "Paciente le branding do seu nutricionista" ON public.nutritionist_branding
      FOR SELECT USING (
        nutritionist_id IN (
          SELECT nutritionist_id FROM public.nutritionist_patients WHERE patient_id = auth.uid()
        )
      );
  END IF;
END $$;

-- RLS: supplement_logs  
ALTER TABLE public.supplement_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'supplement_logs' AND policyname = 'Paciente gerencia seus suplementos') THEN
    CREATE POLICY "Paciente gerencia seus suplementos" ON public.supplement_logs
      USING (patient_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'supplement_logs' AND policyname = 'Nutricionista ve suplementos do paciente') THEN
    CREATE POLICY "Nutricionista ve suplementos do paciente" ON public.supplement_logs
      FOR SELECT USING (
        nutritionist_id = auth.uid()
      );
  END IF;
END $$;

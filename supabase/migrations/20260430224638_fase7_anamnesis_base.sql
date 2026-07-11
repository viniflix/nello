-- Fase 7: Motor de Anamnese (Nello Forms) - Data Layer e Segurança

-- 1. Alterar tabela anamnesis_records
ALTER TABLE public.anamnesis_records
    ADD COLUMN IF NOT EXISTS lgpd_consented BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS lgpd_consented_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS lgpd_ip_address TEXT,
    ADD COLUMN IF NOT EXISTS history_log JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Criar índices de performance adicionais
CREATE INDEX IF NOT EXISTS idx_anamnesis_records_content_gin ON public.anamnesis_records USING GIN (content);
CREATE INDEX IF NOT EXISTS idx_anamnesis_records_patient ON public.anamnesis_records(patient_id);
-- A tabela já tem public_access_token, criamos o índice para ele
CREATE INDEX IF NOT EXISTS idx_anamnesis_records_public_token ON public.anamnesis_records(public_access_token);

CREATE INDEX IF NOT EXISTS idx_anamnesis_templates_nutri ON public.anamnesis_templates(nutritionist_id);

-- 2. Triggers para updated_at
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_modified_column') THEN
        CREATE FUNCTION public.update_modified_column()
        RETURNS TRIGGER AS $func$
        BEGIN
            NEW.updated_at = timezone('utc'::text, now());
            RETURN NEW;
        END;
        $func$ LANGUAGE plpgsql;
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_anamnesis_templates_updated_at ON public.anamnesis_templates;
CREATE TRIGGER update_anamnesis_templates_updated_at
BEFORE UPDATE ON public.anamnesis_templates
FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

DROP TRIGGER IF EXISTS update_anamnesis_records_updated_at ON public.anamnesis_records;
CREATE TRIGGER update_anamnesis_records_updated_at
BEFORE UPDATE ON public.anamnesis_records
FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

-- 3. Row Level Security (RLS)
ALTER TABLE public.anamnesis_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anamnesis_records ENABLE ROW LEVEL SECURITY;

-- Segurança: Templates
DROP POLICY IF EXISTS "Nutricionista vê seus templates e os globais" ON public.anamnesis_templates;
CREATE POLICY "Nutricionista vê seus templates e os globais" ON public.anamnesis_templates
    FOR SELECT USING (
        auth.uid() = nutritionist_id OR is_system_default = true
    );

DROP POLICY IF EXISTS "Nutricionista pode gerenciar seus templates" ON public.anamnesis_templates;
CREATE POLICY "Nutricionista pode gerenciar seus templates" ON public.anamnesis_templates
    FOR ALL USING (
        auth.uid() = nutritionist_id
    ) WITH CHECK (
        auth.uid() = nutritionist_id AND is_system_default = false
    );

-- Segurança: Records (Fichas dos pacientes)
DROP POLICY IF EXISTS "Nutricionista acessa records de seus pacientes" ON public.anamnesis_records;
CREATE POLICY "Nutricionista acessa records de seus pacientes" ON public.anamnesis_records
    FOR ALL USING (
        auth.uid() = nutritionist_id
    ) WITH CHECK (
        auth.uid() = nutritionist_id
    );


-- GIN Indexes para deep-search JSONB
CREATE INDEX IF NOT EXISTS idx_anamnesis_records_content_gin 
  ON public.anamnesis_records USING GIN (content);

CREATE INDEX IF NOT EXISTS idx_anamnesis_templates_sections_gin 
  ON public.anamnesis_templates USING GIN (sections);

-- Versionamento de templates
ALTER TABLE public.anamnesis_templates 
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- Snapshot do schema no momento do preenchimento
ALTER TABLE public.anamnesis_records 
  ADD COLUMN IF NOT EXISTS template_snapshot jsonb DEFAULT NULL;

-- Colunas Omnichannel
ALTER TABLE public.anamnesis_records 
  ADD COLUMN IF NOT EXISTS public_access_token uuid DEFAULT NULL;

ALTER TABLE public.anamnesis_records 
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz DEFAULT NULL;

-- Índice único no token público
CREATE UNIQUE INDEX IF NOT EXISTS idx_anamnesis_records_public_token 
  ON public.anamnesis_records (public_access_token) 
  WHERE public_access_token IS NOT NULL;

-- Índice composto paciente + status
CREATE INDEX IF NOT EXISTS idx_anamnesis_records_patient_status 
  ON public.anamnesis_records (patient_id, status);

CREATE TABLE IF NOT EXISTS public.archived_patient_links (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nutritionist_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE NOT NULL,
    patient_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE NOT NULL,
    patient_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(nutritionist_id, patient_id)
);

ALTER TABLE public.archived_patient_links ENABLE ROW LEVEL SECURITY;

-- Drop policies to replace if they exist
DROP POLICY IF EXISTS "Nutri ver arquivados" ON public.archived_patient_links;
DROP POLICY IF EXISTS "Nutri criar arquivados" ON public.archived_patient_links;
DROP POLICY IF EXISTS "Nutri deletar arquivados" ON public.archived_patient_links;

CREATE POLICY "Nutri ver arquivados" 
ON public.archived_patient_links FOR SELECT 
USING (nutritionist_id = auth.uid());

CREATE POLICY "Nutri criar arquivados" 
ON public.archived_patient_links FOR INSERT 
WITH CHECK (nutritionist_id = auth.uid());

CREATE POLICY "Nutri deletar arquivados" 
ON public.archived_patient_links FOR DELETE 
USING (nutritionist_id = auth.uid());

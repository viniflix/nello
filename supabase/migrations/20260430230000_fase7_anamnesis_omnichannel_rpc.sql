-- Fase 7: Sprint 4 - Omnichannel (Patient Link RPCs)

-- Garante que a coluna public_access_token exista e seja gerada por padrão
ALTER TABLE public.anamnesis_records
    ADD COLUMN IF NOT EXISTS public_access_token UUID DEFAULT gen_random_uuid();

-- 1. get_anamnesis_by_token: Busca segura bypassing RLS
DROP FUNCTION IF EXISTS public.get_anamnesis_by_token(UUID);
CREATE OR REPLACE FUNCTION public.get_anamnesis_by_token(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_record RECORD;
    v_template RECORD;
    v_nutritionist RECORD;
BEGIN
    -- Busca o record
    SELECT * INTO v_record FROM public.anamnesis_records WHERE public_access_token = p_token;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Busca o template associado
    SELECT title, description, sections INTO v_template FROM public.anamnesis_templates WHERE id = v_record.template_id;

    -- Busca o nome do nutricionista
    SELECT name INTO v_nutritionist FROM public.user_profiles WHERE id = v_record.nutritionist_id;

    -- Retorna JSON combinado
    RETURN jsonb_build_object(
        'id', v_record.id,
        'date', v_record.date,
        'status', v_record.status,
        'content', v_record.content,
        'lgpd_consented', v_record.lgpd_consented,
        'nutritionist_name', v_nutritionist.name,
        'template', jsonb_build_object(
            'title', v_template.title,
            'description', v_template.description,
            'sections', v_template.sections
        )
    );
END;
$$;

-- 2. submit_anamnesis_by_token: Atualiza anamnese via link
DROP FUNCTION IF EXISTS public.submit_anamnesis_by_token(UUID, JSONB, TEXT, BOOLEAN, TEXT);
CREATE OR REPLACE FUNCTION public.submit_anamnesis_by_token(
    p_token UUID,
    p_content JSONB,
    p_status TEXT,
    p_lgpd_consented BOOLEAN DEFAULT NULL,
    p_ip TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_record_id UUID;
    v_result JSONB;
BEGIN
    SELECT id INTO v_record_id FROM public.anamnesis_records WHERE public_access_token = p_token;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Anamnese não encontrada ou token inválido.';
    END IF;

    UPDATE public.anamnesis_records
    SET 
        content = p_content,
        status = p_status,
        lgpd_consented = COALESCE(p_lgpd_consented, lgpd_consented),
        lgpd_consented_at = CASE WHEN p_lgpd_consented = TRUE AND lgpd_consented_at IS NULL THEN now() ELSE lgpd_consented_at END,
        lgpd_ip_address = COALESCE(p_ip, lgpd_ip_address),
        updated_at = now()
    WHERE id = v_record_id
    RETURNING jsonb_build_object('success', true, 'status', status) INTO v_result;

    RETURN v_result;
END;
$$;

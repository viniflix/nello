-- Fase 7: Update submit_anamnesis_by_token para extrair clinical_flags

DROP FUNCTION IF EXISTS public.submit_anamnesis_by_token(UUID, JSONB, TEXT, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.submit_anamnesis_by_token(UUID, JSONB, TEXT, BOOLEAN, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.submit_anamnesis_by_token(
    p_token UUID,
    p_content JSONB,
    p_status TEXT,
    p_lgpd_consented BOOLEAN DEFAULT NULL,
    p_ip TEXT DEFAULT NULL,
    p_clinical_flags JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_record_id UUID;
    v_patient_id UUID;
    v_result JSONB;
BEGIN
    SELECT id, patient_id INTO v_record_id, v_patient_id FROM public.anamnesis_records WHERE public_access_token = p_token;
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

    -- Se concluído e houver flags clínicas, atualiza o perfil do paciente
    IF p_status = 'completed' AND p_clinical_flags IS NOT NULL AND jsonb_typeof(p_clinical_flags) = 'object' THEN
        UPDATE public.user_profiles
        SET clinical_flags = COALESCE(clinical_flags, '{}'::jsonb) || p_clinical_flags,
            updated_at = now()
        WHERE id = v_patient_id;
    END IF;

    RETURN v_result;
END;
$$;

-- ============================================================
-- FASE 7 PREMIUM: Sprints 6 a 9
-- ============================================================

-- Sprint 6: Suporte a Anexos/Uploads no anamnesis_records
ALTER TABLE public.anamnesis_records
    ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Sprint 8: clinical_flags no user_profiles (tags de alergias/comorbidades extraídas)
ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS clinical_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Sprint 9: Garantir coluna link_url e metadata na tabela notifications (já existe, verificar)
-- A tabela notifications já tem: id, user_id, type, content, is_read, created_at, title, message, link_url, read_at

-- Sprint 8: Índice para busca rápida de clinical_flags
CREATE INDEX IF NOT EXISTS idx_user_profiles_clinical_flags ON public.user_profiles USING GIN (clinical_flags);

-- ============================================================
-- Sprint 8: RPC para injetar clinical_flags após submissão
-- ============================================================
CREATE OR REPLACE FUNCTION public.extract_and_inject_clinical_flags(
    p_record_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_record RECORD;
    v_template RECORD;
    v_new_flags JSONB := '{}'::jsonb;
    v_field RECORD;
    v_section RECORD;
    v_answer TEXT;
BEGIN
    -- Buscar o record
    SELECT r.*, t.sections INTO v_record
    FROM public.anamnesis_records r
    LEFT JOIN public.anamnesis_templates t ON t.id = r.template_id
    WHERE r.id = p_record_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Record not found');
    END IF;

    -- Iterar sobre as seções e campos que tenham a tag 'clinical_flag'
    FOR v_section IN SELECT * FROM jsonb_array_elements(COALESCE(v_record.sections, '[]'::jsonb)) AS s
    LOOP
        FOR v_field IN SELECT * FROM jsonb_array_elements(COALESCE(v_section.value->'fields', '[]'::jsonb)) AS f
        LOOP
            -- Verificar se o campo tem flag clínica configurada
            IF v_field.value->>'clinical_flag_key' IS NOT NULL THEN
                v_answer := v_record.content->>(v_field.value->>'id');
                IF v_answer IS NOT NULL AND v_answer != '' AND v_answer != 'false' AND v_answer != 'nao' AND v_answer != 'não' THEN
                    v_new_flags := v_new_flags || jsonb_build_object(
                        v_field.value->>'clinical_flag_key',
                        jsonb_build_object(
                            'value', v_answer,
                            'label', v_field.value->>'label',
                            'captured_at', now()::text,
                            'source', 'anamnesis',
                            'record_id', p_record_id::text
                        )
                    );
                END IF;
            END IF;
        END LOOP;
    END LOOP;

    -- Merge das flags no perfil do paciente
    IF v_new_flags != '{}'::jsonb THEN
        UPDATE public.user_profiles
        SET clinical_flags = COALESCE(clinical_flags, '{}'::jsonb) || v_new_flags
        WHERE id = v_record.patient_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'flags_injected', v_new_flags);
END;
$$;

-- ============================================================
-- Sprint 9: RPC para criar notificação ao nutricionista
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_nutritionist_anamnesis_completed(
    p_record_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_record RECORD;
    v_patient_name TEXT;
    v_template_title TEXT;
BEGIN
    SELECT r.nutritionist_id, r.patient_id, r.template_id
    INTO v_record
    FROM public.anamnesis_records r
    WHERE r.id = p_record_id;

    IF NOT FOUND THEN RETURN; END IF;

    SELECT name INTO v_patient_name FROM public.user_profiles WHERE id = v_record.patient_id;
    SELECT title INTO v_template_title FROM public.anamnesis_templates WHERE id = v_record.template_id;

    INSERT INTO public.notifications (
        user_id, type, title, message, link_url, is_read, content
    ) VALUES (
        v_record.nutritionist_id,
        'anamnesis_completed',
        'Anamnese Respondida',
        COALESCE(v_patient_name, 'Paciente') || ' respondeu ' || COALESCE(v_template_title, 'o questionário') || ' via link externo.',
        '/nutritionist/patients/' || v_record.patient_id::text || '/anamnesis',
        false,
        jsonb_build_object(
            'record_id', p_record_id,
            'patient_id', v_record.patient_id,
            'patient_name', v_patient_name,
            'template_title', v_template_title,
            'submitted_via', 'external_link'
        )
    );
END;
$$;

-- ============================================================
-- Atualizar a RPC submit_anamnesis_by_token para acionar
-- a extração de flags e notificação quando status = 'completed'
-- ============================================================
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
    SELECT id INTO v_record_id
    FROM public.anamnesis_records
    WHERE public_access_token = p_token;

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
    RETURNING jsonb_build_object('success', true, 'id', id, 'status', status) INTO v_result;

    -- Sprint 8+9: Se concluída pelo paciente via link externo, disparar automações
    IF p_status = 'completed' THEN
        PERFORM public.extract_and_inject_clinical_flags(v_record_id);
        PERFORM public.notify_nutritionist_anamnesis_completed(v_record_id);
    END IF;

    RETURN v_result;
END;
$$;

-- Storage bucket para anexos de anamnese (criado via API, mas policies via SQL)
-- Policies para o bucket anamnesis-attachments serão configuradas via MCP;

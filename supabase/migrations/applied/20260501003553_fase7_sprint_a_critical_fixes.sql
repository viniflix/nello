
-- ============================================================
-- SPRINT A: Correções Críticas de Segurança e Integridade
-- ============================================================

-- A1. Adicionar coluna filled_by para rastrear quem preencheu
ALTER TABLE public.anamnesis_records
    ADD COLUMN IF NOT EXISTS filled_by TEXT
        CHECK (filled_by IN ('nutritionist', 'patient'))
        DEFAULT 'nutritionist';

-- A2. Adicionar coluna appointment_id para integração futura com agenda
ALTER TABLE public.anamnesis_records
    ADD COLUMN IF NOT EXISTS appointment_id BIGINT REFERENCES public.appointments(id) ON DELETE SET NULL;

-- A3. REMOVER policy duplicada que usa auth.uid() inconsistente
DROP POLICY IF EXISTS "Nutricionista acessa records de seus pacientes" ON public.anamnesis_records;

-- A4. ATUALIZAR policy UPDATE para BLOQUEAR edição de records awaiting_patient pelo nutricionista
-- (race condition fix: nutricionista não edita enquanto paciente está preenchendo)
DROP POLICY IF EXISTS "Nutricionists can update anamnesis of their patients" ON public.anamnesis_records;
CREATE POLICY "Nutricionists can update anamnesis of their patients"
    ON public.anamnesis_records
    FOR UPDATE
    USING (
        (auth_uid() = nutritionist_id OR patient_id IN (
            SELECT id FROM public.user_profiles WHERE nutritionist_id = auth_uid()
        ))
        AND status != 'awaiting_patient' -- BLOQUEIO DE RACE CONDITION
    )
    WITH CHECK (
        auth_uid() = nutritionist_id OR patient_id IN (
            SELECT id FROM public.user_profiles WHERE nutritionist_id = auth_uid()
        )
    );

-- ============================================================
-- A5. REESCREVER get_anamnesis_by_token com verificação de expiração
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_anamnesis_by_token(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_record RECORD;
    v_template RECORD;
    v_nutritionist_name TEXT;
BEGIN
    SELECT * INTO v_record
    FROM public.anamnesis_records
    WHERE public_access_token = p_token;

    -- Token não encontrado
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'error', 'TOKEN_NOT_FOUND',
            'message', 'Questionário não encontrado ou link inválido.'
        );
    END IF;

    -- Token expirado
    IF v_record.token_expires_at IS NOT NULL AND v_record.token_expires_at < now() THEN
        RETURN jsonb_build_object(
            'error', 'TOKEN_EXPIRED',
            'message', 'Este link expirou. Solicite um novo link ao seu nutricionista.'
        );
    END IF;

    -- Já foi respondido (token foi revogado após submissão)
    IF v_record.status IN ('completed', 'validated') THEN
        RETURN jsonb_build_object(
            'error', 'ALREADY_COMPLETED',
            'message', 'Este questionário já foi respondido. Obrigado!'
        );
    END IF;

    -- Busca template (prioriza snapshot imutável se disponível)
    IF v_record.template_snapshot IS NOT NULL THEN
        v_template := NULL; -- usa snapshot abaixo
    ELSE
        SELECT title, description, sections
        INTO v_template
        FROM public.anamnesis_templates
        WHERE id = v_record.template_id;
    END IF;

    SELECT name INTO v_nutritionist_name
    FROM public.user_profiles
    WHERE id = v_record.nutritionist_id;

    RETURN jsonb_build_object(
        'id', v_record.id,
        'date', v_record.date,
        'status', v_record.status,
        'content', v_record.content,
        'attachments', v_record.attachments,
        'lgpd_consented', v_record.lgpd_consented,
        'nutritionist_name', v_nutritionist_name,
        'template', CASE
            WHEN v_record.template_snapshot IS NOT NULL THEN v_record.template_snapshot
            ELSE jsonb_build_object(
                'title', v_template.title,
                'description', v_template.description,
                'sections', v_template.sections
            )
        END
    );
END;
$$;

-- ============================================================
-- A6. REESCREVER submit_anamnesis_by_token:
--     - popular filled_by = 'patient'
--     - revogar token após conclusão (LGPD compliance)
--     - capturar IP nativamente via header da requisição
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
    v_captured_ip TEXT;
BEGIN
    -- Capturar IP nativo do servidor (fallback para p_ip se não disponível)
    BEGIN
        v_captured_ip := current_setting('request.headers', true)::json->>'x-real-ip';
        IF v_captured_ip IS NULL OR v_captured_ip = '' THEN
            v_captured_ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_captured_ip := NULL;
    END;

    -- Usar IP do frontend como fallback final
    IF v_captured_ip IS NULL OR v_captured_ip = '' THEN
        v_captured_ip := p_ip;
    END IF;

    -- Buscar record pelo token
    SELECT id INTO v_record_id
    FROM public.anamnesis_records
    WHERE public_access_token = p_token;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TOKEN_NOT_FOUND: Anamnese não encontrada ou token inválido.';
    END IF;

    -- Verificar expiração antes de gravar
    IF EXISTS (
        SELECT 1 FROM public.anamnesis_records
        WHERE id = v_record_id
          AND token_expires_at IS NOT NULL
          AND token_expires_at < now()
    ) THEN
        RAISE EXCEPTION 'TOKEN_EXPIRED: Este link expirou.';
    END IF;

    UPDATE public.anamnesis_records
    SET
        content = p_content,
        status = p_status,
        filled_by = 'patient',
        lgpd_consented = COALESCE(p_lgpd_consented, lgpd_consented),
        lgpd_consented_at = CASE
            WHEN p_lgpd_consented = TRUE AND lgpd_consented_at IS NULL THEN now()
            ELSE lgpd_consented_at
        END,
        lgpd_ip_address = COALESCE(v_captured_ip, lgpd_ip_address),
        -- Revogar token após conclusão (LGPD: link não fica ativo indefinidamente)
        public_access_token = CASE
            WHEN p_status = 'completed' THEN NULL
            ELSE public_access_token
        END,
        updated_at = now()
    WHERE id = v_record_id
    RETURNING jsonb_build_object('success', true, 'id', id, 'status', status) INTO v_result;

    -- Automações pós-conclusão
    IF p_status = 'completed' THEN
        PERFORM public.extract_and_inject_clinical_flags(v_record_id);
        PERFORM public.notify_nutritionist_anamnesis_completed(v_record_id);
    END IF;

    RETURN v_result;
END;
$$;

-- ============================================================
-- A7. RPC: Gerar/Regenerar link (com expiração de 7 dias)
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_anamnesis_link(
    p_record_id UUID,
    p_nutritionist_id UUID,
    p_expires_days INT DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_token UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- Verificar ownership
    IF NOT EXISTS (
        SELECT 1 FROM public.anamnesis_records
        WHERE id = p_record_id AND nutritionist_id = p_nutritionist_id
    ) THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    v_token := gen_random_uuid();
    v_expires_at := now() + (p_expires_days || ' days')::interval;

    UPDATE public.anamnesis_records
    SET
        public_access_token = v_token,
        token_expires_at = v_expires_at,
        status = CASE WHEN status = 'draft' THEN 'awaiting_patient' ELSE status END,
        updated_at = now()
    WHERE id = p_record_id;

    RETURN jsonb_build_object(
        'success', true,
        'token', v_token,
        'expires_at', v_expires_at,
        'status', 'awaiting_patient'
    );
END;
$$;

-- ============================================================
-- A8. Índice para performance na busca por appointment_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_anamnesis_records_appointment_id
    ON public.anamnesis_records(appointment_id)
    WHERE appointment_id IS NOT NULL;

-- A9. Índice para busca de records pendentes (awaiting_patient)
CREATE INDEX IF NOT EXISTS idx_anamnesis_records_awaiting
    ON public.anamnesis_records(nutritionist_id, status, created_at)
    WHERE status = 'awaiting_patient' AND public_access_token IS NOT NULL;

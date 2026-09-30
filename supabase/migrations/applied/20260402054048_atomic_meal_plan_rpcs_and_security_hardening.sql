-- =====================================================
-- Sprint 2: RPCs Atômicas para Planos Alimentares
-- Eliminam race conditions em ativação e promoção de planos
-- =====================================================

-- RPC 1: Ativa um plano desativando todos os outros do paciente (atômico)
CREATE OR REPLACE FUNCTION public.set_active_meal_plan(p_plan_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_patient_id UUID;
BEGIN
    -- Obtém o patient_id do plano alvo
    SELECT patient_id INTO v_patient_id
    FROM meal_plans WHERE id = p_plan_id;

    IF v_patient_id IS NULL THEN
        RAISE EXCEPTION 'Plano % não encontrado', p_plan_id;
    END IF;

    -- Atomicamente: desativa todos os planos ativos do paciente
    UPDATE meal_plans
        SET is_active = false
        WHERE patient_id = v_patient_id AND is_active = true;

    -- Atomicamente: ativa o plano alvo
    UPDATE meal_plans
        SET is_active = true
        WHERE id = p_plan_id;
END;
$$;

-- RPC 2: Promove draft para plano ativo desativando outros (atômico)
CREATE OR REPLACE FUNCTION public.promote_draft_to_active(p_draft_id BIGINT, p_patient_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Atomicamente: desativa planos ativos não-rascunho
    UPDATE meal_plans
        SET is_active = false
        WHERE patient_id = p_patient_id
            AND is_active = true
            AND is_draft = false;

    -- Atomicamente: promove o draft para plano ativo
    UPDATE meal_plans
        SET is_draft = false,
            is_active = true,
            updated_at = NOW()
        WHERE id = p_draft_id;
END;
$$;

-- =====================================================
-- Sprint 3: Hardening de search_path nas funções existentes
-- Previne search path injection attacks
-- =====================================================

ALTER FUNCTION public.generate_random_invite_code(integer)
    SET search_path = public;

ALTER FUNCTION public.trg_set_invite_code()
    SET search_path = public;

ALTER FUNCTION public.generate_unique_invite_code(text)
    SET search_path = public;

ALTER FUNCTION public.redeem_invite_code(text)
    SET search_path = public;

ALTER FUNCTION public.upsert_full_meal_plan(bigint, jsonb, jsonb)
    SET search_path = public;

ALTER FUNCTION public.approve_patient_link(uuid)
    SET search_path = public;

ALTER FUNCTION public.reject_patient_link(uuid)
    SET search_path = public;

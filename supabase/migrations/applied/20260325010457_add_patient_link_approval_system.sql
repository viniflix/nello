-- 1. Add status column to nutritionist_patients
ALTER TABLE public.nutritionist_patients 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' CHECK (status IN ('pending', 'active', 'rejected'));

-- 2. Update existing rows to 'active' (though default covers it, this is safer)
UPDATE public.nutritionist_patients SET status = 'active' WHERE status IS NULL;

-- 3. Update redeem_invite_code RPC
CREATE OR REPLACE FUNCTION public.redeem_invite_code(input_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid;
    v_nutritionist_id uuid;
    v_target_profile_id uuid;
    v_target_profile_data record;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Usuário não autenticado');
    END IF;

    -- 1. Try to find a nutritionist with this code (Case-sensitive)
    SELECT id INTO v_nutritionist_id 
    FROM public.user_profiles 
    WHERE invite_code = input_code AND user_type = 'nutritionist';

    IF v_nutritionist_id IS NOT NULL THEN
        -- Link patient to nutritionist with PENDING status for global code
        INSERT INTO public.nutritionist_patients (nutritionist_id, patient_id, status)
        VALUES (v_nutritionist_id, v_user_id, 'pending')
        ON CONFLICT (nutritionist_id, patient_id) DO UPDATE SET status = 'pending'
        WHERE public.nutritionist_patients.status IS NULL;
        
        -- Update nutritionist_id in profile if not set
        UPDATE public.user_profiles 
        SET nutritionist_id = v_nutritionist_id 
        WHERE id = v_user_id AND (nutritionist_id IS NULL OR nutritionist_id::text = '');

        RETURN jsonb_build_object('success', true, 'type', 'link_pending', 'message', 'Solicitação de vínculo enviada. Aguarde a aprovação do seu nutricionista.');
    END IF;

    -- 2. Try to find a patient profile with this code (Claiming/Offline)
    SELECT * INTO v_target_profile_data
    FROM public.user_profiles 
    WHERE patient_invite_code = input_code AND user_type = 'patient';

    IF v_target_profile_data.id IS NOT NULL THEN
        IF v_target_profile_data.id = v_user_id THEN
            RETURN jsonb_build_object('success', false, 'message', 'Você já é o dono deste perfil');
        END IF;

        -- Claim profile: Update the profile ID to match the current auth user
        BEGIN
            -- Ensure any existing link created by nutritionists for this profile is set to 'active'
            -- (Offline creation usually results in an 'active' link already, but we ensure it)
            UPDATE public.nutritionist_patients 
            SET patient_id = v_user_id, status = 'active'
            WHERE patient_id = v_target_profile_data.id;

            DELETE FROM public.user_profiles WHERE id = v_user_id;
            
            UPDATE public.user_profiles 
            SET id = v_user_id, 
                patient_invite_code = NULL,
                email = COALESCE(email, v_target_profile_data.email)
            WHERE id = v_target_profile_data.id;

            RETURN jsonb_build_object('success', true, 'type', 'profile_claimed', 'message', 'Cadastro vinculado ao perfil clínico com sucesso');
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('success', false, 'message', 'Erro ao vincular perfil: ' || SQLERRM);
        END;
    END IF;

    RETURN jsonb_build_object('success', false, 'message', 'Código inválido ou não encontrado');
END;
$$;

-- 4. Create approval/rejection functions
CREATE OR REPLACE FUNCTION public.approve_patient_link(p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_nutri_id uuid;
BEGIN
    v_nutri_id := auth.uid();
    
    UPDATE public.nutritionist_patients 
    SET status = 'active'
    WHERE nutritionist_id = v_nutri_id AND patient_id = p_patient_id;

    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'message', 'Vínculo aprovado com sucesso');
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'Solicitação não encontrada');
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_patient_link(p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_nutri_id uuid;
BEGIN
    v_nutri_id := auth.uid();
    
    -- Remove the link request
    DELETE FROM public.nutritionist_patients 
    WHERE nutritionist_id = v_nutri_id AND patient_id = p_patient_id;

    IF FOUND THEN
        -- Optional: Clear nutritionist_id from patient's profile if they were linked to this nutri
        UPDATE public.user_profiles 
        SET nutritionist_id = NULL 
        WHERE id = p_patient_id AND nutritionist_id = v_nutri_id;

        RETURN jsonb_build_object('success', true, 'message', 'Solicitação recusada e removida');
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'Solicitação não encontrada');
    END IF;
END;
$$;

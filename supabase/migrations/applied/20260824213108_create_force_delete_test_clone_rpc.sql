CREATE OR REPLACE FUNCTION public.force_delete_test_clone(p_patient_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  -- 1. Verifica se realmente é um clone de teste (trava de segurança)
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = p_patient_id AND metadata->>'observations' = 'DUPLICATA DE TESTE'
  ) THEN
    RAISE EXCEPTION 'Acesso Negado: O paciente não é uma cópia de teste autorizada para exclusão rápida.';
  END IF;

  -- 2. Desativa temporariamente as travas de segurança médica (Triggers do Usuário)
  -- NOTA: Como o owner das tabelas é postgres, podemos desativar as triggers no nível da transação atual.
  ALTER TABLE public.clinical_records DISABLE TRIGGER USER;
  ALTER TABLE public.growth_records DISABLE TRIGGER USER;
  ALTER TABLE public.lab_results DISABLE TRIGGER USER;
  ALTER TABLE public.meal_plans DISABLE TRIGGER USER;
  ALTER TABLE public.patient_goals DISABLE TRIGGER USER;
  ALTER TABLE public.energy_expenditure_calculations DISABLE TRIGGER USER;
  ALTER TABLE public.anamnesis_records DISABLE TRIGGER USER;
  ALTER TABLE public.care_episodes DISABLE TRIGGER USER;
  ALTER TABLE public.nutritionist_patients DISABLE TRIGGER USER;
  ALTER TABLE public.patient_profile_events DISABLE TRIGGER USER;

  -- 3. Exclui todo o "lixo" gerado pelo clone de forma forçada e silenciosa
  DELETE FROM public.clinical_records WHERE patient_id = p_patient_id;
  DELETE FROM public.growth_records WHERE patient_id = p_patient_id;
  DELETE FROM public.lab_results WHERE patient_id = p_patient_id;
  DELETE FROM public.meal_plans WHERE patient_id = p_patient_id;
  DELETE FROM public.patient_goals WHERE patient_id = p_patient_id;
  DELETE FROM public.energy_expenditure_calculations WHERE patient_id = p_patient_id;
  DELETE FROM public.anamnesis_records WHERE patient_id = p_patient_id;
  DELETE FROM public.care_episodes WHERE patient_id = p_patient_id;
  DELETE FROM public.nutritionist_patients WHERE patient_id = p_patient_id;
  DELETE FROM public.patient_profile_events WHERE patient_id = p_patient_id;

  -- 4. Exclui o perfil do paciente
  DELETE FROM public.user_profiles WHERE id = p_patient_id;

  -- 5. Religa as travas de segurança imediatamente
  ALTER TABLE public.clinical_records ENABLE TRIGGER USER;
  ALTER TABLE public.growth_records ENABLE TRIGGER USER;
  ALTER TABLE public.lab_results ENABLE TRIGGER USER;
  ALTER TABLE public.meal_plans ENABLE TRIGGER USER;
  ALTER TABLE public.patient_goals ENABLE TRIGGER USER;
  ALTER TABLE public.energy_expenditure_calculations ENABLE TRIGGER USER;
  ALTER TABLE public.anamnesis_records ENABLE TRIGGER USER;
  ALTER TABLE public.care_episodes ENABLE TRIGGER USER;
  ALTER TABLE public.nutritionist_patients ENABLE TRIGGER USER;
  ALTER TABLE public.patient_profile_events ENABLE TRIGGER USER;

  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    -- Em caso de erro, garante que as travas voltem a funcionar para não comprometer o banco
    ALTER TABLE public.clinical_records ENABLE TRIGGER USER;
    ALTER TABLE public.growth_records ENABLE TRIGGER USER;
    ALTER TABLE public.lab_results ENABLE TRIGGER USER;
    ALTER TABLE public.meal_plans ENABLE TRIGGER USER;
    ALTER TABLE public.patient_goals ENABLE TRIGGER USER;
    ALTER TABLE public.energy_expenditure_calculations ENABLE TRIGGER USER;
    ALTER TABLE public.anamnesis_records ENABLE TRIGGER USER;
    ALTER TABLE public.care_episodes ENABLE TRIGGER USER;
    ALTER TABLE public.nutritionist_patients ENABLE TRIGGER USER;
    ALTER TABLE public.patient_profile_events ENABLE TRIGGER USER;
    RAISE;
END;
$$;

-- Libera o uso da função apenas para usuários logados no Nello
REVOKE ALL ON FUNCTION public.force_delete_test_clone(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_delete_test_clone(uuid) TO authenticated;

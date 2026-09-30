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

  -- 2. Desativa temporariamente as travas de segurança médica (Triggers)
  -- NOTA: O Security Definer faz com que essa função rode como "postgres" (superuser)
  SET session_replication_role = 'replica';

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
  SET session_replication_role = 'origin';

  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    -- Em caso de erro, garante que as travas voltem a funcionar para não comprometer o banco
    SET session_replication_role = 'origin';
    RAISE;
END;
$$;

-- Libera o uso da função apenas para usuários logados no Nello
REVOKE ALL ON FUNCTION public.force_delete_test_clone(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_delete_test_clone(uuid) TO authenticated;

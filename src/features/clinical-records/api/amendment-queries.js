import { supabase } from '@/infrastructure/supabase/client';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

const callRpc = async (rpcName, payload, errorContext) => {
  try {
    const { data, error } = await supabase.rpc(rpcName, payload);
    if (error) logSupabaseError(errorContext, error);
    return { data, error };
  } catch (error) {
    logSupabaseError(errorContext, error);
    return { data: null, error };
  }
};

export const getAmendmentImpact = (recordId) => callRpc(
  'get_clinical_record_amendment_impact',
  { p_record_id: recordId },
  "erro_ao_consultar_impacto_da_alteracao_do_registro_clinico",
);

export const startClinicalRecordCorrection = (
  recordId,
  reason,
  impactConfirmation,
) => callRpc(
  'start_clinical_record_correction',
  {
    p_record_id: recordId,
    p_reason: reason,
    p_impact_confirmation: impactConfirmation,
  },
  "erro_ao_iniciar_correcao_do_registro_clinico",
);

export const abandonClinicalRecordCorrection = (amendmentId, reason) => callRpc(
  'abandon_clinical_record_correction',
  {
    p_amendment_id: amendmentId,
    p_reason: reason,
  },
  "erro_ao_abandonar_correcao_do_registro_clinico",
);

export const invalidateClinicalRecord = (
  recordId,
  reason,
  impactConfirmation,
) => callRpc(
  'invalidate_clinical_record',
  {
    p_record_id: recordId,
    p_reason: reason,
    p_impact_confirmation: impactConfirmation,
  },
  "erro_ao_invalidar_registro_clinico",
);

export const listClinicalRecordVersionChain = (recordId) => callRpc(
  'list_clinical_record_version_chain',
  { p_record_id: recordId },
  "erro_ao_listar_versoes_do_registro_clinico",
);

export const compareClinicalRecordVersions = (leftRecordId, rightRecordId) => callRpc(
  'compare_clinical_record_versions',
  {
    p_left_record_id: leftRecordId,
    p_right_record_id: rightRecordId,
  },
  "erro_ao_comparar_versoes_do_registro_clinico",
);

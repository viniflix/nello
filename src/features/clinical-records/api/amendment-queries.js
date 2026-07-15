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
  'Erro ao consultar impacto da alteração do registro clínico',
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
  'Erro ao iniciar correção do registro clínico',
);

export const abandonClinicalRecordCorrection = (amendmentId, reason) => callRpc(
  'abandon_clinical_record_correction',
  {
    p_amendment_id: amendmentId,
    p_reason: reason,
  },
  'Erro ao abandonar correção do registro clínico',
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
  'Erro ao invalidar registro clínico',
);

export const listClinicalRecordVersionChain = (recordId) => callRpc(
  'list_clinical_record_version_chain',
  { p_record_id: recordId },
  'Erro ao listar versões do registro clínico',
);

export const compareClinicalRecordVersions = (leftRecordId, rightRecordId) => callRpc(
  'compare_clinical_record_versions',
  {
    p_left_record_id: leftRecordId,
    p_right_record_id: rightRecordId,
  },
  'Erro ao comparar versões do registro clínico',
);

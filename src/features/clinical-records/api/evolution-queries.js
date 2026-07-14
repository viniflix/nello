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

export const createClinicalEvolutionDraft = (
  patientId,
  episodeId,
  templateCode,
  encounterAt,
  visibility,
  retrospectiveReason = null,
) => callRpc(
  'create_clinical_evolution_draft',
  {
    p_patient_id: patientId,
    p_episode_id: episodeId,
    p_template_code: templateCode,
    p_encounter_at: encounterAt,
    p_visibility: visibility,
    p_retrospective_reason: retrospectiveReason,
  },
  'Erro ao criar rascunho da evolução',
);

export const updateClinicalRecordDraft = (
  recordId,
  content,
  visibility,
  expectedRevision,
) => callRpc(
  'update_clinical_record_draft',
  {
    p_record_id: recordId,
    p_content: content,
    p_visibility: visibility,
    p_expected_revision: expectedRevision,
  },
  'Erro ao salvar rascunho da evolução',
);

export const finalizeClinicalRecord = (
  recordId,
  content,
  expectedRevision,
  retrospectiveReason = null,
) => callRpc(
  'finalize_clinical_record',
  {
    p_record_id: recordId,
    p_content: content,
    p_expected_revision: expectedRevision,
    p_retrospective_reason: retrospectiveReason,
  },
  'Erro ao finalizar registro clínico',
);

export const signClinicalRecord = (recordId) => callRpc(
  'sign_clinical_record',
  { p_record_id: recordId },
  'Erro ao assinar registro clínico',
);

export const listClinicalRecordsByEpisode = (patientId, episodeId, statusFilter = null) => callRpc(
  'list_clinical_records_by_episode',
  {
    p_patient_id: patientId,
    p_episode_id: episodeId,
    p_status_filter: statusFilter,
  },
  'Erro ao listar registros clínicos',
);

export const listEvolutionTemplates = () => callRpc(
  'list_evolution_templates',
  {},
  'Erro ao listar templates de evolução',
);

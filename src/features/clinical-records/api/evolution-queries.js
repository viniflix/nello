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
  "erro_ao_criar_rascunho_da_evolucao",
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
  "erro_ao_salvar_rascunho_da_evolucao",
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
  "erro_ao_finalizar_registro_clinico",
);

export const signClinicalRecord = (recordId) => callRpc(
  'sign_clinical_record',
  { p_record_id: recordId },
  "erro_ao_assinar_registro_clinico",
);

export const listClinicalRecordsByEpisode = (patientId, episodeId, statusFilter = null) => callRpc(
  'list_clinical_records_by_episode',
  {
    p_patient_id: patientId,
    p_episode_id: episodeId,
    p_status_filter: statusFilter,
  },
  "erro_ao_listar_registros_clinicos",
);

export const listEvolutionTemplates = () => callRpc(
  'list_evolution_templates',
  {},
  "erro_ao_listar_templates_de_evolucao",
);

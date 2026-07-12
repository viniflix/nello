import { supabase } from '@/infrastructure/supabase/client';
import { logSupabaseError } from '@/lib/supabase/query-helpers';
import { normalizeProgressiveProfilePayload } from '../model/progressiveProfileSchema';

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

export const getPatientRecordFoundation = (patientId) => callRpc(
  'get_patient_record_foundation',
  { p_patient_id: patientId },
  'Erro ao buscar fundação do prontuário',
);

export const updatePatientProgressiveProfile = (patientId, changes, source) => {
  try {
    const normalizedChanges = normalizeProgressiveProfilePayload(changes);
    return callRpc(
      'update_patient_progressive_profile',
      { p_patient_id: patientId, p_changes: normalizedChanges, p_source: source },
      'Erro ao atualizar perfil progressivo',
    );
  } catch (error) {
    return Promise.resolve({ data: null, error });
  }
};

export const listPatientLegalGuardians = (patientId, episodeId) => callRpc(
  'list_patient_legal_guardians',
  { p_patient_id: patientId, p_episode_id: episodeId },
  'Erro ao buscar responsáveis legais',
);

export const savePatientLegalGuardian = (patientId, episodeId, payload) => callRpc(
  'upsert_patient_legal_guardian',
  { p_patient_id: patientId, p_episode_id: episodeId, p_payload: payload },
  'Erro ao salvar responsável legal',
);

export const revokePatientLegalGuardian = (guardianId, reason) => callRpc(
  'revoke_patient_legal_guardian',
  { p_guardian_id: guardianId, p_reason: reason },
  'Erro ao revogar responsável legal',
);

export const createClinicalRecordDraft = (patientId, recordType, encounterAt, visibility) => callRpc(
  'create_clinical_record_draft',
  {
    p_patient_id: patientId,
    p_record_type: recordType,
    p_encounter_at: encounterAt,
    p_visibility: visibility,
  },
  'Erro ao criar rascunho do prontuário',
);

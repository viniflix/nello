import {readRequest} from '@/lib/supabase/readRequest';
import { clinicalClient as supabase } from '@/infrastructure/supabase/domainClients';
import { logSupabaseError } from '@/lib/supabase/query-helpers';
import { normalizeProgressiveProfilePayload } from '../model/progressiveProfileSchema';

const callRpc = async (rpcName, payload, errorContext, {signal} = {}) => {
  try {
    const { data, error } = await (['get_patient_record_foundation','list_patient_legal_guardians'].includes(rpcName)
      ? readRequest(() => supabase.rpc(rpcName, payload), {signal}) : supabase.rpc(rpcName, payload));
    if (error) logSupabaseError(errorContext, error);
    return { data, error };
  } catch (error) {
    logSupabaseError(errorContext, error);
    return { data: null, error };
  }
};

export const getPatientRecordFoundation = (patientId, options) => callRpc(
  'get_patient_record_foundation',
  { p_patient_id: patientId },
  "erro_ao_buscar_fundacao_do_prontuario", options,
);

export const updatePatientProgressiveProfile = (patientId, changes, source) => {
  try {
    const normalizedChanges = normalizeProgressiveProfilePayload(changes);
    return callRpc(
      'update_patient_progressive_profile',
      { p_patient_id: patientId, p_changes: normalizedChanges, p_source: source },
      "erro_ao_atualizar_perfil_progressivo",
    );
  } catch (error) {
    return Promise.resolve({ data: null, error });
  }
};

export const listPatientLegalGuardians = (patientId, episodeId, options) => callRpc(
  'list_patient_legal_guardians',
  { p_patient_id: patientId, p_episode_id: episodeId },
  "erro_ao_buscar_responsaveis_legais", options,
);

export const savePatientLegalGuardian = (patientId, episodeId, payload) => callRpc(
  'upsert_patient_legal_guardian',
  { p_patient_id: patientId, p_episode_id: episodeId, p_payload: payload },
  "erro_ao_salvar_responsavel_legal",
);

export const revokePatientLegalGuardian = (guardianId, reason) => callRpc(
  'revoke_patient_legal_guardian',
  { p_guardian_id: guardianId, p_reason: reason },
  "erro_ao_revogar_responsavel_legal",
);

export const createClinicalRecordDraft = (patientId, recordType, encounterAt, visibility) => callRpc(
  'create_clinical_record_draft',
  {
    p_patient_id: patientId,
    p_record_type: recordType,
    p_encounter_at: encounterAt,
    p_visibility: visibility,
  },
  "erro_ao_criar_rascunho_do_prontuario",
);

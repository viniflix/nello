import { invalidateDomain } from '@/infrastructure/realtime/events';

import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import { patientClient as supabase } from '@/infrastructure/supabase/domainClients';

import { isExpectedRequestCancellation, logSupabaseError } from '@/lib/supabase/query-helpers';
import {collectBoundedPages} from './bounded-pages';





export const getLatestAnamnesisForEnergy = async (patientId) => {
    try {
        // Buscar último registro de anamnese
        const { data: anamnesisRecord, error: recordError } = await supabase
            .from('anamnesis_records')
            .select('id, content, date')
            .eq('patient_id', patientId)
            .order('date', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (recordError) throw recordError;

        if (!anamnesisRecord || !anamnesisRecord.content) {
            return { data: null, error: null };
        }

        // Tentar extrair informações de atividade física do conteúdo JSONB
        const content = anamnesisRecord.content;
        let exerciseFrequency = null;
        let activityLevel = null;

        // Buscar em diferentes campos possíveis
        if (typeof content === 'object') {
            // Tentar encontrar campos relacionados a exercício
            const searchFields = [
                'exercise_frequency',
                'exerciseFrequency',
                'frequencia_exercicio',
                'atividade_fisica',
                'physical_activity',
                'nivel_atividade',
                'activity_level'
            ];

            for (const field of searchFields) {
                if (content[field]) {
                    exerciseFrequency = content[field];
                    break;
                }
            }

            // Buscar em seções aninhadas
            if (!exerciseFrequency && content.sections) {
                for (const section of content.sections) {
                    if (section.fields) {
                        for (const field of section.fields) {
                            if (searchFields.includes(field.key || field.id)) {
                                exerciseFrequency = field.value || field.answer;
                                break;
                            }
                        }
                    }
                }
            }
        }

        return {
            data: {
                exerciseFrequency,
                activityLevel,
                date: anamnesisRecord.date
            },
            error: null
        };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_anamnese_para_energia", error);
        return { data: null, error };
    }
};

export const getActiveGoalForEnergy = async (patientId) => {
    try {
        const { data: goal, error } = await supabase
            .from('patient_goals')
            .select('id, goal_type, target_weight, current_weight, description, status')
            .eq('patient_id', patientId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;

        return { data: goal, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_objetivo_para_energia", error);
        return { data: null, error };
    }
};

export const fetchAllNutritionistPatients = async (nutritionistId, {signal} = {}) => {
    try {
        const [carePatients, pendingLinks] = await Promise.all([
            collectBoundedPages((offset, size) => supabase.rpc('list_nutritionist_care_patients').range(offset, offset + size - 1).abortSignal(signal), {signal}),
            collectBoundedPages((offset, size) => supabase
                .from('nutritionist_patients')
                .select('patient_id, status')
                .eq('nutritionist_id', nutritionistId)
                .eq('status', 'pending').order('patient_id').range(offset, offset + size - 1).abortSignal(signal), {signal})
        ]);

        const pendingIds = (pendingLinks || []).map(link => link.patient_id);
        let pending = [];
        if (pendingIds.length > 0) {
            for (let offset = 0; offset < pendingIds.length; offset += 200) {
            const { data: pendingProfiles, error: profileError } = await supabase
                .from('user_profiles')
                .select('id,name,email,cpf,phone,avatar_url,created_at,birth_date,gender,is_active,patient_category')
                .in('id', pendingIds.slice(offset, offset + 200)).abortSignal(signal);
            if (profileError) throw profileError;
            pending.push(...(pendingProfiles || []).map(profile => ({ ...profile, link_status: 'pending' })));
            }
        }

        const normalized = carePatients || [];
        const active = normalized.filter(patient => patient.care_status === 'active');
        const archived = normalized.filter(patient => patient.care_status === 'ended');

        return { active, archived, pending, error: null };
    } catch (error) {
        const failure=signal?.aborted?signal.reason:error;
        if(failure?.name!=='AbortError')logSupabaseError("erro_ao_buscar_pacientes_unificados", failure);
        return { active: [], archived: [], error:failure };
    }
};

export const archivePatient = async (patientId, nutritionistId) => {
    try {
        const { data, error } = await supabase.rpc('end_care_episode', {
            p_patient_id: patientId,
            p_end_reason: 'ended_by_nutritionist'
        });
        if (error) throw error;
        return { success: data?.success === true, error: null, data };
    } catch (error) {
        logSupabaseError("erro_ao_arquivar_paciente", error);
        return { success: false, error };
    }
};

export const getMyCareRelationship = async ({ signal } = {}) => {
    try {
        if (signal?.aborted) return { data: null, error: null, cancelled: true };

        let request = supabase.rpc('get_my_care_relationship');
        if (signal) request = request.abortSignal(signal);
        const { data, error } = await request;
        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        if (isExpectedRequestCancellation(error, signal)) {
            return { data: null, error: null, cancelled: true };
        }
        logSupabaseError("erro_ao_buscar_vinculo_de_atendimento", error);
        return { data: null, error };
    }
};

export const endMyCareRelationship = async (patientId, reason = 'ended_by_patient') => {
    try {
        const { data, error } = await supabase.rpc('end_care_episode', {
            p_patient_id: patientId,
            p_end_reason: reason
        });
        if (error) throw error;
        return { success: data?.success === true, data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_encerrar_vinculo_de_atendimento", error);
        return { success: false, data: null, error };
    }
};

export const unarchivePatient = async (patientId, nutritionistId) => {
    try {
        const { data, error } = await supabase.rpc('start_care_episode', { p_patient_id: patientId, p_start_reason: 'restarted_by_nutritionist' });
        if (!error && data?.success) invalidateDomain(nutritionistId, 'access');
        return { success: !error && data?.success === true, error, data };
    } catch (error) {
        logSupabaseError("erro_ao_reativar_paciente", error);
        return { success: false, error };
    }
};

export const getEmptyPatientRemovalStatus = async (patientId) => {
    try {
        const { data, error } = await supabase.rpc('get_empty_patient_removal_status', {
            p_patient_id: patientId,
        });
        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_verificar_remocao_de_cadastro_vazio", error);
        return { data: { can_remove: false, reason: 'status_check_failed' }, error };
    }
};

export const removeEmptyPatient = async (patientId) => {
    try {
        const { data, error } = await supabase.rpc('remove_empty_patient', {
            p_patient_id: patientId,
        });
        if (error) throw error;
        if (!data?.success) throw new Error('A remoção não foi confirmada pelo servidor.');
        return { success: true, data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_remover_cadastro_vazio_do_paciente", error);
        return { success: false, data: null, error };
    }
};

export const approvePatientLink = async (patientId) => {
    try {
        const { data, error } = await supabase.rpc('approve_patient_link', { p_patient_id: patientId });
        if (error) throw error;
        return { success: data?.success, message: data?.message };
    } catch (error) {
        logSupabaseError("erro_ao_aprovar_vinculo", error);
        return { success: false, message: error.message };
    }
};

export const rejectPatientLink = async (patientId) => {
    try {
        const { data, error } = await supabase.rpc('reject_patient_link', { p_patient_id: patientId });
        if (error) throw error;
        return { success: data?.success, message: data?.message };
    } catch (error) {
        logSupabaseError("erro_ao_rejeitar_vinculo", error);
        return { success: false, message: error.message };
    }
};

export async function getInviteDetails(inviteCode) {
  try {
    const { data, error } = await supabase.rpc('get_invite_details', { p_invite_code: inviteCode });
    if (error) throw error;
    return { success: true, data: data?.[0] };
  } catch (error) {
    logDiagnostic('error', 'lib/supabase/patient-queries.js:1821', 'Erro getInviteDetails:', error);
    return { success: false, message: error.message };
  }
}

import { supabase } from '@/lib/customSupabaseClient';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

/**
 * Avalia exames + meta e retorna sugestões de conduta
 */
export const evaluateLabGoalRules = async ({ nutritionistId, patientId }) => {
    try {
        const { data, error } = await supabase.rpc('evaluate_lab_goal_rules', {
            p_nutritionist_id: nutritionistId,
            p_patient_id: patientId
        });

        if (error) throw error;
        return { data: data || null, error: null };
    } catch (error) {
        logSupabaseError('Erro ao avaliar regras lab+goal', error);
        return { data: null, error };
    }
};

/**
 * Registra sugestão de conduta e retorna a sugestão criada
 */
export const createConductSuggestion = async ({
    nutritionistId,
    patientId,
    suggestionKey,
    title,
    rationale,
    suggestedConduct = null,
    labContext = [],
    goalContext = null
}) => {
    try {
        const { data, error } = await supabase
            .from('conduct_suggestions')
            .insert([{
                nutritionist_id: nutritionistId,
                patient_id: patientId,
                suggestion_key: suggestionKey,
                title,
                rationale,
                suggested_conduct: suggestedConduct,
                lab_context: Array.isArray(labContext) ? labContext : [],
                goal_context: goalContext && typeof goalContext === 'object' ? goalContext : null
            }])
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao criar sugestão de conduta', error);
        return { data: null, error };
    }
};

/**
 * Aprovar sugestão de conduta
 */
export const approveConductSuggestion = async ({ suggestionId, actorId = null }) => {
    try {
        const { data, error } = await supabase.rpc('approve_conduct_suggestion', {
            p_suggestion_id: suggestionId,
            p_actor_id: actorId
        });

        if (error) throw error;
        return { data: data || null, error: null };
    } catch (error) {
        logSupabaseError('Erro ao aprovar sugestão de conduta', error);
        return { data: null, error };
    }
};

/**
 * Rejeitar sugestão de conduta
 */
export const rejectConductSuggestion = async ({ suggestionId, reason = null, actorId = null }) => {
    try {
        const { data, error } = await supabase.rpc('reject_conduct_suggestion', {
            p_suggestion_id: suggestionId,
            p_reason: reason,
            p_actor_id: actorId
        });

        if (error) throw error;
        return { data: data || null, error: null };
    } catch (error) {
        logSupabaseError('Erro ao rejeitar sugestão de conduta', error);
        return { data: null, error };
    }
};

/**
 * Busca sugestões de conduta por paciente
 */
export const getConductSuggestions = async ({ nutritionistId, patientId = null, status = null, limit = 30 }) => {
    try {
        let query = supabase
            .from('conduct_suggestions')
            .select('*')
            .eq('nutritionist_id', nutritionistId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (patientId) query = query.eq('patient_id', patientId);
        if (status) query = query.eq('status', status);

        const { data, error } = await query;
        if (error) throw error;
        return { data: data || [], error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar sugestões de conduta', error);
        return { data: [], error };
    }
};

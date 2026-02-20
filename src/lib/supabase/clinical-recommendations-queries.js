import { supabase } from '@/lib/customSupabaseClient';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

const DEFAULT_STATUS = 'pending';

export const getClinicalRecommendations = async ({
    nutritionistId,
    patientId = null,
    status = null,
    limit = 30
}) => {
    try {
        let query = supabase
            .from('clinical_recommendations')
            .select('*')
            .eq('nutritionist_id', nutritionistId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (patientId) {
            query = query.eq('patient_id', patientId);
        }
        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;
        if (error) throw error;

        return { data: data || [], error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar recomendações clínicas', error);
        return { data: [], error };
    }
};

export const createClinicalRecommendation = async ({
    nutritionistId,
    patientId,
    recommendationKey,
    title,
    recommendationText,
    rationale,
    confidenceScore = null,
    sourceModule = 'copilot_v1',
    inputSnapshot = {},
    outputSnapshot = {},
    metadata = {}
}) => {
    try {
        const { data, error } = await supabase
            .from('clinical_recommendations')
            .insert([{
                nutritionist_id: nutritionistId,
                patient_id: patientId,
                recommendation_key: recommendationKey,
                source_module: sourceModule,
                title,
                recommendation_text: recommendationText,
                rationale,
                confidence_score: confidenceScore,
                input_snapshot: inputSnapshot && typeof inputSnapshot === 'object' ? inputSnapshot : {},
                output_snapshot: outputSnapshot && typeof outputSnapshot === 'object' ? outputSnapshot : {},
                metadata: metadata && typeof metadata === 'object' ? metadata : {},
                status: DEFAULT_STATUS
            }])
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao criar recomendação clínica', error);
        return { data: null, error };
    }
};

export const updateClinicalRecommendationStatus = async ({
    recommendationId,
    status,
    actorUserId = null,
    metadata = {}
}) => {
    try {
        const safeStatus = ['pending', 'accepted', 'dismissed', 'applied'].includes(status)
            ? status
            : DEFAULT_STATUS;

        const { data: current, error: currentError } = await supabase
            .from('clinical_recommendations')
            .select('metadata, accepted_by, accepted_at')
            .eq('id', recommendationId)
            .maybeSingle();

        if (currentError) throw currentError;

        const mergedMetadata = {
            ...(current?.metadata && typeof current.metadata === 'object' ? current.metadata : {}),
            ...(metadata && typeof metadata === 'object' ? metadata : {})
        };

        const baseUpdate = {
            status: safeStatus,
            metadata: mergedMetadata
        };

        if (safeStatus === 'accepted') {
            baseUpdate.accepted_by = actorUserId || null;
            baseUpdate.accepted_at = new Date().toISOString();
        }
        if (safeStatus === 'applied') {
            baseUpdate.applied_at = new Date().toISOString();
            if (!current?.accepted_by) {
                baseUpdate.accepted_by = actorUserId || current?.accepted_by || null;
            }
            if (!current?.accepted_at) {
                baseUpdate.accepted_at = new Date().toISOString();
            }
        }

        const { data, error } = await supabase
            .from('clinical_recommendations')
            .update(baseUpdate)
            .eq('id', recommendationId)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao atualizar status da recomendação clínica', error);
        return { data: null, error };
    }
};

export const acceptClinicalRecommendation = async ({
    recommendationId,
    actorUserId = null,
    metadata = {}
}) => updateClinicalRecommendationStatus({
    recommendationId,
    status: 'accepted',
    actorUserId,
    metadata
});

export const dismissClinicalRecommendation = async ({
    recommendationId,
    actorUserId = null,
    metadata = {}
}) => updateClinicalRecommendationStatus({
    recommendationId,
    status: 'dismissed',
    actorUserId,
    metadata
});

export const markClinicalRecommendationApplied = async ({
    recommendationId,
    actorUserId = null,
    metadata = {}
}) => updateClinicalRecommendationStatus({
    recommendationId,
    status: 'applied',
    actorUserId,
    metadata
});

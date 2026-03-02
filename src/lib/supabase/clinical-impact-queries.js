import { supabase } from '@/lib/customSupabaseClient';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

/**
 * Registra simulação de impacto clínico
 */
export const logClinicalImpact = async ({
    nutritionistId,
    patientId,
    module,
    scenario,
    initialValue,
    simulatedValue,
    impactNotes = null,
    confidenceLow = null,
    confidenceHigh = null,
    wasApplied = false,
    metadata = {}
}) => {
    try {
        const { data, error } = await supabase
            .from('clinical_impact_log')
            .insert([{
                nutritionist_id: nutritionistId,
                patient_id: patientId,
                module,
                scenario,
                initial_value: initialValue && typeof initialValue === 'object' ? initialValue : {},
                simulated_value: simulatedValue && typeof simulatedValue === 'object' ? simulatedValue : {},
                impact_notes: impactNotes,
                confidence_low: confidenceLow,
                confidence_high: confidenceHigh,
                was_applied: Boolean(wasApplied),
                metadata: metadata && typeof metadata === 'object' ? metadata : {}
            }])
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao registrar impacto clínico', error);
        return { data: null, error };
    }
};

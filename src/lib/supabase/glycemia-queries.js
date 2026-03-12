import { supabase } from '@/lib/customSupabaseClient';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

/**
 * Busca o histórico de glicemia do paciente
 * @param {string} patientId - ID do paciente
 * @param {object} options - Opções (limit, startDate, endDate)
 * @returns {Promise<{data: array, error: object}>}
 */
export const getGlycemiaRecords = async (patientId, options = {}) => {
    try {
        let query = supabase
            .from('glycemia_records')
            .select('*')
            .eq('patient_id', patientId)
            .order('record_date', { ascending: false });

        if (options.limit) {
            query = query.limit(options.limit);
        }
        
        if (options.startDate) {
            query = query.gte('record_date', options.startDate);
        }

        const { data, error } = await query;
        if (error) throw error;
        
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar glicemia', error);
        return { data: null, error };
    }
};

/**
 * Cria um novo registro de glicemia
 * @param {object} recordData - Dados: patient_id, glycemia_value, condition, record_date
 * @returns {Promise<{data: object, error: object}>}
 */
export const insertGlycemiaRecord = async (recordData) => {
    try {
        const { data, error } = await supabase
            .from('glycemia_records')
            .insert({
                patient_id: recordData.patient_id,
                glycemia_value: recordData.glycemia_value,
                condition: recordData.condition || null,
                notes: recordData.notes || null,
                record_date: recordData.record_date || new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao registrar glicemia', error);
        return { data: null, error };
    }
};

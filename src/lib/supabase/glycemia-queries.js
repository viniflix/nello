import { supabase } from '@/lib/customSupabaseClient';
import { logSupabaseError } from '@/lib/supabase/query-helpers';
import { parseGlycemiaMgDl } from '@/lib/utils/glycemia';

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
            .order('date', { ascending: false });

        if (options.limit) {
            query = query.limit(options.limit);
        }
        
        if (options.startDate) {
            query = query.gte('date', options.startDate);
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
        const value = parseGlycemiaMgDl(recordData.value ?? recordData.glycemia_value);
        if (value === null) throw new Error('GLYCEMIA_VALUE_OUT_OF_RANGE');
        const { data, error } = await supabase
            .from('glycemia_records')
            .insert({
                patient_id: recordData.patient_id,
                value,
                condition: recordData.condition || null,
                notes: recordData.notes || null,
                date: recordData.date || recordData.record_date || new Date().toISOString()
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

import { supabase } from '@/lib/customSupabaseClient';
import { logSupabaseError } from '@/lib/supabase/query-helpers';
import { parseGlycemiaMgDl } from '@/lib/utils/glycemia';
import {collectBoundedPages,pageBounds} from './bounded-pages';

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
            .select("id,patient_id,nutritionist_id,date,value,condition,notes,created_at,care_episode_id")
            .eq('patient_id', patientId)
            .order('date', { ascending: false }).order('id', {ascending:false});

        if (options.startDate) {
            query = query.gte('date', options.startDate);
        }

        let data;
        if (options.limit) {
            const result = await query.limit(pageBounds(options.limit).size);
            if (result.error) throw result.error;
            data = result.data;
        } else data = await collectBoundedPages((offset,size) => query.range(offset,offset+size-1));
        
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_glicemia", error);
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
            .select("id,patient_id,nutritionist_id,date,value,condition,notes,created_at,care_episode_id")
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_registrar_glicemia", error);
        return { data: null, error };
    }
};

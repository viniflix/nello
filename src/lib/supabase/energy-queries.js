import { supabase } from '@/lib/customSupabaseClient';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

const fetchLatestEnergyCalculation = async (patientId) => {
    return supabase
        .from('energy_expenditure_calculations')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
};

/**
 * Busca o último cálculo de gasto energético do paciente
 * @param {string} patientId - ID do paciente
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export const getLatestEnergyCalculation = async (patientId) => {
    try {
        const { data, error } = await fetchLatestEnergyCalculation(patientId);

        if (error) throw error;

        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar cálculo de energia', error);
        return { data: null, error };
    }
};

/**
 * Busca o cálculo de energia com breakdown para tooltip
 * @param {string} patientId - ID do paciente
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export const getEnergyCalculationWithDetails = async (patientId) => {
    try {
        const { data, error } = await fetchLatestEnergyCalculation(patientId);

        if (error) throw error;

        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar cálculo de energia', error);
        return { data: null, error };
    }
};


import { supabase } from '@/lib/customSupabaseClient';

/**
 * Busca todos os registros antropométricos de um paciente
 * @param {string} patientId - ID do paciente
 * @param {object} options - Opções de paginação e ordenação
 * @returns {Promise<{data: array, error: object}>}
 */
export const getAnthropometryRecords = async (patientId, options = {}) => {
    const {
        limit = 50,
        offset = 0,
        orderBy = 'record_date',
        ascending = false
    } = options;

    try {
        const { data, error } = await supabase
            .from('growth_records')
            .select('*')
            .eq('patient_id', patientId)
            .order(orderBy, { ascending })
            .range(offset, offset + limit - 1);

        if (error) throw error;
        return { data: data || [], error: null };
    } catch (error) {
        console.error('Erro ao buscar registros antropométricos:', error);
        return { data: [], error };
    }
};

/**
 * Busca todos os registros para gráficos (sem limite)
 * @param {string} patientId - ID do paciente
 * @returns {Promise<{data: array, error: object}>}
 */
export const getAnthropometryChartData = async (patientId) => {
    try {
        const { data, error } = await supabase
            .from('growth_records')
            .select('id, weight, height, record_date')
            .eq('patient_id', patientId)
            .order('record_date', { ascending: true });

        if (error) throw error;

        // Calcular IMC para cada registro
        const processedData = (data || []).map(record => {
            const bmi = record.height && record.weight
                ? (record.weight / Math.pow(record.height / 100, 2))
                : null;

            return {
                ...record,
                bmi,
                calculatedBmi: bmi
            };
        });

        return { data: processedData, error: null };
    } catch (error) {
        console.error('Erro ao buscar dados para gráficos:', error);
        return { data: [], error };
    }
};

/**
 * Cria um novo registro antropométrico
 * @param {object} recordData - Dados do registro
 * @returns {Promise<{data: object, error: object}>}
 */
export const createAnthropometryRecord = async (recordData) => {
    try {
        const { patient_id, weight, height, record_date, notes } = recordData;

        const { data, error } = await supabase
            .from('growth_records')
            .insert([
                {
                    patient_id,
                    weight,
                    height,
                    record_date,
                    notes: notes || null
                }
            ])
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Erro ao criar registro antropométrico:', error);
        return { data: null, error };
    }
};

/**
 * Atualiza um registro antropométrico existente
 * @param {string} recordId - ID do registro
 * @param {object} recordData - Dados a atualizar
 * @returns {Promise<{data: object, error: object}>}
 */
export const updateAnthropometryRecord = async (recordId, recordData) => {
    try {
        const { weight, height, record_date, notes } = recordData;

        const updateData = {
            ...(weight !== undefined && { weight }),
            ...(height !== undefined && { height }),
            ...(record_date !== undefined && { record_date }),
            ...(notes !== undefined && { notes })
        };

        const { data, error } = await supabase
            .from('growth_records')
            .update(updateData)
            .eq('id', recordId)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Erro ao atualizar registro antropométrico:', error);
        return { data: null, error };
    }
};

/**
 * Deleta um registro antropométrico
 * @param {string} recordId - ID do registro
 * @returns {Promise<{data: object, error: object}>}
 */
export const deleteAnthropometryRecord = async (recordId) => {
    try {
        const { data, error } = await supabase
            .from('growth_records')
            .delete()
            .eq('id', recordId)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Erro ao deletar registro antropométrico:', error);
        return { data: null, error };
    }
};

/**
 * Busca o último registro antropométrico do paciente
 * @param {string} patientId - ID do paciente
 * @returns {Promise<{data: object, error: object}>}
 */
export const getLatestAnthropometryRecord = async (patientId) => {
    try {
        const { data, error } = await supabase
            .from('growth_records')
            .select('weight, height, notes')
            .eq('patient_id', patientId)
            .order('record_date', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Erro ao buscar último registro:', error);
        return { data: null, error };
    }
};

/**
 * Busca estatísticas dos registros antropométricos
 * @param {string} patientId - ID do paciente
 * @returns {Promise<{data: object, error: object}>}
 */
export const getAnthropometryStats = async (patientId) => {
    try {
        const { data, error } = await supabase
            .from('growth_records')
            .select('weight, height, record_date')
            .eq('patient_id', patientId)
            .order('record_date', { ascending: true });

        if (error) throw error;

        if (!data || data.length === 0) {
            return {
                data: {
                    totalRecords: 0,
                    firstRecord: null,
                    lastRecord: null,
                    weightChange: null,
                    bmiChange: null
                },
                error: null
            };
        }

        const firstRecord = data[0];
        const lastRecord = data[data.length - 1];

        const weightChange = lastRecord.weight - firstRecord.weight;
        const firstBmi = firstRecord.height && firstRecord.weight
            ? firstRecord.weight / Math.pow(firstRecord.height / 100, 2)
            : null;
        const lastBmi = lastRecord.height && lastRecord.weight
            ? lastRecord.weight / Math.pow(lastRecord.height / 100, 2)
            : null;

        const stats = {
            totalRecords: data.length,
            firstRecord: {
                date: firstRecord.record_date,
                weight: firstRecord.weight,
                bmi: firstBmi
            },
            lastRecord: {
                date: lastRecord.record_date,
                weight: lastRecord.weight,
                bmi: lastBmi
            },
            weightChange,
            bmiChange: (firstBmi && lastBmi) ? (lastBmi - firstBmi) : null
        };

        return { data: stats, error: null };
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        return { data: null, error };
    }
};

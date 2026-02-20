import { supabase } from '@/lib/customSupabaseClient';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

const isMissingColumnError = (error) => {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('column') && (
        message.includes('supersedes_record_id') ||
        message.includes('revision_group_id') ||
        message.includes('revision_number') ||
        message.includes('is_latest_revision') ||
        message.includes('change_reason') ||
        message.includes('created_by_user_id')
    );
};

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
        ascending = false,
        latestOnly = false
    } = options;

    try {
        const buildQuery = () => supabase
            .from('growth_records')
            .select('*')
            .eq('patient_id', patientId)
            .order(orderBy, { ascending })
            .range(offset, offset + limit - 1);

        if (latestOnly) {
            const { data, error } = await buildQuery().eq('is_latest_revision', true);
            if (!error) return { data: data || [], error: null };
            if (!isMissingColumnError(error)) throw error;
        }

        const { data, error } = await buildQuery();

        if (error) throw error;
        return { data: data || [], error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar registros antropométricos', error);
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
        const buildQuery = () => supabase
            .from('growth_records')
            .select('id, weight, height, record_date')
            .eq('patient_id', patientId)
            .order('record_date', { ascending: true });

        let data;
        let error;
        ({ data, error } = await buildQuery().eq('is_latest_revision', true));
        if (error && !isMissingColumnError(error)) throw error;
        if (error && isMissingColumnError(error)) {
            ({ data, error } = await buildQuery());
        }

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
        logSupabaseError('Erro ao buscar dados para gráficos', error);
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
        const {
            patient_id,
            weight,
            height,
            record_date,
            notes,
            circumferences,
            skinfolds,
            bone_diameters,
            bioimpedance,
            photos,
            results,
            supersedes_record_id,
            change_reason,
            created_by_user_id
        } = recordData;

        const insertData = {
            patient_id,
            weight,
            height,
            record_date,
            notes: notes || null,
            ...(circumferences && { circumferences }),
            ...(skinfolds && { skinfolds }),
            ...(bone_diameters && { bone_diameters }),
            ...(bioimpedance && { bioimpedance }),
            ...(photos && { photos }),
            ...(results && { results }),
            ...(supersedes_record_id && { supersedes_record_id }),
            ...(change_reason && { change_reason }),
            ...(created_by_user_id && { created_by_user_id })
        };

        let { data, error } = await supabase
            .from('growth_records')
            .insert([insertData])
            .select()
            .single();

        if (error && isMissingColumnError(error)) {
            const {
                supersedes_record_id: _supersedes,
                change_reason: _reason,
                created_by_user_id: _createdBy,
                ...fallbackData
            } = insertData;

            ({ data, error } = await supabase
                .from('growth_records')
                .insert([fallbackData])
                .select()
                .single());
        }

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao criar registro antropométrico', error);
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
        const {
            weight,
            height,
            record_date,
            notes,
            circumferences,
            skinfolds,
            bone_diameters,
            bioimpedance,
            photos,
            results
        } = recordData;

        const updateData = {
            ...(weight !== undefined && { weight }),
            ...(height !== undefined && { height }),
            ...(record_date !== undefined && { record_date }),
            ...(notes !== undefined && { notes }),
            ...(circumferences !== undefined && { circumferences }),
            ...(skinfolds !== undefined && { skinfolds }),
            ...(bone_diameters !== undefined && { bone_diameters }),
            ...(bioimpedance !== undefined && { bioimpedance }),
            ...(photos !== undefined && { photos }),
            ...(results !== undefined && { results })
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
        logSupabaseError('Erro ao atualizar registro antropométrico', error);
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
        logSupabaseError('Erro ao deletar registro antropométrico', error);
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
        const buildQuery = () => supabase
            .from('growth_records')
            .select('weight, height, notes')
            .eq('patient_id', patientId)
            .order('record_date', { ascending: false })
            .limit(1);

        let data;
        let error;
        ({ data, error } = await buildQuery().eq('is_latest_revision', true).maybeSingle());
        if (error && !isMissingColumnError(error)) throw error;
        if (error && isMissingColumnError(error)) {
            ({ data, error } = await buildQuery().maybeSingle());
        }

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar último registro', error);
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
        logSupabaseError('Erro ao buscar estatísticas', error);
        return { data: null, error };
    }
};

/**
 * Score longitudinal antropométrico (30/60/90 dias)
 * Requer a função SQL public.get_anthropometry_longitudinal_score
 */
export const getAnthropometryLongitudinalScore = async (patientId) => {
    try {
        const { data, error } = await supabase.rpc('get_anthropometry_longitudinal_score', {
            p_patient_id: patientId
        });

        if (error) throw error;
        return { data: data || null, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar score longitudinal antropométrico', error);
        return { data: null, error };
    }
};

/**
 * Flags de sincronização entre módulos (GET/plano)
 */
export const getPatientModuleSyncFlags = async (patientId) => {
    try {
        const { data, error } = await supabase
            .from('patient_module_sync_flags')
            .select('*')
            .eq('patient_id', patientId)
            .maybeSingle();

        if (error) throw error;
        return { data: data || null, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar flags de sincronização de módulos', error);
        return { data: null, error };
    }
};

/**
 * Limpa flags de sincronização entre módulos após revisão/conclusão
 * @param {string} patientId
 * @param {{ energy?: boolean, mealPlan?: boolean }} options
 */
export const clearPatientModuleSyncFlags = async (patientId, options = {}) => {
    const { energy = false, mealPlan = false } = options;

    try {
        const { data: existing, error: selectError } = await supabase
            .from('patient_module_sync_flags')
            .select('patient_id')
            .eq('patient_id', patientId)
            .maybeSingle();

        if (selectError) throw selectError;

        const patch = {
            patient_id: patientId,
            updated_at: new Date().toISOString(),
            ...(energy ? { needs_energy_recalc: false } : {}),
            ...(mealPlan ? { needs_meal_plan_review: false } : {})
        };

        if (existing?.patient_id) {
            const { data, error } = await supabase
                .from('patient_module_sync_flags')
                .update(patch)
                .eq('patient_id', patientId)
                .select()
                .maybeSingle();
            if (error) throw error;
            return { data, error: null };
        }

        const insertData = {
            patient_id: patientId,
            anthropometry_updated_at: null,
            needs_energy_recalc: energy ? false : false,
            needs_meal_plan_review: mealPlan ? false : false,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('patient_module_sync_flags')
            .insert(insertData)
            .select()
            .maybeSingle();
        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao limpar flags de sincronização de módulos', error);
        return { data: null, error };
    }
};

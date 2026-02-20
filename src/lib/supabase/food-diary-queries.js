import { supabase } from '@/lib/customSupabaseClient';
import { formatDateToIsoDate, getTodayIsoDate } from '@/lib/utils/date';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

/**
 * Busca todas as refeições de um paciente com paginação
 * @param {string} patientId - ID do paciente
 * @param {object} filters - Filtros opcionais (startDate, endDate, mealType)
 * @param {number} limit - Limite de resultados
 * @param {number} offset - Offset para paginação
 */
export const getPatientMeals = async (patientId, filters = {}, limit = 50, offset = 0) => {
    try {
        let query = supabase
            .from('meals')
            .select(`
                *,
                meal_items (
                    *
                )
            `)
            .eq('patient_id', patientId)
            .order('meal_date', { ascending: false })
            .order('meal_time', { ascending: false })
            .range(offset, offset + limit - 1);

        // Aplicar filtros
        if (filters.startDate) {
            query = query.gte('meal_date', filters.startDate);
        }
        if (filters.endDate) {
            query = query.lte('meal_date', filters.endDate);
        }
        if (filters.mealType) {
            query = query.eq('meal_type', filters.mealType);
        }

        const { data, error, count } = await query;

        if (error) throw error;

        return { data, error: null, count };
    } catch (error) {
        logSupabaseError('Erro ao buscar refeições', error);
        return { data: null, error };
    }
};

/**
 * Busca histórico de auditoria de uma refeição específica
 * @param {number} mealId - ID da refeição
 */
export const getMealAuditHistory = async (mealId) => {
    try {
        const { data, error } = await supabase
            .from('meal_audit_log')
            .select('*')
            .eq('meal_id', mealId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar histórico de auditoria', error);
        return { data: null, error };
    }
};

/**
 * Busca todo o histórico de auditoria de um paciente
 * @param {string} patientId - ID do paciente
 * @param {object} filters - Filtros opcionais
 * @param {number} limit - Limite de resultados
 */
export const getPatientAuditHistory = async (patientId, filters = {}, limit = 100) => {
    try {
        let query = supabase
            .from('meal_audit_log')
            .select('*')
            .eq('patient_id', patientId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (filters.action) {
            query = query.eq('action', filters.action);
        }
        if (filters.startDate) {
            query = query.gte('meal_date', filters.startDate);
        }
        if (filters.endDate) {
            query = query.lte('meal_date', filters.endDate);
        }

        const { data, error } = await query;

        if (error) throw error;

        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar histórico completo', error);
        return { data: null, error };
    }
};

/**
 * Calcula estatísticas de adesão ao diário
 * @param {string} patientId - ID do paciente
 * @param {number} days - Número de dias para calcular (7, 30, etc.)
 */
export const calculateDiaryAdherence = async (patientId, days = 30) => {
    try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const startDateStr = formatDateToIsoDate(startDate);

        // Buscar todas as refeições no período
        const { data: meals, error } = await supabase
            .from('meals')
            .select('meal_date')
            .eq('patient_id', patientId)
            .gte('meal_date', startDateStr);

        if (error) throw error;

        // Contar dias únicos com registro
        const uniqueDays = new Set(meals.map(m => m.meal_date));
        const daysWithRecords = uniqueDays.size;
        const adherencePercentage = (daysWithRecords / days) * 100;

        // Calcular streak (dias consecutivos)
        let currentStreak = 0;
        const today = getTodayIsoDate();
        const sortedDates = Array.from(uniqueDays).sort().reverse();

        for (let i = 0; i < days; i++) {
            const checkDate = new Date();
            checkDate.setDate(checkDate.getDate() - i);
            const checkDateStr = formatDateToIsoDate(checkDate);

            if (sortedDates.includes(checkDateStr)) {
                currentStreak++;
            } else if (checkDateStr !== today) {
                // Se não é hoje e não tem registro, quebra a sequência
                break;
            }
        }

        return {
            data: {
                totalDays: days,
                daysWithRecords,
                adherencePercentage: Math.round(adherencePercentage),
                currentStreak,
                totalMeals: meals.length
            },
            error: null
        };
    } catch (error) {
        logSupabaseError('Erro ao calcular adesão', error);
        return { data: null, error };
    }
};

/**
 * Busca resumo nutricional de um período
 * @param {string} patientId - ID do paciente
 * @param {string} startDate - Data inicial (YYYY-MM-DD)
 * @param {string} endDate - Data final (YYYY-MM-DD)
 */
export const getNutritionalSummary = async (patientId, startDate, endDate) => {
    try {
        const { data: meals, error } = await supabase
            .from('meals')
            .select(`
                *,
                meal_items (
                    quantity,
                    calories,
                    protein,
                    carbs,
                    fat
                )
            `)
            .eq('patient_id', patientId)
            .gte('meal_date', startDate)
            .lte('meal_date', endDate);

        if (error) throw error;

        // Calcular totais
        let totalCalories = 0;
        let totalProtein = 0;
        let totalCarbs = 0;
        let totalFat = 0;

        meals.forEach(meal => {
            meal.meal_items?.forEach(item => {
                totalCalories += (item.calories || 0);
                totalProtein += (item.protein || 0);
                totalCarbs += (item.carbs || 0);
                totalFat += (item.fat || 0);
            });
        });

        const days = meals.length > 0 ? new Set(meals.map(m => m.meal_date)).size : 1;

        return {
            data: {
                totalMeals: meals.length,
                days,
                avgCaloriesPerDay: Math.round(totalCalories / days),
                avgProteinPerDay: Math.round(totalProtein / days),
                avgCarbsPerDay: Math.round(totalCarbs / days),
                avgFatPerDay: Math.round(totalFat / days),
                totals: {
                    calories: Math.round(totalCalories),
                    protein: Math.round(totalProtein),
                    carbs: Math.round(totalCarbs),
                    fat: Math.round(totalFat)
                }
            },
            error: null
        };
    } catch (error) {
        logSupabaseError('Erro ao calcular resumo nutricional', error);
        return { data: null, error };
    }
};

/**
 * Busca atividades recentes do diário (para o Feed)
 * @param {string} patientId - ID do paciente
 * @param {number} limit - Limite de resultados
 */
export const getRecentDiaryActivity = async (patientId, limit = 5) => {
    try {
        const { data, error } = await supabase
            .from('meal_audit_log')
            .select('*')
            .eq('patient_id', patientId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;

        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar atividades recentes', error);
        return { data: null, error };
    }
};

/**
 * Formata ação de auditoria para exibição
 * @param {object} auditLog - Objeto do log de auditoria
 * @returns {object} - Objeto formatado com ícone, cor e texto
 */
export const formatAuditAction = (auditLog) => {
    const actionMap = {
        create: {
            icon: 'Plus',
            color: 'text-green-600',
            bgColor: 'bg-green-50',
            borderColor: 'border-green-200',
            label: 'Registrou',
            description: 'Nova refeição adicionada'
        },
        update: {
            icon: 'Edit',
            color: 'text-blue-600',
            bgColor: 'bg-blue-50',
            borderColor: 'border-blue-200',
            label: 'Editou',
            description: 'Refeição modificada'
        },
        delete: {
            icon: 'Trash2',
            color: 'text-red-600',
            bgColor: 'bg-red-50',
            borderColor: 'border-red-200',
            label: 'Excluiu',
            description: 'Refeição removida'
        }
    };

    return actionMap[auditLog.action] || actionMap.create;
};

/**
 * Extrai mudanças do campo details do audit log
 * @param {object} details - JSON details do audit log
 * @returns {array} - Array de mudanças formatadas
 */
export const extractChanges = (details) => {
    if (!details || !details.changes) return [];

    const changes = [];

    Object.keys(details.changes).forEach(field => {
        const change = details.changes[field];
        changes.push({
            field,
            oldValue: change.old,
            newValue: change.new,
            label: getFieldLabel(field)
        });
    });

    return changes;
};

/**
 * Retorna label legível para campos
 */
const getFieldLabel = (field) => {
    const labels = {
        meal_type: 'Tipo de Refeição',
        meal_date: 'Data',
        meal_time: 'Horário',
        notes: 'Observações',
        foods: 'Alimentos'
    };

    return labels[field] || field;
};

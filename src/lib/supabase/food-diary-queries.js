import { clinicalRpc } from '@/lib/supabase/idempotent-mutations';
import { nutritionClient as supabase } from '@/infrastructure/supabase/domainClients';
import { format, subDays } from 'date-fns';
import { isExpectedRequestCancellation, logSupabaseError } from '@/lib/supabase/query-helpers';


/**
 * Mapeia food_id (da view foods) para reference_food_id ou nutritionist_food_id
 * @param {string} foodId - ID do alimento
 * @param {string} source - source do alimento ('custom' = nutritionist_foods)
 */
export const mealItemFoodIds = (foodId, source) => {
    const isCustom = source === 'custom' || source === 'CUSTOM';
    return {
        reference_food_id: isCustom ? null : foodId,
        nutritionist_food_id: isCustom ? foodId : null
    };
};

/** One database transaction owns the meal, its items, computed totals and audit log. */
export async function savePatientDiaryMeal({ mealId = null, expectedRevision = null, mealDate, mealTime, mealType, notes = '', foods }) {
    if (!Array.isArray(foods) || foods.length === 0) throw new Error('Adicione pelo menos um alimento.');
    const numericMealId = mealId == null ? null : Number(mealId);
    if (numericMealId !== null && (!Number.isSafeInteger(numericMealId) || numericMealId <= 0)) {
        throw new Error('Refeição inválida.');
    }
    const items = foods.map((food) => {
        const item = {
            food_id: food.food_id,
            food_source: String(food.food_source || 'reference').toLowerCase() === 'custom' ? 'custom' : 'reference',
            quantity: Number(food.quantity),
            unit: food.unit || 'gram',
            measure_id: food.measure_id || food.measure?.id || null,
        };
        if (!item.food_id || !Number.isFinite(item.quantity) || item.quantity <= 0) {
            throw new Error('Revise os valores dos alimentos antes de salvar.');
        }
        return item;
    });
    const { data, error } = await clinicalRpc('diary_meal', {
        p_meal_id: numericMealId,
        p_payload: { meal_date: mealDate, meal_time: mealTime, meal_type: mealType, notes },
        p_items: items,
    }, expectedRevision);
    if (error) throw error;
    return data;
}

const DEFAULT_REMINDER_PREFERENCES = {
    daily_log_enabled: true,
    measurement_enabled: true,
    daily_log_time: '20:00',
    measurement_time: '09:00',
    channel_in_app: true,
    timezone: 'America/Sao_Paulo',
    quiet_hours_start: null,
    quiet_hours_end: null
};

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
            .select("id,patient_id,meal_date,meal_time,meal_type,notes,total_calories,total_protein,total_fat,total_carbs,created_at,updated_at,is_edited,meal_plan_meal_id,adherence_score,meal_plan_id,deleted_at,photo_url,care_episode_id,\n                meal_items(id,meal_id,name,quantity,calories,protein,fat,carbs,unit,reference_food_id,nutritionist_food_id,grams,measure_id)\n            ")
            .eq('patient_id', patientId)
            .order('meal_date', { ascending: false })
            .order('meal_time', { ascending: false })
            .order('id', { ascending: false })
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

        // Compatibilidade: meal_items usa reference_food_id/nutritionist_food_id
        const dataWithFoodId = (data || []).map((meal) => ({
            ...meal,
            meal_items: (meal.meal_items || []).map((item) => ({
                ...item,
                food_id: item.reference_food_id || item.nutritionist_food_id
            }))
        }));

        /* logOperationalEvent removed */

        return { data: dataWithFoodId, error: null, count };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_refeicoes", error);
        /* logOperationalEvent removed */
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
            .select("id,patient_id,meal_id,action,meal_type,meal_date,meal_time,details,created_at,care_episode_id")
            .eq('meal_id', mealId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_historico_de_auditoria", error);
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
            .select("id,patient_id,meal_id,action,meal_type,meal_date,meal_time,details,created_at,care_episode_id")
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
        logSupabaseError("erro_ao_buscar_historico_completo", error);
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
        if (!Number.isInteger(days) || days < 1) {
            throw new Error('O período do diário deve ser um número inteiro positivo de dias.');
        }
        // meal_date é uma data de calendário: não converter para UTC.
        const referenceDate = new Date();
        const today = format(referenceDate, 'yyyy-MM-dd');
        const startDateStr = format(subDays(referenceDate, days - 1), 'yyyy-MM-dd');

        // Buscar todas as refeições no período
        const { data: meals, error } = await supabase
            .from('meals')
            .select('meal_date')
            .eq('patient_id', patientId)
            .is('deleted_at', null)
            .gte('meal_date', startDateStr)
            .lte('meal_date', today);

        if (error) throw error;

        // Contar dias únicos com registro
        const uniqueDays = new Set(meals.map(m => m.meal_date));
        const daysWithRecords = uniqueDays.size;
        const adherencePercentage = (daysWithRecords / days) * 100;

        // Calcular streak (dias consecutivos)
        let currentStreak = 0;
        for (let i = 0; i < days; i++) {
            const checkDateStr = format(subDays(referenceDate, i), 'yyyy-MM-dd');

            if (uniqueDays.has(checkDateStr)) {
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
        logSupabaseError("erro_ao_calcular_adesao", error);
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
            .select("id,patient_id,meal_date,meal_time,meal_type,notes,total_calories,total_protein,total_fat,total_carbs,created_at,updated_at,is_edited,meal_plan_meal_id,adherence_score,meal_plan_id,deleted_at,photo_url,care_episode_id,\n                meal_items (\n                    quantity,\n                    calories,\n                    protein,\n                    carbs,\n                    fat\n                )\n            ")
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
        logSupabaseError("erro_ao_calcular_resumo_nutricional", error);
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
            .select("id,patient_id,meal_id,action,meal_type,meal_date,meal_time,details,created_at,care_episode_id")
            .eq('patient_id', patientId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;

        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_atividades_recentes", error);
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
 * Busca preferências de lembrete do paciente.
 * Retorna defaults quando ainda não existe registro.
 */
export const getPatientReminderPreferences = async (patientId) => {
    try {
        const { data, error } = await supabase
            .from('patient_reminder_preferences')
            .select("id,patient_id,daily_log_enabled,measurement_enabled,daily_log_time,measurement_time,channel_in_app,timezone,quiet_hours_start,quiet_hours_end,created_at,updated_at")
            .eq('patient_id', patientId)
            .maybeSingle();

        if (error) throw error;
        return {
            data: data ? { ...DEFAULT_REMINDER_PREFERENCES, ...data } : { ...DEFAULT_REMINDER_PREFERENCES, patient_id: patientId },
            error: null
        };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_preferencias_de_lembrete", error);
        return { data: { ...DEFAULT_REMINDER_PREFERENCES, patient_id: patientId }, error };
    }
};

/**
 * Salva preferências de lembrete do paciente (idempotente por patient_id).
 */
export const upsertPatientReminderPreferences = async (patientId, preferences = {}) => {
    try {
        const payload = {
            patient_id: patientId,
            ...DEFAULT_REMINDER_PREFERENCES,
            ...(preferences && typeof preferences === 'object' ? preferences : {})
        };

        const { data, error } = await supabase
            .from('patient_reminder_preferences')
            .upsert(payload, { onConflict: 'patient_id' })
            .select("id,patient_id,daily_log_enabled,measurement_enabled,daily_log_time,measurement_time,channel_in_app,timezone,quiet_hours_start,quiet_hours_end,created_at,updated_at")
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_salvar_preferencias_de_lembrete", error);
        return { data: null, error };
    }
};

/**
 * Processa lembretes in-app para o paciente atual (idempotente por dia/tipo).
 */
export const processPatientReminders = async (patientId, { signal } = {}) => {
    try {
        if (signal?.aborted) return { data: null, error: null, cancelled: true };

        let request = supabase.rpc('process_patient_reminders', {
            p_patient_id: patientId
        });
        if (signal) request = request.abortSignal(signal);
        const { data, error } = await request;

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        if (isExpectedRequestCancellation(error, signal)) {
            return { data: null, error: null, cancelled: true };
        }
        logSupabaseError("erro_ao_processar_lembretes_do_paciente", error);
        return { data: null, error };
    }
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

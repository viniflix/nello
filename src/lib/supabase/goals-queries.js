import { supabase } from '@/lib/customSupabaseClient';
import { getTodayIsoDate } from '@/lib/utils/date';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

// =============================================
// CONSTANTES
// =============================================

// 1kg de gordura corporal ≈ 7700 kcal
const CALORIES_PER_KG = 7700;

// Limites seguros de déficit/superávit calórico diário
const MAX_SAFE_DEFICIT = 1000; // kcal/dia
const MIN_EFFECTIVE_DEFICIT = 200; // kcal/dia para perda de peso
const MAX_SAFE_SURPLUS = 500; // kcal/dia para ganho de peso

// =============================================
// FUNÇÕES DE CÁLCULO DE VIABILIDADE
// =============================================

/**
 * Calcula a viabilidade de uma meta baseada em dados nutricionais
 */
export const calculateGoalViability = async (goalData, patientId) => {
    const {
        goal_type,
        initial_weight,
        target_weight,
        start_date,
        target_date
    } = goalData;

    // Calcular mudança de peso necessária
    const totalWeightChange = target_weight - initial_weight;
    const isWeightLoss = totalWeightChange < 0;
    const isWeightGain = totalWeightChange > 0;

    // Calcular dias até a meta
    const startDateTime = new Date(start_date).getTime();
    const targetDateTime = new Date(target_date).getTime();
    const daysToGoal = Math.ceil((targetDateTime - startDateTime) / (1000 * 60 * 60 * 24));

    if (daysToGoal <= 0) {
        return {
            is_realistic: false,
            viability_score: 1,
            viability_notes: 'Data alvo deve ser posterior à data de início.',
            warnings: [{ type: 'invalid_dates', message: 'Data alvo inválida' }],
            required_daily_deficit: 0,
            daily_calorie_goal: null
        };
    }

    // Calcular mudança de peso necessária por dia
    const dailyWeightChange = totalWeightChange / daysToGoal;

    // Calcular déficit/superávit calórico necessário por dia
    const requiredDailyDeficit = dailyWeightChange * CALORIES_PER_KG;

    // Buscar gasto energético mais recente
    const { data: energyData } = await supabase
        .from('energy_expenditure_calculations')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    // Buscar plano alimentar ativo
    const { data: mealPlanData } = await supabase
        .from('meal_plans')
        .select('*')
        .eq('patient_id', patientId)
        .eq('is_active', true)
        .maybeSingle();

    // Extrair valores corretos
    const totalEnergyExpenditure = energyData?.get || null; // Campo correto é 'get'
    const planCalories = mealPlanData?.daily_calories || null;

    // Inicializar resultado
    const result = {
        is_realistic: true,
        viability_score: 5,
        viability_notes: '',
        warnings: [],
        required_daily_deficit: Math.round(requiredDailyDeficit),
        daily_calorie_goal: null,
        energy_expenditure_id: energyData?.id || null,
        meal_plan_id: mealPlanData?.id || null
    };

    // Array de notas
    const notes = [];
    const warnings = [];

    // VALIDAÇÃO 1: Meta muito agressiva?
    if (isWeightLoss && Math.abs(requiredDailyDeficit) > MAX_SAFE_DEFICIT) {
        result.is_realistic = false;
        result.viability_score = 1;
        warnings.push({
            type: 'too_aggressive',
            message: `Déficit de ${Math.abs(Math.round(requiredDailyDeficit))} kcal/dia é muito agressivo e pode ser prejudicial à saúde.`
        });
        notes.push('⚠️ Meta extremamente agressiva. Recomendamos estender o prazo ou reduzir o objetivo de peso.');
    }

    // VALIDAÇÃO 2: Meta muito lenta?
    if (isWeightLoss && Math.abs(requiredDailyDeficit) < MIN_EFFECTIVE_DEFICIT) {
        result.viability_score = Math.min(result.viability_score, 3);
        warnings.push({
            type: 'too_slow',
            message: `Déficit de apenas ${Math.abs(Math.round(requiredDailyDeficit))} kcal/dia resultará em perda muito lenta.`
        });
        notes.push('📊 Meta pode ser muito conservadora. Considere reduzir o prazo para resultados mais visíveis.');
    }

    // VALIDAÇÃO 3: Ganho de peso muito rápido?
    if (isWeightGain && requiredDailyDeficit > MAX_SAFE_SURPLUS) {
        result.is_realistic = false;
        result.viability_score = 1;
        warnings.push({
            type: 'gain_too_fast',
            message: `Superávit de ${Math.round(requiredDailyDeficit)} kcal/dia é excessivo.`
        });
        notes.push('⚠️ Ganho de peso muito rápido. Pode resultar em acúmulo excessivo de gordura.');
    }

    // VALIDAÇÃO 4: Comparar com gasto energético e plano alimentar
    if (totalEnergyExpenditure && planCalories) {
        // Calcular déficit atual do plano
        const currentDeficit = totalEnergyExpenditure - planCalories;

        // Calcular meta calórica ideal
        const idealDailyCalories = totalEnergyExpenditure - requiredDailyDeficit;
        result.daily_calorie_goal = Math.round(idealDailyCalories);

        // Diferença entre o que o plano fornece e o que é necessário
        const deficitDifference = Math.abs(currentDeficit - requiredDailyDeficit);

        if (deficitDifference > 300) {
            // Tolerância de 300 kcal
            result.viability_score = Math.min(result.viability_score, 3);

            if (currentDeficit < requiredDailyDeficit) {
                warnings.push({
                    type: 'plan_too_high_calories',
                    message: `Plano atual fornece ${Math.round(planCalories)} kcal/dia. Para atingir a meta, deveria fornecer aproximadamente ${Math.round(idealDailyCalories)} kcal/dia.`
                });
                notes.push('📋 Plano alimentar atual fornece mais calorias que o necessário. Considere ajustar o plano.');
            } else {
                warnings.push({
                    type: 'plan_too_low_calories',
                    message: `Plano atual fornece ${Math.round(planCalories)} kcal/dia. Está abaixo do necessário para a meta (${Math.round(idealDailyCalories)} kcal/dia).`
                });
                notes.push('📋 Plano alimentar atual fornece menos calorias que o necessário. Meta pode ser atingida mais rapidamente.');
            }
        } else {
            notes.push('✅ Plano alimentar atual está adequado para atingir a meta no prazo estabelecido.');
        }

        // Informações adicionais
        notes.push(`\n**Dados nutricionais:**`);
        notes.push(`• Gasto energético total: ${Math.round(totalEnergyExpenditure)} kcal/dia`);
        notes.push(`• Plano alimentar atual: ${Math.round(planCalories)} kcal/dia`);
        notes.push(`• Déficit atual: ${Math.round(currentDeficit)} kcal/dia`);
        notes.push(`• Déficit necessário: ${Math.round(requiredDailyDeficit)} kcal/dia`);
    } else {
        // Sem dados nutricionais completos
        result.viability_score = Math.min(result.viability_score, 3);
        warnings.push({
            type: 'missing_data',
            message: 'Faltam dados de gasto energético ou plano alimentar para validação completa.'
        });

        if (!totalEnergyExpenditure) {
            notes.push('⚠️ Gasto energético não calculado. Recomendamos calcular antes de criar a meta.');
        }
        if (!planCalories) {
            notes.push('⚠️ Nenhum plano alimentar ativo. Crie um plano adequado à meta.');
        }
    }

    // VALIDAÇÃO 5: Prazo muito curto ou muito longo?
    if (daysToGoal < 7) {
        result.viability_score = Math.min(result.viability_score, 2);
        warnings.push({
            type: 'too_short_deadline',
            message: 'Prazo muito curto. Metas saudáveis requerem mais tempo.'
        });
    }

    if (daysToGoal > 365) {
        result.viability_score = Math.min(result.viability_score, 4);
        warnings.push({
            type: 'long_deadline',
            message: 'Prazo muito longo. Considere criar metas intermediárias.'
        });
    }

    // Montar nota final
    result.viability_notes = notes.join('\n');
    result.warnings = warnings;

    return result;
};

// =============================================
// CRUD - CREATE
// =============================================

/**
 * Criar nova meta
 */
export const createGoal = async (goalData, patientId, nutritionistId) => {
    try {
        // Calcular viabilidade
        const viability = await calculateGoalViability(goalData, patientId);

        // Preparar dados para inserção
        const dataToInsert = {
            patient_id: patientId,
            nutritionist_id: nutritionistId,
            goal_type: goalData.goal_type,
            title: goalData.title,
            description: goalData.description || null,
            initial_weight: goalData.initial_weight,
            target_weight: goalData.target_weight,
            current_weight: goalData.initial_weight, // Peso atual = peso inicial
            start_date: goalData.start_date,
            target_date: goalData.target_date,
            ...viability,
            status: 'active'
        };

        const { data, error } = await supabase
            .from('patient_goals')
            .insert([dataToInsert])
            .select()
            .single();

        if (error) throw error;

        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao criar meta', error);
        return { data: null, error };
    }
};

// =============================================
// CRUD - READ
// =============================================

/**
 * Buscar todas as metas de um paciente
 */
export const getPatientGoals = async (patientId, options = {}) => {
    try {
        let query = supabase
            .from('patient_goals')
            .select('*')
            .eq('patient_id', patientId);

        // Filtrar por status se especificado
        if (options.status) {
            if (Array.isArray(options.status)) {
                query = query.in('status', options.status);
            } else {
                query = query.eq('status', options.status);
            }
        }

        // Ordenar
        query = query.order('created_at', { ascending: false });

        // Limitar resultados
        if (options.limit) {
            query = query.limit(options.limit);
        }

        const { data, error } = await query;

        if (error) throw error;

        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar metas', error);
        return { data: null, error };
    }
};

/**
 * Buscar meta ativa de um paciente
 */
export const getActiveGoal = async (patientId) => {
    try {
        const { data, error } = await supabase
            .from('patient_goals')
            .select('*')
            .eq('patient_id', patientId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;

        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar meta ativa', error);
        return { data: null, error };
    }
};

/**
 * Buscar meta por ID
 */
export const getGoalById = async (goalId) => {
    try {
        const { data, error } = await supabase
            .from('patient_goals')
            .select('*')
            .eq('id', goalId)
            .single();

        if (error) throw error;

        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar meta', error);
        return { data: null, error };
    }
};

// =============================================
// CRUD - UPDATE
// =============================================

/**
 * Atualizar progresso da meta (peso atual)
 */
export const updateGoalProgress = async (goalId, currentWeight) => {
    try {
        // Buscar meta atual
        const { data: goal } = await getGoalById(goalId);
        if (!goal) throw new Error('Meta não encontrada');

        // Calcular progresso com base no novo peso informado.
        const initialWeight = Number(goal.initial_weight);
        const targetWeight = Number(goal.target_weight);
        const nextWeight = Number(currentWeight);
        const totalDelta = initialWeight - targetWeight;
        const currentDelta = initialWeight - nextWeight;
        const rawProgress = totalDelta === 0 ? 100 : (currentDelta / totalDelta) * 100;
        const progressData = Math.max(0, Number(rawProgress.toFixed(2)));

        // Atualizar peso atual e progresso
        const { data, error } = await supabase
            .from('patient_goals')
            .update({
                current_weight: currentWeight,
                progress_percentage: progressData
            })
            .eq('id', goalId)
            .select()
            .single();

        if (error) throw error;

        // Verificar se meta foi completada
        if (progressData >= 100) {
            await completeGoal(goalId);
        }

        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao atualizar progresso', error);
        return { data: null, error };
    }
};

/**
 * Atualizar meta
 */
export const updateGoal = async (goalId, updates) => {
    try {
        const { data, error } = await supabase
            .from('patient_goals')
            .update(updates)
            .eq('id', goalId)
            .select()
            .single();

        if (error) throw error;

        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao atualizar meta', error);
        return { data: null, error };
    }
};

/**
 * Completar meta
 */
export const completeGoal = async (goalId) => {
    try {
        const { data, error } = await supabase
            .from('patient_goals')
            .update({
                status: 'completed',
                completion_date: getTodayIsoDate()
            })
            .eq('id', goalId)
            .select()
            .single();

        if (error) throw error;

        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao completar meta', error);
        return { data: null, error };
    }
};

/**
 * Cancelar meta
 */
export const cancelGoal = async (goalId, reason = '') => {
    try {
        const { data, error } = await supabase
            .from('patient_goals')
            .update({
                status: 'cancelled',
                description: reason ? `${reason}` : undefined
            })
            .eq('id', goalId)
            .select()
            .single();

        if (error) throw error;

        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao cancelar meta', error);
        return { data: null, error };
    }
};

/**
 * Pausar meta
 */
export const pauseGoal = async (goalId) => {
    try {
        const { data, error } = await supabase
            .from('patient_goals')
            .update({ status: 'paused' })
            .eq('id', goalId)
            .select()
            .single();

        if (error) throw error;

        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao pausar meta', error);
        return { data: null, error };
    }
};

/**
 * Reativar meta pausada
 */
export const resumeGoal = async (goalId) => {
    try {
        const { data, error } = await supabase
            .from('patient_goals')
            .update({ status: 'active' })
            .eq('id', goalId)
            .select()
            .single();

        if (error) throw error;

        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao reativar meta', error);
        return { data: null, error };
    }
};

// =============================================
// CRUD - DELETE
// =============================================

/**
 * Deletar meta
 */
export const deleteGoal = async (goalId) => {
    try {
        const { error } = await supabase
            .from('patient_goals')
            .delete()
            .eq('id', goalId);

        if (error) throw error;

        return { error: null };
    } catch (error) {
        logSupabaseError('Erro ao deletar meta', error);
        return { error };
    }
};

// =============================================
// UTILITÁRIOS
// =============================================

/**
 * Calcular prazo mínimo recomendado para uma meta
 * Baseado em déficit máximo seguro de 1000 kcal/dia
 */
export const calculateMinimumDeadline = (weightChange) => {
    const isWeightLoss = weightChange < 0;
    const absWeightChange = Math.abs(weightChange);

    if (absWeightChange === 0) return 1;

    if (isWeightLoss) {
        // Perda de peso: máximo 1000 kcal/dia de déficit
        // 1kg = 7700 kcal, então: dias = (kg * 7700) / 1000
        const minDays = Math.ceil((absWeightChange * CALORIES_PER_KG) / MAX_SAFE_DEFICIT);
        return minDays;
    } else {
        // Ganho de peso: máximo 500 kcal/dia de superávit
        const minDays = Math.ceil((absWeightChange * CALORIES_PER_KG) / MAX_SAFE_SURPLUS);
        return minDays;
    }
};

/**
 * Calcular prazo ideal (moderado) para uma meta
 * Baseado em déficit moderado de 500 kcal/dia para perda ou 300 kcal/dia para ganho
 */
export const calculateIdealDeadline = (weightChange) => {
    const isWeightLoss = weightChange < 0;
    const absWeightChange = Math.abs(weightChange);

    if (absWeightChange === 0) return 1;

    if (isWeightLoss) {
        // Perda de peso moderada: 500 kcal/dia
        const idealDays = Math.ceil((absWeightChange * CALORIES_PER_KG) / 500);
        return idealDays;
    } else {
        // Ganho de peso moderado: 300 kcal/dia
        const idealDays = Math.ceil((absWeightChange * CALORIES_PER_KG) / 300);
        return idealDays;
    }
};

/**
 * Calcular dias restantes até a meta
 */
export const getDaysRemaining = (targetDate) => {
    const now = new Date();
    const target = new Date(targetDate);
    const diffTime = target.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
};

/**
 * Obter status do progresso (no prazo, atrasado, adiantado)
 */
export const getProgressStatus = (goal) => {
    if (!goal || goal.status !== 'active') return null;

    const daysTotal = Math.ceil(
        (new Date(goal.target_date).getTime() - new Date(goal.start_date).getTime()) / (1000 * 60 * 60 * 24)
    );
    const daysElapsed = Math.ceil(
        (new Date().getTime() - new Date(goal.start_date).getTime()) / (1000 * 60 * 60 * 24)
    );

    const expectedProgress = (daysElapsed / daysTotal) * 100;
    const actualProgress = goal.progress_percentage || 0;

    const difference = actualProgress - expectedProgress;

    if (difference >= 10) {
        return { status: 'ahead', label: 'Adiantado', color: 'text-green-600' };
    } else if (difference <= -10) {
        return { status: 'behind', label: 'Atrasado', color: 'text-red-600' };
    } else {
        return { status: 'on_track', label: 'No prazo', color: 'text-blue-600' };
    }
};

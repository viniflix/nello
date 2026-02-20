import { supabase } from '@/lib/customSupabaseClient';
import { calculateCaloriesFromMacros } from '@/lib/utils/nutrition-calculations';
import { getTodayIsoDate } from '@/lib/utils/date';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

// =====================================================
// MEAL PLANS - Planos Alimentares
// =====================================================

const FOOD_FIELDS = `
    id,
    name,
    source,
    description,
    portion_size,
    calories,
    protein,
    carbs,
    fat,
    fiber,
    sodium,
    saturated_fat,
    trans_fat,
    cholesterol,
    sugar,
    calcium,
    iron,
    magnesium,
    phosphorus,
    potassium,
    zinc,
    vitamin_a,
    vitamin_c,
    vitamin_d,
    vitamin_e,
    vitamin_b12,
    folate
`;

const getFoodsMapByIds = async (foodIds) => {
    const ids = [...new Set((foodIds || []).filter(Boolean).map(String))];
    if (ids.length === 0) return {};

    const { data, error } = await supabase
        .from('foods')
        .select(FOOD_FIELDS)
        .in('id', ids);

    if (error) throw error;

    return (data || []).reduce((acc, food) => {
        acc[String(food.id)] = food;
        return acc;
    }, {});
};

/**
 * Cria um novo plano alimentar
 * IMPORTANTE: Desativa automaticamente outros planos ativos do mesmo paciente
 * @param {object} planData - Dados do plano
 * @returns {Promise<{data: object, error: object}>}
 */
export const createMealPlan = async (planData) => {
    try {
        const {
            patient_id,
            nutritionist_id,
            name,
            description,
            active_days,
            start_date,
            end_date
        } = planData;

        // Desativar outros planos ativos do mesmo paciente
        const { error: deactivateError } = await supabase
            .from('meal_plans')
            .update({ is_active: false })
            .eq('patient_id', patient_id)
            .eq('is_active', true);

        if (deactivateError) {
            console.warn('Erro ao desativar planos anteriores:', deactivateError);
            // Não lançar erro, apenas avisar
        }

        // Criar novo plano ativo
        const { data, error } = await supabase
            .from('meal_plans')
            .insert([{
                patient_id,
                nutritionist_id,
                name,
                description: description || null,
                active_days: active_days || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
                start_date: start_date || getTodayIsoDate(),
                end_date: end_date || null,
                is_active: true
            }])
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao criar plano alimentar', error);
        return { data: null, error };
    }
};

/**
 * Busca todos os planos de um paciente
 * @param {string} patientId - ID do paciente
 * @param {boolean} onlyActive - Se true, retorna apenas planos ativos
 * @returns {Promise<{data: array, error: object}>}
 */
export const getMealPlans = async (patientId, onlyActive = false) => {
    try {
        let query = supabase
            .from('meal_plans')
            .select('*')
            .eq('patient_id', patientId)
            .order('created_at', { ascending: false });

        if (onlyActive) {
            query = query.eq('is_active', true);
        }

        const { data, error } = await query;

        if (error) throw error;
        return { data: data || [], error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar planos alimentares', error);
        return { data: [], error };
    }
};

/**
 * Busca um plano completo com todas as refeições e alimentos
 * @param {number} planId - ID do plano
 * @returns {Promise<{data: object, error: object}>}
 */
export const getMealPlanById = async (planId) => {
    try {
        // Buscar plano
        const { data: plan, error: planError } = await supabase
            .from('meal_plans')
            .select('*')
            .eq('id', planId)
            .single();

        if (planError) throw planError;

        // Buscar refeições do plano
        const { data: meals, error: mealsError } = await supabase
            .from('meal_plan_meals')
            .select('*')
            .eq('meal_plan_id', planId)
            .order('order_index', { ascending: true });

        if (mealsError) throw mealsError;

        // Buscar alimentos de cada refeição
        const mealsWithFoods = await Promise.all(
            (meals || []).map(async (meal) => {
                const { data: foods, error: foodsError } = await supabase
                    .from('meal_plan_foods')
                    .select('*')
                    .eq('meal_plan_meal_id', meal.id)
                    .order('order_index', { ascending: true });

                if (foodsError) {
                    logSupabaseError('Erro ao buscar alimentos da refeição', foodsError);
                    return {
                        ...meal,
                        // Transformar nomes dos campos para compatibilidade com o form
                        calories: meal.total_calories || 0,
                        protein: meal.total_protein || 0,
                        carbs: meal.total_carbs || 0,
                        fat: meal.total_fat || 0,
                        foods: []
                    };
                }

                const foodsMap = await getFoodsMapByIds((foods || []).map((f) => f.food_id));

                // Buscar medidas caseiras para os alimentos (quando unit é um ID numérico)
                const measureIds = (foods || [])
                    .filter(f => f.unit && typeof f.unit === 'number')
                    .map(f => f.unit);

                let measuresMap = {};
                if (measureIds.length > 0) {
                    const { data: measures } = await supabase
                        .from('household_measures')
                        .select('id, name, code, grams_equivalent')
                        .in('id', measureIds);

                    measuresMap = (measures || []).reduce((acc, m) => {
                        acc[m.id] = m;
                        return acc;
                    }, {});
                }

                // Transformar estrutura dos alimentos: foods (plural) -> food (singular)
                const transformedFoods = (foods || []).map(f => ({
                    ...f,
                    food: foodsMap[String(f.food_id)] || null,
                    foods: foodsMap[String(f.food_id)] || null,
                    measure: typeof f.unit === 'number' ? measuresMap[f.unit] : null  // Incluir dados da medida caseira
                }));

                return {
                    ...meal,
                    // Transformar nomes dos campos para compatibilidade com o form
                    calories: meal.total_calories || 0,
                    protein: meal.total_protein || 0,
                    carbs: meal.total_carbs || 0,
                    fat: meal.total_fat || 0,
                    foods: transformedFoods
                };
            })
        );

        return {
            data: {
                ...plan,
                meals: mealsWithFoods
            },
            error: null
        };
    } catch (error) {
        logSupabaseError('Erro ao buscar plano alimentar', error);
        return { data: null, error };
    }
};

/**
 * Busca o plano ativo atual do paciente
 * @param {string} patientId - ID do paciente
 * @returns {Promise<{data: object, error: object}>}
 */
export const getActiveMealPlan = async (patientId) => {
    try {
        const today = getTodayIsoDate();

        const { data, error } = await supabase
            .from('meal_plans')
            .select('*')
            .eq('patient_id', patientId)
            .eq('is_active', true)
            .lte('start_date', today)
            .or(`end_date.is.null,end_date.gte.${today}`)
            .order('start_date', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;

        // Se encontrou um plano, buscar com detalhes completos
        if (data) {
            return getMealPlanById(data.id);
        }

        return { data: null, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar plano ativo', error);
        return { data: null, error };
    }
};

/**
 * Atualiza um plano alimentar
 * @param {number} planId - ID do plano
 * @param {object} updates - Dados a atualizar
 * @returns {Promise<{data: object, error: object}>}
 */
export const updateMealPlan = async (planId, updates) => {
    try {
        const { data, error } = await supabase
            .from('meal_plans')
            .update(updates)
            .eq('id', planId)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao atualizar plano alimentar', error);
        return { data: null, error };
    }
};

/**
 * Arquiva um plano (marca como inativo)
 * @param {number} planId - ID do plano
 * @returns {Promise<{data: object, error: object}>}
 */
export const archiveMealPlan = async (planId) => {
    return updateMealPlan(planId, { is_active: false });
};

/**
 * Define um plano como ativo e desativa todos os outros do mesmo paciente
 * @param {number} planId - ID do plano a ativar
 * @returns {Promise<{data: object, error: object}>}
 */
export const setActiveMealPlan = async (planId) => {
    try {
        // Primeiro, buscar o plano para saber o patient_id
        const { data: plan, error: planError } = await supabase
            .from('meal_plans')
            .select('patient_id')
            .eq('id', planId)
            .single();

        if (planError) throw planError;

        // Desativar todos os planos do paciente
        const { error: deactivateError } = await supabase
            .from('meal_plans')
            .update({ is_active: false })
            .eq('patient_id', plan.patient_id)
            .eq('is_active', true);

        if (deactivateError) throw deactivateError;

        // Ativar o plano específico
        const { data, error } = await supabase
            .from('meal_plans')
            .update({ is_active: true })
            .eq('id', planId)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao ativar plano alimentar', error);
        return { data: null, error };
    }
};

/**
 * Deleta um plano alimentar (e todas as refeições/alimentos associados por CASCADE)
 * @param {number} planId - ID do plano
 * @returns {Promise<{data: object, error: object}>}
 */
export const deleteMealPlan = async (planId) => {
    try {
        const { data, error } = await supabase
            .from('meal_plans')
            .delete()
            .eq('id', planId)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao deletar plano alimentar', error);
        return { data: null, error };
    }
};

// =====================================================
// MEAL PLAN MEALS - Refeições do Plano
// =====================================================

/**
 * Adiciona uma refeição ao plano
 * @param {object} mealData - Dados da refeição
 * @returns {Promise<{data: object, error: object}>}
 */
export const addMealToPlan = async (mealData) => {
    try {
        const {
            meal_plan_id,
            name,
            meal_type,
            meal_time,
            notes,
            order_index
        } = mealData;

        const { data, error } = await supabase
            .from('meal_plan_meals')
            .insert([{
                meal_plan_id,
                name,
                meal_type,
                meal_time: meal_time || null,
                notes: notes || null,
                order_index: order_index || 0
            }])
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao adicionar refeição ao plano', error);
        return { data: null, error };
    }
};

/**
 * Atualiza uma refeição do plano
 * @param {number} mealId - ID da refeição
 * @param {object} updates - Dados a atualizar
 * @returns {Promise<{data: object, error: object}>}
 */
export const updateMealInPlan = async (mealId, updates) => {
    try {
        const { data, error } = await supabase
            .from('meal_plan_meals')
            .update(updates)
            .eq('id', mealId)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao atualizar refeição do plano', error);
        return { data: null, error };
    }
};

/**
 * Remove uma refeição do plano
 * @param {number} mealId - ID da refeição
 * @returns {Promise<{data: object, error: object}>}
 */
export const deleteMealFromPlan = async (mealId) => {
    try {
        const { data, error } = await supabase
            .from('meal_plan_meals')
            .delete()
            .eq('id', mealId)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao deletar refeição do plano', error);
        return { data: null, error };
    }
};

/**
 * Busca todas as refeições de um plano
 * @param {number} planId - ID do plano
 * @returns {Promise<{data: array, error: object}>}
 */
export const getMealsInPlan = async (planId) => {
    try {
        const { data, error } = await supabase
            .from('meal_plan_meals')
            .select('*')
            .eq('meal_plan_id', planId)
            .order('order_index', { ascending: true });

        if (error) throw error;
        return { data: data || [], error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar refeições do plano', error);
        return { data: [], error };
    }
};

// =====================================================
// MEAL PLAN FOODS - Alimentos das Refeições
// =====================================================

/**
 * Adiciona um alimento a uma refeição
 * @param {object} foodData - Dados do alimento
 * @returns {Promise<{data: object, error: object}>}
 */
export const addFoodToMeal = async (foodData) => {
    try {
        const {
            meal_plan_meal_id,
            food_id,
            quantity,
            unit,
            calories,
            protein,
            carbs,
            fat,
            notes,
            order_index
        } = foodData;

        const { data, error } = await supabase
            .from('meal_plan_foods')
            .insert([{
                meal_plan_meal_id,
                food_id,
                quantity,
                unit,
                calories,
                protein,
                carbs,
                fat,
                notes: notes || null,
                order_index: order_index || 0
            }])
            .select('*')
            .single();

        if (error) throw error;

        const foodsMap = await getFoodsMapByIds([data?.food_id]);
        const dataWithFood = {
            ...data,
            food: foodsMap[String(data?.food_id)] || null,
            foods: foodsMap[String(data?.food_id)] || null
        };

        // Após adicionar alimento, recalcular totais da refeição
        await recalculateMealNutrition(meal_plan_meal_id);

        return { data: dataWithFood, error: null };
    } catch (error) {
        logSupabaseError('Erro ao adicionar alimento à refeição', error);
        return { data: null, error };
    }
};

/**
 * Atualiza um alimento em uma refeição
 * @param {number} foodId - ID do registro meal_plan_foods
 * @param {object} updates - Dados a atualizar
 * @returns {Promise<{data: object, error: object}>}
 */
export const updateFoodInMeal = async (foodId, updates) => {
    try {
        const { data, error } = await supabase
            .from('meal_plan_foods')
            .update(updates)
            .eq('id', foodId)
            .select('*')
            .single();

        if (error) throw error;

        const foodsMap = await getFoodsMapByIds([data?.food_id]);
        const dataWithFood = {
            ...data,
            food: foodsMap[String(data?.food_id)] || null,
            foods: foodsMap[String(data?.food_id)] || null
        };

        // Após atualizar, recalcular totais da refeição
        if (dataWithFood) {
            await recalculateMealNutrition(dataWithFood.meal_plan_meal_id);
        }

        return { data: dataWithFood, error: null };
    } catch (error) {
        logSupabaseError('Erro ao atualizar alimento da refeição', error);
        return { data: null, error };
    }
};

/**
 * Remove um alimento de uma refeição
 * @param {number} foodId - ID do registro meal_plan_foods
 * @returns {Promise<{data: object, error: object}>}
 */
export const removeFoodFromMeal = async (foodId) => {
    try {
        // Buscar meal_plan_meal_id antes de deletar
        const { data: foodData } = await supabase
            .from('meal_plan_foods')
            .select('meal_plan_meal_id')
            .eq('id', foodId)
            .single();

        const { data, error } = await supabase
            .from('meal_plan_foods')
            .delete()
            .eq('id', foodId)
            .select()
            .single();

        if (error) throw error;

        // Após remover, recalcular totais da refeição
        if (foodData) {
            await recalculateMealNutrition(foodData.meal_plan_meal_id);
        }

        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao remover alimento da refeição', error);
        return { data: null, error };
    }
};

/**
 * Busca todos os alimentos de uma refeição
 * @param {number} mealId - ID da refeição (meal_plan_meals)
 * @returns {Promise<{data: array, error: object}>}
 */
export const getFoodsInMeal = async (mealId) => {
    try {
        const { data, error } = await supabase
            .from('meal_plan_foods')
            .select('*')
            .eq('meal_plan_meal_id', mealId)
            .order('order_index', { ascending: true });

        if (error) throw error;

        const foodsMap = await getFoodsMapByIds((data || []).map((item) => item.food_id));
        const enriched = (data || []).map((item) => ({
            ...item,
            food: foodsMap[String(item.food_id)] || null,
            foods: foodsMap[String(item.food_id)] || null
        }));

        return { data: enriched, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar alimentos da refeição', error);
        return { data: [], error };
    }
};

// =====================================================
// HELPER FUNCTIONS - Funções Auxiliares
// =====================================================

/**
 * Recalcula os totais nutricionais de uma refeição
 * @param {number} mealId - ID da refeição
 * @returns {Promise<{data: object, error: object}>}
 */
export const recalculateMealNutrition = async (mealId) => {
    try {
        // Buscar todos os alimentos da refeição
        const { data: foods, error: foodsError } = await supabase
            .from('meal_plan_foods')
            .select('calories, protein, carbs, fat')
            .eq('meal_plan_meal_id', mealId);

        if (foodsError) throw foodsError;

        // Calcular totais
        const totals = (foods || []).reduce(
            (acc, food) => ({
                total_calories: acc.total_calories + (parseFloat(food.calories) || 0),
                total_protein: acc.total_protein + (parseFloat(food.protein) || 0),
                total_carbs: acc.total_carbs + (parseFloat(food.carbs) || 0),
                total_fat: acc.total_fat + (parseFloat(food.fat) || 0)
            }),
            { total_calories: 0, total_protein: 0, total_carbs: 0, total_fat: 0 }
        );

        // Atualizar refeição
        const { data: meal, error: updateError } = await supabase
            .from('meal_plan_meals')
            .update(totals)
            .eq('id', mealId)
            .select('meal_plan_id')
            .single();

        if (updateError) throw updateError;

        // Recalcular totais do plano
        if (meal) {
            await recalculatePlanNutrition(meal.meal_plan_id);
        }

        return { data: totals, error: null };
    } catch (error) {
        logSupabaseError('Erro ao recalcular nutrição da refeição', error);
        return { data: null, error };
    }
};

/**
 * Recalcula os totais nutricionais de um plano inteiro
 * @param {number} planId - ID do plano
 * @returns {Promise<{data: object, error: object}>}
 */
export const recalculatePlanNutrition = async (planId) => {
    try {
        // Buscar todas as refeições do plano
        const { data: meals, error: mealsError } = await supabase
            .from('meal_plan_meals')
            .select('total_calories, total_protein, total_carbs, total_fat')
            .eq('meal_plan_id', planId);

        if (mealsError) throw mealsError;

        // Calcular totais do dia
        const totals = (meals || []).reduce(
            (acc, meal) => ({
                daily_calories: acc.daily_calories + (parseFloat(meal.total_calories) || 0),
                daily_protein: acc.daily_protein + (parseFloat(meal.total_protein) || 0),
                daily_carbs: acc.daily_carbs + (parseFloat(meal.total_carbs) || 0),
                daily_fat: acc.daily_fat + (parseFloat(meal.total_fat) || 0)
            }),
            { daily_calories: 0, daily_protein: 0, daily_carbs: 0, daily_fat: 0 }
        );

        // Atualizar plano
        const { data, error: updateError } = await supabase
            .from('meal_plans')
            .update(totals)
            .eq('id', planId)
            .select()
            .single();

        if (updateError) throw updateError;

        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao recalcular nutrição do plano', error);
        return { data: null, error };
    }
};

/**
 * Calcula valores nutricionais com base em quantidade e unidade
 * ATUALIZADO: Usa food_household_measures (nova arquitetura)
 * @param {object} food - Alimento da tabela foods
 * @param {number} quantity - Quantidade
 * @param {string|number} unit - Code da medida (string) OU ID (number). 'gram'/'ml' para gramas direto
 * @returns {Promise<{calories, protein, carbs, fat}>}
 */
export const calculateNutrition = async (food, quantity, unit) => {
    try {
        let gramsEquivalent = null;

        // Se a unidade for 'gram' ou 'ml', usar direto
        if (unit === 'gram' || unit === 'ml') {
            gramsEquivalent = quantity;
        } else {
            // Primeiro, tentar buscar conversão específica do alimento
            let measureId = unit;

            // Se unit é string (código), converter para ID
            if (typeof unit === 'string') {
                const { data: measure } = await supabase
                    .from('household_measures')
                    .select('id')
                    .eq('code', unit)
                    .maybeSingle();

                measureId = measure?.id;
            }

            if (measureId) {
                // Buscar conversão específica do alimento na nova tabela
                const { data: foodMeasure } = await supabase
                    .from('food_household_measures')
                    .select('quantity, grams')
                    .eq('food_id', food.id)
                    .eq('measure_id', measureId)
                    .maybeSingle();

                if (foodMeasure) {
                    // Usar conversão específica
                    gramsEquivalent = foodMeasure.grams * (quantity / foodMeasure.quantity);
                } else {
                    // Fallback: usar conversão padrão da medida
                    const { data: measure } = await supabase
                        .from('household_measures')
                        .select('grams_equivalent')
                        .eq('id', measureId)
                        .maybeSingle();

                    if (measure && measure.grams_equivalent) {
                        gramsEquivalent = measure.grams_equivalent * quantity;
                    } else {
                        // Último fallback: usar portion_size do alimento
                        gramsEquivalent = (food.portion_size || 100) * quantity;
                    }
                }
            } else {
                // Se não encontrou a medida, usar portion_size
                gramsEquivalent = (food.portion_size || 100) * quantity;
            }
        }

        // Se não conseguiu converter, retornar valores zerados
        if (!gramsEquivalent || gramsEquivalent <= 0) {
            return {
                calories: 0,
                protein: 0,
                carbs: 0,
                fat: 0
            };
        }

        // Calcular valores nutricionais (foods usa base 100g)
        const factor = gramsEquivalent / 100;
        
        // Calcular macros primeiro
        const protein = (food.protein || 0) * factor;
        const carbs = (food.carbs || 0) * factor;
        const fat = (food.fat || 0) * factor;
        
        // RECALCULAR calorias baseado nos macros (não usar food.calories diretamente)
        // Fórmula: (Proteína × 4) + (Carboidratos × 4) + (Gorduras × 9)
        const calories = calculateCaloriesFromMacros(protein, carbs, fat);

        return {
            calories: parseFloat(calories.toFixed(2)),
            protein: parseFloat(protein.toFixed(2)),
            carbs: parseFloat(carbs.toFixed(2)),
            fat: parseFloat(fat.toFixed(2))
        };
    } catch (error) {
        logSupabaseError('Erro ao calcular nutrição', error);
        return {
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0
        };
    }
};

/**
 * Copia um plano como modelo para outro paciente
 * @param {number} planId - ID do plano a copiar
 * @param {string} targetPatientId - ID do paciente destino
 * @returns {Promise<{data: object, error: object}>}
 */
export const copyMealPlanToPatient = async (planId, targetPatientId) => {
    try {
        // Buscar plano original com todos os detalhes
        const { data: originalPlan, error: planError } = await getMealPlanById(planId);
        if (planError) throw planError;

        // Criar novo plano para o paciente alvo
        const { data: newPlan, error: createError } = await createMealPlan({
            patient_id: targetPatientId,
            nutritionist_id: originalPlan.nutritionist_id,
            name: originalPlan.name,
            description: originalPlan.description,
            active_days: originalPlan.active_days,
            start_date: getTodayIsoDate()
        });

        if (createError) throw createError;

        // Copiar refeições e alimentos
        for (const meal of originalPlan.meals || []) {
            const { data: newMeal, error: mealError } = await addMealToPlan({
                meal_plan_id: newPlan.id,
                name: meal.name,
                meal_type: meal.meal_type,
                meal_time: meal.meal_time,
                notes: meal.notes,
                order_index: meal.order_index
            });

            if (mealError) throw mealError;

            // Copiar alimentos
            for (const food of meal.foods || []) {
                await addFoodToMeal({
                    meal_plan_meal_id: newMeal.id,
                    food_id: food.food_id,
                    quantity: food.quantity,
                    unit: food.unit,
                    calories: food.calories,
                    protein: food.protein,
                    carbs: food.carbs,
                    fat: food.fat,
                    notes: food.notes,
                    order_index: food.order_index
                });
            }
        }

        // Buscar plano completo criado
        return getMealPlanById(newPlan.id);
    } catch (error) {
        logSupabaseError('Erro ao copiar plano para paciente', error);
        return { data: null, error };
    }
};

/**
 * Duplica um plano alimentar completo
 * @param {number} planId - ID do plano a copiar
 * @param {string} newName - Nome do novo plano
 * @returns {Promise<{data: object, error: object}>}
 */
export const copyMealPlan = async (planId, newName) => {
    try {
        // Buscar plano original com todos os detalhes
        const { data: originalPlan, error: planError } = await getMealPlanById(planId);
        if (planError) throw planError;

        // Criar novo plano
        const { data: newPlan, error: createError } = await createMealPlan({
            patient_id: originalPlan.patient_id,
            nutritionist_id: originalPlan.nutritionist_id,
            name: newName,
            description: originalPlan.description,
            active_days: originalPlan.active_days,
            start_date: getTodayIsoDate()
        });

        if (createError) throw createError;

        // Copiar refeições e alimentos
        for (const meal of originalPlan.meals || []) {
            const { data: newMeal, error: mealError } = await addMealToPlan({
                meal_plan_id: newPlan.id,
                name: meal.name,
                meal_type: meal.meal_type,
                meal_time: meal.meal_time,
                notes: meal.notes,
                order_index: meal.order_index
            });

            if (mealError) throw mealError;

            // Copiar alimentos
            for (const food of meal.foods || []) {
                await addFoodToMeal({
                    meal_plan_meal_id: newMeal.id,
                    food_id: food.food_id,
                    quantity: food.quantity,
                    unit: food.unit,
                    calories: food.calories,
                    protein: food.protein,
                    carbs: food.carbs,
                    fat: food.fat,
                    notes: food.notes,
                    order_index: food.order_index
                });
            }
        }

        // Buscar plano completo criado
        return getMealPlanById(newPlan.id);
    } catch (error) {
        logSupabaseError('Erro ao copiar plano alimentar', error);
        return { data: null, error };
    }
};

/**
 * Atualiza um plano alimentar completo
 * @param {number} planId - ID do plano a atualizar
 * @param {object} planData - Dados atualizados do plano
 * @returns {Promise<{data: object, error: object}>}
 */
export const updateFullMealPlan = async (planId, planData) => {
    try {
        // 1. Atualizar informações básicas do plano
        const { error: updateError } = await supabase
            .from('meal_plans')
            .update({
                name: planData.name,
                description: planData.description,
                active_days: planData.active_days,
                start_date: planData.start_date,
                end_date: planData.end_date || null
            })
            .eq('id', planId);

        if (updateError) throw updateError;

        // 2. Deletar todas as refeições antigas (CASCADE deletará os alimentos)
        const { error: deleteError } = await supabase
            .from('meal_plan_meals')
            .delete()
            .eq('meal_plan_id', planId);

        if (deleteError) throw deleteError;

        // 3. Criar novas refeições e alimentos
        for (const meal of planData.meals || []) {
            const { data: newMeal, error: mealError } = await addMealToPlan({
                meal_plan_id: planId,
                name: meal.name,
                meal_type: meal.meal_type,
                meal_time: meal.meal_time,
                notes: meal.notes,
                order_index: meal.order_index
            });

            if (mealError) throw mealError;

            // Adicionar alimentos à refeição
            for (const food of meal.foods || []) {
                await addFoodToMeal({
                    meal_plan_meal_id: newMeal.id,
                    food_id: food.food_id,
                    quantity: food.quantity,
                    unit: food.unit,
                    calories: food.calories,
                    protein: food.protein,
                    carbs: food.carbs,
                    fat: food.fat,
                    notes: food.notes,
                    order_index: food.order_index || 0
                });
            }
        }

        // 4. Buscar plano completo atualizado
        return getMealPlanById(planId);
    } catch (error) {
        logSupabaseError('Erro ao atualizar plano alimentar', error);
        return { data: null, error };
    }
};

// =====================================================
// REFERENCE VALUES - Valores de Referência
// =====================================================

/**
 * Salva ou atualiza valores de referência para um plano alimentar
 * @param {number} planId - ID do plano
 * @param {object} values - Valores de referência
 * @returns {Promise<{data: object, error: object}>}
 */
export const saveReferenceValues = async (planId, values) => {
    try {
        const {
            weight_kg,
            weight_type,
            total_energy_kcal,
            macro_mode,
            protein_percentage,
            carbs_percentage,
            fat_percentage,
            protein_g_per_kg,
            carbs_g_per_kg,
            fat_g_per_kg
        } = values;

        // Verificar se já existe registro
        const { data: existing } = await supabase
            .from('meal_plan_reference_values')
            .select('id')
            .eq('meal_plan_id', planId)
            .maybeSingle();

        if (existing) {
            // Atualizar existente
            const { data, error } = await supabase
                .from('meal_plan_reference_values')
                .update({
                    weight_kg,
                    weight_type: weight_type || 'current',
                    total_energy_kcal,
                    macro_mode: macro_mode || 'percentage',
                    protein_percentage: macro_mode === 'percentage' ? protein_percentage : null,
                    carbs_percentage: macro_mode === 'percentage' ? carbs_percentage : null,
                    fat_percentage: macro_mode === 'percentage' ? fat_percentage : null,
                    protein_g_per_kg: macro_mode === 'g_per_kg' ? protein_g_per_kg : null,
                    carbs_g_per_kg: macro_mode === 'g_per_kg' ? carbs_g_per_kg : null,
                    fat_g_per_kg: macro_mode === 'g_per_kg' ? fat_g_per_kg : null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id)
                .select()
                .single();

            if (error) throw error;
            return { data, error: null };
        } else {
            // Criar novo
            const { data, error } = await supabase
                .from('meal_plan_reference_values')
                .insert([{
                    meal_plan_id: planId,
                    weight_kg,
                    weight_type: weight_type || 'current',
                    total_energy_kcal,
                    macro_mode: macro_mode || 'percentage',
                    protein_percentage: macro_mode === 'percentage' ? protein_percentage : null,
                    carbs_percentage: macro_mode === 'percentage' ? carbs_percentage : null,
                    fat_percentage: macro_mode === 'percentage' ? fat_percentage : null,
                    protein_g_per_kg: macro_mode === 'g_per_kg' ? protein_g_per_kg : null,
                    carbs_g_per_kg: macro_mode === 'g_per_kg' ? carbs_g_per_kg : null,
                    fat_g_per_kg: macro_mode === 'g_per_kg' ? fat_g_per_kg : null
                }])
                .select()
                .single();

            if (error) throw error;
            return { data, error: null };
        }
    } catch (error) {
        logSupabaseError('Erro ao salvar valores de referência', error);
        return { data: null, error };
    }
};

/**
 * Busca valores de referência de um plano
 * @param {number} planId - ID do plano
 * @returns {Promise<{data: object, error: object}>}
 */
export const getReferenceValues = async (planId) => {
    try {
        const { data, error } = await supabase
            .from('meal_plan_reference_values')
            .select('*')
            .eq('meal_plan_id', planId)
            .maybeSingle();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar valores de referência', error);
        return { data: null, error };
    }
};

/**
 * Calcula valores alvo de macronutrientes
 * Usa a função SQL calculate_macro_targets()
 * @param {number} planId - ID do plano
 * @returns {Promise<{data: object, error: object}>}
 */
export const calculateMacroTargets = async (planId) => {
    try {
        const { data, error } = await supabase
            .rpc('calculate_macro_targets', { p_meal_plan_id: planId });

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao calcular valores alvo', error);
        return { data: null, error };
    }
};

/**
 * Deleta valores de referência de um plano
 * @param {number} planId - ID do plano
 * @returns {Promise<{data: object, error: object}>}
 */
export const deleteReferenceValues = async (planId) => {
    try {
        const { data, error } = await supabase
            .from('meal_plan_reference_values')
            .delete()
            .eq('meal_plan_id', planId)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao deletar valores de referência', error);
        return { data: null, error };
    }
};

// =====================================================
// TEMPLATE FUNCTIONS - Funções de Templates
// =====================================================

/**
 * Salva um plano como template
 * @param {number} planId - ID do plano a salvar como template
 * @param {string} templateName - Nome do template
 * @param {array} tags - Tags do template (array de strings)
 * @returns {Promise<{data: object, error: object}>}
 */
export const savePlanAsTemplate = async (planId, templateName, tags = []) => {
    try {
        // Buscar plano completo com todas as refeições e alimentos
        const { data: originalPlan, error: planError } = await getMealPlanById(planId);
        if (planError) throw planError;

        // Criar novo plano como template (patient_id = null, is_template = true)
        const { data: templatePlan, error: createError } = await supabase
            .from('meal_plans')
            .insert([{
                patient_id: null,
                nutritionist_id: originalPlan.nutritionist_id,
                name: templateName,
                description: originalPlan.description || null,
                active_days: originalPlan.active_days,
                start_date: null, // Templates não têm data de início
                end_date: null,
                is_active: false, // Templates não são "ativos" no sentido de plano de paciente
                is_template: true,
                template_tags: tags.length > 0 ? tags : null
            }])
            .select()
            .single();

        if (createError) throw createError;

        // Copiar refeições e alimentos
        for (const meal of originalPlan.meals || []) {
            const { data: newMeal, error: mealError } = await addMealToPlan({
                meal_plan_id: templatePlan.id,
                name: meal.name,
                meal_type: meal.meal_type,
                meal_time: meal.meal_time,
                notes: meal.notes,
                order_index: meal.order_index
            });

            if (mealError) throw mealError;

            // Copiar alimentos
            for (const food of meal.foods || []) {
                await addFoodToMeal({
                    meal_plan_meal_id: newMeal.id,
                    food_id: food.food_id,
                    quantity: food.quantity,
                    unit: food.unit,
                    calories: food.calories,
                    protein: food.protein,
                    carbs: food.carbs,
                    fat: food.fat,
                    notes: food.notes,
                    order_index: food.order_index
                });
            }
        }

        // Buscar template completo criado
        return getMealPlanById(templatePlan.id);
    } catch (error) {
        logSupabaseError('Erro ao salvar plano como template', error);
        return { data: null, error };
    }
};

/**
 * Busca todos os templates de um nutricionista
 * @param {string} nutritionistId - ID do nutricionista
 * @returns {Promise<{data: array, error: object}>}
 */
export const getTemplates = async (nutritionistId) => {
    try {
        const { data, error } = await supabase
            .from('meal_plans')
            .select('*')
            .eq('nutritionist_id', nutritionistId)
            .eq('is_template', true)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return { data: data || [], error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar templates', error);
        return { data: [], error };
    }
};

/**
 * Aplica um template a um paciente, criando um novo plano
 * @param {number} templateId - ID do template
 * @param {string} patientId - ID do paciente
 * @param {string} startDate - Data de início (opcional, padrão: hoje)
 * @param {number} scaleFactor - Fator de escala para ajustar quantidades (padrão: 1.0)
 * @param {number[]} selectedMealIds - Array de IDs das refeições a importar (opcional, padrão: todas)
 * @returns {Promise<{data: object, error: object}>}
 */
export const applyTemplateToPatient = async (templateId, patientId, startDate = null, scaleFactor = 1.0, selectedMealIds = null) => {
    try {
        // Buscar template completo
        const { data: template, error: templateError } = await getMealPlanById(templateId);
        if (templateError) throw templateError;

        if (!template.is_template) {
            throw new Error('O plano selecionado não é um template');
        }

        // Desativar outros planos ativos do paciente
        const { error: deactivateError } = await supabase
            .from('meal_plans')
            .update({ is_active: false })
            .eq('patient_id', patientId)
            .eq('is_active', true);

        if (deactivateError) {
            console.warn('Erro ao desativar planos anteriores:', deactivateError);
        }

        // Criar novo plano para o paciente (clonando o template)
        const targetStartDate = startDate || getTodayIsoDate();
        
        const { data: newPlan, error: createError } = await supabase
            .from('meal_plans')
            .insert([{
                patient_id: patientId,
                nutritionist_id: template.nutritionist_id,
                name: template.name,
                description: template.description || null,
                active_days: template.active_days,
                start_date: targetStartDate,
                end_date: null,
                is_active: true,
                is_template: false
            }])
            .select()
            .single();

        if (createError) throw createError;

        // Filtrar refeições se selectedMealIds foi fornecido
        const mealsToImport = selectedMealIds && selectedMealIds.length > 0
            ? (template.meals || []).filter(meal => selectedMealIds.includes(meal.id))
            : (template.meals || []);

        if (mealsToImport.length === 0) {
            throw new Error('Nenhuma refeição selecionada para importar');
        }

        // Copiar refeições e alimentos (aplicando scaleFactor se necessário)
        for (const meal of mealsToImport) {
            const { data: newMeal, error: mealError } = await addMealToPlan({
                meal_plan_id: newPlan.id,
                name: meal.name,
                meal_type: meal.meal_type,
                meal_time: meal.meal_time,
                notes: meal.notes,
                order_index: meal.order_index
            });

            if (mealError) throw mealError;

            // Copiar alimentos (aplicando scaleFactor nas quantidades)
            for (const food of meal.foods || []) {
                // Aplicar scaleFactor na quantidade
                const scaledQuantity = Math.round((parseFloat(food.quantity) || 0) * scaleFactor * 100) / 100;
                
                // Recalcular valores nutricionais proporcionalmente
                const scaledCalories = Math.round((parseFloat(food.calories) || 0) * scaleFactor * 100) / 100;
                const scaledProtein = Math.round((parseFloat(food.protein) || 0) * scaleFactor * 100) / 100;
                const scaledCarbs = Math.round((parseFloat(food.carbs) || 0) * scaleFactor * 100) / 100;
                const scaledFat = Math.round((parseFloat(food.fat) || 0) * scaleFactor * 100) / 100;

                await addFoodToMeal({
                    meal_plan_meal_id: newMeal.id,
                    food_id: food.food_id,
                    quantity: scaledQuantity,
                    unit: food.unit,
                    calories: scaledCalories,
                    protein: scaledProtein,
                    carbs: scaledCarbs,
                    fat: scaledFat,
                    notes: food.notes,
                    order_index: food.order_index
                });
            }
        }

        // Buscar plano completo criado
        return getMealPlanById(newPlan.id);
    } catch (error) {
        logSupabaseError('Erro ao aplicar template ao paciente', error);
        return { data: null, error };
    }
};


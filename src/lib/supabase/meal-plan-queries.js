import { supabase } from '@/lib/customSupabaseClient';
import { calculateCaloriesFromMacros } from '@/lib/utils/nutrition-calculations';
import { getTodayIsoDate } from '@/lib/utils/date';
import { logSupabaseError } from '@/lib/supabase/query-helpers';
import { normalizeMealTime } from '@/lib/utils/mealTime';


// =====================================================
// MEAL PLANS - Planos Alimentares
// =====================================================

const FOOD_FIELDS = `
    id,
    name,
    group,
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

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value) => Math.round(toNumber(value) * 100) / 100;

const calculateTotalsFromMeals = (meals = []) => {
    return (meals || []).reduce((acc, meal) => ({
        calories: acc.calories + toNumber(meal?.calories),
        protein: acc.protein + toNumber(meal?.protein),
        carbs: acc.carbs + toNumber(meal?.carbs),
        fat: acc.fat + toNumber(meal?.fat)
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
};

const getEntityId = (entity) => entity?.tempId ?? entity?.id ?? null;

/**
 * Simula ajuste de porções no plano (escala linear por fator).
 * Suporta escopo total, por refeição ou por alimento.
 * Retorna refeições ajustadas + resumo before/after para preview clínico.
 */
export const simulateMealPlanPortionAdjustment = (meals = [], scaleFactor = 1, options = {}) => {
    const safeFactor = Number.isFinite(Number(scaleFactor)) && Number(scaleFactor) > 0
        ? Number(scaleFactor)
        : 1;
    const scope = options?.scope || 'all';
    const targetMealId = options?.mealId ?? null;
    const targetFoodId = options?.foodId ?? null;

    const beforeTotals = calculateTotalsFromMeals(meals);

    const adjustedMeals = (meals || []).map((meal) => {
        const mealId = getEntityId(meal);
        const matchMeal = scope === 'all' || (scope !== 'all' && String(mealId) === String(targetMealId));

        const adjustedFoods = (meal?.foods || []).map((food) => {
            const foodId = getEntityId(food);
            const shouldScaleFood = scope === 'all'
                || (scope === 'meal' && matchMeal)
                || (scope === 'food' && matchMeal && String(foodId) === String(targetFoodId));

            if (!shouldScaleFood) return food;

            return {
                ...food,
                quantity: round2(toNumber(food?.quantity) * safeFactor),
                calories: round2(toNumber(food?.calories) * safeFactor),
                protein: round2(toNumber(food?.protein) * safeFactor),
                carbs: round2(toNumber(food?.carbs) * safeFactor),
                fat: round2(toNumber(food?.fat) * safeFactor)
            };
        });

        const hasFoods = adjustedFoods.length > 0;
        const scaledMealOnly = scope === 'all' || (scope === 'meal' && matchMeal);

        const mealFromFoods = hasFoods
            ? adjustedFoods.reduce((acc, food) => ({
                calories: acc.calories + toNumber(food?.calories),
                protein: acc.protein + toNumber(food?.protein),
                carbs: acc.carbs + toNumber(food?.carbs),
                fat: acc.fat + toNumber(food?.fat)
            }), { calories: 0, protein: 0, carbs: 0, fat: 0 })
            : {
                calories: scaledMealOnly ? toNumber(meal?.calories) * safeFactor : toNumber(meal?.calories),
                protein: scaledMealOnly ? toNumber(meal?.protein) * safeFactor : toNumber(meal?.protein),
                carbs: scaledMealOnly ? toNumber(meal?.carbs) * safeFactor : toNumber(meal?.carbs),
                fat: scaledMealOnly ? toNumber(meal?.fat) * safeFactor : toNumber(meal?.fat)
            };

        return {
            ...meal,
            calories: round2(mealFromFoods.calories),
            protein: round2(mealFromFoods.protein),
            carbs: round2(mealFromFoods.carbs),
            fat: round2(mealFromFoods.fat),
            foods: adjustedFoods
        };
    });

    const afterTotals = calculateTotalsFromMeals(adjustedMeals);

    return {
        scaleFactor: safeFactor,
        scope,
        meals: adjustedMeals,
        totalsBefore: beforeTotals,
        totalsAfter: afterTotals,
        delta: {
            calories: round2(afterTotals.calories - beforeTotals.calories),
            protein: round2(afterTotals.protein - beforeTotals.protein),
            carbs: round2(afterTotals.carbs - beforeTotals.carbs),
            fat: round2(afterTotals.fat - beforeTotals.fat)
        }
    };
};

/**
 * Cria um novo plano alimentar
 * Cria um plano inativo; a ativação ocorre após salvar e confirmar o conteúdo.
 * @param {object} planData - Dados do plano
 * @returns {Promise<{data: object, error: object}>}
 */
export const createMealPlan = async (planData) => {
    try {
        const { data: planId, error: createError } = await supabase.rpc('create_meal_plan_atomic', {
            p_plan_data: {
                patient_id: planData.patient_id,
                nutritionist_id: planData.nutritionist_id,
                name: planData.name,
                description: planData.description || null,
                active_days: planData.active_days || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
                start_date: planData.start_date || getTodayIsoDate(),
                end_date: planData.end_date || null,
                is_active: false,
                plan_mode: planData.plan_mode || 'hybrid',
            },
        });
        if (createError) throw createError;
        const { data, error } = await supabase.from('meal_plans').select('*').eq('id', planId).single();
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
            .eq('is_draft', false)    // Never show draft plans in the list
            .eq('is_template', false) // Never show templates in the plan list
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

        if (!meals || meals.length === 0) {
            return {
                data: { ...plan, meals: [] },
                error: null
            };
        }

        const mealIds = meals.map(m => m.id);

        // 1. Batch Fetch: Todos os alimentos de todas as refeições do plano
        const { data: allFoods, error: allFoodsError } = await supabase
            .from('meal_plan_foods')
            .select('*')
            .in('meal_plan_meal_id', mealIds)
            .order('order_index', { ascending: true });

        if (allFoodsError) throw allFoodsError;

        // Agrupar alimentos por meal_plan_meal_id
        const foodsByMealId = (allFoods || []).reduce((acc, food) => {
            if (!acc[food.meal_plan_meal_id]) acc[food.meal_plan_meal_id] = [];
            acc[food.meal_plan_meal_id].push(food);
            return acc;
        }, {});

        // 2. Batch Fetch: Resolver todas as unidades/medidas de uma vez
        const allUnits = [...new Set((allFoods || []).map(f => f.unit).filter(Boolean))];
        let measuresMap = {};

        const numericIds = allUnits.filter(u => /^\d+$/.test(String(u))).map(u => Number(u));
        if (numericIds.length > 0) {
            const { data: measures, error: measuresError } = await supabase
                .from('household_measures')
                .select('id, name, code, grams_equivalent')
                .in('id', numericIds);
            if (measuresError) throw measuresError;
            (measures || []).forEach(m => { measuresMap[m.id] = { ...m, source: 'system' }; });
        }

        const systemCodes = allUnits.filter(u => u && !/^\d+$/.test(String(u)) && !String(u).startsWith('custom_') && u !== 'gram');
        if (systemCodes.length > 0) {
            const { data: measures, error: measuresError } = await supabase
                .from('household_measures')
                .select('id, name, code, grams_equivalent')
                .in('code', systemCodes);
            if (measuresError) throw measuresError;
            (measures || []).forEach(m => { measuresMap[m.code] = { ...m, source: 'system' }; });
        }

        const customCodes = allUnits.filter(u => u && String(u).startsWith('custom_'));
        if (customCodes.length > 0) {
            const { data: customMeasures, error: customMeasuresError } = await supabase
                .from('nutritionist_custom_measures')
                .select('id, name, code, grams_equivalent, category, description')
                .in('code', customCodes);
            if (customMeasuresError) throw customMeasuresError;
            (customMeasures || []).forEach(m => { measuresMap[m.code] = { ...m, source: 'custom' }; });
        }

        const isUuid = (str) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(String(str));
        const foodMeasureIds = allUnits.filter(u => u && isUuid(u));
        if (foodMeasureIds.length > 0) {
            const { data: foodMeasures, error: foodMeasuresError } = await supabase
                .from('food_measures')
                .select('id, label, weight_in_grams')
                .in('id', foodMeasureIds);
            if (foodMeasuresError) throw foodMeasuresError;
            (foodMeasures || []).forEach(m => {
                measuresMap[m.id] = {
                    id: m.id,
                    name: m.label,
                    code: m.id,
                    grams_equivalent: m.weight_in_grams,
                    source: 'specific'
                };
            });
        }

        const resolveMeasure = (unit) => {
            if (!unit) return null;
            if (/^\d+$/.test(String(unit))) return measuresMap[Number(unit)] || null;
            return measuresMap[unit] || null;
        };

        // 3. Batch Fetch: Buscar todas as substituições para todos os alimentos
        const allMealPlanFoodIds = (allFoods || []).map(f => f.id);
        let substitutionsMap = {};
        let subFoodIds = [];

        if (allMealPlanFoodIds.length > 0) {
            const { data: subs, error: subsError } = await supabase
                .from('meal_plan_food_substitutions')
                .select('meal_plan_food_id, substitute_food_id, quantity, unit')
                .in('meal_plan_food_id', allMealPlanFoodIds);
            if (subsError) throw subsError;
            
            if (subs && subs.length > 0) {
                subFoodIds = subs.map(s => s.substitute_food_id);
                substitutionsMap = subs.reduce((acc, s) => {
                    if (!acc[s.meal_plan_food_id]) acc[s.meal_plan_food_id] = [];
                    acc[s.meal_plan_food_id].push(s);
                    return acc;
                }, {});
            }
        }

        // 4. Batch Fetch: Buscar os dados originais da tabela `foods`
        const primaryFoodIds = (allFoods || []).map(f => f.food_id);
        const allFoodIdsToFetch = [...new Set([...primaryFoodIds, ...subFoodIds])];
        const globalFoodsMap = await getFoodsMapByIds(allFoodIdsToFetch);

        // 5. Construir a estrutura final
        const mealsWithFoods = meals.map(meal => {
            const mealFoods = foodsByMealId[meal.id] || [];

            const transformedFoods = mealFoods.map(f => {
                const subsForThisFood = substitutionsMap[f.id] || [];
                const populatedSubs = subsForThisFood.map(s => {
                    const subFood = globalFoodsMap[String(s.substitute_food_id)];
                    if (subFood) {
                        return {
                            ...subFood,
                            quantity: s.quantity,
                            unit: s.unit,
                            measure: resolveMeasure(s.unit)
                        };
                    }
                    return null;
                }).filter(Boolean);

                return {
                    ...f,
                    food: globalFoodsMap[String(f.food_id)] || null,
                    foods: globalFoodsMap[String(f.food_id)] || null, // legacy compat
                    measure: resolveMeasure(f.unit),
                    substitutes: populatedSubs
                };
            });

            return {
                ...meal,
                calories: meal.total_calories || 0,
                protein: meal.total_protein || 0,
                carbs: meal.total_carbs || 0,
                fat: meal.total_fat || 0,
                foods: transformedFoods
            };
        });

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
export const archiveMealPlan = async (planId, reason = 'Plano arquivado pelo nutricionista na interface') => {
    try {
        const { data, error } = await supabase.rpc('archive_meal_plan', { p_plan_id: planId, p_reason: reason });
        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao arquivar plano alimentar', error);
        return { data: null, error };
    }
};

/**
 * Define um plano como ativo de forma ATÔMICA via RPC SQL.
 * Desativa todos os outros planos do paciente e ativa o plano alvo
 * dentro de uma única transação no banco — sem risco de race condition.
 * @param {number} planId - ID do plano a ativar
 * @returns {Promise<{data: object, error: object}>}
 */
export const setActiveMealPlan = async (planId) => {
    try {
        // RPC atômica: desativa todos + ativa o plano dentro de 1 transação
        const { error: rpcError } = await supabase
            .rpc('set_active_meal_plan', { p_plan_id: planId });

        if (rpcError) throw rpcError;

        // Busca o plano atualizado para retornar ao caller
        const { data, error: fetchError } = await supabase
            .from('meal_plans')
            .select('*')
            .eq('id', planId)
            .single();

        if (fetchError) throw fetchError;
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
        const { data, error } = await supabase.rpc('archive_meal_plan', {
            p_plan_id: planId,
            p_reason: 'Plano arquivado pelo nutricionista na interface'
        });

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

        const normalizedMealTime = normalizeMealTime(meal_time);

        const { data, error } = await supabase
            .from('meal_plan_meals')
            .insert([{
                meal_plan_id,
                name,
                meal_type,
                meal_time: normalizedMealTime,
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
        const normalizedUpdates = Object.prototype.hasOwnProperty.call(updates, 'meal_time')
            ? { ...updates, meal_time: normalizeMealTime(updates.meal_time) }
            : updates;
        const { data, error } = await supabase
            .from('meal_plan_meals')
            .update(normalizedUpdates)
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
 * Adiciona vários alimentos a uma refeição em uma única transação (batch).
 * @param {number} mealId - ID da refeição (meal_plan_meals)
 * @param {array} foods - Lista de alimentos
 * @returns {Promise<{data: array, error: object}>}
 */
export const addFoodsToMeal = async (mealId, foods = []) => {
    try {
        if (!foods || foods.length === 0) return { data: [], error: null };

        const inserts = foods.map((food, index) => ({
            meal_plan_meal_id: mealId,
            food_id: food.food_id,
            quantity: food.quantity,
            unit: food.unit,
            calories: food.calories || 0,
            protein: food.protein || 0,
            carbs: food.carbs || 0,
            fat: food.fat || 0,
            notes: food.notes || null,
            patient_description: food.patient_description || null,
            order_index: food.order_index ?? index
        }));

        const { data: dbFoods, error } = await supabase
            .from('meal_plan_foods')
            .insert(inserts)
            .select();

        if (error) throw error;

        // Salvar substituições se existirem
        const allSubstitutes = [];
        dbFoods.forEach((dbFood, idx) => {
            const uiFood = foods[idx];
            if (uiFood.substitutes && Array.isArray(uiFood.substitutes)) {
                uiFood.substitutes.forEach(sub => {
                    allSubstitutes.push({
                        meal_plan_food_id: dbFood.id,
                        substitute_food_id: sub.id || sub.food_id,
                        quantity: sub.quantity || null,
                        unit: sub.unit || null
                    });
                });
            }
        });

        if (allSubstitutes.length > 0) {
            const { error: substitutesError } = await supabase
                .from('meal_plan_food_substitutions').insert(allSubstitutes);
            if (substitutesError) throw substitutesError;
        }

        return { data: dbFoods, error: null };
    } catch (error) {
        logSupabaseError('Erro ao adicionar alimentos em lote', error);
        return { data: null, error };
    }
};

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
            patient_description,
            substitutes,
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
                patient_description: patient_description || null,
                order_index: order_index || 0
            }])
            .select()
            .single();

        if (error) throw error;

        // Salvar substituições se fornecidas
        if (substitutes && substitutes.length > 0) {
            const { error: substitutesError } = await saveFoodSubstitutions(data.id, substitutes);
            if (substitutesError) throw substitutesError;
        }

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
        const { substitutes, ...otherUpdates } = updates;

        const { data, error } = await supabase
            .from('meal_plan_foods')
            .update(otherUpdates)
            .eq('id', foodId)
            .select('*')
            .single();

        if (error) throw error;

        // Atualizar substituições se fornecidas
        if (substitutes !== undefined) {
            const { error: substitutesError } = await saveFoodSubstitutions(foodId, substitutes);
            if (substitutesError) throw substitutesError;
        }

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
            const planResult = await recalculatePlanNutrition(meal.meal_plan_id);
            if (planResult.error) throw planResult.error;
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
        const { data: copiedId, error } = await supabase.rpc('copy_meal_plan_to_patient_atomic', {
            p_source_plan_id: planId,
            p_target_patient_id: targetPatientId,
            p_name: null,
        });
        if (error) throw error;
        return getMealPlanById(copiedId);
    } catch (error) {
        logSupabaseError('Erro ao copiar plano para paciente', error);
        return { data: null, error };
    }
};

/** Duplica um plano para o mesmo paciente como rascunho para revisão. */
export const copyMealPlan = async (planId, newName) => {
    try {
        const { data: originalPlan, error: sourceError } = await getMealPlanById(planId);
        if (sourceError) throw sourceError;
        const { data: copiedId, error } = await supabase.rpc('copy_meal_plan_to_patient_atomic', {
            p_source_plan_id: planId,
            p_target_patient_id: originalPlan.patient_id,
            p_name: newName,
        });
        if (error) throw error;
        return getMealPlanById(copiedId);
    } catch (error) {
        logSupabaseError('Erro ao copiar plano alimentar', error);
        return { data: null, error };
    }
};

const normalizeMealPlanVersionSnapshot = (plan) => {
    if (!plan) return null;

    const normalizedMeals = (plan.meals || []).map((meal) => ({
        id: meal.id,
        name: meal.name,
        meal_type: meal.meal_type,
        meal_time: meal.meal_time || null,
        notes: meal.notes || null,
        order_index: meal.order_index ?? 0,
        total_calories: meal.total_calories ?? meal.calories ?? 0,
        total_protein: meal.total_protein ?? meal.protein ?? 0,
        total_carbs: meal.total_carbs ?? meal.carbs ?? 0,
        total_fat: meal.total_fat ?? meal.fat ?? 0,
        foods: (meal.foods || []).map((food) => ({
            id: food.id,
            food_id: food.food_id,
            quantity: food.quantity ?? 0,
            unit: food.unit || null,
            calories: food.calories ?? 0,
            protein: food.protein ?? 0,
            carbs: food.carbs ?? 0,
            fat: food.fat ?? 0,
            notes: food.notes || null,
            patient_description: food.patient_description || null,
            order_index: food.order_index ?? 0
        }))
    }));

    return {
        plan: {
            id: plan.id,
            patient_id: plan.patient_id,
            nutritionist_id: plan.nutritionist_id,
            name: plan.name,
            description: plan.description || null,
            active_days: plan.active_days || [],
            start_date: plan.start_date,
            end_date: plan.end_date || null,
            is_active: Boolean(plan.is_active),
            daily_calories: plan.daily_calories ?? 0,
            daily_protein: plan.daily_protein ?? 0,
            daily_carbs: plan.daily_carbs ?? 0,
            daily_fat: plan.daily_fat ?? 0
        },
        meals: normalizedMeals
    };
};

export const createMealPlanVersionSnapshot = async ({
    mealPlan,
    versionNumber,
    changeReason = null,
    createdBy = null,
    isRollback = false,
    metadata = {}
}) => {
    try {
        if (!mealPlan?.id) {
            return { data: null, error: new Error('Plano inválido para gerar versão') };
        }

        const snapshot = normalizeMealPlanVersionSnapshot(mealPlan);
        if (!snapshot) {
            return { data: null, error: new Error('Snapshot inválido para versão do plano') };
        }

        const { data, error } = await supabase
            .from('meal_plan_versions')
            .insert([{
                meal_plan_id: mealPlan.id,
                nutritionist_id: mealPlan.nutritionist_id,
                patient_id: mealPlan.patient_id,
                version_number: versionNumber,
                change_reason: changeReason,
                snapshot,
                is_rollback: Boolean(isRollback),
                metadata: metadata && typeof metadata === 'object' ? metadata : {},
                created_by: createdBy || null
            }])
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao criar versão do plano alimentar', error);
        return { data: null, error };
    }
};

export const getMealPlanVersions = async (planId, limit = 20) => {
    try {
        const { data, error } = await supabase
            .from('meal_plan_versions')
            .select('*')
            .eq('meal_plan_id', planId)
            .order('version_number', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return { data: data || [], error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar versões do plano alimentar', error);
        return { data: [], error };
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
        // Perform atomic upsert via RPC
        const { error: rpcError } = await supabase.rpc('upsert_full_meal_plan', {
            p_plan_id: planId,
            p_plan_data: {
                name: planData.name,
                description: planData.description,
                start_date: planData.start_date,
                end_date: planData.end_date || null,
                is_active: planData.is_active ?? false,
                is_draft: planData.is_draft ?? false,
                daily_calories: planData.daily_calories || 0,
                daily_protein: planData.daily_protein || 0,
                daily_carbs: planData.daily_carbs || 0,
                daily_fat: planData.daily_fat || 0,
                active_days: planData.active_days || [],
                plan_mode: planData.plan_mode || 'hybrid',
                change_reason: planData.change_reason || 'Edição confirmada pelo nutricionista'
            },
            p_meals: (planData.meals || []).map((meal, idx) => ({
                name: meal.name,
                meal_type: meal.meal_type || 'other',
                meal_time: normalizeMealTime(meal.meal_time),
                notes: meal.notes || null,
                order_index: meal.order_index ?? idx,
                total_calories: meal.calories || meal.total_calories || 0,
                total_protein: meal.protein || meal.total_protein || 0,
                total_carbs: meal.carbs || meal.total_carbs || 0,
                total_fat: meal.fat || meal.total_fat || 0,
                foods: (meal.foods || []).map((food, fIdx) => ({
                    food_id: food.food_id,
                    quantity: food.quantity || 0,
                    unit: food.unit || null,
                    calories: food.calories || 0,
                    protein: food.protein || 0,
                    carbs: food.carbs || 0,
                    fat: food.fat || 0,
                    notes: food.notes || null,
                    patient_description: food.patient_description || null,
                    order_index: food.order_index ?? fIdx,
                    substitutes: (food.substitutes || []).map(sub => ({
                        id: sub.id || sub.food_id,
                        notes: sub.notes || null
                    }))
                }))
            }))
        });

        if (rpcError) throw rpcError;

        // Fetch updated data for UI
        const updatedResult = await getMealPlanById(planId);
        if (updatedResult.error) throw updatedResult.error;

        /* logOperationalEvent removed */

        return updatedResult;
    } catch (error) {
        logSupabaseError('Erro ao atualizar plano alimentar (RPC)', error);
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
 * Salva um plano alimentar de paciente como template de dieta.
 * Grava em `diet_templates` (fonte única), garantindo que o template
 * apareça na listagem de Dietas Padrão e seja editável pelo TemplateBuilder.
 * @param {number} planId - ID do plano de paciente a copiar
 * @param {string} templateName - Nome do template
 * @param {string[]} tags - Tags do template
 * @returns {Promise<{data: {id: string, name: string}, error: object|null}>}
 */
export const savePlanAsTemplate = async (planId, templateName, tags = []) => {
    try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        const userId = authData?.user?.id;
        if (!userId) throw new Error('Usuário não autenticado.');
        const { data: originalPlan, error: planError } = await getMealPlanById(planId);
        if (planError) throw planError;
        if (originalPlan.nutritionist_id !== userId) throw new Error('Plano indisponível para este profissional.');
        if (!(originalPlan.meals || []).length) throw new Error('O plano não possui refeições para salvar como modelo.');
        const meals = (originalPlan.meals || []).map((meal, index) => ({
            name: meal.name,
            time: meal.meal_time || null,
            order_index: meal.order_index ?? index,
            foods: (meal.foods || []).map((food, foodIndex) => ({
                food_id: food.food_id,
                quantity: food.quantity,
                unit: food.unit,
                observation: food.notes || food.observation || '',
                order_index: food.order_index ?? foodIndex,
            })),
        }));
        const { data: templateId, error } = await supabase.rpc('create_diet_template', {
            p_user_id: userId,
            p_name: templateName.trim(),
            p_description: originalPlan.description || null,
            p_tags: tags,
            p_meals: meals,
        });
        if (error) throw error;
        return { data: { id: templateId, name: templateName.trim() }, error: null };
    } catch (error) {
        logSupabaseError('Erro ao salvar plano como template de dieta', error);
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
 * Restaura um plano alimentar a partir de uma versão salva.
 * A restauração gera uma nova versão com flag de rollback.
 */
export const restoreMealPlanVersion = async (versionId) => {
    try {
        const { data: version, error: versionError } = await supabase
            .from('meal_plan_versions')
            .select('*')
            .eq('id', versionId)
            .single();

        if (versionError) throw versionError;

        const snapshot = version?.snapshot;
        const planSnapshot = snapshot?.plan;
        const mealsSnapshot = Array.isArray(snapshot?.meals) ? snapshot.meals : [];

        if (!version?.meal_plan_id || !planSnapshot) {
            throw new Error('Versão inválida para restauração');
        }

        const planData = {
            name: planSnapshot.name,
            description: planSnapshot.description || '',
            active_days: planSnapshot.active_days || [],
            start_date: planSnapshot.start_date || getTodayIsoDate(),
            end_date: planSnapshot.end_date || null,
            meals: mealsSnapshot.map((meal, mealIndex) => ({
                name: meal.name,
                meal_type: meal.meal_type,
                meal_time: meal.meal_time || null,
                notes: meal.notes || null,
                order_index: meal.order_index ?? mealIndex,
                foods: (meal.foods || []).map((food, foodIndex) => ({
                    food_id: food.food_id,
                    quantity: food.quantity ?? 0,
                    unit: food.unit || null,
                    calories: food.calories ?? 0,
                    protein: food.protein ?? 0,
                    carbs: food.carbs ?? 0,
                    fat: food.fat ?? 0,
                    notes: food.notes || null,
                    patient_description: food.patient_description || null,
                    order_index: food.order_index ?? foodIndex,
                    substitutes: food.substitutes || []
                }))
            })),
            change_reason: `rollback_versao_${version.version_number}`,
            is_rollback: true
        };

        return updateFullMealPlan(version.meal_plan_id, planData);
    } catch (error) {
        logSupabaseError('Erro ao restaurar versão do plano alimentar', error);
        return { data: null, error };
    }
};

// =====================================================
// DRAFT MEAL PLANS - Rascunhos de Planos Alimentares
// =====================================================

/**
 * Cria um novo plano rascunho para o nutricionista trabalhar.
 * Não desativa outros planos ativos. Não é visível ao paciente.
 * @param {string} patientId
 * @param {string} nutritionistId
 * @returns {Promise<{data: object, error: object}>}
 */
export const createDraftMealPlan = async (patientId, nutritionistId) => {
    try {
        // Garantia de segurança: rascunho deve ser do nutricionista logado
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user?.id && userData.user.id !== nutritionistId) {
            throw new Error('ID de nutricionista inválido para criação de rascunho.');
        }

        const { data, error } = await supabase
            .from('meal_plans')
            .insert([{
                patient_id: patientId,
                nutritionist_id: nutritionistId,
                name: 'Rascunho',
                start_date: getTodayIsoDate(),
                is_active: false,
                is_draft: true,
                is_template: false,
                active_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
            }])
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao criar rascunho do plano alimentar', error);
        return { data: null, error };
    }
};

/**
 * Busca o rascunho pendente (O MAIS RECENTE) de um nutricionista para um paciente.
 * Retorna o plano COMPLETO com refeições e alimentos para garantir recovery correto.
 * @param {string} patientId
 * @param {string} nutritionistId
 * @returns {Promise<{data: object|null, error: object}>}
 */
export const getDraftMealPlan = async (patientId, nutritionistId) => {
    try {
        const { data: drafts, error } = await getDraftMealPlans(patientId, nutritionistId);
        if (error) throw error;
        
        return { data: drafts && drafts.length > 0 ? drafts[0] : null, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar rascunho singular do plano alimentar', error);
        return { data: null, error };
    }
};

/**
 * Busca TODOS os rascunhos pendentes de um nutricionista para um paciente.
 * Retorna uma lista de planos COMPLETOS (com refeições e alimentos).
 * @param {string} patientId
 * @param {string} nutritionistId
 * @returns {Promise<{data: array, error: object}>}
 */
export const getDraftMealPlans = async (patientId, nutritionistId) => {
    try {
        // Passo 1: encontra os IDs de todos os rascunhos (ordenados por update desc)
        const { data: draftMetas, error } = await supabase
            .from('meal_plans')
            .select('id')
            .eq('patient_id', patientId)
            .eq('nutritionist_id', nutritionistId)
            .eq('is_draft', true)
            .order('updated_at', { ascending: false });

        if (error) throw error;
        if (!draftMetas || draftMetas.length === 0) return { data: [], error: null };

        // Passo 2: busca o plano COMPLETO para cada um (para recovery no form ou count de itens)
        const draftsPromises = draftMetas.map(meta => getMealPlanById(meta.id));
        const results = await Promise.all(draftsPromises);
        const failed = results.find(res => res.error);
        if (failed) throw failed.error;

        const drafts = results
            .filter(res => res.data && !res.error)
            .map(res => res.data);

        return { data: drafts, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar rascunhos pendentes', error);
        return { data: [], error };
    }
};

/**
 * Atualiza os dados básicos de um plano rascunho (nome, datas, dias).
 * @param {number} draftId
 * @param {object} planData
 * @returns {Promise<{data: object, error: object}>}
 */
export const updateDraftMealPlan = async (draftId, planData) => {
    try {
        const { data, error } = await supabase
            .from('meal_plans')
            .update({
                name: planData.name || 'Rascunho',
                description: planData.description || null,
                start_date: planData.start_date || getTodayIsoDate(),
                end_date: planData.end_date || null,
                active_days: planData.active_days || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
                plan_mode: planData.plan_mode || 'hybrid',
                updated_at: new Date().toISOString()
            })
            .eq('id', draftId)
            .eq('is_draft', true)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao atualizar rascunho do plano alimentar', error);
        return { data: null, error };
    }
};

/**
 * Deleta um plano rascunho (e suas refeições/alimentos por CASCADE).
 * Chamado ao apertar "Descartar" ou "Cancelar" no formulário.
 * @param {number} draftId
 * @returns {Promise<{data: object, error: object}>}
 */
export const deleteDraftMealPlan = async (draftId) => {
    try {
        if (!draftId) throw new Error('draftId é obrigatório para deletar rascunho');

        const { data: userData } = await supabase.auth.getUser();
        const actorId = userData?.user?.id;
        if (!actorId) throw new Error('Usuário não autenticado');

        // DELETE simples sem .select().maybeSingle() — evita sucesso silencioso
        // quando 0 rows são afetados (ex: RLS block ou actorId mismatch)
        const { error } = await supabase
            .from('meal_plans')
            .delete()
            .eq('id', draftId)
            .eq('is_draft', true)
            .eq('nutritionist_id', actorId);

        if (error) throw error;
        // Retorna data sintético para compatibilidade com chamadores que checam .data
        return { data: { id: draftId }, error: null };
    } catch (error) {
        logSupabaseError('Erro ao deletar rascunho do plano alimentar', error);
        return { data: null, error };
    }
};

/**
 * Deleta TODOS os planos rascunhos pendentes de um paciente (e suas refeições/alimentos por CASCADE).
 * @param {string} patientId
 * @returns {Promise<{data: object, error: object}>}
 */
export const deleteAllDraftMealPlans = async (patientId) => {
    try {
        if (!patientId) throw new Error('patientId é obrigatório para deletar rascunhos');

        const { data: userData } = await supabase.auth.getUser();
        const actorId = userData?.user?.id;
        if (!actorId) throw new Error('Usuário não autenticado');

        const { error } = await supabase
            .from('meal_plans')
            .delete()
            .eq('patient_id', patientId)
            .eq('is_draft', true)
            .eq('nutritionist_id', actorId);

        if (error) throw error;
        return { data: { success: true }, error: null };
    } catch (error) {
        logSupabaseError('Erro ao deletar todos os rascunhos', error);
        return { data: null, error };
    }
};


/**
 * Promove um rascunho para plano ativo de forma ATÔMICA via RPC SQL.
 * Desativa todos os planos ativos e promove o draft dentro de 1 transação.
 * @param {number} draftId
 * @param {string} patientId - Necessário para desativar outros planos ativos
 * @returns {Promise<{data: object, error: object}>}
 */
export const promoteDraftToActive = async (draftId, patientId) => {
    try {
        // RPC atômica: desativa ativos + promove draft dentro de 1 transação
        const { error: rpcError } = await supabase
            .rpc('promote_draft_to_active', {
                p_draft_id: draftId,
                p_patient_id: patientId
            });

        if (rpcError) throw rpcError;

        // Busca o plano promovido para retornar ao caller
        const { data, error: fetchError } = await supabase
            .from('meal_plans')
            .select('*')
            .eq('id', draftId)
            .single();

        if (fetchError) throw fetchError;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao promover rascunho para plano ativo', error);
        return { data: null, error };
    }
};

/**
 * Promove um rascunho para plano salvo (sem ativar).
 * Chamado ao apertar "Salvar como Rascunho" no formulário.
 * @param {number} draftId
 * @returns {Promise<{data: object, error: object}>}
 */
export const saveDraftAsPlan = async (draftId) => {
    try {
        const { data, error } = await supabase
            .from('meal_plans')
            .update({
                is_draft: false,
                is_active: false,
                updated_at: new Date().toISOString()
            })
            .eq('id', draftId)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao salvar rascunho como plano', error);
        return { data: null, error };
    }
};

// =====================================================
// FOOD SUBSTITUTIONS - Substituições de Alimentos
// =====================================================

/**
 * Salva a lista de substitutos para um item do plano
 * @param {number} mealPlanFoodId - ID do item em meal_plan_foods
 * @param {array} substitutes - Lista de objetos de alimento (com id da tabela foods)
 */
export const saveFoodSubstitutions = async (mealPlanFoodId, substitutes = []) => {
    try {
        // 1. Limpar substituições existentes
        const { error: deleteError } = await supabase
            .from('meal_plan_food_substitutions')
            .delete()
            .eq('meal_plan_food_id', mealPlanFoodId);
        if (deleteError) throw deleteError;

        if (!substitutes || substitutes.length === 0) return { data: [], error: null };

        // 2. Inserir novas
        const inserts = substitutes.map(sub => ({
            meal_plan_food_id: mealPlanFoodId,
            substitute_food_id: sub.id || sub.food_id,
            quantity: sub.quantity || null,
            unit: sub.unit || null
        }));

        const { data, error } = await supabase
            .from('meal_plan_food_substitutions')
            .insert(inserts)
            .select();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao salvar substituições', error);
        return { data: null, error };
    }
};

/**
 * Busca os substitutos de um item do plano
 * @param {number} mealPlanFoodId
 */
export const getFoodSubstitutions = async (mealPlanFoodId) => {
    try {
        const { data: subs, error: subsError } = await supabase
            .from('meal_plan_food_substitutions')
            .select('substitute_food_id, quantity, unit')
            .eq('meal_plan_food_id', mealPlanFoodId);

        if (subsError) throw subsError;
        if (!subs || subs.length === 0) return { data: [], error: null };

        // Buscar detalhes dos alimentos
        const foodIds = subs.map(s => s.substitute_food_id);
        const { data: foods, error: foodsError } = await supabase
            .from('foods')
            .select(FOOD_FIELDS)
            .in('id', foodIds);

        if (foodsError) throw foodsError;
        
        // Mapear quantidades e unidades para o resultado
        const result = (foods || []).map(food => {
            const subData = subs.find(s => s.substitute_food_id === food.id);
            return {
                ...food,
                quantity: subData?.quantity || null,
                unit: subData?.unit || null
            };
        });

        return { data: result, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar substituições', error);
        return { data: [], error };
    }
};

/**
 * Busca sugestões de alimentos para substituição baseados em grupo e calorias.
 * @param {string} targetGroup Grupo do alimento original
 * @param {number} targetCalories Calorias do alimento original (normalizada p/ 100g se necessário)
 * @param {number} limit Quantidade máxima de sugestões a retornar
 */
export const getSuggestedSubstitutes = async (targetGroup, targetCalories, limit = 6) => {
    try {
        if (!targetGroup) return { data: [], error: null };

        // Buscamos um conjunto maior do mesmo grupo para ordenar por proximidade calórica no JS
        const { data: groupFoods, error } = await supabase
            .from('foods')
            .select(FOOD_FIELDS)
            .eq('group', targetGroup)
            .eq('is_active', true)
            .limit(100);

        if (error) throw error;
        if (!groupFoods || groupFoods.length === 0) return { data: [], error: null };

        // Ordenação por proximidade absoluta de calorias
        const sorted = [...groupFoods]
            .sort((a, b) => {
                const diffA = Math.abs((a.calories || 0) - (targetCalories || 0));
                const diffB = Math.abs((b.calories || 0) - (targetCalories || 0));
                return diffA - diffB;
            })
            .slice(0, limit);

        return { data: sorted, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar sugestões de substitutos', error);
        return { data: [], error };
    }
};

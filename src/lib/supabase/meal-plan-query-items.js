import { insertIdempotently, updateIdempotently, idempotentRpc } from '@/lib/supabase/idempotent-mutations';
import { supabase } from '@/lib/customSupabaseClient';

import { getTodayIsoDate } from '@/lib/utils/date';
import { logSupabaseError } from '@/lib/supabase/query-helpers';
import { normalizeMealTime } from '@/lib/utils/mealTime';
import {getFoodsMapByIds} from './meal-plan-query-model';
import {saveFoodSubstitutions} from './meal-plan-query-write';
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
        logSupabaseError("erro_ao_adicionar_refeicao_ao_plano", error);
        return { data: null, error };
    }
};

export const saveDraftMeal = async (planId, mealId, mealData, expectedRevision) => {
    try {
        const result = await idempotentRpc('save_draft_meal', {
            p_plan_id: planId, p_meal_id: mealId,
            p_meal: { ...mealData, meal_time: normalizeMealTime(mealData.meal_time) },
            p_expected: expectedRevision,
        });
        if (result.error) throw result.error;
        return result;
    } catch (error) {
        logSupabaseError('save_draft_meal', error);
        return { data: null, error };
    }
};

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
        logSupabaseError("erro_ao_atualizar_refeicao_do_plano", error);
        return { data: null, error };
    }
};

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
        logSupabaseError("erro_ao_deletar_refeicao_do_plano", error);
        return { data: null, error };
    }
};

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
        logSupabaseError("erro_ao_adicionar_alimentos_em_lote", error);
        return { data: null, error };
    }
};

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
        logSupabaseError("erro_ao_adicionar_alimento_a_refeicao", error);
        return { data: null, error };
    }
};

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
        logSupabaseError("erro_ao_atualizar_alimento_da_refeicao", error);
        return { data: null, error };
    }
};

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
        logSupabaseError("erro_ao_remover_alimento_da_refeicao", error);
        return { data: null, error };
    }
};

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
        logSupabaseError("erro_ao_recalcular_nutricao_da_refeicao", error);
        return { data: null, error };
    }
};

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
        logSupabaseError("erro_ao_recalcular_nutricao_do_plano", error);
        return { data: null, error };
    }
};

export const createDraftMealPlan = async (patientId, nutritionistId) => {
    try {
        // Garantia de segurança: rascunho deve ser do nutricionista logado
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user?.id && userData.user.id !== nutritionistId) {
            throw new Error('ID de nutricionista inválido para criação de rascunho.');
        }

        const { data, error } = await insertIdempotently('meal_plans', {
                patient_id: patientId,
                nutritionist_id: nutritionistId,
                name: 'Rascunho',
                start_date: getTodayIsoDate(),
                is_active: false,
                is_draft: true,
                is_template: false,
                active_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
            });
        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_criar_rascunho_do_plano_alimentar", error);
        return { data: null, error };
    }
};

export const updateDraftMealPlan = async (draftId, planData, expectedRevision) => {
    try {
        const { data, error } = await updateIdempotently('meal_plans', draftId, {
                name: planData.name || 'Rascunho',
                description: planData.description || null,
                start_date: planData.start_date || getTodayIsoDate(),
                end_date: planData.end_date || null,
                active_days: planData.active_days || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
                plan_mode: planData.plan_mode || 'hybrid'
            }, expectedRevision);
        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_atualizar_rascunho_do_plano_alimentar", error);
        return { data: null, error };
    }
};

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
        logSupabaseError("erro_ao_deletar_rascunho_do_plano_alimentar", error);
        return { data: null, error };
    }
};

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
        logSupabaseError("erro_ao_deletar_todos_os_rascunhos", error);
        return { data: null, error };
    }
};

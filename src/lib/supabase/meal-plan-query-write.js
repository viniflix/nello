import { clinicalRpc } from '@/lib/supabase/idempotent-mutations';
import { supabase } from '@/lib/customSupabaseClient';

import { getTodayIsoDate } from '@/lib/utils/date';
import { logSupabaseError } from '@/lib/supabase/query-helpers';
import { normalizeMealTime } from '@/lib/utils/mealTime';
import {toNumber,round2,calculateTotalsFromMeals,getEntityId,normalizeMealPlanVersionSnapshot} from './meal-plan-query-model';
import {getMealPlanById} from './meal-plan-query-read';
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

export const createMealPlan = async (planData) => {
    try {
        const { data: planId, error: createError } = await clinicalRpc('meal_plan', {
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
        const { data, error } = await supabase.from('meal_plans').select("id,patient_id,nutritionist_id,name,description,active_days,start_date,end_date,is_active,daily_calories,daily_protein,daily_carbs,daily_fat,created_at,updated_at,is_template,template_tags,is_draft,care_episode_id,plan_mode,prescription_status,source_snapshot,confirmed_by,confirmed_at,archived_at,archived_by,archive_reason").eq('id', planId).single();
        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_criar_plano_alimentar", error);
        return { data: null, error };
    }
};

export const updateMealPlan = async (planId, updates) => {
    try {
        const { data, error } = await supabase
            .from('meal_plans')
            .update(updates)
            .eq('id', planId)
            .select("id,patient_id,nutritionist_id,name,description,active_days,start_date,end_date,is_active,daily_calories,daily_protein,daily_carbs,daily_fat,created_at,updated_at,is_template,template_tags,is_draft,care_episode_id,plan_mode,prescription_status,source_snapshot,confirmed_by,confirmed_at,archived_at,archived_by,archive_reason")
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_atualizar_plano_alimentar", error);
        return { data: null, error };
    }
};

export const archiveMealPlan = async (planId, reason = 'Plano arquivado pelo nutricionista na interface') => {
    try {
        const { data, error } = await supabase.rpc('archive_meal_plan', { p_plan_id: planId, p_reason: reason });
        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_arquivar_plano_alimentar", error);
        return { data: null, error };
    }
};

export const setActiveMealPlan = async (planId) => {
    try {
        // RPC atômica: desativa todos + ativa o plano dentro de 1 transação
        const { error: rpcError } = await supabase
            .rpc('set_active_meal_plan', { p_plan_id: planId });

        if (rpcError) throw rpcError;

        // Busca o plano atualizado para retornar ao caller
        const { data, error: fetchError } = await supabase
            .from('meal_plans')
            .select("id,patient_id,nutritionist_id,name,description,active_days,start_date,end_date,is_active,daily_calories,daily_protein,daily_carbs,daily_fat,created_at,updated_at,is_template,template_tags,is_draft,care_episode_id,plan_mode,prescription_status,source_snapshot,confirmed_by,confirmed_at,archived_at,archived_by,archive_reason")
            .eq('id', planId)
            .single();

        if (fetchError) throw fetchError;
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_ativar_plano_alimentar", error);
        return { data: null, error };
    }
};

export const deleteMealPlan = async (planId) => {
    try {
        const { data, error } = await supabase.rpc('archive_meal_plan', {
            p_plan_id: planId,
            p_reason: 'Plano arquivado pelo nutricionista na interface'
        });

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_deletar_plano_alimentar", error);
        return { data: null, error };
    }
};

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
        logSupabaseError("erro_ao_copiar_plano_para_paciente", error);
        return { data: null, error };
    }
};

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
        logSupabaseError("erro_ao_copiar_plano_alimentar", error);
        return { data: null, error };
    }
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
            .select("id,meal_plan_id,nutritionist_id,patient_id,version_number,change_reason,snapshot,is_rollback,metadata,created_by,created_at,care_episode_id")
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_criar_versao_do_plano_alimentar", error);
        return { data: null, error };
    }
};

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
        logSupabaseError("erro_ao_atualizar_plano_alimentar_rpc", error);
        return { data: null, error };
    }
};

export const restoreMealPlanVersion = async (versionId) => {
    try {
        const { data: version, error: versionError } = await supabase
            .from('meal_plan_versions')
            .select("id,meal_plan_id,nutritionist_id,patient_id,version_number,change_reason,snapshot,is_rollback,metadata,created_by,created_at,care_episode_id")
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
        logSupabaseError("erro_ao_restaurar_versao_do_plano_alimentar", error);
        return { data: null, error };
    }
};

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
            .select("id,patient_id,nutritionist_id,name,description,active_days,start_date,end_date,is_active,daily_calories,daily_protein,daily_carbs,daily_fat,created_at,updated_at,is_template,template_tags,is_draft,care_episode_id,plan_mode,prescription_status,source_snapshot,confirmed_by,confirmed_at,archived_at,archived_by,archive_reason")
            .eq('id', draftId)
            .single();

        if (fetchError) throw fetchError;
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_promover_rascunho_para_plano_ativo", error);
        return { data: null, error };
    }
};

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
            .select("id,patient_id,nutritionist_id,name,description,active_days,start_date,end_date,is_active,daily_calories,daily_protein,daily_carbs,daily_fat,created_at,updated_at,is_template,template_tags,is_draft,care_episode_id,plan_mode,prescription_status,source_snapshot,confirmed_by,confirmed_at,archived_at,archived_by,archive_reason")
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_salvar_rascunho_como_plano", error);
        return { data: null, error };
    }
};

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
            .select("id,meal_plan_food_id,substitute_food_id,notes,created_at,quantity,unit,food_snapshot,equivalence_basis");

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_salvar_substituicoes", error);
        return { data: null, error };
    }
};

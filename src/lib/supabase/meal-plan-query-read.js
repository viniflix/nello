
import { supabase } from '@/lib/customSupabaseClient';
import { calculateNutrition as calculateServingNutrition, foodPer100Grams } from '@/lib/utils/nutrition-calculations';
import { getTodayIsoDate } from '@/lib/utils/date';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

import {fetchAllRows,fetchByIdsInPages,getFoodsMapByIds,FOOD_FIELDS} from './meal-plan-query-model';
export const getMealPlans = async (patientId, onlyActive = false) => {
    try {
        const data = await fetchAllRows((offset, pageSize) => {
            let query = supabase.from('meal_plans').select("id,patient_id,nutritionist_id,name,description,active_days,start_date,end_date,is_active,daily_calories,daily_protein,daily_carbs,daily_fat,created_at,updated_at,is_template,template_tags,is_draft,care_episode_id,plan_mode,prescription_status,source_snapshot,confirmed_by,confirmed_at,archived_at,archived_by,archive_reason")
                .eq('patient_id', patientId)
                .eq('is_draft', false)
                .eq('is_template', false)
                .order('created_at', { ascending: false })
                .order('id', { ascending: false })
                .range(offset, offset + pageSize - 1);
            if (onlyActive) query = query.eq('is_active', true);
            return query;
        });
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_planos_alimentares", error);
        return { data: [], error };
    }
};

export const getMealPlansByIds = async (planIds, existingPlans = null) => {
    try {
        if (!planIds.length) return { data: [], error: null };
        let plans = existingPlans;
        if (!plans) {
            plans = [];
            for (let offset = 0; offset < planIds.length; offset += 400) {
                const { data, error } = await supabase.from('meal_plans').select("id,patient_id,nutritionist_id,name,description,active_days,start_date,end_date,is_active,daily_calories,daily_protein,daily_carbs,daily_fat,created_at,updated_at,is_template,template_tags,is_draft,care_episode_id,plan_mode,prescription_status,source_snapshot,confirmed_by,confirmed_at,archived_at,archived_by,archive_reason").in('id', planIds.slice(offset, offset + 400));
                if (error) throw error;
                plans.push(...(data || []));
            }
        }
        if (plans.length !== planIds.length) throw new Error('Um ou mais planos não foram encontrados.');

        // Buscar refeições do plano
        const meals = await fetchByIdsInPages(planIds, (ids, offset, pageSize) => supabase
            .from('meal_plan_meals').select("id,meal_plan_id,name,meal_type,meal_time,order_index,notes,total_calories,total_protein,total_carbs,total_fat,include_in_totals,created_at,updated_at").in('meal_plan_id', ids)
            .order('order_index', { ascending: true }).order('id', { ascending: true })
            .range(offset, offset + pageSize - 1));

        if (!meals || meals.length === 0) {
            return {
                data: plans.map(plan => ({ ...plan, meals: [] })),
                error: null
            };
        }

        const mealIds = meals.map(m => m.id);

        // 1. Batch Fetch: Todos os alimentos de todas as refeições do plano
        const allFoods = await fetchByIdsInPages(mealIds, (ids, offset, pageSize) => supabase
            .from('meal_plan_foods').select("id,meal_plan_meal_id,food_id,quantity,unit,calories,protein,carbs,fat,notes,order_index,created_at,patient_description,food_snapshot,measure_snapshot,equivalent_group").in('meal_plan_meal_id', ids)
            .order('order_index', { ascending: true }).order('id', { ascending: true })
            .range(offset, offset + pageSize - 1));

        // Agrupar alimentos por meal_plan_meal_id
        const foodsByMealId = (allFoods || []).reduce((acc, food) => {
            if (!acc[food.meal_plan_meal_id]) acc[food.meal_plan_meal_id] = [];
            acc[food.meal_plan_meal_id].push(food);
            return acc;
        }, {});

        // 3. Batch Fetch: Buscar todas as substituições para todos os alimentos
        const allMealPlanFoodIds = (allFoods || []).map(f => f.id);
        let substitutionsMap = {};
        let subFoodIds = [];

        if (allMealPlanFoodIds.length > 0) {
            const subs = await fetchByIdsInPages(allMealPlanFoodIds, (ids, offset, pageSize) => supabase
                .from('meal_plan_food_substitutions')
                .select('id, meal_plan_food_id, substitute_food_id, quantity, unit, food_snapshot, measure_snapshot')
                .in('meal_plan_food_id', ids)
                .order('id', { ascending: true })
                .range(offset, offset + pageSize - 1));

            if (subs && subs.length > 0) {
                subFoodIds = subs.map(s => s.substitute_food_id);
                substitutionsMap = subs.reduce((acc, s) => {
                    if (!acc[s.meal_plan_food_id]) acc[s.meal_plan_food_id] = [];
                    acc[s.meal_plan_food_id].push(s);
                    return acc;
                }, {});
            }
        }

        // 2. Batch Fetch: Resolver todas as unidades/medidas de uma vez
        const allUnits = [...new Set([...(allFoods || []), ...Object.values(substitutionsMap).flat()].map(f => f.unit).filter(Boolean))];
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
                    const subFood = s.food_snapshot || globalFoodsMap[String(s.substitute_food_id)];
                    if (subFood) {
                        return {
                            ...subFood,
                            quantity: s.quantity,
                            unit: s.unit,
                            measure: s.measure_snapshot || resolveMeasure(s.unit)
                        };
                    }
                    return null;
                }).filter(Boolean);

                return {
                    ...f,
                    food: globalFoodsMap[String(f.food_id)] || null,
                    foods: globalFoodsMap[String(f.food_id)] || null, // legacy compat
                    measure: f.measure_snapshot?.weight_in_grams || f.measure_snapshot?.grams_equivalent ? f.measure_snapshot : resolveMeasure(f.unit),
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
            data: plans.map(plan => ({
                ...plan,
                meals: mealsWithFoods.filter(meal => meal.meal_plan_id === plan.id)
            })),
            error: null
        };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_plano_alimentar", error);
        return { data: [], error };
    }
};

export const getMealPlanById = async (planId) => {
    const result = await getMealPlansByIds([planId]);
    return { data: result.data?.[0] || null, error: result.error };
};

export const getActiveMealPlan = async (patientId) => {
    try {
        const today = getTodayIsoDate();

        const { data, error } = await supabase
            .from('meal_plans')
            .select("id,patient_id,nutritionist_id,name,description,active_days,start_date,end_date,is_active,daily_calories,daily_protein,daily_carbs,daily_fat,created_at,updated_at,is_template,template_tags,is_draft,care_episode_id,plan_mode,prescription_status,source_snapshot,confirmed_by,confirmed_at,archived_at,archived_by,archive_reason")
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
            const result = await getMealPlansByIds([data.id], [data]);
            return { data: result.data?.[0] || null, error: result.error };
        }

        return { data: null, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_plano_ativo", error);
        return { data: null, error };
    }
};

export const getMealsInPlan = async (planId) => {
    try {
        const { data, error } = await supabase
            .from('meal_plan_meals')
            .select("id,meal_plan_id,name,meal_type,meal_time,order_index,notes,total_calories,total_protein,total_carbs,total_fat,include_in_totals,created_at,updated_at")
            .eq('meal_plan_id', planId)
            .order('order_index', { ascending: true });

        if (error) throw error;
        return { data: data || [], error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_refeicoes_do_plano", error);
        return { data: [], error };
    }
};

export const getFoodsInMeal = async (mealId) => {
    try {
        const { data, error } = await supabase
            .from('meal_plan_foods')
            .select("id,meal_plan_meal_id,food_id,quantity,unit,calories,protein,carbs,fat,notes,order_index,created_at,patient_description,food_snapshot,measure_snapshot,equivalent_group")
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
        logSupabaseError("erro_ao_buscar_alimentos_da_refeicao", error);
        return { data: [], error };
    }
};

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

        const values = calculateServingNutrition(foodPer100Grams(food),gramsEquivalent);
        return { calories: values.calories, protein: values.protein, carbs: values.carbs, fat: values.fat };

    } catch (error) {
        logSupabaseError("erro_ao_calcular_nutricao", error);
        return {
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0
        };
    }
};

export const getMealPlanVersions = async (planId, limit = 20) => {
    try {
        const { data, error } = await supabase
            .from('meal_plan_versions')
            .select("id,meal_plan_id,nutritionist_id,patient_id,version_number,change_reason,snapshot,is_rollback,metadata,created_by,created_at,care_episode_id")
            .eq('meal_plan_id', planId)
            .order('version_number', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return { data: data || [], error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_versoes_do_plano_alimentar", error);
        return { data: [], error };
    }
};

export const getDraftMealPlan = async (patientId, nutritionistId) => {
    try {
        const { data: drafts, error } = await getDraftMealPlans(patientId, nutritionistId);
        if (error) throw error;

        return { data: drafts && drafts.length > 0 ? drafts[0] : null, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_rascunho_singular_do_plano_alimentar", error);
        return { data: null, error };
    }
};

export const getDraftMealPlans = async (patientId, nutritionistId) => {
    try {
        const draftMetas = await fetchAllRows((offset, pageSize) => supabase
            .from('meal_plans').select("id,patient_id,nutritionist_id,name,description,active_days,start_date,end_date,is_active,daily_calories,daily_protein,daily_carbs,daily_fat,created_at,updated_at,is_template,template_tags,is_draft,care_episode_id,plan_mode,prescription_status,source_snapshot,confirmed_by,confirmed_at,archived_at,archived_by,archive_reason")
            .eq('patient_id', patientId)
            .eq('nutritionist_id', nutritionistId)
            .eq('is_draft', true)
            .order('updated_at', { ascending: false })
            .order('id', { ascending: false })
            .range(offset, offset + pageSize - 1));
        if (!draftMetas || draftMetas.length === 0) return { data: [], error: null };

        const result = await getMealPlansByIds(draftMetas.map(meta => meta.id), draftMetas);
        if (result.error) throw result.error;
        const planMap = new Map(result.data.map(plan => [plan.id, plan]));
        const drafts = draftMetas.map(meta => planMap.get(meta.id)).filter(Boolean);

        return { data: drafts, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_rascunhos_pendentes", error);
        return { data: [], error };
    }
};

export const getFoodSubstitutions = async (mealPlanFoodId) => {
    try {
        const { data: subs, error: subsError } = await supabase
            .from('meal_plan_food_substitutions')
            .select('substitute_food_id, quantity, unit, measure_snapshot')
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
                quantity: subData?.quantity ?? null,
                measure: subData?.measure_snapshot || null,
                unit: subData?.unit || null
            };
        });

        return { data: result, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_substituicoes", error);
        return { data: [], error };
    }
};

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
        logSupabaseError("erro_ao_buscar_sugestoes_de_substitutos", error);
        return { data: [], error };
    }
};

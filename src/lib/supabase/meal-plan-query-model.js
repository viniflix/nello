
import { supabase } from '@/lib/customSupabaseClient';


import { logSupabaseError } from '@/lib/supabase/query-helpers';


export const FOOD_FIELDS = `
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

export const fetchAllRows = async (buildQuery, pageSize = 500) => {
    const rows = [];
    for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await buildQuery(offset, pageSize);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < pageSize) return rows;
    }
};

export const fetchByIdsInPages = async (ids, buildQuery) => {
    const rows = [];
    for (let start = 0; start < ids.length; start += 200) {
        const chunk = ids.slice(start, start + 200);
        rows.push(...await fetchAllRows((offset, pageSize) => buildQuery(chunk, offset, pageSize)));
    }
    return rows;
};

export const getFoodsMapByIds = async (foodIds) => {
    const ids = [...new Set((foodIds || []).filter(Boolean).map(String))];
    if (ids.length === 0) return {};

    const chunks = [];
    for (let offset = 0; offset < ids.length; offset += 400) {
        const { data, error } = await supabase.from('foods').select(FOOD_FIELDS).in('id', ids.slice(offset, offset + 400));
        if (error) throw error;
        chunks.push(...(data || []));
    }

    return chunks.reduce((acc, food) => {
        acc[String(food.id)] = food;
        return acc;
    }, {});
};

export const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const round2 = (value) => Math.round(toNumber(value) * 100) / 100;

export const calculateTotalsFromMeals = (meals = []) => {
    return (meals || []).reduce((acc, meal) => ({
        calories: acc.calories + toNumber(meal?.calories),
        protein: acc.protein + toNumber(meal?.protein),
        carbs: acc.carbs + toNumber(meal?.carbs),
        fat: acc.fat + toNumber(meal?.fat)
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
};

export const getEntityId = (entity) => entity?.tempId ?? entity?.id ?? null;

export const normalizeMealPlanVersionSnapshot = (plan) => {
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

export const calculateMacroTargets = async (planId) => {
    try {
        const { data, error } = await supabase
            .rpc('calculate_macro_targets', { p_meal_plan_id: planId });

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_calcular_valores_alvo", error);
        return { data: null, error };
    }
};

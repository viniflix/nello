
import { supabase } from '@/lib/customSupabaseClient';


import { logSupabaseError } from '@/lib/supabase/query-helpers';

import {getMealPlanById} from './meal-plan-query-read';
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
                .select("id,meal_plan_id,weight_kg,weight_type,total_energy_kcal,energy_source,macro_mode,protein_percentage,carbs_percentage,fat_percentage,protein_g_per_kg,carbs_g_per_kg,fat_g_per_kg,target_protein_g,target_carbs_g,target_fat_g,created_at,updated_at")
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
                .select("id,meal_plan_id,weight_kg,weight_type,total_energy_kcal,energy_source,macro_mode,protein_percentage,carbs_percentage,fat_percentage,protein_g_per_kg,carbs_g_per_kg,fat_g_per_kg,target_protein_g,target_carbs_g,target_fat_g,created_at,updated_at")
                .single();

            if (error) throw error;
            return { data, error: null };
        }
    } catch (error) {
        logSupabaseError("erro_ao_salvar_valores_de_referencia", error);
        return { data: null, error };
    }
};

export const getReferenceValues = async (planId) => {
    try {
        const { data, error } = await supabase
            .from('meal_plan_reference_values')
            .select("id,meal_plan_id,weight_kg,weight_type,total_energy_kcal,energy_source,macro_mode,protein_percentage,carbs_percentage,fat_percentage,protein_g_per_kg,carbs_g_per_kg,fat_g_per_kg,target_protein_g,target_carbs_g,target_fat_g,created_at,updated_at")
            .eq('meal_plan_id', planId)
            .maybeSingle();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_valores_de_referencia", error);
        return { data: null, error };
    }
};

export const deleteReferenceValues = async (planId) => {
    try {
        const { data, error } = await supabase
            .from('meal_plan_reference_values')
            .delete()
            .eq('meal_plan_id', planId)
            .select("id,meal_plan_id,weight_kg,weight_type,total_energy_kcal,energy_source,macro_mode,protein_percentage,carbs_percentage,fat_percentage,protein_g_per_kg,carbs_g_per_kg,fat_g_per_kg,target_protein_g,target_carbs_g,target_fat_g,created_at,updated_at")
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_deletar_valores_de_referencia", error);
        return { data: null, error };
    }
};

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
        logSupabaseError("erro_ao_salvar_plano_como_template_de_dieta", error);
        return { data: null, error };
    }
};

export const getTemplates = async (nutritionistId) => {
    try {
        const { data, error } = await supabase
            .from('meal_plans')
            .select("id,patient_id,nutritionist_id,name,description,active_days,start_date,end_date,is_active,daily_calories,daily_protein,daily_carbs,daily_fat,created_at,updated_at,is_template,template_tags,is_draft,care_episode_id,plan_mode,prescription_status,source_snapshot,confirmed_by,confirmed_at,archived_at,archived_by,archive_reason")
            .eq('nutritionist_id', nutritionistId)
            .eq('is_template', true)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return { data: data || [], error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_templates", error);
        return { data: [], error };
    }
};

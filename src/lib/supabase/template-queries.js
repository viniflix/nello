import { supabase } from '@/lib/customSupabaseClient';

/**
 * Clones a Diet Template into a new Patient Meal Plan.
 * @param {string} templateId - UUID of the template.
 * @param {string} patientId - UUID of the patient.
 * @param {string} nutritionistId - UUID of the nutritionist.
 * @param {string} [planName] - Optional custom name for the new plan.
 * @returns {Promise<number>} - The ID of the newly created Meal Plan.
 */
export async function cloneDietTemplateToPatient(templateId, patientId, nutritionistId, planName = null) {
  const { data, error } = await supabase.rpc('clone_diet_template_to_patient', {
    p_template_id: templateId,
    p_patient_id: patientId,
    p_nutritionist_id: nutritionistId,
    p_name: planName
  });

  if (error) {
    console.error('Error cloning diet template:', error);
    throw error;
  }

  return data;
}

/**
 * Clones an individual Meal Template into an existing Meal Plan.
 * @param {string} mealTemplateId - UUID of the meal template.
 * @param {number} mealPlanId - ID of the meal plan.
 * @param {string} mealType - Type of the meal (e.g., 'breakfast', 'lunch').
 * @param {string} [mealTime] - Optional time of the meal (HH:MM).
 * @returns {Promise<number>} - The ID of the newly created Meal Plan Meal.
 */
export async function cloneMealTemplateToPlan(mealTemplateId, mealPlanId, mealType, mealTime = null) {
  const { data, error } = await supabase.rpc('clone_meal_template_to_plan', {
    p_meal_template_id: mealTemplateId,
    p_meal_plan_id: mealPlanId,
    p_meal_type: mealType,
    p_meal_time: mealTime
  });

  if (error) {
    console.error('Error cloning meal template:', error);
    throw error;
  }

  return data;
}

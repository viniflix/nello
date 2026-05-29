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

/**
 * Helper to fetch food details from the 'foods' view by IDs.
 */
export async function getFoodsMapByIds(foodIds) {
  const uniqueIds = [...new Set(foodIds.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const { data, error } = await supabase
    .from('foods')
    .select('id, name, calories, protein, carbs, fat, fiber, group, is_active')
    .in('id', uniqueIds);

  if (error) {
    console.error('Error fetching food details:', error);
    return {};
  }

  return (data || []).reduce((acc, food) => {
    acc[food.id] = food;
    return acc;
  }, {});
}

/**
 * Loads a full diet template with its meals and foods from diet_templates.
 * Normalizes to the format used by ImportMealFromProtocolDialog.
 * @param {string} templateId - UUID of the diet_template.
 * @returns {Promise<{data: object, error: null}>}
 */
export async function getDietTemplateWithMeals(templateId) {
  // Step 1: Fetch template and meals/foods structure without the join
  const { data: template, error } = await supabase
    .from('diet_templates')
    .select(`
      id, name, description, tags,
      diet_template_meals (
        id, name, time, order_index,
        diet_template_foods (
          id, food_id, quantity, unit, observation, order_index
        )
      )
    `)
    .eq('id', templateId)
    .single();

  if (error) throw error;

  // Step 2: Collect all food_ids
  const allFoodIds = (template.diet_template_meals || []).flatMap(m => 
    (m.diet_template_foods || []).map(f => f.food_id)
  );

  // Step 3: Fetch food details from the 'foods' view
  const foodsMap = await getFoodsMapByIds(allFoodIds);

  // Step 4: Normalizar refeições para o formato esperado pelos componentes
  const meals = (template.diet_template_meals || [])
    .sort((a, b) => a.order_index - b.order_index)
    .map(m => {
      const foods = (m.diet_template_foods || [])
        .sort((a, b) => a.order_index - b.order_index)
        .map(f => {
          const foodDetails = foodsMap[f.food_id] || null;
          const ratio = (f.quantity || 100) / 100;
          return {
            id: f.id,
            food: foodDetails,
            food_id: f.food_id,
            quantity: f.quantity,
            unit: f.unit,
            observation: f.observation,
            calories: foodDetails ? (foodDetails.calories || 0) * ratio : 0,
            protein: foodDetails ? (foodDetails.protein || 0) * ratio : 0,
            carbs: foodDetails ? (foodDetails.carbs || 0) * ratio : 0,
            fat: foodDetails ? (foodDetails.fat || 0) * ratio : 0,
          };
        });

      return {
        id: m.id,
        name: m.name,
        meal_time: m.time,
        order_index: m.order_index,
        foods,
        calories: foods.reduce((sum, f) => sum + (f.calories || 0), 0),
      };
    });

  return { data: { ...template, meals }, error: null };
}


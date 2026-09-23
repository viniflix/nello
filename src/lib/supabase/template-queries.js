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
  try {
    const { data, error } = await supabase.rpc('clone_diet_template_to_patient', {
      p_template_id: templateId,
      p_patient_id: patientId,
      p_nutritionist_id: nutritionistId,
      p_name: planName
    });

    if (error) {
      console.error('Error cloning diet template:', error);
      throw new Error(error.message || 'Erro no banco de dados ao importar o protocolo.');
    }

    if (!data) throw new Error('O banco não confirmou a criação do plano.');

    return data;
  } catch (err) {
    console.error('Exception in cloneDietTemplateToPatient:', err);
    if (['template_food_unavailable', 'template_substitute_unavailable', 'template_measure_unavailable'].includes(err?.message)) {
      throw new Error('O protocolo contém um alimento ou medida indisponível. Corrija-o antes de importar.');
    }
    throw new Error('Não foi possível importar o protocolo. Tente novamente mais tarde.');
  }
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
    throw error;
  }

  return (data || []).reduce((acc, food) => {
    acc[food.id] = food;
    return acc;
  }, {});
}

export function getUnavailableTemplateFoods(meals = []) {
  return meals.flatMap(meal => [
    ...(meal.foods || [])
    .filter(item => !item.food || item.food.is_active === false || item.unavailable_reason)
    .map(item => ({ meal: meal.name, name: item.food?.name || 'Alimento removido', id: item.food_id,
      reason: item.unavailable_reason || (item.food?.is_active === false ? 'desativado' : 'removido') })),
    ...(meal.foods || []).flatMap(item => (item.substitutes || [])
      .filter(sub => !sub.food || sub.food.is_active === false)
      .map(sub => ({ meal: meal.name, name: sub.food?.name || 'Substituto removido',
        id: sub.substitute_food_id, reason: 'substituto indisponível' })))
  ]);
}

export async function importDietTemplateMealsToPlan(templateId, planId, mealIds) {
  const { data, error } = await supabase.rpc('import_diet_template_meals_to_plan', {
    p_template_id: templateId,
    p_plan_id: planId,
    p_meal_ids: mealIds
  });
  if (error) throw error;
  return data;
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
  const templateFoodIds = (template.diet_template_meals || []).flatMap(m =>
    (m.diet_template_foods || []).map(f => f.id));
  let substitutions = [];
  if (templateFoodIds.length) {
    const { data, error: substitutesError } = await supabase.from('diet_template_food_substitutions')
      .select('template_food_id, substitute_food_id, quantity, unit').in('template_food_id', templateFoodIds);
    if (substitutesError) throw substitutesError;
    substitutions = data || [];
  }
  const foodsMap = await getFoodsMapByIds([...allFoodIds, ...substitutions.map(s => s.substitute_food_id)]);

  const measureIds = [...new Set((template.diet_template_meals || [])
    .flatMap(m => m.diet_template_foods || [])
    .map(f => String(f.unit || ''))
    .filter(unit => /^\d+$/.test(unit)))];
  let measuresMap = {};
  if (measureIds.length) {
    const { data: measures, error: measureError } = await supabase.from('household_measures')
      .select('id, grams_equivalent').in('id', measureIds.map(Number));
    if (measureError) throw measureError;
    measuresMap = Object.fromEntries((measures || []).map(m => [String(m.id), m]));
  }

  // Step 4: Normalizar refeições para o formato esperado pelos componentes
  const meals = (template.diet_template_meals || [])
    .sort((a, b) => a.order_index - b.order_index)
    .map(m => {
      const foods = (m.diet_template_foods || [])
        .sort((a, b) => a.order_index - b.order_index)
        .map(f => {
          const foodDetails = foodsMap[f.food_id] || null;
          const unit = String(f.unit || '');
          const gramsPerUnit = unit === 'gram' ? 1 : Number(measuresMap[unit]?.grams_equivalent);
          const hasMeasure = Number.isFinite(gramsPerUnit) && gramsPerUnit > 0;
          const hasNutrients = ['calories', 'protein', 'carbs', 'fat'].some(key => Number(foodDetails?.[key]) > 0);
          const unavailableReason = !Number.isFinite(Number(f.quantity)) || Number(f.quantity) <= 0
            ? 'quantidade inválida'
            : foodDetails && ['calories', 'protein', 'carbs', 'fat'].some(key => foodDetails[key] == null)
              ? 'macronutriente sem informação'
              : !hasMeasure && hasNutrients ? 'medida sem conversão em gramas' : null;
          const ratio = hasMeasure ? Number(f.quantity) * gramsPerUnit / 100 : 0;
          return {
            id: f.id,
            food: foodDetails,
            food_id: f.food_id,
            quantity: f.quantity,
            unit: f.unit,
            measure: measuresMap[unit] || null,
            observation: f.observation,
            unavailable_reason: unavailableReason,
            substitutes: substitutions.filter(s => s.template_food_id === f.id)
              .map(s => ({ ...s, food: foodsMap[s.substitute_food_id] || null })),
            calories: foodDetails ? (foodDetails.calories ?? 0) * ratio : null,
            protein: foodDetails ? (foodDetails.protein ?? 0) * ratio : null,
            carbs: foodDetails ? (foodDetails.carbs ?? 0) * ratio : null,
            fat: foodDetails ? (foodDetails.fat ?? 0) * ratio : null,
          };
        });

      return {
        id: m.id,
        name: m.name,
        meal_time: m.time,
        order_index: m.order_index,
        foods,
        calories: foods.reduce((sum, f) => sum + (f.calories || 0), 0),
        protein: foods.reduce((sum, f) => sum + (f.protein || 0), 0),
        carbs: foods.reduce((sum, f) => sum + (f.carbs || 0), 0),
        fat: foods.reduce((sum, f) => sum + (f.fat || 0), 0),
      };
    });

  return { data: { ...template, meals }, error: null };
}


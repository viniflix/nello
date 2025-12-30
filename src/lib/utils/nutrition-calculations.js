/**
 * Funções utilitárias para cálculos nutricionais
 * 
 * IMPORTANTE: Sempre recalcular calorias baseado nos macros usando a fórmula:
 * Calorias = (Proteína × 4) + (Carboidratos × 4) + (Gorduras × 9)
 * 
 * Não usar food.calories diretamente, pois pode estar desatualizado ou incorreto.
 */

/**
 * Calcula calorias baseado nos macronutrientes
 * @param {number} protein - Proteína em gramas
 * @param {number} carbs - Carboidratos em gramas
 * @param {number} fat - Gorduras em gramas
 * @returns {number} Calorias calculadas
 */
export function calculateCaloriesFromMacros(protein = 0, carbs = 0, fat = 0) {
  return (protein * 4) + (carbs * 4) + (fat * 9);
}

/**
 * Calcula valores nutricionais para uma quantidade específica de alimento
 * Sempre recalcula calorias baseado nos macros
 * 
 * @param {object} food - Alimento com valores por 100g
 * @param {number} totalGrams - Quantidade total em gramas
 * @returns {object} Valores nutricionais calculados
 */
export function calculateNutrition(food, totalGrams) {
  if (!food || !totalGrams || totalGrams <= 0) {
    return {
      grams: 0,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: food?.fiber ? 0 : null,
      sodium: food?.sodium ? 0 : null
    };
  }

  const multiplier = totalGrams / 100;

  // Calcular macros primeiro
  const protein = (food.protein || 0) * multiplier;
  const carbs = (food.carbs || 0) * multiplier;
  const fat = (food.fat || 0) * multiplier;

  // RECALCULAR calorias baseado nos macros (não usar food.calories diretamente)
  const calories = calculateCaloriesFromMacros(protein, carbs, fat);

  return {
    grams: parseFloat(totalGrams.toFixed(2)),
    calories: parseFloat(calories.toFixed(2)),
    protein: parseFloat(protein.toFixed(2)),
    carbs: parseFloat(carbs.toFixed(2)),
    fat: parseFloat(fat.toFixed(2)),
    fiber: food.fiber ? parseFloat((food.fiber * multiplier).toFixed(2)) : null,
    sodium: food.sodium ? parseFloat((food.sodium * multiplier).toFixed(2)) : null
  };
}

/**
 * Valida se os valores nutricionais de um alimento estão corretos
 * Compara calorias salvas com calorias calculadas dos macros
 * 
 * @param {object} food - Alimento para validar
 * @returns {object} { isValid: boolean, savedCalories: number, calculatedCalories: number, difference: number }
 */
export function validateFoodNutrition(food) {
  if (!food) {
    return { isValid: false, savedCalories: 0, calculatedCalories: 0, difference: 0 };
  }

  const savedCalories = food.calories || 0;
  const calculatedCalories = calculateCaloriesFromMacros(
    food.protein || 0,
    food.carbs || 0,
    food.fat || 0
  );
  const difference = Math.abs(savedCalories - calculatedCalories);

  // Considerar válido se a diferença for menor que 1 kcal (tolerância para arredondamentos)
  const isValid = difference < 1;

  return {
    isValid,
    savedCalories,
    calculatedCalories,
    difference
  };
}


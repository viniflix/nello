import { decimalFraction, exactOperation, fractionNumber } from '../../../supabase/functions/_shared/clinical-arithmetic.js';
type Nutrient = 'protein' | 'carbs' | 'fat' | 'fiber' | 'sodium';
export interface Food { source?: string; calories?: number | null; protein?: number | null; carbs?: number | null; fat?: number | null; fiber?: number | null; sodium?: number | null; portion_size?: number | null; nutrition_basis?: {food: Food; portion: number}; }
/**
 * Funções utilitárias para cálculos nutricionais
 *
 * Energia publicada por tabelas de referência tem precedência; sem fonte, usar a estimativa geral:
 * Calorias = (Proteína × 4) + (Carboidratos × 4) + (Gorduras × 9)
 *
 * Fatores gerais 4/4/9 não reproduzem necessariamente energia publicada (fibras/fatores específicos).
 */

const multiply = (a: number,b: number) => fractionNumber(exactOperation('multiply',[decimalFraction(a),decimalFraction(b)]));
export const NUTRITION_REFERENCE = 'https://www.fao.org/4/y5022e/y5022e04.htm';
export const foodEnergyPer100Grams = (food: Food | null | undefined) => {
  const published = Number(food?.calories);
  return ['TACO','TBCA','IBGE','TUCUNDUVA','USDA','OFF','OPENFOODFACTS'].includes(String(food?.source || '').toUpperCase()) && food?.calories != null && Number.isFinite(published) && published >= 0
    ? published : calculateCaloriesFromMacros(food?.protein || 0,food?.carbs || 0,food?.fat || 0);
};

/**
 * Calcula calorias baseado nos macronutrientes
 * @param {number} protein - Proteína em gramas
 * @param {number} carbs - Carboidratos em gramas
 * @param {number} fat - Gorduras em gramas
 * @returns {number} Calorias calculadas
 */
export function calculateCaloriesFromMacros(protein = 0, carbs = 0, fat = 0) {
  return fractionNumber(exactOperation('add',[exactOperation('add',[exactOperation('multiply',[decimalFraction(protein),decimalFraction(4)]),exactOperation('multiply',[decimalFraction(carbs),decimalFraction(4)])]),exactOperation('multiply',[decimalFraction(fat),decimalFraction(9)])]));
}

/** Custom food macros are stored per portion_size; reference foods are per 100 g. */
export function foodPer100Grams(food: Food | null | undefined) {
  if (!food || food.source !== 'custom') return food;
  if (food.nutrition_basis && food.portion_size === 100) return food;
  const portion = Number(food.portion_size);
  if (!Number.isFinite(portion) || portion <= 0) return null;
  const factor = 100 / portion;
  const normalized = {
    ...food,
    portion_size: 100,
    protein: multiply(Number(food.protein || 0),factor),
    carbs: multiply(Number(food.carbs || 0),factor),
    fat: multiply(Number(food.fat || 0),factor),
    fiber: food.fiber == null ? null : Number(food.fiber) * factor,
    sodium: food.sodium == null ? null : Number(food.sodium) * factor,
  };
  Object.defineProperty(normalized,'nutrition_basis',{value:{food,portion},enumerable:false});
  return normalized;
}

/**
 * Calcula valores nutricionais para uma quantidade específica de alimento
 * Preserva energia publicada; a estimativa geral é alternativa sem fonte válida.
 *
 * @param {object} food - Alimento com valores por 100g
 * @param {number} totalGrams - Quantidade total em gramas
 * @returns {object} Valores nutricionais calculados
 */
export function calculateNutrition(food: Food | null | undefined, totalGrams: number) {
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

  const grams = Number(totalGrams);
  if (!Number.isFinite(grams)) throw new Error('invalid_food_quantity');
  const basis = food.nutrition_basis;
  const original = basis?.food || food;
  const divisor = basis?.portion || 100;
  const ratio = exactOperation('divide',[decimalFraction(grams),decimalFraction(divisor)]);
  const scaled = (value: number) => fractionNumber(exactOperation('multiply',[decimalFraction(value),ratio]));
  const nutrient = (field: Nutrient) => scaled(original[field] || 0);
  return {
    grams, calories: scaled(foodEnergyPer100Grams(original)),
    protein: nutrient('protein'), carbs: nutrient('carbs'), fat: nutrient('fat'),
    fiber: original.fiber == null ? null : nutrient('fiber'),
    sodium: original.sodium == null ? null : nutrient('sodium'),
  };

}

/**
 * Valida se os valores nutricionais de um alimento estão corretos
 * Compara calorias salvas com calorias calculadas dos macros
 *
 * @param {object} food - Alimento para validar
 * @returns {object} { isValid: boolean, savedCalories: number, calculatedCalories: number, difference: number }
 */
export function validateFoodNutrition(food: Food | null | undefined) {
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

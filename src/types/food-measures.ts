/**
 * Types para o novo sistema de medidas caseiras
 *
 * Sistema baseado em:
 * - household_measures (medidas genéricas - 34 medidas)
 * - food_household_measures (associações específicas por alimento)
 */

export interface HouseholdMeasure {
  id: number;
  name: string;              // "xícara (chá)", "colher (sopa)"
  code: string;              // "teacup", "tablespoon"
  ml_equivalent: number | null;
  grams_equivalent: number | null;
  description: string | null;
  category: 'weight' | 'volume' | 'unit' | 'other';
  is_active: boolean;
  order_index: number;
  created_at: string;
}

export interface FoodHouseholdMeasure {
  id: number;
  food_id: number;           // FK → foods.id
  measure_id: number;        // FK → household_measures.id
  quantity: number;          // 1, 2, 0.5, etc
  grams: number;            // peso específico em gramas
  created_at: string;
  updated_at: string;
}

/**
 * Versão expandida com a medida genérica incluída (join)
 */
export interface FoodHouseholdMeasureWithDetails extends FoodHouseholdMeasure {
  measure: HouseholdMeasure;
}

/**
 * Estrutura de porção usada nos componentes
 */
export interface PortionValue {
  quantity: number;
  measureId: number | null;  // null = gramas direto
}

/**
 * Resultado do cálculo nutricional
 */
export interface NutritionCalculation {
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  sodium?: number | null;
}

/**
 * Validação de medida caseira
 */
export interface FoodMeasureValidationError {
  field: string;
  message: string;
}

/**
 * Payload para criar nova medida caseira
 */
export interface CreateFoodMeasurePayload {
  food_id: number;
  measure_id: number;
  quantity?: number;  // default: 1
  grams: number;
}

/**
 * Payload para atualizar medida caseira
 */
export interface UpdateFoodMeasurePayload {
  grams?: number;
  quantity?: number;
}

import { z } from 'zod';
import { entityId, finiteNonnegative } from '../contracts';
export const foodPortionSchema = z.object({ foodId: entityId, quantity: finiteNonnegative, gramsEquivalent: z.number().finite().positive(), unit: z.string().min(1).max(128) }).strict();
export { normalizeMealTime, isValidMealTime, MealTimeValidationError } from './mealTime';
export { calculateNutrition, calculateCaloriesFromMacros, foodPer100Grams, foodEnergyPer100Grams } from './calculations';
export type { Food } from './calculations';

import { describe, expect, it } from 'vitest';
import { calculateNutrition, foodPer100Grams } from './nutrition-calculations';

describe('patient diary food basis', () => {
  it('uses the custom food portion size before calculating grams', () => {
    const food = foodPer100Grams({ source: 'custom', portion_size: 50, protein: 5, carbs: 10, fat: 2 });
    expect(calculateNutrition(food, 25)).toMatchObject({ protein: 2.5, carbs: 5, fat: 1, calories: 39 });
  });

  it('keeps reference foods on their 100 gram basis', () => {
    const food = foodPer100Grams({ source: 'TACO', portion_size: 20, protein: 4, carbs: 8, fat: 0 });
    expect(calculateNutrition(food, 25)).toMatchObject({ protein: 1, carbs: 2, calories: 12 });
  });
});

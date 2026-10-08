import { describe, expect, it } from 'vitest';
import { calculateNutrition, foodPer100Grams } from './nutrition-calculations';

describe('micronutrient knowledge at an empty portion', () => {
  it.each([0, null])('preserves measured zero instead of changing it to unknown at %s grams', grams => {
    expect(calculateNutrition({ fiber: 0, sodium: 0 }, grams)).toMatchObject({ grams: 0, fiber: 0, sodium: 0 });
  });

  it('keeps missing composition unknown and measured composition known across custom normalization', () => {
    const normalized = foodPer100Grams({ source: 'custom', portion_size: 25, fiber: 0, sodium: null });
    expect(calculateNutrition(normalized, 0)).toMatchObject({ fiber: 0, sodium: null });
    expect(calculateNutrition({ fiber: null }, 0)).toMatchObject({ fiber: null, sodium: null });
    expect(calculateNutrition({ fiber: 4, sodium: 100 }, 0)).toMatchObject({ fiber: 0, sodium: 0 });
  });
});

import { describe, expect, it } from 'vitest';
import { summarizeMicronutrients } from './micronutrientCoverage';

const planWith = (...foods) => ({ meals: [{ foods }] });
const item = (food, quantity = 100) => ({ food, quantity, unit: 'gram' });

describe('micronutrient coverage', () => {
  it('keeps unreported TACO B12 unknown, even if a stale snapshot contains a value', () => {
    const result = summarizeMicronutrients(planWith(item({ source: 'TACO', vitamin_b12: 2, vitamin_c: 10 })), ['vitamin_b12', 'vitamin_c']);
    expect(result.vitamin_b12).toEqual({ value: 0, known: 0, unknown: 1 });
    expect(result.vitamin_c).toEqual({ value: 10, known: 1, unknown: 0 });
  });

  it('distinguishes measured zero from missing and marks mixed plans incomplete', () => {
    const result = summarizeMicronutrients(planWith(
      item({ source: 'TACO', vitamin_b12: null }),
      item({ source: 'TBCA', vitamin_b12: 0 }),
      item({ source: 'USDA', vitamin_b12: 4 }, 50),
    ), ['vitamin_b12']);
    expect(result.vitamin_b12).toEqual({ value: 2, known: 2, unknown: 1 });
  });

  it('uses the chosen household measure for nutrient totals', () => {
    const result = summarizeMicronutrients(planWith({ food: { source: 'USDA', vitamin_b12: 4 }, quantity: 2, unit: 'measure', measure: { weight_in_grams: 25 } }), ['vitamin_b12']);
    expect(result.vitamin_b12).toEqual({ value: 2, known: 1, unknown: 0 });
  });
});

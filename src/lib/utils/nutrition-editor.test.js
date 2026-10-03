import { describe, it, expect } from 'vitest';
import { changePortionMeasure, portionGrams } from './foodPortions';
import { calculateNutrition, foodPer100Grams } from './nutrition-calculations';
import { calculateEquivalentGrams } from './nutritionCalculations';
import { duplicateMeal, reorderMeals, ensureMealFoodIds } from './mealEditing';
import { summarizeMicronutrients } from './micronutrientCoverage';
import { prescriptionQuantity } from '../../../supabase/functions/_shared/clinical-document.js';

const bread = { source: 'TUCUNDUVA', calories: 285.6, protein: 9.42, carbs: 56.8, fat: 2.55 };
const measures = [{ id: 'bread-unit', name: 'Unidade média', weight_in_grams: 50 }];
describe('prescribed portions and meal editing', () => {
  it('assigns distinct editable identities to imported foods without changing existing identities', () => {
    let next = 0;
    const input = [{ food_id: 'bread' }, { food_id: 'cheese' }, { tempId: 'existing', food_id: 'fruit' }];
    const foods = ensureMealFoodIds(input, () => `import-${++next}`);
    expect(foods.map(food => food.tempId)).toEqual(['import-1', 'import-2', 'existing']);
    expect(foods.filter(food => food.tempId !== foods[0].tempId).map(food => food.food_id)).toEqual(['cheese', 'fruit']);
    expect(input[0].tempId).toBeUndefined();
  });
  it('preserves 100 g when choosing a 50 g bread unit, then restores grams', () => {
    const units = changePortionMeasure({ quantity: 100, measureCode: 'gram' }, 'bread-unit', measures, { preserveMass: true });
    expect(units.quantity).toBe(2);
    expect(portionGrams(units.quantity, units.measureId, measures)).toBe(100);
    expect(changePortionMeasure(units, 'gram', measures, { preserveMass: true }).quantity).toBe(100);
    expect(calculateNutrition(bread, 100).calories).toBe(285.6);
    expect(calculateNutrition(bread, 50).calories).toBe(142.8);
    expect(calculateNutrition(bread, 100).carbs).toBe(56.8);
  });
  it('keeps the entered count when selecting a measure, including empty and zero values', () => {
    for (const quantity of ['1.5', '', 0, 100]) {
      const units = changePortionMeasure({ quantity, measureCode: 'gram' }, 'bread-unit', measures);
      expect(units.quantity).toBe(quantity);
      expect(units.measure.grams_equivalent).toBe(50);
    }
    expect(portionGrams(changePortionMeasure({ quantity: 1, measureCode: 'gram' }, 'bread-unit', measures).quantity, 'bread-unit', measures)).toBe(50);
  });
  it('accepts zero portions but never interprets an unresolved UUID as grams', () => {
    expect(portionGrams(0, 'bread-unit', measures)).toBe(0);
    expect(calculateNutrition(bread, 0).calories).toBe(0);
    expect(portionGrams(1, 'missing-uuid', measures)).toBeNull();
    expect(portionGrams(-1, 'g')).toBeNull();
  });
  it('uses a custom food portion basis for equivalent energy and micronutrients', () => {
    const custom = { source: 'custom', portion_size: 50, protein: 10, carbs: 15, fat: 0, iron: 2 };
    expect(calculateNutrition(foodPer100Grams(custom), 100).calories).toBe(200);
    expect(calculateEquivalentGrams(100, custom)).toBe(50);
    const result = summarizeMicronutrients({ meals: [{ foods: [{ food: custom, quantity: 100, unit: 'gram' }] }, { include_in_totals: false, foods: [{ food: custom, quantity: 200, unit: 'gram' }] }] }, ['iron']);
    expect(result.iron).toEqual({ value: 4, known: 1, unknown: 0 });
  });
  it('copies foods and alternatives without reusing persisted meal/food identifiers', () => {
    const meal = { id: 10, dbId: 10, name: 'Almoço', include_in_totals: false, foods: [{ id: 20, food_id: 'catalog-id', quantity: 100, substitutes: [{ id: 'alternative-id', quantity: 50 }] }] };
    let next = 0;
    const copy = duplicateMeal(meal, () => `copy-${++next}`);
    expect(copy.id).toBeUndefined();
    expect(copy.foods[0].id).toBeUndefined();
    expect(copy.foods[0].food_id).toBe('catalog-id');
    expect(copy.include_in_totals).toBe(false);
    copy.foods[0].substitutes[0].quantity = 0;
    expect(meal.foods[0].substitutes[0].quantity).toBe(50);
    expect(reorderMeals([{ name: 'Café' }, { name: 'Jantar' }, copy], 2, 1).map(item => item.name)).toEqual(['Café', 'Almoço (cópia)', 'Jantar']);
  });
  it('exports household labels, never the stored UUID', () => {
    const uuid = '846e4d9f-ea1d-4680-b37b-e51682420d5b';
    expect(prescriptionQuantity({ quantity: 1, unit: uuid, measure_snapshot: { label: 'Unidade média', weight_in_grams: 50 } })).toContain('Unidade média');
    expect(prescriptionQuantity({ quantity: 1, unit: uuid })).not.toContain(uuid);
  });
});

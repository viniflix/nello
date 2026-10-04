import { expect, it } from 'vitest';
import { workingPlanMeals, workingPlanTotals } from './mealPlanEditor';
it('preserves recorded energy, includes numeric zero and excludes alternative meals', () => {
    const meals = [{ calories: 0, total_calories: 90, foods: [{ calories: 100, protein: 10 }] }, { calories: 50, protein: 3 }, { calories: 500, include_in_totals: false }];
    expect(workingPlanTotals(meals)).toEqual({ daily_calories: 50, daily_protein: 13, daily_carbs: 0, daily_fat: 0 });
    expect(meals[0].total_calories).toBe(90);
});
it('previews one pending food with zero quantity without mutating applied content or counting it twice', () => {
    const meal = { id: 'meal', calories: 100, foods: [{ id: 'food', quantity: 100, calories: 100, protein: 4 }] };
    const editor = { foods: meal.foods, foodEditor: { open: true, foodId: 'food', state: { selectedFood: { id: 'catalog' }, portion: { quantity: 0 }, calculatedNutrition: { calories: 0, protein: 0 } } } };
    expect(workingPlanTotals(workingPlanMeals([meal], editor, meal)).daily_calories).toBe(0);
    expect(meal.foods[0].quantity).toBe(100);
    expect(workingPlanMeals([meal], null, meal)).toEqual([meal]);
});
it('previews a new meal and food but ignores incomplete food entry and excludes alternative meal totals', () => {
    const meal = { id: 'meal', include_in_totals: false, calories: 100, foods: [] };
    const editor = { foods: [], foodEditor: { open: true, state: { selectedFood: { id: 1 }, portion: { quantity: '2' }, calculatedNutrition: { calories: 60, carbs: 15 } } } };
    expect(workingPlanTotals(workingPlanMeals([], editor, null)).daily_calories).toBe(60);
    expect(workingPlanTotals(workingPlanMeals([meal], editor, meal)).daily_calories).toBe(0);
    editor.foodEditor.state.portion.quantity = '';
    expect(workingPlanMeals([], editor, null)[0].foods).toEqual([]);
});

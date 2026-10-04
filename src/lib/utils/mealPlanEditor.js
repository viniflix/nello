import { displayNumber } from './mealPlanPresentation';

const nutrients = ['calories', 'protein', 'carbs', 'fat'];
export function workingPlanTotals(meals = [], mealOnly = false) {
    const totals = Object.fromEntries(nutrients.map(key => [key, 0]));
    for (const meal of meals) {
        if (!mealOnly && meal.include_in_totals === false) continue;
        for (const key of nutrients) {
            const fromFoods = (meal.foods || []).reduce((sum, food) => sum + displayNumber(food[key]), 0);
            totals[key] += mealOnly ? fromFoods : displayNumber(meal[key] ?? meal[`total_${key}`] ?? fromFoods);
        }
    }
    return mealOnly ? totals : Object.fromEntries(nutrients.map(key => [`daily_${key}`, totals[key]]));
}
// Presentation preview only. Never commits a pending food or mutates the working copy.
export function workingPlanMeals(meals, editor, editingMeal) {
    if (!editor) return meals;
    let foods = [...(editor.foods || [])];
    const pending = editor.foodEditor?.state;
    if (editor.foodEditor?.open && pending?.selectedFood && pending.calculatedNutrition && pending.portion?.quantity !== '') {
        const food = { food: pending.selectedFood, food_id: pending.selectedFood.id, quantity: pending.portion?.quantity, measure: pending.portion?.measure, unit: pending.portion?.measureCode || 'gram', ...pending.calculatedNutrition };
        const id = editor.foodEditor.foodId;
        const index = id ? foods.findIndex(item => String(item.id || item.tempId) === String(id)) : -1;
        if (index >= 0) foods[index] = { ...foods[index], ...food };
        else if (!id) foods.push(food);
    }
    const meal = { ...(editingMeal || {}), ...editor.formData, foods, ...workingPlanTotals([{ foods }], true) };
    return editingMeal ? meals.map(item => item === editingMeal ? meal : item) : [...meals, meal];
}

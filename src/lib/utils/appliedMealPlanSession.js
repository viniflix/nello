const text = value => value ?? '';
const numeric = value => value === '' ? '' : Number(value ?? 0);
const measure = food => {
    const value = food.measure || food.measure_snapshot;
    return value ? { name: text(value.name || value.label), grams: numeric(value.weight_in_grams ?? value.grams_equivalent) } : null;
};
const portion = food => ({
    foodId: text(food.food_id || food.food?.id || food.id), quantity: numeric(food.quantity),
    unit: text(food.unit || 'gram'), measure: measure(food), notes: text(food.notes),
});
const content = (form, meals) => ({
    name: text(form.name), description: text(form.description), mode: form.plan_mode || 'hybrid',
    start: text(form.start_date), end: text(form.end_date), days: [...(form.active_days || [])].sort(),
    meals: meals.map(meal => ({
        name: text(meal.name), type: meal.meal_type || 'other', time: text(meal.meal_time).slice(0,5),
        notes: text(meal.notes), include: meal.include_in_totals !== false,
        foods: (meal.foods || []).map(food => ({
            ...portion(food), description: text(food.patient_description),
            calories: numeric(food.calories), protein: numeric(food.protein), carbs: numeric(food.carbs), fat: numeric(food.fat),
            substitutes: (food.substitutes || []).map(portion),
        })),
    })),
});

/** Ignore obsolete copies of applied content, without deleting them or suppressing unfinished editors. */
export function sessionMatchesAppliedPlan(saved, plan) {
    if (!saved?.formData || !Array.isArray(saved.meals) || saved.editor?.open || !plan || plan.is_draft || !Array.isArray(plan.meals)) return false;
    return JSON.stringify(content(saved.formData, saved.meals)) === JSON.stringify(content(plan, plan.meals));
}

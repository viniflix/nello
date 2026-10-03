import { expect, it } from 'vitest';
import { sessionMatchesAppliedPlan } from './appliedMealPlanSession';

const plan = { id: 'plan', name: 'Plano', start_date: '2026-10-03', description: null, active_days: ['monday', 'tuesday'], meals: [{ id: 'meal', name: 'Café', meal_type: 'breakfast', meal_time: '08:00:00', foods: [{ id: 'applied-row', food_id: 'food', quantity: 50, unit: 'gram', calories: 100, protein: 1, carbs: 20, fat: 1, substitutes: [{ id: 'other-food', quantity: 40, unit: 'gram' }] }] }] };
const saved = () => ({ formData: { ...plan, description: '', active_days: ['tuesday', 'monday'] }, meals: structuredClone(plan.meals), editor: { open: false } });

it('recognizes an already applied copy despite generated row IDs and storage formatting', () => {
    const copy = saved();
    copy.meals[0].id = 'temporary-meal';
    copy.meals[0].meal_time = '08:00';
    copy.meals[0].foods[0].id = 'temporary-food-row';
    copy.meals[0].foods[0].quantity = '50';
    expect(sessionMatchesAppliedPlan(copy, plan)).toBe(true);
});

it('preserves unfinished editors even if the already added plan content is unchanged', () => {
    const copy = saved();
    copy.editor = { open: true, state: { foodEditor: { open: true, state: { notes: 'Ainda em preenchimento' } } } };
    expect(sessionMatchesAppliedPlan(copy, plan)).toBe(false);
});

it('never suppresses changes to quantity, instructions, totals participation, measures or substitutions', () => {
    for (const edit of [
        copy => { copy.meals[0].foods[0].quantity = 51; },
        copy => { copy.meals[0].foods[0].notes = 'Orientação'; },
        copy => { copy.meals[0].include_in_totals = false; },
        copy => { copy.meals[0].foods[0].measure = { name: 'Colher', weight_in_grams: 25 }; },
        copy => { copy.meals[0].foods[0].substitutes[0].quantity = 41; },
        copy => { copy.meals[0].foods[0].protein = 2; },
    ]) {
        const copy = saved(); edit(copy);
        expect(sessionMatchesAppliedPlan(copy, plan)).toBe(false);
    }
});

it('keeps drafts and absent or partial plans eligible for normal recovery', () => {
    expect(sessionMatchesAppliedPlan(saved(), { ...plan, is_draft: true })).toBe(false);
    expect(sessionMatchesAppliedPlan(saved(), null)).toBe(false);
    expect(sessionMatchesAppliedPlan(saved(), { ...plan, meals: undefined })).toBe(false);
});

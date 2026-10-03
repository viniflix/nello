import { asCivilDate } from './date';

export const mealColors = ['#476d3b', '#6d48a3', '#2563a6', '#ae5a15', '#a34566', '#167367'];
export function formatMealPlanDate(value) {
    if (!value) return null;
    try {
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return asCivilDate(value).split('-').reverse().join('/');
        const date = new Date(value);
        return Number.isFinite(date.getTime()) ? date.toLocaleDateString('pt-BR') : '—';
    } catch { return '—'; }
}
export const displayNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
export const roundedNutrition = value => Math.round(displayNumber(value)).toLocaleString('pt-BR');
export function referenceTargets(reference) {
    if (!reference) return null;
    const energy = displayNumber(reference.total_energy_kcal);
    const weight = displayNumber(reference.weight_kg);
    return {
        calories: energy,
        protein: reference.macro_mode === 'percentage' ? energy * displayNumber(reference.protein_percentage) / 4 : weight * displayNumber(reference.protein_g_per_kg),
        carbs: reference.macro_mode === 'percentage' ? energy * displayNumber(reference.carbs_percentage) / 4 : weight * displayNumber(reference.carbs_g_per_kg),
        fat: reference.macro_mode === 'percentage' ? energy * displayNumber(reference.fat_percentage) / 9 : weight * displayNumber(reference.fat_g_per_kg),
    };
}
export function targetComparison(value, target) {
    if (!(displayNumber(target) > 0)) return { percentage: null, label: 'Sem meta', className: 'bg-slate-100 text-slate-700' };
    const percentage = displayNumber(value) / target * 100;
    if (percentage >= 95 && percentage <= 105) return { percentage, label: 'Na faixa', className: 'bg-green-100 text-green-800' };
    if (percentage >= 85 && percentage <= 115) return { percentage, label: 'Próximo da meta', className: 'bg-amber-100 text-amber-900' };
    return { percentage, label: percentage < 100 ? 'Abaixo da meta' : 'Acima da meta', className: 'bg-rose-100 text-rose-800' };
}

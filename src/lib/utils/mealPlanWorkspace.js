import { displayNumber, referenceTargets } from './mealPlanPresentation';
import { energyCalculationNeedsVentaReview } from './energy-planning';
import { calculateCaloriesFromMacros } from './nutrition-calculations';

// Presentation only: no clinical classification or change to prescribed totals.
export function macroDistribution({ protein, carbs, fat } = {}) {
    const values = { protein: Math.max(0, displayNumber(protein)), carbs: Math.max(0, displayNumber(carbs)), fat: Math.max(0, displayNumber(fat)) };
    const total = calculateCaloriesFromMacros(values.protein, values.carbs, values.fat);
    return { total, protein: total > 0 ? values.protein * 4 / total * 100 : 0, carbs: total > 0 ? values.carbs * 4 / total * 100 : 0, fat: total > 0 ? values.fat * 9 / total * 100 : 0 };
}
export function planEnergyTarget(energyCalculation) {
    if (!energyCalculation || energyCalculationNeedsVentaReview(energyCalculation)) return null;
    const value = Number(energyCalculation.final_planned_kcal ?? energyCalculation.get_with_activities ?? energyCalculation.get ?? energyCalculation.get_result);
    return Number.isFinite(value) && value > 0 ? value : null;
}
export function energyComparison(current, target) {
    if (!(Number.isFinite(Number(target)) && Number(target) > 0)) return null;
    const prescribed = displayNumber(current);
    return { prescribed, target: Number(target), difference: prescribed - target, percentage: prescribed / target * 100, differencePercentage: (prescribed - target) / target * 100 };
}
export function workspaceInsights(plan, reference) {
    const targets = referenceTargets(reference);
    if (!targets || !(targets.calories > 0)) return [];
    return [{ key: 'protein', label: 'Proteínas', unit: 'g' }, { key: 'carbs', label: 'Carboidratos', unit: 'g' }, { key: 'fat', label: 'Gorduras', unit: 'g' }].filter(item => targets[item.key] > 0).map(item => ({ ...item, value: displayNumber(plan?.[`daily_${item.key}`]), target: targets[item.key], difference: displayNumber(plan?.[`daily_${item.key}`]) - targets[item.key] }));
}

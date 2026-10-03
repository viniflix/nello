import { expect, it } from 'vitest';
import { referenceTargets, targetComparison, roundedNutrition, formatMealPlanDate } from './mealPlanPresentation';
it('converts stored fractional percentages and grams per kilogram independently', () => {
    expect(referenceTargets({macro_mode:'percentage',total_energy_kcal:2000,protein_percentage:0.2,carbs_percentage:0.6,fat_percentage:0.2})).toEqual({calories:2000,protein:100,carbs:300,fat:400/9});
    expect(referenceTargets({macro_mode:'per_kg',weight_kg:60,total_energy_kcal:1800,protein_g_per_kg:2,carbs_g_per_kg:4,fat_g_per_kg:1})).toEqual({calories:1800,protein:120,carbs:240,fat:60});
});
it('preserves calendar dates in every timezone and rejects invalid dates without throwing', () => {
    expect(formatMealPlanDate('2026-10-03')).toBe('03/10/2026');
    expect(formatMealPlanDate('2026-02-29')).toBe('—');
    expect(formatMealPlanDate('invalid')).toBe('—');
    expect(formatMealPlanDate(null)).toBeNull();
    const instant='2026-10-03T04:00:00Z';
    expect(formatMealPlanDate(instant)).toBe(new Date(instant).toLocaleDateString('pt-BR'));
});
it('keeps real above-target percentages and has no classification for absent or zero targets', () => {
    expect(targetComparison(150,100)).toMatchObject({percentage:150,label:'Acima da meta'});
    expect(targetComparison(0,0)).toMatchObject({percentage:null,label:'Sem meta'});
    expect(targetComparison(20,null).percentage).toBeNull();
    expect(targetComparison(100,100).label).toBe('Na faixa');
    expect(roundedNutrition('287.92')).toBe('288');
    expect(roundedNutrition(NaN)).toBe('0');
});

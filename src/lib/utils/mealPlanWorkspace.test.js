import { describe, expect, it } from 'vitest';
import { energyComparison, macroDistribution, planEnergyTarget, workspaceInsights } from './mealPlanWorkspace';

describe('workspace presentation keeps clinical calculations and missing data distinct', () => {
    it('uses macro energy as denominator, independently of catalog calories', () => {
        const result = macroDistribution({protein:10,carbs:20,fat:10});
        expect(result.total).toBe(210);
        expect(result.protein).toBeCloseTo(40/210*100);
        expect(result.carbs + result.protein + result.fat).toBeCloseTo(100);
        expect(macroDistribution({carbs:25})).toEqual({total:100,protein:0,carbs:100,fat:0});
        expect(macroDistribution({protein:NaN,carbs:-2})).toEqual({total:0,protein:0,carbs:0,fat:0});
    });
    it('distinguishes missing energy from a real zero prescription and retains surplus', () => {
        expect(energyComparison(100,0)).toBeNull();
        expect(energyComparison(100,null)).toBeNull();
        expect(energyComparison(100,Infinity)).toBeNull();
        expect(energyComparison(0,2000)).toEqual({prescribed:0,target:2000,difference:-2000,percentage:0,differencePercentage:-100});
        expect(energyComparison(2400,2000)).toEqual({prescribed:2400,target:2000,difference:400,percentage:120,differencePercentage:20});
    });
    it('uses confirmed existing energy fields and never invents a fallback', () => {
        expect(planEnergyTarget(null)).toBeNull();
        expect(planEnergyTarget({final_planned_kcal:0,get:2000})).toBeNull();
        expect(planEnergyTarget({final_planned_kcal:1800,get:2000})).toBe(1800);
        expect(planEnergyTarget({get_with_activities:2200})).toBe(2200);
        expect(planEnergyTarget({get_result:'2300'})).toBe(2300);
    });
    it('compares only configured references, without invented dietary ranges', () => {
        expect(workspaceInsights({daily_protein:20},null)).toEqual([]);
        const result=workspaceInsights({daily_protein:30},{total_energy_kcal:2000,macro_mode:'percentage',protein_percentage:0.2,carbs_percentage:0,fat_percentage:0});
        expect(result).toEqual([{key:'protein',label:'Proteínas',unit:'g',value:30,target:100,difference:-70}]);
    });
});

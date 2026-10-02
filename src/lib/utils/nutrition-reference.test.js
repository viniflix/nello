import { expect, it } from 'vitest';
import { calculateNutrition, foodPer100Grams, foodEnergyPer100Grams } from './nutrition-calculations';
import { calculateEquivalentGrams, checkMacroDeviations } from './nutritionCalculations';
it('preserves published food energy instead of replacing specific factors with general Atwater',()=>{
 const food={source:'TACO',portion_size:20,calories:130,protein:2.5,carbs:28,fat:.2,fiber:0,sodium:0};
 expect(calculateNutrition(food,50)).toMatchObject({calories:65,protein:1.25,carbs:14,fat:.1,fiber:0,sodium:0});
 expect(foodEnergyPer100Grams(food)).toBe(130);
 expect(calculateEquivalentGrams(65,food)).toBe(50);
 expect(checkMacroDeviations(65,1.25,14,.1,food,50)).toEqual({hasDeviation:false,messages:[]});
});
it('uses the same custom serving basis in diary, meals and substitutions',()=>{
 const food={source:'custom',portion_size:50,protein:5,carbs:10,fat:2};
 expect(calculateNutrition(foodPer100Grams(food),25).calories).toBe(39);
 expect(calculateEquivalentGrams(39,food)).toBe(25);
 expect(checkMacroDeviations(39,2.5,5,1,food,25).hasDeviation).toBe(false);
});
it('rejects nonfinite substitution energy and unusable custom servings',()=>{
 expect(calculateEquivalentGrams(Infinity,{source:'TACO',calories:100})).toBe(0);
 expect(calculateEquivalentGrams(100,{source:'custom',portion_size:0})).toBe(0);
});
it('keeps custom basis idempotent and avoids intermediate nutrient rounding',()=>{
 const food=foodPer100Grams({source:'custom',portion_size:30,protein:3,carbs:6,fat:1.5});
 expect(calculateNutrition(food,15)).toMatchObject({protein:1.5,carbs:3,fat:.75,calories:24.75});
 expect(calculateNutrition(foodPer100Grams(food),15).calories).toBe(24.75);
 expect(foodPer100Grams(food)).toBe(food);
 expect(calculateNutrition({protein:.01,carbs:0,fat:0},50).protein).toBe(.005);
});

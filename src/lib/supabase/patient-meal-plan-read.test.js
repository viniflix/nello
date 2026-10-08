import {beforeEach, describe, expect, it, vi} from 'vitest';
import {nutritionClient} from '@/infrastructure/supabase/domainClients';
import {getActiveMealPlan} from './meal-plan-query-read';
import {updateFullMealPlan} from './meal-plan-query-write';

vi.mock('@/infrastructure/supabase/domainClients', () => ({nutritionClient:{from:vi.fn(),rpc:vi.fn()}}));
vi.mock('@/lib/supabase/query-helpers', () => ({logSupabaseError:vi.fn()}));
vi.mock('@/lib/supabase/idempotent-mutations', () => ({clinicalRpc:vi.fn()}));

describe('active prescription read contract for patient consumers', () => {
  let rows, failure;
  beforeEach(() => {
    failure=null;
    nutritionClient.rpc.mockReset().mockResolvedValue({data:null,error:null});
    rows={meal_plans:[{id:42,patient_id:'synthetic',daily_calories:120}],
      meal_plan_meals:[{id:8,meal_plan_id:42,name:'Café',meal_time:'08:00',include_in_totals:true,order_index:0},{id:9,meal_plan_id:42,name:'Alternativa',include_in_totals:false,order_index:1}],
      meal_plan_foods:[{id:3,meal_plan_meal_id:8,food_id:'custom',quantity:100,unit:'gram',calories:120,protein:10,carbs:20,fat:0,notes:'Orientação salva',food_snapshot:{name:'Alimento salvo',fiber:0}}],
      foods:[{id:'custom',name:'Alimento salvo',calories:120,protein:10,carbs:20,fat:0,fiber:0}],meal_plan_food_substitutions:[]};
    nutritionClient.from.mockImplementation(table => {
      const result=()=>({data:rows[table] || [],error:failure});
      const query={};
      for(const method of ['select','eq','lte','or','order','limit','in','range'])query[method]=vi.fn(()=>query);
      query.maybeSingle=vi.fn(async()=>({data:rows[table]?.[0] || null,error:failure}));
      query.then=(resolve,reject)=>Promise.resolve(result()).then(resolve,reject);
      return query;
    });
  });
  it('exposes applied meals and foods to home, diary and full-plan consumers without losing the professional shape', async () => {
    const {data,error}=await getActiveMealPlan('synthetic');
    expect(error).toBeNull();
    expect(data.meal_plan_meals).toHaveLength(2);
    expect(data.meal_plan_meals[0].meal_plan_foods[0]).toMatchObject({quantity:100,calories:120,protein:10,carbs:20,fat:0,notes:'Orientação salva',foods:{name:'Alimento salvo'}});
    expect(data.meal_plan_meals[1].include_in_totals).toBe(false);
    expect(data.meals[0].foods[0].quantity).toBe(100);
  });
  it('represents a saved plan without meals as empty in both supported read shapes', async () => {
    rows.meal_plan_meals=[];
    const {data}=await getActiveMealPlan('synthetic');
    expect(data.meals).toEqual([]);
    expect(data.meal_plan_meals).toEqual([]);
  });
  it('preserves the saved substitution instructions for patient and professional consumers', async () => {
    rows.meal_plan_food_substitutions=[{meal_plan_food_id:3,substitute_food_id:'alternative',quantity:2,unit:'gram',notes:'Orientação salva da substituição',food_snapshot:{name:'Alternativa congelada'}}];
    const {data,error}=await getActiveMealPlan('synthetic');
    expect(error).toBeNull();
    expect(data.meal_plan_meals[0].meal_plan_foods[0].substitutes[0]).toMatchObject({name:'Alternativa congelada',quantity:2,unit:'gram',notes:'Orientação salva da substituição'});
    expect(data.meals[0].foods[0].substitutes[0].notes).toBe('Orientação salva da substituição');
    await updateFullMealPlan(data.id,data);
    expect(nutritionClient.rpc).toHaveBeenCalledWith('upsert_full_meal_plan',expect.objectContaining({p_meals:expect.arrayContaining([expect.objectContaining({foods:expect.arrayContaining([expect.objectContaining({substitutes:expect.arrayContaining([expect.objectContaining({notes:'Orientação salva da substituição'})])})])})])}));
    const substitutionReads=nutritionClient.from.mock.results.filter(result=>result.value.select.mock.calls.some(([fields])=>fields.includes('substitute_food_id')));
    expect(substitutionReads.length).toBeGreaterThan(0);
    for(const result of substitutionReads)expect(result.value.select.mock.calls[0][0]).toContain('notes');
  });
  it('does not synthesize a prescription when the authorized read fails', async () => {
    failure={code:'42501',message:'synthetic denied'};
    const result=await getActiveMealPlan('other-synthetic');
    expect(result.data).toBeNull();
    expect(result.error).toBe(failure);
  });
});

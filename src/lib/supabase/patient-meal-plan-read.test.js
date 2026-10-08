import {beforeEach, describe, expect, it, vi} from 'vitest';
import {nutritionClient} from '@/infrastructure/supabase/domainClients';
import {getActiveMealPlan} from './meal-plan-query-read';

vi.mock('@/infrastructure/supabase/domainClients', () => ({nutritionClient:{from:vi.fn()}}));
vi.mock('@/lib/supabase/query-helpers', () => ({logSupabaseError:vi.fn()}));

describe('active prescription read contract for patient consumers', () => {
  let rows, failure;
  beforeEach(() => {
    failure=null;
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
  it('does not synthesize a prescription when the authorized read fails', async () => {
    failure={code:'42501',message:'synthetic denied'};
    const result=await getActiveMealPlan('other-synthetic');
    expect(result.data).toBeNull();
    expect(result.error).toBe(failure);
  });
});

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {nutritionClient} from '@/infrastructure/supabase/domainClients';
import {getMealPlanById} from './meal-plan-query-read';
import {restoreMealPlanVersion} from './meal-plan-query-write';

vi.mock('@/infrastructure/supabase/domainClients', () => ({nutritionClient:{from:vi.fn(),rpc:vi.fn()}}));
vi.mock('./meal-plan-query-read', () => ({getMealPlanById:vi.fn()}));
vi.mock('@/lib/supabase/query-helpers', () => ({logSupabaseError:vi.fn()}));
vi.mock('@/lib/supabase/idempotent-mutations', () => ({clinicalRpc:vi.fn()}));

describe('restore a meal-plan version', () => {
    const snapshot = {plan:{name:'Versão anterior',is_active:false,plan_mode:'quantitative',daily_calories:100,daily_protein:0,daily_carbs:25,daily_fat:0},meals:[
        {name:'Café',include_in_totals:true,total_calories:100,total_carbs:25,foods:[{food_id:'food',quantity:100,calories:100,carbs:25,patient_description:'Porção',substitutions:[{substitute_food_id:'sub',quantity:50,unit:'gram'}]}]},
        {name:'Alternativa',include_in_totals:false,total_calories:300,total_carbs:75,foods:[{food_id:'food',quantity:300,calories:300,carbs:75}]},
    ]};
    beforeEach(() => {
        vi.clearAllMocks();
        const query={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),single:vi.fn().mockResolvedValue({data:{meal_plan_id:42,version_number:1,snapshot},error:null})};
        nutritionClient.from.mockReturnValue(query);
        nutritionClient.rpc.mockResolvedValue({error:null});
    });
    it.each([{is_active:true,is_draft:false},{is_active:false,is_draft:false},{is_active:false,is_draft:true}])('preserves current lifecycle %j and restores recorded nutrition and alternatives',async lifecycle => {
        getMealPlanById.mockResolvedValue({data:{id:42,...lifecycle},error:null});
        expect((await restoreMealPlanVersion('version')).error).toBeNull();
        const payload=nutritionClient.rpc.mock.calls[0][1];
        expect(payload.p_plan_data).toMatchObject({...lifecycle,daily_calories:100,daily_carbs:25,plan_mode:'quantitative'});
        expect(payload.p_meals[0]).toMatchObject({total_calories:100,total_carbs:25,include_in_totals:true,foods:[{patient_description:'Porção',substitutes:[{id:'sub',quantity:50,unit:'gram'}]}]});
        expect(payload.p_meals[1]).toMatchObject({total_calories:300,total_carbs:75,include_in_totals:false});
    });
    it('does not write if the current plan cannot be read',async()=>{
        const error=new Error('access denied');
        getMealPlanById.mockResolvedValue({data:null,error});
        expect((await restoreMealPlanVersion('version')).error).toBe(error);
        expect(nutritionClient.rpc).not.toHaveBeenCalled();
    });
});

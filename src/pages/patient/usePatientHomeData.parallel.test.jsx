import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {renderHook,act,waitFor,cleanup} from '@testing-library/react';
import {usePatientHomeData} from './usePatientHomeData';
const api=vi.hoisted(()=>({care:vi.fn(),link:vi.fn(),plan:vi.fn(),appointment:vi.fn(),meals:vi.fn()}));
vi.mock('@/lib/supabase/patient-queries',()=>({getMyCareRelationship:api.care}));
vi.mock('@/lib/supabase/meal-plan-queries',()=>({getActiveMealPlan:api.plan}));
vi.mock('@/lib/supabase/patient-home-queries',()=>({getPatientHomeLink:api.link,getPatientHomeAppointment:api.appointment,getPatientHomeMeals:api.meals}));
const deferred=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)}};
const user={id:'synthetic-patient',profile:{nutritionist_id:'synthetic-n',is_active:true}};
beforeEach(()=>{vi.resetAllMocks();api.care.mockResolvedValue({data:{status:'active'}});api.link.mockResolvedValue({data:{status:'active'}});api.plan.mockResolvedValue({data:null});api.appointment.mockResolvedValue({data:null});api.meals.mockResolvedValue({data:[],count:0});});
afterEach(cleanup);
it('authorizes first then starts all independent sources before any one completes',async()=>{
 const care=deferred(),plan=deferred(),appointment=deferred(),meals=deferred();api.care.mockReturnValue(care.promise);api.plan.mockReturnValue(plan.promise);api.appointment.mockReturnValue(appointment.promise);api.meals.mockReturnValue(meals.promise);
 const h=renderHook(()=>usePatientHomeData(user));expect(api.plan).not.toHaveBeenCalled();expect(api.appointment).not.toHaveBeenCalled();
 await act(async()=>care.resolve({data:{status:'active'}}));await waitFor(()=>expect(api.plan).toHaveBeenCalledOnce());
 expect(api.appointment).toHaveBeenCalledOnce();expect(api.meals).toHaveBeenCalledOnce();
 await act(async()=>appointment.resolve({data:{id:'appointment'}}));await waitFor(()=>expect(h.result.current.nextAppointment?.id).toBe('appointment'));
 expect(h.result.current.prescriptionReady).toBe(false);expect(h.result.current.todayMealsCount).toBeNull();
 await act(async()=>{plan.resolve({data:{daily_calories:1800}});meals.resolve({data:[{total_calories:120}],count:1})});await waitFor(()=>expect(h.result.current.fetching).toBe(false));expect(h.result.current.currentProgress.calories).toBe(120);
});
it('never starts clinical reads for a nonactive relationship',async()=>{api.care.mockResolvedValue({data:{status:'ended'}});const h=renderHook(()=>usePatientHomeData(user));await waitFor(()=>expect(h.result.current.fetching).toBe(false));expect(api.plan).not.toHaveBeenCalled();expect(api.appointment).not.toHaveBeenCalled();expect(api.meals).not.toHaveBeenCalled();});
it('never restores a discarded access snapshot when reauthorization fails transiently',async()=>{
 const h=renderHook(()=>usePatientHomeData(user));await waitFor(()=>expect(h.result.current.hasSnapshot).toBe(true));await waitFor(()=>expect(h.result.current.fetching).toBe(false));
 api.care.mockResolvedValue({data:null,error:{status:503}});
 await act(()=>h.result.current.loadData({discard:true}));await waitFor(()=>expect(h.result.current.error).toBeTruthy());expect(h.result.current.hasSnapshot).toBe(false);expect(h.result.current.prescription).toBeUndefined();
});

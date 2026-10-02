import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMealPlanDraft } from '@/hooks/useMealPlanDraft';
const mocks = vi.hoisted(() => Object.fromEntries(['createDraftMealPlan','getDraftMealPlan','updateDraftMealPlan','deleteDraftMealPlan','saveDraftMeal','deleteMealFromPlan','getMealPlanById'].map(name => [name,vi.fn()])));
vi.mock('@/lib/supabase/meal-plan-queries', () => mocks);
const base = { id:55,name:'Rascunho',updated_at:'2026-10-01T10:00:00Z' };
const params = {patientId:'synthetic-patient',nutritionistId:'synthetic-professional',enabled:false};
beforeEach(() => {
 vi.resetAllMocks();
 mocks.getDraftMealPlan.mockResolvedValue({data:null,error:null});
 mocks.createDraftMealPlan.mockResolvedValue({data:base,error:null});
 mocks.updateDraftMealPlan.mockImplementation(async (_id,data) => ({data:{...base,...data,updated_at:'2026-10-01T11:00:00Z'},error:null}));
 mocks.getMealPlanById.mockResolvedValue({data:{...base,updated_at:'2026-10-01T12:00:00Z'},error:null});
 mocks.saveDraftMeal.mockResolvedValue({data:{id:201,plan_revision:'2026-10-01T12:00:00Z'},error:null});
 mocks.deleteDraftMealPlan.mockResolvedValue({error:null});
 mocks.deleteMealFromPlan.mockResolvedValue({error:null});
});
async function started() {
 const hook = renderHook(() => useMealPlanDraft(params));
 await act(async () => { await hook.result.current.startNewDraft(); });
 return hook;
}
describe('draft revisions and atomic meals', () => {
 it('does not fetch while disabled', () => { const h=renderHook(()=>useMealPlanDraft(params));expect(h.result.current.draftId).toBeNull();expect(mocks.getDraftMealPlan).not.toHaveBeenCalled(); });
 it('creates a draft for the exact pair', async () => {const h=await started();expect(h.result.current.draftId).toBe(55);expect(mocks.createDraftMealPlan).toHaveBeenCalledWith(params.patientId,params.nutritionistId);});
 it('keeps initialization failure visible', async () => {mocks.createDraftMealPlan.mockResolvedValue({data:null,error:{code:'OFFLINE'}});const h=await started();expect(h.result.current.draftId).toBeNull();expect(h.result.current.saveStatus).toBe('error');});
 it('explicitly flushes the pending header with its confirmed revision', async () => {const h=await started();act(()=>h.result.current.savePlanInfo({name:'New header'}));await act(async()=>{await h.result.current.flushPlanInfo();});expect(mocks.updateDraftMealPlan).toHaveBeenCalledWith(55,{name:'New header'},base.updated_at);});
 it('serializes headers and advances CAS only after confirmation', async () => {
  let finish; mocks.updateDraftMealPlan.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const h=await started();
  act(()=>h.result.current.savePlanInfo({name:'First'}));let first;await act(async()=>{first=h.result.current.flushPlanInfo();await Promise.resolve();});
  expect(finish).toBeTypeOf('function');
  act(()=>h.result.current.savePlanInfo({name:'Last'}));let last;await act(async()=>{last=h.result.current.flushPlanInfo();await Promise.resolve();});
  expect(mocks.updateDraftMealPlan).toHaveBeenCalledTimes(1);
  await act(async()=>{finish({data:{...base,name:'First',updated_at:'2026-10-01T11:00:00Z'},error:null});await Promise.all([first,last]);});
  expect(mocks.updateDraftMealPlan).toHaveBeenNthCalledWith(2,55,{name:'Last'},'2026-10-01T11:00:00Z');expect(h.result.current.saveStatus).toBe('saved');
 });
 it('sends a meal and all foods as one server operation', async () => {const h=await started();const meal={name:'Lunch',meal_type:'lunch',foods:[{food_id:5,quantity:100,unit:'g'}]};let id;await act(async()=>{id=await h.result.current.saveMeal(meal);});expect(id).toBe(201);expect(mocks.saveDraftMeal).toHaveBeenCalledWith(55,null,meal,base.updated_at);expect(h.result.current.saveStatus).toBe('saved');});
 it('retains the existing meal if the atomic replacement fails', async () => {mocks.saveDraftMeal.mockResolvedValue({data:null,error:{code:'NETWORK_FAILURE'}});const h=await started();let id;await act(async()=>{id=await h.result.current.updateMeal(99,{name:'Edited',foods:[]},0);});expect(id).toBeNull();expect(h.result.current.saveStatus).toBe('error');expect(mocks.deleteMealFromPlan).not.toHaveBeenCalled();});
 it('passes the old identity to the atomic replacement instead of deleting it', async () => {const h=await started();await act(async()=>{await h.result.current.updateMeal(99,{name:'Edited',foods:[]},2);});expect(mocks.saveDraftMeal).toHaveBeenCalledWith(55,99,{name:'Edited',foods:[],order_index:2},base.updated_at);expect(mocks.deleteMealFromPlan).not.toHaveBeenCalled();});
 it('does not mark a stale overwrite saved', async () => {mocks.saveDraftMeal.mockResolvedValue({data:null,error:{code:'PT409'}});const h=await started();await act(async()=>{await h.result.current.saveMeal({name:'Lunch',foods:[]});});expect(h.result.current.saveStatus).toBe('conflict');});
 it('does not send a meal if the pending header conflicts', async () => {mocks.updateDraftMealPlan.mockResolvedValue({data:null,error:{code:'PT409'}});const h=await started();act(()=>h.result.current.savePlanInfo({name:'Changed'}));await act(async()=>{await h.result.current.saveMeal({name:'Lunch',foods:[]});});expect(mocks.saveDraftMeal).not.toHaveBeenCalled();expect(h.result.current.saveStatus).toBe('conflict');});
 it('keeps the draft identity when deletion fails', async () => {mocks.deleteDraftMealPlan.mockResolvedValue({error:{code:'OFFLINE'}});const h=await started();await act(async()=>{await h.result.current.discardDraft();});expect(h.result.current.draftId).toBe(55);expect(h.result.current.saveStatus).toBe('error');});
 it('advances the header CAS after its own meal write', async () => {const h=await started();await act(async()=>{await h.result.current.saveMeal({name:'Lunch',foods:[]});});act(()=>h.result.current.savePlanInfo({name:'Next'}));await act(async()=>{await h.result.current.flushPlanInfo();});expect(mocks.updateDraftMealPlan).toHaveBeenCalledWith(55,{name:'Next'},'2026-10-01T12:00:00Z');});
 it('deletes only through the confirmed parent revision and retains a conflict', async()=>{const h=await started();mocks.saveDraftMeal.mockResolvedValue({data:null,error:{code:'PT409'}});await act(async()=>expect(await h.result.current.removeMeal(201)).toBe(false));expect(mocks.saveDraftMeal).toHaveBeenCalledWith(55,201,{delete:true},base.updated_at);expect(h.result.current.saveStatus).toBe('conflict');});
});

it('never flushes a pending clinical header when unmounting', async()=>{
 const h=await started();act(()=>h.result.current.savePlanInfo({name:'Pending'}));h.unmount();
 await act(async()=>{});expect(mocks.updateDraftMealPlan).not.toHaveBeenCalled();
});
it('cancels the old patient debounce on identity change', async()=>{
 const h=renderHook(props=>useMealPlanDraft(props),{initialProps:params});
 await act(async()=>{await h.result.current.startNewDraft();});act(()=>h.result.current.savePlanInfo({name:'Old patient'}));
 h.rerender({...params,patientId:'different-patient'});
 await act(async()=>{await h.result.current.flushPlanInfo();});
 expect(mocks.updateDraftMealPlan).not.toHaveBeenCalled();expect(h.result.current.draftId).toBeNull();
});

it('ignores a delete response from the previously displayed patient', async()=>{
 let finish;mocks.deleteDraftMealPlan.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const h=renderHook(props=>useMealPlanDraft(props),{initialProps:params});
 await act(async()=>{await h.result.current.startNewDraft();});let pending;
 act(()=>{pending=h.result.current.discardDraft();});await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
 h.rerender({...params,patientId:'different-patient'});
 await act(async()=>{await h.result.current.startNewDraft();});
 await act(async()=>{finish({error:null});await pending;});expect(h.result.current.draftId).toBe(55);
});

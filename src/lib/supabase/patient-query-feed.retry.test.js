import {beforeEach,describe,expect,it,vi} from 'vitest';
import {getFeedTaskStates,getNutritionistPatientsForFeed,retryFeedTaskSync,syncFeedTasksFromItems} from './patient-query-feed';
const mocks=vi.hoisted(()=>({session:vi.fn(),rpc:vi.fn(),write:vi.fn(),labs:vi.fn(),pages:[]}));
vi.mock('@/infrastructure/supabase/domainClients',()=>({communicationClient:{auth:{getSession:mocks.session},rpc:(...args)=>{
 const result=Promise.resolve(mocks.rpc(...args));result.order=()=>result;result.range=(start,end)=>{mocks.pages.push({name:args[0],start,end});return result.then(value=>({...value,data:value.data?.slice(start,end+1)}));};return result;
}}}));
vi.mock('@/lib/supabase/idempotent-mutations',()=>({idempotentRpc:mocks.write}));
vi.mock('@/lib/supabase/patient-query-monitoring',()=>({getPatientsHighRiskLabAlerts:mocks.labs}));
vi.mock('@/lib/supabase/query-helpers',()=>({logSupabaseError:vi.fn()}));
const item=id=>({sourceType:'lab_high_risk',sourceId:'lab-result:'+id,patientId:'patient',careEpisodeId:'episode',title:'Synthetic risk',type:'lab_high_risk'});
beforeEach(()=>{
 vi.clearAllMocks();mocks.pages=[];mocks.session.mockResolvedValue({data:{session:{user:{id:'owner'}}}});
 mocks.rpc.mockImplementation(async name=>({data:name==='get_active_feed_patients'?[{id:'patient',care_episode_id:'episode'}]:[]}));
 mocks.labs.mockResolvedValue({data:[{result_id:'current'}],error:null});mocks.write.mockResolvedValue({data:{id:'saved'},error:null});
});
describe('laboratory occurrence retry and status isolation',()=>{
 it.each([getFeedTaskStates,getNutritionistPatientsForFeed])('reads the full authorized context beyond the provider row ceiling',async load=>{
   mocks.rpc.mockResolvedValue({data:Array.from({length:1001},(_,i)=>({id:String(i).padStart(5,'0')}))});
   const result=await load('owner');expect(result.error).toBeNull();expect(result.data).toHaveLength(1001);expect(mocks.pages.map(page=>page.start)).toEqual([0,250,500,750,1000]);
 });
 it('discards normalized or superseded lab evidence before retry while retaining another current task',async()=>{
   const result=await retryFeedTaskSync('owner',[item('old'),item('current')]);
   expect(result.discardedKeys).toEqual(['lab_high_risk:lab-result:old']);expect(mocks.write).toHaveBeenCalledTimes(1);
   expect(mocks.write.mock.calls[0][1].p_values.source_id).toBe('lab-result:current');
 });
 it('does not retry stale lab evidence when revalidation fails',async()=>{
   mocks.labs.mockResolvedValue({data:[],error:{status:403,code:'42501'}});
   const result=await retryFeedTaskSync('owner',[item('old')]);expect(result.error.status).toBe(403);expect(result.failedItems).toHaveLength(1);expect(mocks.write).not.toHaveBeenCalled();
 });
 it.each(['resolved','snoozed'])('an existing %s occurrence never suppresses a new result',async status=>{
   const old={id:'old-task',source_type:'lab_high_risk',source_id:'lab-result:old',patient_id:'patient',status,snooze_until:'2099-01-01T00:00:00Z',metadata:{care_episode_id:'episode'}};
   await syncFeedTasksFromItems('owner',[item('current')],[old]);
   expect(mocks.write.mock.calls[0][1]).toMatchObject({p_expected:null,p_values:{source_id:'lab-result:current',status:'open',snooze_until:null}});
 });
 it.each(['resolved','snoozed'])('preserves the same occurrence’s %s state during snapshot refresh',async status=>{
   const existing={id:'current-task',source_type:'lab_high_risk',source_id:'lab-result:current',patient_id:'patient',status,snooze_until:'2099-01-01T00:00:00Z',updated_at:'2026-10-16T10:00:00Z',metadata:{care_episode_id:'episode'}};
   await syncFeedTasksFromItems('owner',[item('current')],[existing]);
   expect(mocks.write.mock.calls[0][1]).toMatchObject({p_expected:existing.updated_at,p_values:{status}});
 });
});

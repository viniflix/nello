import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { usePatientProgressPageController } from './usePatientProgressPageController';
const mock=vi.hoisted(()=>({read:vi.fn(),photos:vi.fn(),foundation:vi.fn()}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'synthetic-indicator-patient'}})}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
vi.mock('@/lib/supabase/progress-photos-queries',()=>({getProgressPhotos:mock.photos,deleteProgressPhoto:vi.fn(),uploadProgressPhoto:vi.fn()}));
vi.mock('@/lib/supabase/patient-queries',()=>({logActivityEvent:vi.fn()}));
vi.mock('@/features/clinical-records/api/record-foundation-queries',()=>({getPatientRecordFoundation:mock.foundation}));
vi.mock('@/infrastructure/supabase/client',()=>({supabase:{from:table=>{const call={table,filters:[],range:null,columns:null};const query={select:columns=>{call.columns=columns;return query;},order:()=>query,range:(...range)=>{call.range=range;return query;},limit:limit=>{call.limit=limit;return query;},then:(resolve,reject)=>Promise.resolve(mock.read(call)).then(resolve,reject)};for(const operation of ['eq','gt','lt','gte','lte'])query[operation]=(...args)=>{call.filters.push([operation,...args]);return query;};return query;}}}));
beforeEach(()=>{mock.photos.mockReset().mockResolvedValue({data:[]});mock.foundation.mockReset().mockResolvedValue({data:{records:[]}});mock.read.mockReset().mockResolvedValue({data:[],error:null});});
const card=(result,id)=>result.current.indicatorCards.find(card=>card.id===id).value;
it('shows an older valid current weight even when the first history page contains only newer height records',async()=>{
 mock.read.mockImplementation(call=>({data:call.table==='growth_records'?(call.filters.some(filter=>filter[0]==='gt')?[{id:'old-weight',weight:71,record_date:'2026-01-01'}]:Array.from({length:100},(_,id)=>({id:'height-'+id,height:170,weight:null,record_date:'2026-10-20'}))):[],error:null}));
 const {result}=renderHook(()=>usePatientProgressPageController());
 await waitFor(()=>expect(card(result,'peso')).toBe('71.0 kg'));
 expect(result.current.sortedMeasurementsData).toHaveLength(100);
});
it('uses creation time to select the same current origin as the home indicator',async()=>{
 mock.read.mockImplementation(call=>({data:call.table==='growth_records'?[{id:'clinical',weight:70,record_date:'2026-10-20',created_at:'2026-10-20T10:00:00Z'}]:call.table==='patient_progress_measurements'?[{id:'self',weight:71,record_date:'2026-10-20',created_at:'2026-10-20T11:00:00Z'}]:[],error:null}));
 const {result}=renderHook(()=>usePatientProgressPageController());await waitFor(()=>expect(card(result,'peso')).toBe('71.0 kg'));
});
it('does not turn a boolean weight or invalid glucose into a displayed current value',async()=>{
 mock.read.mockImplementation(call=>({data:call.table==='growth_records'?[{id:'bad',weight:false,record_date:'2026-10-22'},{id:'valid',weight:70,record_date:'2026-10-20'}]:call.table==='glycemia_records'?[{id:'bad-glucose',value:1000,date:'2026-10-22'},{id:'valid-glucose',value:99,date:'2026-10-20'}]:[],error:null}));
 const {result}=renderHook(()=>usePatientProgressPageController());await waitFor(()=>expect(card(result,'glicemia')).toBe('99 mg/dL'));expect(card(result,'peso')).toBe('70.0 kg');
});
it('clears the whole progress context after denial and ignores a late glucose response',async()=>{
 mock.read.mockImplementation(call=>({data:call.table==='growth_records'?[{id:'clinical',weight:70,record_date:'2026-10-20'}]:call.table==='patient_progress_measurements'?[{id:'self',weight:71,record_date:'2026-10-21'}]:[],error:null}));
 const {result}=renderHook(()=>usePatientProgressPageController());await waitFor(()=>expect(card(result,'peso')).toBe('71.0 kg'));
 let resolve;const late=new Promise(r=>{resolve=r;});mock.read.mockImplementation(call=>call.table==='growth_records'?{data:null,error:{status:403}}:call.table==='glycemia_records'?late:{data:[{id:'self',weight:71,record_date:'2026-10-21'}],error:null});
 await act(async()=>{void result.current.loadProgressData();});await waitFor(()=>expect(card(result,'peso')).toBe('Indisponível'));
 await act(async()=>resolve({data:[{id:'late',value:150,date:'2026-10-22'}],error:null}));
 expect(result.current.sortedWeightData).toEqual([]);expect(result.current.sortedGlycemiaData).toEqual([]);
});

it('clears paginated history after a denied next-page read',async()=>{
 const rows=Array.from({length:100},(_,id)=>({id:'history-'+id,weight:70,record_date:'2026-10-20'}));
 mock.read.mockImplementation(call=>call.range?.[0]>0?{data:null,error:{status:403}}:{data:call.table==='growth_records'?rows.slice(0,call.limit||100):[],error:null});
 const {result}=renderHook(()=>usePatientProgressPageController());await waitFor(()=>expect(result.current.hasMoreHistory).toBe(true));
 await act(async()=>result.current.loadMoreHistory());
 expect(result.current.sortedWeightData).toEqual([]);expect(card(result,'peso')).toBe('Indisponível');
});

const deferredRead=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
it('preserves complete measurements and notes when narrow current-weight rows overlap history',async()=>{
 const full={id:1,weight:70,height:170,notes:'Synthetic complete measurement',record_date:'2026-10-20',created_at:'2026-10-20T10:00:00Z',status:'active',is_latest_revision:true};
 mock.read.mockImplementation(call=>({data:call.table==='growth_records'?[Object.fromEntries(call.columns.split(',').map(key=>key.trim()).filter(key=>Object.hasOwn(full,key)).map(key=>[key,full[key]]))]:[],error:null}));
 const {result}=renderHook(()=>usePatientProgressPageController());await waitFor(()=>expect(card(result,'peso')).toBe('70.0 kg'));
 expect(result.current.sortedWeightData[0]).toMatchObject({height:170,notes:'Synthetic complete measurement'});
 expect(result.current.timeline.find(row=>row.id===1)).toMatchObject({kind:'anthropometry',height:170,notes:'Synthetic complete measurement'});
});
it('observes a late access denial even after a sibling current-weight source failed transiently',async()=>{
 let phase='initial';const denied=deferredRead();
 mock.read.mockImplementation(call=>phase==='refresh'&&call.limit?call.table==='growth_records'?{data:null,error:{status:503}}:denied.promise:{data:call.table==='growth_records'?[{id:1,weight:70,record_date:'2026-10-20'}]:call.table==='patient_progress_measurements'?[{id:2,weight:71,record_date:'2026-10-21'}]:[],error:null});
 const {result}=renderHook(()=>usePatientProgressPageController());await waitFor(()=>expect(card(result,'peso')).toBe('71.0 kg'));phase='refresh';
 await act(async()=>{void result.current.loadProgressData();});await act(async()=>denied.resolve({data:null,error:{status:403}}));
 await waitFor(()=>expect(card(result,'peso')).toBe('Indisponível'));expect(result.current.sortedWeightData).toEqual([]);
});
it('keeps a healthy current self weight when the independent clinical source fails',async()=>{
 mock.read.mockImplementation(call=>call.table==='growth_records'?{data:null,error:{status:503}}:{data:call.table==='patient_progress_measurements'?[{id:2,weight:71,record_date:'2026-10-21'}]:[],error:null});
 const {result}=renderHook(()=>usePatientProgressPageController());await waitFor(()=>expect(card(result,'peso')).toBe('71.0 kg'));expect(result.current.resources.peso.error).toBeTruthy();
});
it('does not republish a late next page after denial during the same read generation',async()=>{
 const denial=deferredRead(),page=deferredRead(),retry=deferredRead();let phase='initial';
 const rows=Array.from({length:100},(_,id)=>({id,weight:70,record_date:'2026-10-20'}));
 mock.read.mockImplementation(call=>{
  if(call.range?.[0]>0)return call.table==='growth_records'?page.promise:{data:[],error:null};
  if(phase==='retry')return call.table==='growth_records'?retry.promise:{data:[],error:null};
  if(call.table==='growth_records'&&call.limit)return denial.promise;
  return {data:call.table==='growth_records'?rows.slice(0,call.limit||100):[],error:null};
 });
 const {result}=renderHook(()=>usePatientProgressPageController());await waitFor(()=>expect(result.current.hasMoreHistory).toBe(true));await waitFor(()=>expect(result.current.loadingMoreHistory).toBe(false));
 let more;await act(async()=>{more=result.current.loadMoreHistory();});
 await act(async()=>denial.resolve({data:null,error:{status:403}}));await waitFor(()=>expect(card(result,'peso')).toBe('Indisponível'));
 await act(async()=>{page.resolve({data:[{id:999,weight:91,record_date:'2026-10-23'}],error:null});await more;});
 phase='retry';await act(async()=>{void result.current.loadProgressData();});await waitFor(()=>expect(result.current.resources.glicemia.hasSnapshot).toBe(true));
 expect(result.current.sortedWeightData.some(row=>row.weight===91)).toBe(false);
 await act(async()=>retry.resolve({data:[],error:null}));
});
it('ignores a stale denied page instead of clearing a newer confirmed refresh',async()=>{
 const page=deferredRead();let refreshed=false;
 mock.read.mockImplementation(call=>call.range?.[0]>0?page.promise:{data:call.table==='growth_records'?Array.from({length:call.limit||100},(_,id)=>({id,weight:refreshed?80:70,record_date:'2026-10-20'})):[],error:null});
 const {result}=renderHook(()=>usePatientProgressPageController());await waitFor(()=>expect(result.current.hasMoreHistory).toBe(true));let more;
 await act(async()=>{more=result.current.loadMoreHistory();});refreshed=true;await act(async()=>result.current.loadProgressData());expect(card(result,'peso')).toBe('80.0 kg');
 await act(async()=>{page.reject({status:403});await more;});
 expect(card(result,'peso')).toBe('80.0 kg');expect(result.current.resources.peso.error).toBeFalsy();
});

it('does not hide a denied page behind a sibling transient page error',async()=>{
 mock.read.mockImplementation(call=>call.range?.[0]>0?call.table==='growth_records'?{data:null,error:{status:503}}:call.table==='patient_progress_measurements'?{data:null,error:{status:403}}:{data:[],error:null}:{data:call.table==='growth_records'?Array.from({length:call.limit||100},(_,id)=>({id,weight:70,record_date:'2026-10-20'})):[],error:null});
 const {result}=renderHook(()=>usePatientProgressPageController());await waitFor(()=>expect(result.current.hasMoreHistory).toBe(true));
 await act(async()=>result.current.loadMoreHistory());expect(card(result,'peso')).toBe('Indisponível');expect(result.current.sortedWeightData).toEqual([]);
});

it('waits for the current history refresh before requesting another page',async()=>{
 let refresh=false,release;const held=new Promise(r=>{release=r;});const rows=Array.from({length:100},(_,id)=>({id,weight:70,record_date:'2026-10-20'}));
 mock.read.mockImplementation(call=>call.range?.[0]>0?{data:call.table==='growth_records'?[{id:100,weight:71,record_date:'2026-10-19'}]:[],error:null}:refresh&&call.table==='growth_records'&&!call.limit?held:{data:call.table==='growth_records'?rows.slice(0,call.limit||100):[],error:null});
 const {result}=renderHook(()=>usePatientProgressPageController());await waitFor(()=>expect(result.current.hasMoreHistory).toBe(true));await waitFor(()=>expect(result.current.loadingMoreHistory).toBe(false));refresh=true;
 await act(async()=>{void result.current.loadProgressData();});expect(result.current.loadingMoreHistory).toBe(true);
 await act(async()=>result.current.loadMoreHistory());expect(mock.read.mock.calls.filter(([call])=>call.range?.[0]>0)).toHaveLength(0);
 await act(async()=>release({data:rows,error:null}));await waitFor(()=>expect(result.current.loadingMoreHistory).toBe(false));
 await act(async()=>result.current.loadMoreHistory());expect(result.current.sortedWeightData).toHaveLength(101);
});

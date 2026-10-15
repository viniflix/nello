import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {renderHook,waitFor,act} from '@testing-library/react';
import {useDashboardController} from './useDashboardController';
const mocks=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn(),capture:vi.fn(()=> '00000000-0000-4000-8000-000000000000'),track:vi.fn()}));
vi.mock('@/infrastructure/supabase/client',()=>({supabase:{from:mocks.from,rpc:mocks.rpc}}));
vi.mock('@/infrastructure/observability/telemetry',()=>({captureOperationalError:mocks.capture}));
vi.mock('@/infrastructure/analytics/posthog',()=>({Events:{DATA_LOAD_TIMING:'timing'},track:mocks.track}));
let resolveQuery;
let resolveScope;
afterEach(()=>vi.useRealTimers());
beforeEach(()=>{
 vi.clearAllMocks();resolveQuery=({table})=>({data:table==='user_profiles'?[{id:'p',created_at:new Date().toISOString()}]:[],count:3,error:null});
 resolveScope=()=>({data:[{id:'p',care_episode_id:'episode'}],error:null});
 const request=table=>{
   const spec={table};const chain={then:(resolve,reject)=>Promise.resolve().then(()=>resolveQuery(spec)).then(resolve,reject)};
   for(const method of ['select','eq','gte','lt','lte','in','order','limit','abortSignal'])chain[method]=(...args)=>{spec[method]=args;return chain;};
   return chain;
 };
 mocks.from.mockImplementation(request);
 mocks.rpc.mockImplementation(()=>{
   const chain={abortSignal:()=>chain,then:(resolve,reject)=>Promise.resolve().then(resolveScope).then(resolve,reject)};
   return chain;
 });
});
it('does not replace confirmed dashboard resources with initial loaders on refresh',async()=>{
 const user={id:'synthetic-dashboard'};
 const {result}=renderHook(()=>useDashboardController({user}));
 await waitFor(()=>expect(result.current.statsLoading||result.current.appointmentsLoading||result.current.noShowLoading).toBe(false));
 resolveQuery=()=>new Promise(()=>{});resolveScope=()=>new Promise(()=>{});
 act(()=>result.current.retry());
 expect(result.current.statsLoading).toBe(false);
 expect(result.current.appointmentsLoading).toBe(false);
 expect(result.current.noShowLoading).toBe(false);
});
it('removes a denied confirmed patients snapshot',async()=>{
 const user={id:'synthetic-dashboard'};
 const {result}=renderHook(()=>useDashboardController({user}));
 await waitFor(()=>expect(result.current.patients).toHaveLength(1));
 resolveScope=()=>({data:null,error:{status:403}});
 await act(async()=>result.current.retry());
 await waitFor(()=>expect(result.current.failures.stats).toBeDefined());
 expect(result.current.patients).toEqual([]);
});
it('publishes appointments while count reads are still pending',async()=>{
 resolveQuery=spec=>spec.table==='appointments'&&spec.select?.[1]?.head
   ?new Promise(()=>{})
   :{data:spec.table==='appointments'?[{id:'synthetic',start_time:new Date().toISOString()}]:[],error:null};
 const {result}=renderHook(()=>useDashboardController({user:{id:'synthetic-dashboard'}}));
 await waitFor(()=>expect(result.current.appointments).toHaveLength(1));
 expect(result.current.appointmentsLoading).toBe(false);
 expect(result.current.resources.total.pending).toBe(true);
});

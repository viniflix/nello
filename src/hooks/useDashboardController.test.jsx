import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {renderHook,waitFor,act} from '@testing-library/react';
import {useDashboardController} from './useDashboardController';
const mocks=vi.hoisted(()=>({from:vi.fn(),capture:vi.fn(()=> '00000000-0000-4000-8000-000000000000'),track:vi.fn()}));
vi.mock('@/lib/customSupabaseClient',()=>({supabase:{from:mocks.from}}));
vi.mock('@/infrastructure/observability/telemetry',()=>({captureOperationalError:mocks.capture}));
vi.mock('@/infrastructure/analytics/posthog',()=>({Events:{DATA_LOAD_TIMING:'timing'},track:mocks.track}));
let resolveQuery;
afterEach(()=>vi.useRealTimers());
beforeEach(()=>{
 vi.clearAllMocks();resolveQuery=({table})=>({data:table==='user_profiles'?[{id:'p',created_at:new Date().toISOString()}]:[],count:3,error:null});
 mocks.from.mockImplementation(table=>{
   const spec={table};const chain={then:(resolve,reject)=>Promise.resolve().then(()=>resolveQuery(spec)).then(resolve,reject)};
   for(const method of ['select','eq','gte','lt','lte','in','order','limit','abortSignal'])chain[method]=(...args)=>{spec[method]=args;return chain;};
   return chain;
 });
});
it('does not refetch because the Auth profile object or toast callback changes identity',async()=>{
 const {result,rerender}=renderHook(({user})=>useDashboardController({user,toast:()=>{}}),{initialProps:{user:{id:'a'}}});
 await waitFor(()=>expect(result.current.statsLoading).toBe(false));const count=mocks.from.mock.calls.length;
 rerender({user:{id:'a',profile:{name:'updated'}}});expect(mocks.from).toHaveBeenCalledTimes(count);
});
it('keeps the agenda and a successful counter when another counter rejects',async()=>{
 resolveQuery=spec=>spec.table==='appointments'&&spec.select?.[1]?.head&&spec.lt?Promise.reject(new TypeError('Failed to fetch')):{data:spec.table==='appointments'?[{id:'appointment'}]:[],count:4,error:null};
 const {result}=renderHook(()=>useDashboardController({user:{id:'a'}}));await waitFor(()=>expect(result.current.appointmentsLoading).toBe(false));
 expect(result.current.appointments).toEqual([{id:'appointment'}]);expect(result.current.appointmentsTotalCount).toBe(4);expect(result.current.failures.today_count?.kind).toBe('network');expect(result.current.failures.appointments).toBeUndefined();
});
it('contains simultaneous outage without destructive toasts and recovers explicitly',async()=>{
 const toast=vi.fn();resolveQuery=()=>Promise.reject(new TypeError('Failed to fetch PRIVATE'));
 const {result}=renderHook(()=>useDashboardController({user:{id:'a'},toast}));await waitFor(()=>expect(Object.keys(result.current.failures)).toHaveLength(3));
 expect(toast).not.toHaveBeenCalled();expect(JSON.stringify(result.current.failures)).not.toContain('PRIVATE');
 resolveQuery=()=>({data:[],count:0,error:null});act(()=>result.current.retry());await waitFor(()=>expect(Object.keys(result.current.failures)).toHaveLength(0));
});
it('never adopts late patient data after switching accounts',async()=>{
 let finish,first=true;resolveQuery=spec=>spec.table==='user_profiles'&&first?(first=false,new Promise(resolve=>{finish=resolve})):{data:[],count:0,error:null};
 const {result,rerender}=renderHook(({id})=>useDashboardController({user:{id}}),{initialProps:{id:'old'}});await waitFor(()=>expect(finish).toBeTypeOf('function'));
 rerender({id:'new'});await waitFor(()=>expect(result.current.statsLoading).toBe(false));await act(async()=>finish({data:[{id:'old-private'}],error:null}));expect(result.current.patients).toEqual([]);
});
it('keeps the rate when only canceled appointments are unavailable',async()=>{
 resolveQuery=spec=>spec.in?.[1]?.includes('canceled')?{error:{status:403}}:{data:[],count:3,error:null};
 const {result}=renderHook(()=>useDashboardController({user:{id:'a'}}));await waitFor(()=>expect(result.current.noShowLoading).toBe(false));expect(result.current.noShowStats.noShowRate).toBe(50);expect(result.current.noShowStats.canceledCount).toBe('—');expect(result.current.failures.canceled_count.kind).toBe('forbidden');
});
it('ends a stalled read with a recoverable timeout and cancels its actual request',async()=>{
 vi.useFakeTimers();resolveQuery=spec=>new Promise((resolve,reject)=>spec.abortSignal[0].addEventListener('abort',()=>reject(spec.abortSignal[0].reason),{once:true}));
 const {result}=renderHook(()=>useDashboardController({user:{id:'a'}}));await act(async()=>{await vi.advanceTimersByTimeAsync(15001);});
 expect(result.current.statsLoading).toBe(false);expect(result.current.failures.stats.kind).toBe('timeout');expect(result.current.failures.appointments.kind).toBe('timeout');
});

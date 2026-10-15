import {readRequest} from './readRequest';
import React from 'react';
import {act,renderHook,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {createClient} from '@supabase/supabase-js';
import {afterEach,expect,it,vi} from 'vitest';
import {fetchAppointmentsInPeriod} from './agenda-list-queries';
import {isExpectedRequestCancellation} from './query-helpers';
import {queryClientOptions} from '@/app/config/queryClient';
import {useProfile} from '@/hooks/useProfile';
const m=vi.hoisted(()=>({client:null}));
vi.mock('@/infrastructure/supabase/domainClients',()=>({agendaClient:{from:(...args)=>m.client.from(...args)}}));
vi.mock('@/infrastructure/supabase/client',()=>({supabase:{from:(...args)=>m.client.from(...args)}}));
vi.mock('@/infrastructure/analytics/posthog',()=>({track:vi.fn(),Events:{}}));
afterEach(()=>vi.useRealTimers());
function client(fetch){return createClient('http://127.0.0.1:54321','synthetic-public-anon',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch}})}
it('caps the Agenda SDK plus Query transport budget instead of multiplying attempts',async()=>{
 vi.useFakeTimers();const fetch=vi.fn(async()=>new Response(JSON.stringify({message:'Unavailable'}),{status:503,headers:{'Content-Type':'application/json','Retry-After':'0'}}));m.client=client(fetch);const q=new QueryClient(queryClientOptions);let done=false;
 const work=q.fetchQuery({queryKey:['qa-agenda-budget'],queryFn:()=>fetchAppointmentsInPeriod('fictitious-owner')}).catch(error=>error).finally(()=>{done=true});
 for(let i=0;i<25&&!done;i++)await vi.advanceTimersByTimeAsync(1000);await work;expect(fetch.mock.calls.length).toBeLessThanOrEqual(2);q.clear();
});
it('treats a deadline abort as a recoverable timeout instead of navigation cancellation',()=>{
 const controller=new AbortController();controller.abort(new DOMException('read_deadline','TimeoutError'));expect(isExpectedRequestCancellation(new DOMException('Aborted','AbortError'),controller.signal)).toBe(false);
});
it('does not retry a forbidden profile',async()=>{
 const fetch=vi.fn(async()=>new Response(JSON.stringify({code:'42501',message:'Denied'}),{status:403,headers:{'Content-Type':'application/json'}}));m.client=client(fetch);const q=new QueryClient({defaultOptions:{queries:{retry:false}}});const wrapper=({children})=><QueryClientProvider client={q}>{children}</QueryClientProvider>;const h=renderHook(()=>useProfile('fictitious-profile'),{wrapper});await waitFor(()=>expect(h.result.current.isError).toBe(true),{timeout:3000});expect(fetch).toHaveBeenCalledTimes(1);h.unmount();q.clear();
});

it('respects the real SDK Retry-After header without exposing headers in Result',async()=>{
 const fetch=vi.fn(async()=>new Response(JSON.stringify({message:'Unavailable'}),{status:503,headers:{'Content-Type':'application/json','Retry-After':'60'}}));m.client=client(fetch);await expect(fetchAppointmentsInPeriod('fictitious-hint')).rejects.toMatchObject({status:503});expect(fetch).toHaveBeenCalledTimes(1);
});

it('requires explicit RPC read retry classification instead of replaying arbitrary POST',async()=>{
 const fetch=vi.fn(async()=>new Response(JSON.stringify({message:'Unavailable'}),{status:503,headers:{'Content-Type':'application/json'}}));m.client=client(fetch);
 const conservative=await readRequest(()=>m.client.rpc('synthetic_unclassified_rpc'));expect(conservative.error).toBeTruthy();expect(fetch).toHaveBeenCalledTimes(1);
 fetch.mockClear();await readRequest(()=>m.client.rpc('synthetic_explicit_read'),{rpcRead:true});expect(fetch).toHaveBeenCalledTimes(2);
});

import React from 'react';
import {act,renderHook,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {it,expect,vi} from 'vitest';
import {useAdminSource} from './useAdminSource';
import {invalidateDomain} from '@/infrastructure/realtime/events';
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'e05-source'}})}));
function setup(){const client=new QueryClient();const wrapper=({children})=><QueryClientProvider client={client}>{children}</QueryClientProvider>;return {client,wrapper}}
it('reuses a fresh source on navigation rather than fetching it again',async()=>{
 const {client,wrapper}=setup();const loader=vi.fn().mockResolvedValue({data:{value:1}});const a=renderHook(()=>({...useAdminSource('fresh',loader)}),{wrapper});await waitFor(()=>expect(a.result.current.data?.value).toBe(1));a.unmount();await new Promise(r=>setTimeout(r,15));
 const b=renderHook(()=>({...useAdminSource('fresh',loader)}),{wrapper});await waitFor(()=>expect(b.result.current.data?.value).toBe(1));expect(loader).toHaveBeenCalledTimes(1);b.unmount();client.clear();
});
it('passes an abort signal to the source and cancels on unmount',async()=>{
 const {client,wrapper}=setup();let signal;const loader=vi.fn(options=>{signal=options?.signal;return new Promise(()=>{})});const a=renderHook(()=>({...useAdminSource('cancel',loader)}),{wrapper});await waitFor(()=>expect(loader).toHaveBeenCalledTimes(1));expect(signal).toBeInstanceOf(AbortSignal);a.unmount();expect(signal.aborted).toBe(true);client.clear();
});
it('immediately masks and re-reads a source after an access boundary',async()=>{
 const {client,wrapper}=setup();let finish;const loader=vi.fn().mockResolvedValueOnce({data:{value:'private'}}).mockImplementation(()=>new Promise(r=>finish=r));const a=renderHook(()=>({...useAdminSource('access',loader)}),{wrapper});await waitFor(()=>expect(a.result.current.data?.value).toBe('private'));
 act(()=>invalidateDomain('e05-source','access'));expect(a.result.current.data).toBeUndefined();await waitFor(()=>expect(loader).toHaveBeenCalledTimes(2));await act(async()=>finish({data:{value:'authorized'}}));await waitFor(()=>expect(a.result.current.data?.value).toBe('authorized'));a.unmount();client.clear();
});

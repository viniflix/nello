import React from 'react';
import {act,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider,useQuery} from '@tanstack/react-query';
import {expect,it,vi} from 'vitest';
import {RealtimeProvider} from './RealtimeContext';
import {invalidateDomain} from '@/infrastructure/realtime/events';
import {useQueryResource} from '@/hooks/useQueryResource';
const mock=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'synthetic-a'}})}));
vi.mock('@/infrastructure/supabase/client',()=>({supabase:{
 rpc:async()=>({error:{status:503}}),
 auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe:()=>{}}}})}
}}));
function Probe(){const q=useQuery({queryKey:['notifications','synthetic-a'],queryFn:mock.read});const r=useQueryResource(q,JSON.stringify(['synthetic-a','notices']),[]);return <output>{r.data.join(',')||'hidden'}</output>}
it('cancels a pre-revocation Query result, including notifications, and restores only newly permitted history',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});mock.read.mockResolvedValue(['private-before']);
 const view=render(<QueryClientProvider client={client}><RealtimeProvider><Probe/></RealtimeProvider></QueryClientProvider>);await screen.findByText('private-before');
 let finish;mock.read.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValue(['permitted-history']);
 let pending;act(()=>{pending=client.refetchQueries({queryKey:['notifications','synthetic-a']})});await waitFor(()=>expect(finish).toBeTypeOf('function'));
 act(()=>invalidateDomain('synthetic-a','access'));await screen.findByText('permitted-history');
 await act(async()=>{finish(['late-private']);await pending});expect(screen.queryByText('late-private')).not.toBeInTheDocument();
 expect(client.getQueryData(['notifications','synthetic-a'])).toEqual(['permitted-history']);view.unmount();client.clear();
});

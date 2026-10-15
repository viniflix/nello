import React,{useEffect} from 'react';
import {act,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {ChatProvider,useChat} from './ChatContext';
import {invalidateDomain} from '@/infrastructure/realtime/events';
const state=vi.hoisted(()=>({rpc:vi.fn(),chat:null}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'synthetic-a'}})}));
vi.mock('@/components/ui/use-toast',()=>({useToast:()=>({toast:()=>{}})}));
vi.mock('@/infrastructure/supabase/client',()=>({supabase:{rpc:state.rpc,auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe:vi.fn()}}})}}}));
function Probe(){const c=useChat();state.chat=c;useEffect(()=>{void c.fetchMessages('synthetic-a','synthetic-peer')},[c.fetchMessages]);return <output>{c.messages.length}:{c.totalUnreadMessages}</output>}
beforeEach(()=>{state.rpc.mockImplementation(async name=>({data:name==='list_chat_messages'?{messages:[{id:'1',created_at:'2026-10-13T10:00:00Z'}],has_more:false}:[{recipient_id:'synthetic-peer',unread_count:2}]}))});
it('does not retain a denied chat snapshot on an ordinary refresh',async()=>{
 render(<ChatProvider><Probe/></ChatProvider>);await screen.findByText('1:2');state.rpc.mockResolvedValue({error:{status:403}});
 await act(async()=>state.chat.fetchMessages('synthetic-a','synthetic-peer',{refresh:true}));expect(state.chat.messages).toEqual([]);
});
it('ignores a send acknowledgment after access changed and prevents a new send until authorized reread',async()=>{
 render(<ChatProvider><Probe/></ChatProvider>);await screen.findByText('1:2');let finish;
 state.rpc.mockImplementation(name=>name==='send_chat_message'?new Promise(resolve=>{finish=resolve}):Promise.resolve({error:{status:403}}));
 let sending;act(()=>{sending=state.chat.sendMessage({to_id:'synthetic-peer',message:'Synthetic',client_message_id:'synthetic-intent'})});
 act(()=>invalidateDomain('synthetic-a','access'));await waitFor(()=>expect(state.chat.messages).toEqual([]));
 await act(async()=>finish({data:{id:'2',created_at:'2026-10-13T10:01:00Z'}}));expect(await sending).toBeNull();
 const before=state.rpc.mock.calls.filter(([name])=>name==='send_chat_message').length;
 await act(async()=>state.chat.sendMessage({to_id:'synthetic-peer',message:'Synthetic',client_message_id:'synthetic-new'}));
 expect(state.rpc.mock.calls.filter(([name])=>name==='send_chat_message')).toHaveLength(before);
});

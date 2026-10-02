import React, { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ChatProvider, useChat } from './ChatContext';
import { invalidateDomain } from '@/infrastructure/realtime/events';
const mock=vi.hoisted(()=>({rpc:vi.fn(),denied:false}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'actor'}})}));
vi.mock('@/components/ui/use-toast',()=>({useToast:()=>({toast:()=>{}})}));
vi.mock('@/lib/customSupabaseClient',()=>({supabase:{rpc:mock.rpc,auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe:vi.fn()}}})}}}));
function Probe(){const chat=useChat();const {fetchMessages}=chat;useEffect(()=>{void fetchMessages('actor','peer');},[fetchMessages]);return <output>{chat.messages.length}:{chat.totalUnreadMessages}</output>;}
it('immediately removes previously loaded chat/counters when access changes and the API now refuses the actor',async()=>{
 mock.denied=false;mock.rpc.mockImplementation(async name=>mock.denied?{error:{code:'42501'}}:{error:null,data:name==='list_chat_messages'?{messages:[{id:'1',from_id:'actor',to_id:'peer',created_at:'2026-10-01T10:00:00Z'}],has_more:false}:[{recipient_id:'peer',unread_count:2}]});
 const view=render(<ChatProvider><Probe/></ChatProvider>);await waitFor(()=>expect(screen.getByText('1:2')).toBeInTheDocument());
 mock.denied=true;invalidateDomain('actor','access');await waitFor(()=>expect(screen.getByText('0:0')).toBeInTheDocument());view.unmount();
});

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { RealtimeProvider } from './RealtimeContext';
import {invalidateDomain} from '@/infrastructure/realtime/events';
import { useOnlinePresence } from '@/hooks/useOnlinePresence';
const mock=vi.hoisted(()=>({user:{id:'a'},rpc:vi.fn(),channel:vi.fn(),remove:vi.fn(),setAuth:vi.fn(),authChanged:null,query:{invalidateQueries:vi.fn(),resetQueries:vi.fn()},listeners:[]}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:mock.user})}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>mock.query}));
vi.mock('@/infrastructure/supabase/client',()=>({supabase:{rpc:mock.rpc,channel:mock.channel,removeChannel:mock.remove,realtime:{setAuth:mock.setAuth},auth:{onAuthStateChange:fn=>{mock.authChanged=fn;return{data:{subscription:{unsubscribe:vi.fn()}}};}}}}));
function Probe(){const p=useOnlinePresence();return <><output>{p.connection}:{String(p.isUserOnline('peer'))}:{String(p.isUserTyping('peer'))}</output><button onClick={()=>p.setTyping(true,'peer')}>typing</button></>;}
beforeEach(()=>{
 vi.clearAllMocks();mock.user={id:'a'};mock.listeners=[];
 mock.rpc.mockImplementation(async name=>({data:name==='get_realtime_inbox'?'inbox:00000000-0000-0000-0000-000000000001':[{id:'peer',online:true,typing:true,online_until:new Date(Date.now()+75000).toISOString(),typing_until:new Date(Date.now()+5000).toISOString()}],error:null}));
 mock.channel.mockImplementation(()=>{const channel={on:vi.fn(()=>channel),subscribe:vi.fn(fn=>{mock.listeners.push(fn);return channel;})};return channel;});
});
it('keeps one private channel while typing and profile renders change, and binds lease requests to the initiating account',async()=>{
 const view=render(<RealtimeProvider><Probe/></RealtimeProvider>);await waitFor(()=>expect(mock.channel).toHaveBeenCalledTimes(1));
 expect(mock.channel.mock.calls[0][1].config.private).toBe(true);
 await act(async()=>{mock.listeners[0]('SUBSCRIBED');});await waitFor(()=>expect(screen.getByText('connected:true:true')).toBeInTheDocument());
 fireEvent.click(screen.getByText('typing'));mock.user={id:'a',profile:{name:'updated'}};view.rerender(<RealtimeProvider><Probe/></RealtimeProvider>);
 await waitFor(()=>expect(mock.rpc).toHaveBeenCalledWith('update_chat_presence',expect.objectContaining({p_actor:'a',p_recipient:'peer',p_typing:true})),{timeout:2000});
 expect(mock.channel).toHaveBeenCalledTimes(1);view.unmount();expect(mock.remove).toHaveBeenCalledTimes(1);
});
it('fences an old inbox bootstrap when the account changes and cleans up the previous subscriptions',async()=>{
 let resolve;mock.rpc.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 const view=render(<RealtimeProvider><Probe/></RealtimeProvider>);mock.user={id:'b'};view.rerender(<RealtimeProvider><Probe/></RealtimeProvider>);
 await waitFor(()=>expect(mock.channel).toHaveBeenCalledTimes(1));await act(async()=>{resolve({data:'inbox:00000000-0000-0000-0000-000000000002',error:null});});
 expect(mock.channel).toHaveBeenCalledTimes(1);expect(mock.rpc).toHaveBeenCalledWith('get_realtime_inbox',{p_actor:'b'});view.unmount();
});
it('clears presence immediately on an Auth session change before the context rerenders',async()=>{
 const view=render(<RealtimeProvider><Probe/></RealtimeProvider>);await waitFor(()=>expect(mock.channel).toHaveBeenCalledTimes(1));
 await act(async()=>{mock.listeners[0]('SUBSCRIBED');});await waitFor(()=>expect(screen.getByText('connected:true:true')).toBeInTheDocument());
 act(()=>mock.authChanged('SIGNED_OUT',null));expect(screen.getByText('connected:false:false')).toBeInTheDocument();view.unmount();
});

it('reconciles the last presence signal during a flight without adding presence writes',async()=>{
 const finishes=[];mock.rpc.mockImplementation(name=>name==='get_chat_presence'?new Promise(resolve=>finishes.push(resolve)):Promise.resolve({data:name==='get_realtime_inbox'?'inbox:00000000-0000-0000-0000-000000000001':[],error:null}));
 const view=render(<RealtimeProvider><Probe/></RealtimeProvider>);await waitFor(()=>expect(mock.channel).toHaveBeenCalledTimes(1));
 act(()=>invalidateDomain('a','presence'));await waitFor(()=>expect(finishes).toHaveLength(1));
 act(()=>{for(let i=0;i<8;i++)invalidateDomain('a','presence')});await act(async()=>new Promise(r=>setTimeout(r,130)));expect(finishes).toHaveLength(1);
 await act(async()=>finishes.shift()({data:[],error:null}));await waitFor(()=>expect(finishes).toHaveLength(1));
 await act(async()=>finishes.shift()({data:[{id:'peer',online:true,typing:false}],error:null}));expect(screen.getByText('connecting:true:false')).toBeInTheDocument();
 expect(mock.rpc.mock.calls.filter(([name])=>name==='get_chat_presence')).toHaveLength(2);expect(mock.rpc.mock.calls.filter(([name])=>name==='update_chat_presence')).toHaveLength(0);view.unmount();
});

it('coalesces online, visible and SUBSCRIBED reads and adds no heartbeat for window focus',async()=>{
 const visible=vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
 const view=render(<RealtimeProvider><Probe/></RealtimeProvider>);await waitFor(()=>expect(mock.channel).toHaveBeenCalledTimes(1));
 await act(async()=>{mock.listeners[0]('SUBSCRIBED');window.dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'));await new Promise(resolve=>setTimeout(resolve,130));});
 expect(mock.query.invalidateQueries).toHaveBeenCalledTimes(2);expect(mock.rpc.mock.calls.filter(([name])=>name==='get_chat_presence')).toHaveLength(1);
 const writes=mock.rpc.mock.calls.filter(([name])=>name==='update_chat_presence').length;
 await act(async()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('focus'));await new Promise(resolve=>setTimeout(resolve,130));});
 expect(mock.query.invalidateQueries).toHaveBeenCalledTimes(4);expect(mock.rpc.mock.calls.filter(([name])=>name==='update_chat_presence')).toHaveLength(writes);view.unmount();visible.mockRestore();
});

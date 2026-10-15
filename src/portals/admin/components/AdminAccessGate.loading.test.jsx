import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import AdminAccessGate from './AdminAccessGate';
const m=vi.hoisted(()=>({rpc:vi.fn(),offline:false,user:{id:'operator-e05'},saved:vi.fn()}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:m.user,isOffline:m.offline})}));
vi.mock('@/infrastructure/supabase/client',()=>({supabase:{rpc:m.rpc,auth:{mfa:{listFactors:async()=>({data:{totp:[]}})}}}}));
function Editor(){const[d,set]=useState('');return <form onSubmit={e=>{e.preventDefault();m.saved();}}><label>Texto fictício<input value={d} onChange={e=>set(e.target.value)}/></label><button>Salvar fictício</button></form>}
const tree=()=> <MemoryRouter><AdminAccessGate><Editor/></AdminAccessGate></MemoryRouter>;
beforeEach(()=>{vi.useRealTimers();m.offline=false;m.user={id:'operator-e05'};m.rpc.mockReset();m.saved.mockReset();m.rpc.mockResolvedValue({data:{eligible:true,authorized:true}})});
afterEach(()=>vi.useRealTimers());
it('joins focus and visible checks while retaining the real editor and blocking submit',async()=>{
 render(tree());const input=await screen.findByLabelText('Texto fictício');fireEvent.change(input,{target:{value:'Rascunho fictício'}});input.focus();input.setSelectionRange(1,3);
 let finish;m.rpc.mockImplementation(()=>new Promise(r=>finish=r));
 act(()=>{fireEvent.focus(window);fireEvent(document,new Event('visibilitychange'))});
 await waitFor(()=>expect(m.rpc).toHaveBeenCalledTimes(2));
 expect(screen.getByLabelText('Texto fictício')).toBe(input);expect(input).toHaveFocus();expect(input.selectionStart).toBe(1);
 fireEvent.submit(input.closest('form'));expect(m.saved).not.toHaveBeenCalled();
 await act(async()=>finish({data:true}));expect(input).toHaveValue('Rascunho fictício');expect(input).toHaveFocus();
 fireEvent.submit(input.closest('form'));expect(m.saved).toHaveBeenCalledTimes(1);
});
it('blocks writes during interval revalidation too',async()=>{
 vi.useFakeTimers();await act(async()=>{render(tree())});const input=screen.getByLabelText('Texto fictício');m.rpc.mockImplementation(()=>new Promise(()=>{}));
 act(()=>vi.advanceTimersByTime(30000));fireEvent.submit(input.closest('form'));expect(m.saved).not.toHaveBeenCalled();
});
it('closes a hung check at the deadline and ignores its late authorization',async()=>{
 render(tree());await screen.findByLabelText('Texto fictício');vi.useFakeTimers();let finish;m.rpc.mockImplementation(()=>new Promise(r=>finish=r));
 act(()=>fireEvent.focus(window));await act(async()=>vi.advanceTimersByTime(10001));
 expect(screen.getByRole('alert')).toHaveTextContent('não pôde ser validada');expect(screen.queryByLabelText('Texto fictício')).toBeNull();
 await act(async()=>finish({data:true}));expect(screen.queryByLabelText('Texto fictício')).toBeNull();
});
it('hides all work offline and requires a new server confirmation on reconnect',async()=>{
 const view=render(tree());await screen.findByLabelText('Texto fictício');m.offline=true;view.rerender(tree());expect(screen.queryByLabelText('Texto fictício')).toBeNull();
 let finish;m.rpc.mockImplementation(()=>new Promise(r=>finish=r));m.offline=false;view.rerender(tree());expect(screen.queryByLabelText('Texto fictício')).toBeNull();
 await waitFor(()=>expect(m.rpc).toHaveBeenCalledTimes(2));await act(async()=>finish({data:{eligible:true,authorized:true}}));await screen.findByLabelText('Texto fictício');
});

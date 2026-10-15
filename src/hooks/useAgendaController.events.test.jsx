import {act,renderHook,waitFor}from'@testing-library/react';import{beforeEach,it,expect,vi}from'vitest';import{useAgendaController}from'./useAgendaController';import{invalidateDomain}from'@/infrastructure/realtime/events';
const m=vi.hoisted(()=>({read:vi.fn(),toast:vi.fn()}));vi.mock('@/components/ui/use-toast',()=>({useToast:()=>({toast:m.toast})}));vi.mock('@/lib/supabase/agenda-list-queries',()=>({fetchAppointmentsInPeriod:m.read}));vi.mock('./useAgendaReferences',()=>({useAgendaReferences:()=>({patients:[],services:[]})}));vi.mock('./useAgendaDayAvailability',()=>({useAgendaDayAvailability:()=>({})}));vi.mock('@/lib/supabase/agenda-queries',()=>({createAppointmentWithFinance:vi.fn(),updateAppointment:vi.fn(),deleteAppointment:vi.fn()}));
beforeEach(()=>{m.read.mockReset();});
it('does not start a second request for any Agenda projection while its first read is pending',async()=>{
 const pending=[];m.read.mockImplementation((id,start,end,select,operation='period')=>new Promise(resolve=>pending.push({operation,resolve})));
 const hook=renderHook(()=>useAgendaController({user:{id:'e06-agenda'}}));await waitFor(()=>expect(pending).toHaveLength(3));
 await act(async()=>{for(let i=0;i<8;i++)invalidateDomain('e06-agenda','clinical');await new Promise(r=>setTimeout(r,250))});
 expect(pending).toHaveLength(3);
 await act(async()=>pending.splice(0).forEach(x=>x.resolve([])));await waitFor(()=>expect(pending).toHaveLength(3));
 await act(async()=>pending.splice(0).forEach(x=>x.resolve([])));await waitFor(()=>expect(hook.result.current.loading).toBe(false));expect(m.read).toHaveBeenCalledTimes(6);hook.unmount();
});

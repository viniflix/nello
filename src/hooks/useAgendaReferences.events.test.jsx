import{act,renderHook,waitFor}from'@testing-library/react';import{beforeEach,it,expect,vi}from'vitest';import{useAgendaReferences}from'./useAgendaReferences';import{invalidateDomain}from'@/infrastructure/realtime/events';
const m=vi.hoisted(()=>({patients:vi.fn(),services:vi.fn(),settings:vi.fn()}));vi.mock('@/lib/supabase/agenda-reference-queries',()=>({searchAgendaPatients:m.patients}));vi.mock('@/lib/supabase/financial-queries',()=>({getServices:m.services}));vi.mock('@/lib/supabase/profile-queries',()=>({getClinicSettings:m.settings}));vi.mock('@/lib/agenda/availability',()=>({readAgendaSettings:()=>({settings:{},errors:[]})}));
beforeEach(()=>{m.patients.mockReset().mockResolvedValue({patients:[]});m.services.mockReset().mockResolvedValue([]);m.settings.mockReset().mockResolvedValue({});});
it('merges profile and clinical in one opportunity and reconciles signals received during the read',async()=>{
 const h=renderHook(()=>useAgendaReferences('e06-refs'));await waitFor(()=>expect(h.result.current.loading).toBe(false));let finish;m.patients.mockImplementation(()=>new Promise(r=>finish=r));
 await act(async()=>{invalidateDomain('e06-refs','profile');invalidateDomain('e06-refs','clinical');await new Promise(r=>setTimeout(r,250))});expect(m.patients).toHaveBeenCalledTimes(2);
 await act(async()=>{for(let i=0;i<8;i++)invalidateDomain('e06-refs','clinical');await new Promise(r=>setTimeout(r,250))});expect(m.patients).toHaveBeenCalledTimes(2);
 m.patients.mockResolvedValue({patients:[]});await act(async()=>finish({patients:[]}));await waitFor(()=>expect(m.patients).toHaveBeenCalledTimes(3));h.unmount();
});

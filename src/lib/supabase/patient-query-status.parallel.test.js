import {expect,it,vi} from 'vitest';
import {getModulesStatus} from './patient-query-status';
const harness=vi.hoisted(()=>({pending:[],calls:[]}));
vi.mock('@/infrastructure/supabase/domainClients',()=>({patientClient:{from:table=>{
 const q={select:()=>q,eq:()=>q,is:()=>q,in:()=>q,limit:()=>q,maybeSingle:()=>q,retry:()=>q,abortSignal:()=>q,
 then:(resolve,reject)=>{harness.calls.push(table);return new Promise(r=>harness.pending.push(r)).then(resolve,reject)}};return q;
}}}));
it('starts all seven independent existence checks before any response',async()=>{
 const flight=getModulesStatus('synthetic-patient');await new Promise(r=>setTimeout(r,0));
 expect(harness.calls).toHaveLength(7);
 harness.pending.forEach(resolve=>resolve({data:{id:'exists'},error:null}));
 const result=await flight;expect(result.error).toBeNull();expect(Object.values(result.data).every(x=>x==='completed')).toBe(true);
});

import {describe,it,expect} from 'vitest';
import {classifyFailure,failurePresentation,settleResources} from './failure';
describe('safe recovery categories',()=>{
 it.each([[{name:'AbortError'},'aborted'],[{name:'TimeoutError'},'timeout'],[{status:401},'unauthenticated'],[{code:'42501'},'forbidden'],[{code:'40001'},'conflict'],[{status:404},'missing'],[{status:429},'rate_limit'],[{code:'22P02'},'validation'],[{message:'Failed to fetch'},'network'],[{message:'private'},'unexpected'],[{cause:new TypeError('Failed to fetch private')},'network']])('classifies %j',(error,kind)=>expect(classifyFailure(error,true)).toBe(kind));
 it('distinguishes offline from timeout and intentional cancellation',()=>{expect(classifyFailure(new TypeError('Failed to fetch'),false)).toBe('offline');expect(classifyFailure({name:'AbortError'},false)).toBe('aborted');});
 it('never renders backend or clinical text',()=>{expect(JSON.stringify(failurePresentation(new Error('PRIVATE_PATIENT token=secret')))).not.toContain('PRIVATE_PATIENT');});
 it('retains independent success when siblings reject or return Result errors',async()=>{const error={status:403};const results=await settleResources({patients:()=>({data:[1],error:null}),meals:()=>Promise.reject(error),count:()=>({data:null,error})});expect(results.patients.data).toEqual([1]);expect(results.meals.error).toBe(error);expect(results.count.data).toBeNull();});
 it('captures synchronous throws without suppressing siblings',async()=>{const r=await settleResources({a:()=>{throw Error('private')},b:()=>[2]});expect(r.a.error).toBeTruthy();expect(r.b.data).toEqual([2]);});
});

import { expect, it, vi } from 'vitest';
import { adminReadRpc, adminReadInvoke } from './adminRead';
const m=vi.hoisted(()=>({rpc:vi.fn(),invoke:vi.fn()}));vi.mock('@/infrastructure/supabase/client',()=>({supabase:{rpc:m.rpc,functions:{invoke:m.invoke}}}));
it('attaches cancellation without changing RPC or Edge read payloads',async()=>{
 const signal=new AbortController().signal,abortSignal=vi.fn().mockResolvedValue({data:1});m.rpc.mockReturnValue({abortSignal});await adminReadRpc('qa_read',{p_page:2},{signal});expect(m.rpc).toHaveBeenCalledWith('qa_read',{p_page:2});expect(abortSignal).toHaveBeenCalledWith(expect.objectContaining({aborted:true}));
 await adminReadInvoke('qa-edge',{method:'POST',body:{action:'read'}},{signal});expect(m.invoke).toHaveBeenCalledWith('qa-edge',{method:'POST',body:{action:'read'},signal});
});

it('does not retry or rewrite ambiguous support send/sync calls',async()=>{
 m.invoke.mockReset().mockResolvedValue({error:{message:'Failed to fetch'},status:503});
 for(const action of ['send','sync']){m.invoke.mockClear();const options={method:'POST',body:{action,message_id:'fictitious-message'}};const result=await adminReadInvoke('admin-support',options);expect(result.status).toBe(503);expect(m.invoke).toHaveBeenCalledTimes(1);expect(m.invoke).toHaveBeenCalledWith('admin-support',options);}
});
it('cancels an in-flight classified RPC while preserving its payload',async()=>{
 const controller=new AbortController();let budget;m.rpc.mockReturnValue({abortSignal:signal=>{budget=signal;return new Promise(()=>{})}});const work=adminReadRpc('admin_security_overview',{p_page:1},{signal:controller.signal}).catch(error=>error);controller.abort();expect((await work).name).toBe('AbortError');expect(budget.aborted).toBe(true);expect(m.rpc).toHaveBeenCalledWith('admin_security_overview',{p_page:1});
});

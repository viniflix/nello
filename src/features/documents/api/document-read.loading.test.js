import{it,expect,vi,afterEach}from'vitest';import{verifyDocumentAuthenticity}from'./document-queries';
const api=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('@/infrastructure/supabase/domainClients',()=>({filesClient:api}));
afterEach(()=>{vi.useRealTimers();vi.resetAllMocks()});
const code='00000000-0000-4000-8000-000000000001';
it('bounds a transport ignoring abort without replaying a public rate-limited RPC',async()=>{
 vi.useFakeTimers();api.rpc.mockImplementation(()=>new Promise(()=>{}));const pending=verifyDocumentAuthenticity(code);await vi.advanceTimersByTimeAsync(10001);const result=await pending;expect(result.data).toBeNull();expect(result.error.name).toBe('TimeoutError');expect(api.rpc).toHaveBeenCalledTimes(1);expect(api.rpc).toHaveBeenCalledWith('verify_document_authenticity',{p_code:code});
});
it('makes synchronous transport failure a recoverable Result',async()=>{api.rpc.mockImplementation(()=>{throw new TypeError('Failed to fetch')});const result=await verifyDocumentAuthenticity(code);expect(result.error).toBeInstanceOf(TypeError);expect(result.data).toBeNull()});
it('does not dispatch an already cancelled valid-code read or malformed code',async()=>{const controller=new AbortController();controller.abort();const result=await verifyDocumentAuthenticity(code,{signal:controller.signal});expect(result.error.name).toBe('AbortError');expect(await verifyDocumentAuthenticity('invalid')).toEqual({data:{found:false},error:null});expect(api.rpc).not.toHaveBeenCalled()});

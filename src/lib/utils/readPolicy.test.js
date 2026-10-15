import {FunctionsHttpError} from '@supabase/supabase-js';
import {afterEach,expect,it,vi} from 'vitest';
import {executeRead,queryReadRetry,readPolicies} from './readPolicy';
import {classifyFailure} from './failure';
afterEach(()=>vi.useRealTimers());
it.each([401,403,400,409,412,429])('keeps HTTP %s terminal even when text resembles a network failure',async status=>{
 const error={message:'Failed to fetch: timeout',status};const read=vi.fn(async()=>({data:null,error}));const result=await executeRead(read);expect(read).toHaveBeenCalledTimes(1);expect(result.error).toBe(error);expect(queryReadRetry(0,error)).toBe(false);
});
it.each([503,520,502,504])('caps transient HTTP %s at two attempts with a single owner',async status=>{
 const read=vi.fn(async()=>({error:{message:'Unavailable'},status}));const result=await executeRead(read);expect(read).toHaveBeenCalledTimes(2);expect(queryReadRetry(0,result.error)).toBe(false);
});
it('bounds an abort-ignoring transport and ignores its late success',async()=>{
 vi.useFakeTimers();let finish;const read=vi.fn(()=>new Promise(resolve=>finish=resolve));let error;const work=executeRead(read,{policy:{deadlineMs:100,maxAttempts:2}}).catch(e=>error=e);await vi.advanceTimersByTimeAsync(100);await work;expect(classifyFailure(error)).toBe('timeout');finish({data:'late'});await Promise.resolve();expect(classifyFailure(error)).toBe('timeout');expect(read).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
});
it('counts retry backoff in the total deadline',async()=>{
 vi.useFakeTimers();const read=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>setTimeout(()=>resolve({error:{message:'Failed to fetch'}}),60))).mockImplementation(()=>new Promise(()=>{}));const work=executeRead(read,{policy:{deadlineMs:100,maxAttempts:2},backoffMs:20}).catch(e=>e);await vi.advanceTimersByTimeAsync(100);expect(classifyFailure(await work)).toBe('timeout');expect(read).toHaveBeenCalledTimes(2);expect(vi.getTimerCount()).toBe(0);
});
it('cancels backoff immediately without issuing a second read',async()=>{
 vi.useFakeTimers();const controller=new AbortController(),read=vi.fn(async()=>({error:{message:'Failed to fetch'}}));const work=executeRead(read,{signal:controller.signal}).catch(e=>e);await vi.advanceTimersByTimeAsync(0);controller.abort();expect(classifyFailure(await work)).toBe('aborted');await vi.advanceTimersByTimeAsync(1000);expect(read).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
});
it('bounds authorization before a retry and never resumes a discarded attempt',async()=>{
 vi.useFakeTimers();let allow;const read=vi.fn(async()=>({error:{message:'Failed to fetch'}}));const work=executeRead(read,{policy:{deadlineMs:50,maxAttempts:2},mayRetry:()=>new Promise(resolve=>allow=resolve)}).catch(e=>e);await vi.advanceTimersByTimeAsync(50);expect(classifyFailure(await work)).toBe('timeout');allow(true);await Promise.resolve();expect(read).toHaveBeenCalledTimes(1);
});
it('does not shorten Retry-After to fit a retry into an exhausted budget',async()=>{
 const read=vi.fn(async()=>({error:{message:'Unavailable',context:{headers:new Headers({'Retry-After':'60'})}},status:503}));const result=await executeRead(read,{policy:readPolicies.search});expect(result.status).toBe(503);expect(read).toHaveBeenCalledTimes(1);
});
it('never starts a pre-cancelled read',async()=>{const controller=new AbortController();controller.abort();const read=vi.fn();await expect(executeRead(read,{signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});expect(read).not.toHaveBeenCalled()});

it('links independent caller signals without requiring AbortSignal.any',async()=>{
 const any=vi.spyOn(AbortSignal,'any').mockImplementation(()=>{throw new Error('not_supported')});const first=new AbortController(),second=new AbortController();const work=executeRead(()=>new Promise(()=>{}),{signal:first.signal,additionalSignal:second.signal}).catch(error=>error);second.abort();expect(classifyFailure(await work)).toBe('aborted');expect(first.signal.aborted).toBe(false);expect(any).not.toHaveBeenCalled();any.mockRestore();
});
it('closes sibling reads after a terminal composed failure',async()=>{
 let closed=false;const error={status:403,message:'Denied'};
 await expect(executeRead(signal=>Promise.all([Promise.reject(error),new Promise(resolve=>signal.addEventListener('abort',()=>{closed=true;resolve(null)},{once:true}))]),{policy:readPolicies.collection})).rejects.toBe(error);expect(closed).toBe(true);
});

it('recognizes a real Edge SDK forbidden response behind FunctionsHttpError.context',async()=>{
 const error=new FunctionsHttpError(new Response('Denied',{status:403})),read=vi.fn(async()=>({error}));expect(classifyFailure(error)).toBe('forbidden');expect((await executeRead(read)).error).toBe(error);expect(read).toHaveBeenCalledTimes(1);
});

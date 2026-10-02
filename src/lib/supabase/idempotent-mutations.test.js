import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { supabase } from '@/lib/customSupabaseClient';
import { clearMutationIntents, idempotentRpc } from './idempotent-mutations';
vi.mock('@/lib/customSupabaseClient',()=>({supabase:{auth:{getSession:vi.fn(),onAuthStateChange:vi.fn()},rpc:vi.fn()}}));
describe('same-account manual retry contract',()=>{
  beforeEach(()=>{clearMutationIntents();vi.stubGlobal('crypto',webcrypto);supabase.auth.getSession.mockResolvedValue({data:{session:{user:{id:'actor1'}}}});supabase.rpc.mockReset();});
  afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
  it('deduplicates concurrent requests and retries the original revision after timeout',async()=>{
    supabase.rpc.mockRejectedValueOnce(new Error('lost response'));
    const args={p_values:{title:'synthetic'},p_expected:'2026-10-01T10:00:00Z'};
    const results=await Promise.all([idempotentRpc('save_feed_task',args),idempotentRpc('save_feed_task',args)]);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);expect(results[0].error.code).toBe('NETWORK_FAILURE');
    const original=supabase.rpc.mock.calls[0][1];
    supabase.rpc.mockResolvedValueOnce({data:{id:'one'},error:null});
    await idempotentRpc('save_feed_task',{...args,p_expected:'2026-10-01T11:00:00Z'});
    expect(supabase.rpc.mock.calls[1][1]).toEqual(original);
  });
  it('never replays offline and rejects an expired retry rather than issuing another nonce',async()=>{
    vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
    expect((await idempotentRpc('save_feed_task',{})).error.code).toBe('OFFLINE');
    expect(supabase.rpc).not.toHaveBeenCalled();vi.restoreAllMocks();
    vi.useFakeTimers();supabase.rpc.mockRejectedValue(new Error('timeout'));
    await idempotentRpc('save_feed_task',{});vi.advanceTimersByTime(30*60*1000+1);
    expect((await idempotentRpc('save_feed_task',{})).error.code).toBe('RETRY_EXPIRED');
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });
  it('does not deliver an old account response after identity cleanup',async()=>{
    let finish;supabase.rpc.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    const result=idempotentRpc('save_feed_task',{});
    await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
    clearMutationIntents();finish({data:{id:'old'},error:null});
    expect((await result).error.code).toBe('SESSION_CHANGED');
  });
  it('checks the current account again before dispatching a mutation',async()=>{
    supabase.auth.getSession.mockResolvedValueOnce({data:{session:{user:{id:'actor1'}}}})
      .mockResolvedValueOnce({data:{session:{user:{id:'actor2'}}}});
    expect((await idempotentRpc('save_feed_task',{})).error.code).toBe('SESSION_CHANGED');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

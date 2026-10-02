import { expect, it, vi, afterEach } from 'vitest';
import { mergeChatMessages, reconcileChatPage } from './chatMessages';
import { invalidateDomain, subscribeDomain } from './events';
afterEach(() => { vi.useRealTimers(); });
it('merges overlapping/out-of-order pages and compares bigint IDs without numeric precision loss', () => {
 const message=(id,created_at='2026-10-01T10:00:00Z')=>({id,created_at});
 expect(mergeChatMessages([message('9007199254740993'),message('1','2026-09-30T10:00:00Z')],[message('9007199254740992'),message('9007199254740993')]).map(m=>m.id)).toEqual(['1','9007199254740992','9007199254740993']);
});
it('coalesces bursts by account/domain and drops callbacks after unsubscribe', () => {
 vi.useFakeTimers();const a=vi.fn(),b=vi.fn();const offA=subscribeDomain('a','chat',a),offB=subscribeDomain('b','chat',b);
 invalidateDomain('a','chat');invalidateDomain('a','chat');invalidateDomain('a','unknown');vi.advanceTimersByTime(100);
 expect(a).toHaveBeenCalledTimes(1);expect(b).not.toHaveBeenCalled();
 invalidateDomain('a','chat');offA();vi.advanceTimersByTime(100);expect(a).toHaveBeenCalledTimes(1);offB();
});

it('restarts pagination across a long offline gap instead of presenting disjoint history as complete', () => {
 const m=id=>({id:String(id),created_at:'2026-10-01T10:00:00Z'});
 const previous={messages:[m(1),m(2)],hasMore:false};
 expect(reconcileChatPage(previous,{messages:[m(51),m(52)],has_more:true})).toEqual({messages:[m(51),m(52)],hasMore:true});
 expect(reconcileChatPage(previous,{messages:[m(2),m(3)],has_more:true})).toEqual({messages:[m(1),m(2),m(3)],hasMore:false});
});

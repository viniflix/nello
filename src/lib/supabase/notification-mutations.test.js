import { beforeEach, expect, it, vi } from 'vitest';
import { markOwnNotificationsRead, deleteOwnNotifications, markAllNotificationsRead } from './notification-mutations';
const api = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: api }));
vi.mock('@/components/ui/use-toast', () => ({ toast: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); });
it('binds mutations to the initiating account, deduplicates and treats an already removed ID as idempotent', async () => {
  api.rpc.mockResolvedValue({ data: ['one'], error: null });
  expect((await markOwnNotificationsRead('owner',['one','one'])).error).toBeNull();
  expect(api.rpc).toHaveBeenCalledWith('mutate_own_notifications',{p_actor:'owner',p_ids:['one'],p_remove:false});
  expect((await deleteOwnNotifications('owner',['one'])).error).toBeNull();
  expect(api.rpc).toHaveBeenLastCalledWith('mutate_own_notifications',{p_actor:'owner',p_ids:['one'],p_remove:true});
  await markAllNotificationsRead('owner');
  expect(api.rpc).toHaveBeenLastCalledWith('mark_all_notifications_read',{p_actor:'owner'});
});
it('surfaces atomic permission errors and does not write with an absent actor or oversized selection', async () => {
  const error={code:'42501'};api.rpc.mockResolvedValue({data:null,error});
  expect((await deleteOwnNotifications('owner',['foreign','own'])).error).toBe(error);
  api.rpc.mockClear();
  expect((await deleteOwnNotifications(null,['one'])).error).toBeTruthy();
  expect((await markOwnNotificationsRead('owner',Array(501).fill('one'))).error).toBeTruthy();
  expect(api.rpc).not.toHaveBeenCalled();
});

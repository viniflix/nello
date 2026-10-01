import { beforeEach, expect, it, vi } from 'vitest';
import { markOwnNotificationsRead, deleteOwnNotifications } from './notification-mutations';
const api = vi.hoisted(() => ({ from: vi.fn(), update: vi.fn(), delete: vi.fn(), eq: vi.fn(), in: vi.fn(), select: vi.fn() }));
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: api }));
beforeEach(() => { vi.clearAllMocks(); for (const name of ['from','update','delete','eq','in']) api[name].mockReturnValue(api); });
it('constrains both write paths to the recipient and verifies actual affected IDs', async () => {
  api.select.mockResolvedValue({ data: [{ id: 'one' }], error: null });
  expect((await markOwnNotificationsRead('owner',['one','one'])).error).toBeNull();
  expect(api.eq).toHaveBeenCalledWith('user_id','owner');
  expect(api.in).toHaveBeenCalledWith('id',['one']);
  expect((await deleteOwnNotifications('owner',['one'])).error).toBeNull();
  expect(api.delete).toHaveBeenCalled();
});
it('does not report false success for RLS-hidden or stale IDs, errors, or an absent user', async () => {
  api.select.mockResolvedValue({ data: [], error: null });
  expect((await markOwnNotificationsRead('owner',['foreign'])).error.code).toBe('notification_not_available');
  const error = { code: '42501' }; api.select.mockResolvedValue({ data: null, error });
  expect((await deleteOwnNotifications('owner',['one'])).error).toBe(error);
  api.from.mockClear(); expect((await deleteOwnNotifications(null,['one'])).error).toBeTruthy();expect(api.from).not.toHaveBeenCalled();
});

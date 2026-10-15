import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotificationsData } from './useNotificationsData';
const mocks = vi.hoisted(() => ({ listError: null, countError: null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'synthetic-owner' } }) }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { from: () => { let head = false; const query = { select: (fields, options) => { head = Boolean(options?.head); return query; }, eq: () => query, order: () => query, limit: () => query, abortSignal: async () => head ? { count: 2, error: mocks.countError } : { data: [{ id: 'synthetic-notice', content: {} }], error: mocks.listError } }; return query; } } }));
const wrapper = () => { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>; };
describe('Notifications cache and independent count', () => {
  beforeEach(() => { mocks.listError = null; mocks.countError = null; });
  it('does not expose denied cached notifications', async () => {
    const { result } = renderHook(() => useNotificationsData(), { wrapper: wrapper() }); await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    mocks.listError = { status: 403 }; await act(async () => result.current.refresh());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.notifications).toEqual([]);
  });
  it('keeps a healthy list when its unread count fails', async () => {
    mocks.countError = { code: 'NETWORK_FAILURE' };
    const { result } = renderHook(() => useNotificationsData(), { wrapper: wrapper() }); await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.unreadCount).toBeNull();
  });
});

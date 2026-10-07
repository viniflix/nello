import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { useAdminSource } from './useAdminSource';

const auth = vi.hoisted(() => ({ user: { id: 'synthetic-owner' } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
function setup(loader) {
  auth.user = { id: 'synthetic-owner' };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  // Subscribe to the fields displayed by the actual status component, including
  // error transitions whose data stays identical after a failed refresh.
  const hook = renderHook(() => ({ ...useAdminSource('source', loader) }), { wrapper });
  return { ...hook, client };
}
describe('private administrative source recovery', () => {
  it('retains the last valid timestamp on a temporary source failure', async () => {
    const data = { generated_at: '2026-10-07T12:00:00Z', value: 2 };
    const loader = vi.fn().mockResolvedValueOnce({ data }).mockResolvedValue({ error: { status: 503 } });
    const { result, unmount } = setup(loader);
    await waitFor(() => expect(result.current.data).toEqual(data));
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toEqual(data);
    unmount();
  });
  it('removes prior private results from both the view and cache when authorization is denied', async () => {
    for (const error of [{ code: '42501' }, { status: 401 }, { context: { status: 403 } }]) {
      const loader = vi.fn().mockResolvedValueOnce({ data: { private: 'synthetic' } }).mockResolvedValue({ error });
      const { result, client, unmount } = setup(loader);
      await waitFor(() => expect(result.current.data).toEqual({ private: 'synthetic' }));
      await act(async () => { await result.current.refetch(); });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.data).toBeNull();
      expect(client.getQueryData(['admin-workspace', auth.user.id, 'source'])).toBeNull();
      unmount();
    }
  });
  it('does not expose the former identity while the next account loads', async () => {
    let resolveNext;
    const loader = vi.fn().mockResolvedValueOnce({ data: { owner: 'first' } })
      .mockImplementation(() => new Promise(resolve => { resolveNext = resolve; }));
    const { result, rerender, unmount } = setup(loader);
    await waitFor(() => expect(result.current.data?.owner).toBe('first'));
    auth.user = { id: 'synthetic-next' };
    rerender();
    expect(result.current.data).toBeUndefined();
    await act(async () => { resolveNext({ data: { owner: 'next' } }); });
    await waitFor(() => expect(result.current.data?.owner).toBe('next'));
    unmount();
  });
});

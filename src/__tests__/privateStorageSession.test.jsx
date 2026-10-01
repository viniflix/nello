import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePrivateStorageUrl } from '@/hooks/usePrivateStorageUrl';

const api = vi.hoisted(() => ({ download: vi.fn(), from: vi.fn(), onAuthStateChange: vi.fn(), unsubscribe: vi.fn(), callback: null }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: {
  supabaseUrl: 'https://project.supabase.co', storage: { from: api.from },
  auth: { onAuthStateChange: api.onAuthStateChange },
} }));

beforeEach(() => {
  vi.clearAllMocks();
  api.from.mockReturnValue({ download: api.download });
  api.download.mockResolvedValue({ data: new Blob(['synthetic image']) });
  api.onAuthStateChange.mockImplementation(callback => {
    api.callback = callback;
    return { data: { subscription: { unsubscribe: api.unsubscribe } } };
  });
  const NativeURL = URL;
  class TestURL extends NativeURL {}
  TestURL.createObjectURL = vi.fn().mockReturnValue('blob:local-test');
  TestURL.revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', TestURL);
});
afterEach(() => vi.unstubAllGlobals());

describe('private images scoped to the current session', () => {
  it('downloads with the authenticated SDK and revokes on unmount', async () => {
    const { result, unmount } = renderHook(() => usePrivateStorageUrl('storage:avatars/id/a.png'));
    await waitFor(() => expect(result.current).toBe('blob:local-test'));
    expect(api.download).toHaveBeenCalledWith('id/a.png');
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-test');
    expect(api.unsubscribe).toHaveBeenCalledOnce();
  });
  it('clears the visible image immediately when signing out', async () => {
    const { result, unmount } = renderHook(() => usePrivateStorageUrl('storage:avatars/id/a.png'));
    await waitFor(() => expect(result.current).toBe('blob:local-test'));
    api.download.mockResolvedValue({ error: new Error('forbidden') });
    act(() => api.callback('SIGNED_OUT'));
    expect(result.current).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-test');
    unmount();
  });
  it('never exposes a previous asynchronous response after switching accounts', async () => {
    let finish;
    api.download.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const { result, unmount } = renderHook(() => usePrivateStorageUrl('storage:avatars/id/a.png'));
    api.download.mockResolvedValue({ error: new Error('forbidden') });
    act(() => api.callback('SIGNED_IN'));
    await act(async () => finish({ data: new Blob(['previous account']) }));
    expect(result.current).toBeUndefined();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    unmount();
  });
  it('suppresses foreign Storage URLs and never downloads them', () => {
    const { result, unmount } = renderHook(() => usePrivateStorageUrl('https://attacker.test/storage/v1/object/public/avatars/id/a.png'));
    expect(result.current).toBeUndefined();
    expect(api.download).not.toHaveBeenCalled();
    unmount();
  });
  it('preserves local branding and temporary upload previews', () => {
    const { result, rerender, unmount } = renderHook(({ src }) => usePrivateStorageUrl(src), { initialProps: { src: '/nello-logo.png' } });
    expect(result.current).toBe('/nello-logo.png');
    rerender({ src: 'blob:preview' });
    expect(result.current).toBe('blob:preview');
    expect(api.download).not.toHaveBeenCalled();
    unmount();
  });
  it('shares one Auth subscription between image consumers', () => {
    const first = renderHook(() => usePrivateStorageUrl('/nello-logo.png'));
    const second = renderHook(() => usePrivateStorageUrl('/nello-logo.png'));
    expect(api.onAuthStateChange).toHaveBeenCalledOnce();
    first.unmount();
    expect(api.unsubscribe).not.toHaveBeenCalled();
    second.unmount();
    expect(api.unsubscribe).toHaveBeenCalledOnce();
  });
});

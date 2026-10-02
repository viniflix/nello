import { clearMemoryDrafts, readMemoryDraft } from '@/lib/utils/memoryDrafts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFormAutosave } from './useFormAutosave';

describe('useFormAutosave', () => {
  beforeEach(() => { sessionStorage.clear();clearMemoryDrafts(); });
  afterEach(() => vi.restoreAllMocks());

  it('keeps an immediate recovery copy and clears it only after the server confirms', async () => {
    let confirm;
    const save = vi.fn(() => new Promise((resolve) => { confirm = resolve; }));
    const props = { storageKey: 'form:one', enabled: true, serverValue: {}, save, delay: 10000 };
    const { result, unmount } = renderHook(() => useFormAutosave(props));

    act(() => result.current.queue({ answer: 'última resposta' }));
    expect(readMemoryDraft('form:one').value).toEqual({ answer: 'última resposta' });
    expect(result.current.status).toBe('local');

    let pending;
    act(() => { pending = result.current.flush(); });
    await waitFor(() => expect(result.current.status).toBe('saving'));
    expect(readMemoryDraft('form:one')).not.toBeNull();
    expect(sessionStorage.length).toBe(0);
    await act(async () => { confirm(); await pending; });
    expect(result.current.status).toBe('saved');
    expect(sessionStorage.getItem('form:one')).toBeNull();
    unmount();
  });

  it('offers recovery after same-tab remount and retains the copy when saving fails', async () => {
    const save = vi.fn().mockRejectedValue(new Error('offline'));
    const props = { storageKey: 'form:two', enabled: true, serverValue: {}, save, delay: 10000 };
    const first = renderHook(() => useFormAutosave(props));
    act(() => first.result.current.queue({ answer: 'recuperável' }));
    await act(async () => { expect(await first.result.current.flush()).toBe(false); });
    expect(first.result.current.status).toBe('error');
    first.unmount();

    const second = renderHook(() => useFormAutosave(props));
    await waitFor(() => expect(second.result.current.recovery?.payload).toEqual({ answer: 'recuperável' }));
    expect(readMemoryDraft('form:two')).not.toBeNull();
    expect(sessionStorage.length).toBe(0);
    second.unmount();
  });
});

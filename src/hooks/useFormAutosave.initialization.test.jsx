import { useLayoutEffect } from 'react';
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useFormAutosave } from './useFormAutosave';

it.each([false, true])('retains an immediate edit when a form becomes enabled (sessionIndependent=%s)', async (sessionIndependent) => {
  const save = vi.fn().mockResolvedValue({ revision: 1 });
  const value = { answer: 'Synthetic immediate edit' };
  const { result, rerender } = renderHook(({ enabled }) => {
    const autosave = useFormAutosave({
      storageKey: enabled ? 'public:synthetic-initialization' : null,
      enabled, serverValue: {}, save, delay: 10_000, sessionIndependent,
    });
    useLayoutEffect(() => { if (enabled) autosave.queue(value); }, [enabled]);
    return autosave;
  }, { initialProps: { enabled: false } });
  rerender({ enabled: true });
  await act(async () => { await result.current.flush(); });
  expect(save).toHaveBeenCalledWith(value, undefined);
});

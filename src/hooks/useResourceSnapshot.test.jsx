import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useResourceSnapshot } from './useResourceSnapshot';

describe('confirmed resource ownership', () => {
  it.each([[], 0, null])('confirms an empty/zero/null result without confusing it with missing data (%j)', data => {
    const { result } = renderHook(() => useResourceSnapshot('a'));
    act(() => { const ticket = result.current.begin(); result.current.succeed(ticket, data); });
    expect(result.current).toMatchObject({ data, hasSnapshot: true, initialLoading: false, canAct: true });
    let ticket; act(() => { ticket = result.current.begin(); });
    expect(result.current).toMatchObject({ data, refreshing: true, initialLoading: false, canAct: false });
    act(() => result.current.fail(ticket, { code: 'NETWORK_FAILURE' }));
    expect(result.current).toMatchObject({ data, hasSnapshot: true, stale: true, canAct: false });
  });
  it.each([401, 403])('removes a denied snapshot (%i)', status => {
    const { result } = renderHook(() => useResourceSnapshot('a', []));
    act(() => { const ticket = result.current.begin(); result.current.succeed(ticket, ['private']); });
    act(() => result.current.fail(result.current.begin(), { status }));
    expect(result.current).toMatchObject({ data: [], hasSnapshot: false, canAct: false, pending: false });
  });
  it('ignores stale generations and cannot resurrect A when changing A → B → A', () => {
    const { result, rerender } = renderHook(({ owner }) => useResourceSnapshot(owner, []), { initialProps: { owner: 'a' } });
    let old; act(() => { old = result.current.begin(); result.current.succeed(old, ['a-private']); });
    rerender({ owner: 'b' }); expect(result.current.data).toEqual([]);
    rerender({ owner: 'a' }); expect(result.current.hasSnapshot).toBe(false);
    expect(result.current.succeed(old, ['late-a'])).toBe(false);
    let first, second; act(() => { first = result.current.begin(); second = result.current.begin(); result.current.succeed(second, ['fresh']); });
    expect(result.current.fail(first, { status: 403 })).toBe(false);
    expect(result.current.data).toEqual(['fresh']);
  });
  it('invalidates pending results and unmounted owners', () => {
    const { result, unmount } = renderHook(() => useResourceSnapshot('a', []));
    let ticket; act(() => { ticket = result.current.begin(); result.current.invalidate(); });
    expect(result.current.succeed(ticket, ['late'])).toBe(false);
    act(() => { ticket = result.current.begin(); }); const succeed = result.current.succeed;
    unmount(); expect(succeed(ticket, ['late'])).toBe(false);
  });
});

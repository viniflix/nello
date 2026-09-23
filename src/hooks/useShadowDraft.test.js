import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/lib/customSupabaseClient';
import { useShadowDraft } from './useShadowDraft';

vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { from: vi.fn() } }));

let row;
function query() {
  const q = {
    mode: 'read', filters: {}, payload: null,
    select() { return this; },
    eq(field, value) { this.filters[field] = value; return this; },
    insert(payload) { this.mode = 'insert'; this.payload = payload; return this; },
    update(payload) { this.mode = 'update'; this.payload = payload; return this; },
    delete() { this.mode = 'delete'; return this; },
    async maybeSingle() {
      if (this.mode === 'update') {
        if (!row || row.revision !== this.filters.revision) return { data: null, error: null };
        row = { ...row, ...this.payload, revision: row.revision + 1, updated_at: new Date().toISOString() };
      } else if (this.mode === 'delete') {
        if (!row || row.revision !== this.filters.revision) return { data: null, error: null };
        const deleted = row;
        row = null;
        return { data: deleted, error: null };
      }
      return { data: row ? { ...row } : null, error: null };
    },
    async single() {
      if (this.mode === 'insert') {
        if (row) return { data: null, error: { code: '23505' } };
        row = { ...this.payload, revision: 1, updated_at: new Date().toISOString() };
      }
      return { data: row ? { ...row } : null, error: null };
    },
  };
  return q;
}

describe('useShadowDraft', () => {
  beforeEach(() => {
    row = null;
    sessionStorage.clear();
    supabase.from.mockReset().mockImplementation(() => query());
  });

  it('saves a private working copy and offers it after a reload', async () => {
    const args = { ownerId: 'nutritionist-1', draftKey: 'meal-plan:patient-1:new' };
    const first = renderHook(() => useShadowDraft(args));
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    act(() => first.result.current.queue({ name: 'Plano quase pronto' }));
    expect(sessionStorage.getItem('nello_shadow:nutritionist-1:meal-plan:patient-1:new')).not.toBeNull();
    await act(async () => { expect(await first.result.current.flush()).toBe(true); });
    expect(first.result.current.status).toBe('saved');
    expect(row.payload.name).toBe('Plano quase pronto');
    first.unmount();

    const second = renderHook(() => useShadowDraft(args));
    await waitFor(() => expect(second.result.current.recovery?.payload.name).toBe('Plano quase pronto'));
    expect(second.result.current.recovery.source).toBe('cloud');
    second.unmount();
  });

  it('detects a concurrent revision instead of overwriting it', async () => {
    const args = { ownerId: 'nutritionist-1', draftKey: 'protocol:recipe:1' };
    const hook = renderHook(() => useShadowDraft(args));
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    act(() => hook.result.current.queue({ name: 'A' }));
    await act(async () => { await hook.result.current.flush(); });
    row.revision = 2; // another authenticated session changed the same working copy
    row.payload = { name: 'B' };
    act(() => hook.result.current.queue({ name: 'C' }));
    await act(async () => { expect(await hook.result.current.flush()).toBe(false); });
    expect(hook.result.current.status).toBe('conflict');
    expect(row.payload.name).toBe('B');
    expect(hook.result.current.recovery?.conflict).toBe(true);
    act(() => { expect(hook.result.current.restore()).toEqual({ name: 'C' }); });
    await act(async () => { expect(await hook.result.current.flush()).toBe(true); });
    expect(row.payload.name).toBe('C');
    expect(row.revision).toBe(3);
    hook.unmount();
  });

  it('does not delete a newer copy saved by another tab', async () => {
    const hook = renderHook(() => useShadowDraft({ ownerId: 'nutritionist-1', draftKey: 'protocol:diet:1' }));
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    act(() => hook.result.current.queue({ name: 'A' }));
    await act(async () => { await hook.result.current.flush(); });
    row = { ...row, revision: 2, payload: { name: 'Updated in another tab' } };
    await act(async () => { expect(await hook.result.current.discard()).toBe(false); });
    expect(row.payload.name).toBe('Updated in another tab');
    hook.unmount();
  });
});

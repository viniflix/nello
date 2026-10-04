import { clearMemoryDrafts, readMemoryDraft } from '@/lib/utils/memoryDrafts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/infrastructure/supabase/client';
import { useShadowDraft } from './useShadowDraft';

vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { from: vi.fn() } }));

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
        clearMemoryDrafts();
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
  it('does not clear a new patient recovery when an earlier deletion finishes late', async () => {
    row = { revision: 1, payload: { name: 'Old patient' }, updated_at: '2026-10-03T01:00:00Z' };
    const hook = renderHook(args => useShadowDraft(args), { initialProps: { ownerId: 'owner', draftKey: 'old-patient' } });
    await waitFor(() => expect(hook.result.current.recovery).not.toBeNull());
    let finish;
    supabase.from.mockImplementation(() => { const q = query(); const read = q.maybeSingle; q.maybeSingle = function () { return this.mode === 'delete' ? new Promise(resolve => { finish = resolve; }) : read.call(this); }; return q; });
    let deletion; act(() => { deletion = hook.result.current.discard(); });
    row = { revision: 8, payload: { name: 'New patient' }, updated_at: '2026-10-03T02:00:00Z' };
    hook.rerender({ ownerId: 'another-owner', draftKey: 'new-patient' });
    await waitFor(() => expect(hook.result.current.recovery?.payload.name).toBe('New patient'));
    await act(async () => { finish({ data: { id: 'old' }, error: null }); expect(await deletion).toBe(false); });
    expect(hook.result.current.recovery.payload.name).toBe('New patient');
    expect(hook.result.current.status).toBe('recoverable');
    hook.unmount();
  });
  beforeEach(() => {
    clearMemoryDrafts();
    row = null;
    sessionStorage.clear();
    supabase.from.mockReset().mockImplementation(() => query());
  });

  it('recovers a server-confirmed working copy after a reload', async () => {
    const args = { ownerId: 'nutritionist-1', draftKey: 'meal-plan:patient-1:new' };
    const first = renderHook(() => useShadowDraft(args));
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    act(() => first.result.current.queue({ name: 'Plano quase pronto' }));
    expect(readMemoryDraft('nello_shadow:nutritionist-1:meal-plan:patient-1:new')).not.toBeNull();
    expect(sessionStorage.length).toBe(0);
    await act(async () => { expect(await first.result.current.flush()).toBe(true); });
    expect(first.result.current.status).toBe('saved');
    expect(row.payload.name).toBe('Plano quase pronto');
    first.unmount();

    const second = renderHook(() => useShadowDraft(args));
    await waitFor(() => expect(second.result.current.recovery?.payload.name).toBe('Plano quase pronto'));
    expect(second.result.current.recovery.source).toBe('cloud');
    second.unmount();
  });

  it('joins an autosave in progress when closing instead of rejecting its consumed queue', async () => {
    const hook = renderHook(() => useShadowDraft({ ownerId: 'owner', draftKey: 'meal-editor' }));
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    let finish;
    supabase.from.mockImplementation(() => {
      const q = query();
      q.single = () => new Promise(resolve => { finish = resolve; });
      return q;
    });
    act(() => hook.result.current.queue({ name: 'Refeição confirmada' }));
    let autosave;
    let close;
    let closed = false;
    act(() => {
      autosave = hook.result.current.flush();
      close = hook.result.current.flush().then(saved => { closed = true; return saved; });
    });
    await act(async () => { await Promise.resolve(); });
    expect(closed).toBe(false);
    await act(async () => {
      finish({ data: { revision: 1, updated_at: '2026-10-04T00:00:00Z' }, error: null });
      expect(await autosave).toBe(true);
      expect(await close).toBe(true);
    });
    expect(hook.result.current.status).toBe('saved');
    const requests = supabase.from.mock.calls.length;
    await act(async () => { expect(await hook.result.current.flush()).toBe(true); });
    expect(supabase.from).toHaveBeenCalledTimes(requests);
    hook.unmount();
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
  it('reports network loss as unconfirmed and retains the working copy without declaring a conflict', async () => {
    const hook=renderHook(()=>useShadowDraft({ownerId:'nutritionist-1',draftKey:'network-loss'}));
    await waitFor(()=>expect(hook.result.current.ready).toBe(true));
    supabase.from.mockImplementation(()=>({insert:()=>({select:()=>({single:async()=>({data:null,error:{code:'NETWORK_FAILURE'}})})})}));
    act(()=>hook.result.current.queue({name:'Synthetic unsaved'}));
    await act(async()=>expect(await hook.result.current.flush()).toBe(false));
    expect(hook.result.current.status).toBe('error');
    expect(readMemoryDraft('nello_shadow:nutritionist-1:network-loss').payload).toEqual({name:'Synthetic unsaved'});
    hook.unmount();
  });
});

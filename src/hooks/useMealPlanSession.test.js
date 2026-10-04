import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { clearMemoryDrafts } from '@/lib/utils/memoryDrafts';
import { useMealPlanSession, isMealPlanSession, sessionWasSuperseded } from './useMealPlanSession';
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { from: () => query() } }));
const rows = new Map();
function query() {
    const q = { filters: {}, mode: 'read', select() { return this; }, eq(k,v) { this.filters[k]=v; return this; }, insert(v) { this.mode='insert'; this.value=v; return this; }, update(v) { this.mode='update'; this.value=v; return this; }, delete() { this.mode='delete'; return this; },
        key() { return `${this.value?.owner_id || this.filters.owner_id}:${this.value?.draft_key || this.filters.draft_key}`; },
        async single() { const key=this.key(); if(rows.has(key))return {data:null,error:{code:'23505'}};rows.set(key,{...this.value,revision:1,updated_at:'2026-10-03T01:00:00Z'});return {data:rows.get(key),error:null}; },
        async maybeSingle() { const key=this.key(),row=rows.get(key); if(this.mode==='update'){if(!row||row.revision!==this.filters.revision)return {data:null,error:null};rows.set(key,{...row,...this.value,revision:row.revision+1});} if(this.mode==='delete'){if(!row||row.revision!==this.filters.revision)return {data:null,error:null};rows.delete(key);return {data:{id:'draft'},error:null};} return {data:rows.get(key)||null,error:null}; }
    }; return q;
}
beforeEach(() => { rows.clear(); clearMemoryDrafts(); });
it('recovers one complete confirmed session after reload and isolates another owner/patient', async () => {
    const args={ownerId:'owner',patientId:'patient'};
    const first=renderHook(()=>useMealPlanSession(args));await waitFor(()=>expect(first.result.current.ready).toBe(true));
    const payload={formData:{name:'Synthetic'},meals:[{foods:[{quantity:33}]}],editor:{open:true,state:{foodEditor:{open:true,state:{notes:'Pending food'}}}}};
    act(()=>first.result.current.queue(payload));await act(async()=>expect(await first.result.current.flush()).toBe(true));first.unmount();clearMemoryDrafts();
    const other=renderHook(()=>useMealPlanSession({ownerId:'other',patientId:'patient'}));await waitFor(()=>expect(other.result.current.ready).toBe(true));expect(other.result.current.recovery).toBeNull();other.unmount();
    const second=renderHook(()=>useMealPlanSession(args));await waitFor(()=>expect(second.result.current.recovery?.source).toBe('cloud'));
    expect(isMealPlanSession(second.result.current.recovery.payload)).toBe(true);expect(second.result.current.recovery.payload.editor.state.foodEditor.state.notes).toBe('Pending food');
    act(()=>expect(second.result.current.restore().meals[0].foods[0].quantity).toBe(33));await act(async()=>expect(await second.result.current.discard()).toBe(true));second.unmount();
    const third=renderHook(()=>useMealPlanSession(args));await waitFor(()=>expect(third.result.current.ready).toBe(true));expect(third.result.current.recovery).toBeNull();third.unmount();
});
it('does not classify old partial meal drafts as an automatic complete session',()=>{expect(isMealPlanSession({formData:{},foods:[]})).toBe(false);expect(isMealPlanSession({kind:'meal-plan-session',version:2,formData:{},meals:[]})).toBe(false);});
it('keeps exactly the last three confirmed full states without nested or unbounded histories after reload', async () => {
    const args = { ownerId: 'owner', patientId: 'patient' };
    const hook = renderHook(() => useMealPlanSession(args));
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    for (let number = 1; number <= 6; number++) {
        act(() => hook.result.current.queue({ formData: { name: `State ${number}` }, meals: [{ foods: [{ quantity: number }] }] }));
        await act(async () => expect(await hook.result.current.flush()).toBe(true));
    }
    expect(rows.size).toBe(1);
    const saved = rows.get('owner:meal-plan-session:patient').payload;
    expect([saved, ...saved.history].map(value => value.formData.name)).toEqual(['State 6', 'State 5', 'State 4']);
    expect(saved.history.every(value => !value.history)).toBe(true);
    hook.unmount(); clearMemoryDrafts();
    const reloaded = renderHook(() => useMealPlanSession(args));
    await waitFor(() => expect(reloaded.result.current.snapshots).toHaveLength(3));
    expect(reloaded.result.current.snapshots.map(value => value.meals[0].foods[0].quantity)).toEqual([6, 5, 4]);
    reloaded.unmount();
});
it('prioritizes newer applied plans over old sessions, including a different newly created plan', () => {
    const old = '2026-10-02T20:00:00Z', newer = '2026-10-02T21:00:00Z';
    const saved = { baselineAppliedAt: old, baseRevision: old };
    expect(sessionWasSuperseded(saved, [{ id: 99, updated_at: newer }], newer, { updated_at: old })).toBe(true);
    expect(sessionWasSuperseded(saved, [], newer, { updated_at: newer })).toBe(true);
    expect(sessionWasSuperseded(saved, [{ updated_at: old }, { is_draft: true, updated_at: newer }], newer, { updated_at: old })).toBe(false);
    expect(sessionWasSuperseded({ baselineAppliedAt: null }, [{ updated_at: newer }], newer, null)).toBe(true);
});

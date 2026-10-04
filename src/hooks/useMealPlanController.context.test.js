import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useMealPlanController } from './useMealPlanController';
const state = vi.hoisted(() => ({ pending: [] }));
function deferred(kind, id) { return new Promise(resolve => { state.pending.push({ kind, id, resolve }); }); }
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { from: () => { const q = { select: () => q, eq: (_, id) => { q.id = id; return q; }, single: () => deferred('name', q.id) }; return q; } } }));
vi.mock('@/lib/supabase/meal-plan-queries', () => ({ getMealPlanById: id => deferred('edit', id), getReferenceValues: id => deferred('reference', id), getMealPlanVersions: id => deferred('versions', id) }));
vi.mock('@/lib/supabase/energy-queries', () => ({ getLatestEnergyCalculation: id => deferred('energy', id) }));
vi.mock('@/lib/supabase/anthropometry-queries', () => ({ getPatientModuleSyncFlags: id => deferred('flags', id) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
beforeEach(() => { state.pending = []; });
it('refreshes version history after saving the same plan without refetching patient energy', async () => {
  const hook=renderHook(props=>useMealPlanController(props),{initialProps:{...args('patient'),activePlan:{id:'patient',updated_at:'before'}}});
  await finish('patient');
  state.pending=[];
  hook.rerender({...args('patient'),activePlan:{id:'patient',updated_at:'after'}});
  expect(state.pending.map(task=>task.kind)).toEqual(['versions']);
  await finish('patient');
  expect(hook.result.current.mealPlanVersions).toHaveLength(1);
});
it('ignores a pending editor response after switching patients', async () => {
  const hook = renderHook(props => useMealPlanController(props), { initialProps: args('old') });
  let opening;
  act(() => { opening = hook.result.current.handleEdit('old'); });
  hook.rerender(args('new'));
  await finish('old');
  expect(await opening).toBe(false);
  expect(hook.result.current.showForm).toBe(false);
  expect(hook.result.current.editingPlan).toBeNull();
});
const args = patientId => ({ patientId, user: { id: 'owner' }, activePlan: { id: patientId }, plans: [], pendingDrafts: [] });
async function finish(id) {
  await act(async () => {
    for (const task of state.pending.filter(p => p.id === id)) task.resolve({ data: task.kind === 'name' ? { name: id } : task.kind === 'versions' ? [{ id, snapshot: {} }] : { patient: id }, error: null });
  });
}
it('keeps current patient context when old name, energy, references, versions and flags arrive late', async () => {
  const hook = renderHook(props => useMealPlanController(props), { initialProps: args('old') });
  hook.rerender(args('new'));
  await finish('new');
  await waitFor(() => expect(hook.result.current.patientName).toBe('new'));
  await finish('old');
  expect(hook.result.current.patientName).toBe('new');
  expect(hook.result.current.referenceValues).toEqual({ patient: 'new' });
  expect(hook.result.current.energyCalculation).toEqual({ patient: 'new' });
  expect(hook.result.current.syncFlags).toEqual({ patient: 'new' });
  expect(hook.result.current.mealPlanVersions[0].id).toBe('new');
  expect(hook.result.current.selectedVersionId).toBe('new');
});
it('clears old context immediately and ignores pending reads when the account changes', async () => {
  const hook = renderHook(props => useMealPlanController(props), { initialProps: args('patient') });
  await finish('patient');
  hook.rerender({ ...args(null), activePlan: null, user: { id: 'other-owner' } });
  expect(hook.result.current.patientName).toBe('');
  expect(hook.result.current.energyCalculation).toBeNull();
  expect(hook.result.current.referenceValues).toBeNull();
  expect(hook.result.current.syncFlags).toBeNull();
  expect(hook.result.current.mealPlanVersions).toEqual([]);
});
it('distinguishes failed context reads from empty data and permits a scoped retry', async () => {
  const hook = renderHook(props => useMealPlanController(props), { initialProps: args('patient') });
  await act(async () => {
    for (const task of state.pending.filter(p => ['energy','versions'].includes(p.kind))) task.resolve({data:null,error:new Error('Synthetic unavailable context')});
  });
  expect(hook.result.current.energyError).toBe(true);
  expect(hook.result.current.versionsError).toBe(true);
  expect(hook.result.current.energyLoading).toBe(false);
  state.pending=[];
  act(() => hook.result.current.retryContext());
  expect(hook.result.current.energyLoading).toBe(true);
  await finish('patient');
  expect(hook.result.current.energyError).toBe(false);
  expect(hook.result.current.versionsError).toBe(false);
});

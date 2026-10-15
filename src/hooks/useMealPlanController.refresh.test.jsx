import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useMealPlanController } from './useMealPlanController';
const mocks = vi.hoisted(() => ({ versions: vi.fn(), energy: vi.fn(), toast: vi.fn() }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { from: () => { const q = { select: () => q, eq: () => q, single: async () => ({ data: { name: 'Synthetic' } }) }; return q; } } }));
vi.mock('@/lib/supabase/meal-plan-queries', () => ({ getReferenceValues: async () => ({ data: null }), getMealPlanVersions: mocks.versions }));
vi.mock('@/lib/supabase/energy-queries', () => ({ getLatestEnergyCalculation: mocks.energy }));
vi.mock('@/lib/supabase/anthropometry-queries', () => ({ getPatientModuleSyncFlags: async () => ({ data: null }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
const args = { patientId: 'synthetic', user: { id: 'synthetic-owner' }, activePlan: { id: 'synthetic-plan' }, plans: [], pendingDrafts: [] };
beforeEach(() => { mocks.versions.mockResolvedValue({ data: [{ id: 'synthetic-version', snapshot: {} }] }); mocks.energy.mockResolvedValue({ data: { target_calories: 1900 } }); });
it('preserves version selection and energy during context refresh', async () => {
  const { result } = renderHook(() => useMealPlanController(args)); await waitFor(() => expect(result.current.mealPlanVersions).toHaveLength(1));
  mocks.versions.mockReturnValue(new Promise(() => {})); mocks.energy.mockReturnValue(new Promise(() => {}));
  act(() => result.current.retryContext());
  expect(result.current.mealPlanVersions).toHaveLength(1); expect(result.current.selectedVersionId).toBe('synthetic-version');
  expect(result.current.energyCalculation).toEqual({ target_calories: 1900 }); expect(result.current.versionsLoading).toBe(false);
});
it('keeps confirmed energy and versions after transient failure and masks them on 403', async () => {
  const { result } = renderHook(() => useMealPlanController(args)); await waitFor(() => expect(result.current.mealPlanVersions).toHaveLength(1));
  mocks.versions.mockResolvedValue({ error: { code: 'NETWORK_FAILURE' } }); mocks.energy.mockResolvedValue({ error: { code: 'NETWORK_FAILURE' } });
  act(() => result.current.retryContext()); await waitFor(() => expect(result.current.versionsError).toBe(true));
  expect(result.current.mealPlanVersions).toHaveLength(1); expect(result.current.energyCalculation).toEqual({ target_calories: 1900 });
  mocks.versions.mockResolvedValue({ error: { status: 403 } }); mocks.energy.mockResolvedValue({ error: { status: 403 } });
  act(() => result.current.retryContext()); await waitFor(() => expect(result.current.energyCalculation).toBeNull());
  expect(result.current.mealPlanVersions).toEqual([]);
});

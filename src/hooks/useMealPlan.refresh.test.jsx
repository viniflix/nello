import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMealPlan } from './useMealPlan';
const mocks = vi.hoisted(() => ({ plans: vi.fn(), drafts: vi.fn() }));
vi.mock('@/lib/supabase/meal-plan-queries', () => ({ getMealPlans: mocks.plans, getDraftMealPlans: mocks.drafts, getMealPlansByIds: async () => ({ data: [{ id: 'synthetic-plan', name: 'Synthetic plan' }] }) }));
vi.mock('@/infrastructure/analytics/posthog', () => ({ track: vi.fn(), Events: {} }));
const wrapper = () => { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>; };
describe('Meal plan same-scope cache confidence', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.plans.mockResolvedValue({ data: [{ id: 'synthetic-plan', is_active: true, start_date: '2020-01-01' }] }); mocks.drafts.mockResolvedValue({ data: [] }); });
  it('removes denied cached plans and drafts after a confirmed read', async () => {
    const { result } = renderHook(() => useMealPlan('synthetic-patient', 'synthetic-owner'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.plans).toHaveLength(1));
    mocks.plans.mockResolvedValue({ data: null, error: { status: 403 } });
    await act(async () => result.current.loadPlans());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.plans).toEqual([]); expect(result.current.activePlan).toBeNull();
  });
  it('keeps a confirmed plan when a background read fails transiently', async () => {
    const { result } = renderHook(() => useMealPlan('synthetic-patient', 'synthetic-owner'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.plans).toHaveLength(1));
    mocks.plans.mockRejectedValue({ code: 'NETWORK_FAILURE' }); await act(async () => result.current.loadPlans());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.plans).toHaveLength(1); expect(result.current.resource.stale).toBe(true);
  });
});

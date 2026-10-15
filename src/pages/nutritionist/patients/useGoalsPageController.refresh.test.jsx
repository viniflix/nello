import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGoalsPageController } from './useGoalsPageController';
const mocks = vi.hoisted(() => ({ active: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/hooks/useResolvedPatientId', () => ({ useResolvedPatientId: () => ({ patientId: 'synthetic-patient' }) }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/infrastructure/observability/telemetry', () => ({ captureOperationalError: () => 'synthetic-operation' }));
vi.mock('@/lib/supabase/clinical-impact-queries', () => ({ logClinicalImpact: vi.fn() }));
vi.mock('@/lib/supabase/goals-queries', () => ({ getActiveGoal: mocks.active, getPatientGoals: async () => ({ data: [] }), createGoal: vi.fn(), updateGoalProgress: vi.fn(), completeGoal: vi.fn(), cancelGoal: vi.fn(), pauseGoal: vi.fn(), calculateGoalViability: vi.fn(), calculateMinimumDeadline: () => 15, calculateIdealDeadline: () => 30 }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) }, from: () => { const query = { select: () => query, eq: () => query, order: () => query, limit: () => query, single: async () => ({ data: { name: 'Synthetic' } }), maybeSingle: async () => ({ data: { weight: 80 } }) }; return query; } } }));
describe('Goals refresh keeps confirmed data and creation draft', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.active.mockResolvedValue({ data: null }); });
  it('keeps the editor and edited weight during a background read', async () => {
    const { result } = renderHook(() => useGoalsPageController()); await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.handleInputChange('initial_weight', '77'));
    mocks.active.mockReturnValue(new Promise(() => {})); act(() => { void result.current.loadData(); });
    expect(result.current.loading).toBe(false); expect(result.current.showForm).toBe(true);
    expect(result.current.formData.initial_weight).toBe('77');
  });
  it('does not hide or rehydrate the form after a recoverable failure/retry', async () => {
    const { result } = renderHook(() => useGoalsPageController()); await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.handleInputChange('initial_weight', '77'));
    mocks.active.mockRejectedValue({ code: 'NETWORK_FAILURE' }); await act(async () => result.current.loadData());
    expect(result.current.showForm).toBe(true);
    mocks.active.mockResolvedValue({ data: null }); await act(async () => result.current.loadData());
    expect(result.current.formData.initial_weight).toBe('77');
  });
});

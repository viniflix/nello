import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCheckins } from './useCheckins';

const mocks = vi.hoisted(() => ({
  mutationOptions: [],
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({})),
  useMutation: vi.fn((options) => {
    mocks.mutationOptions.push(options);
    return { mutateAsync: vi.fn() };
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'patient-1', profile: { user_type: 'patient' } } }) }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/supabase/query-helpers', () => ({ logSupabaseError: vi.fn() }));

describe('useCheckins submission contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mutationOptions.length = 0;
  });

  it('recalcula o score, restringe a atualização e usa a assinatura completa da sequência', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const sessionBuilder = {
      select: vi.fn(() => sessionBuilder),
      eq: vi.fn(() => sessionBuilder),
      single: vi.fn(async () => ({
        data: { id: 'session-1', patient_id: 'patient-1', nutritionist_id: 'nutritionist-1', template_id: 'template-1', status: 'pending', expires_at: future },
        error: null,
      })),
    };
    const fieldsBuilder = {
      select: vi.fn(() => fieldsBuilder),
      eq: vi.fn(() => fieldsBuilder),
      order: vi.fn(async () => ({ data: [{ id: 'scale', label: 'Adesão', field_type: 'scale_1_10', is_required: true, score_weight: 2 }], error: null })),
    };
    const updateBuilder = {
      update: vi.fn(() => updateBuilder),
      eq: vi.fn(() => updateBuilder),
      gt: vi.fn(() => updateBuilder),
      select: vi.fn(() => updateBuilder),
      maybeSingle: vi.fn(async () => ({ data: { id: 'session-1' }, error: null })),
    };
    let sessionCalls = 0;
    mocks.from.mockImplementation((table) => {
      if (table === 'checkin_fields') return fieldsBuilder;
      sessionCalls += 1;
      return sessionCalls === 1 ? sessionBuilder : updateBuilder;
    });
    mocks.rpc.mockResolvedValue({ error: null });

    renderHook(() => useCheckins());
    const submitMutation = mocks.mutationOptions[3];
    const result = await submitMutation.mutationFn({ sessionId: 'session-1', responses: { scale: [7] }, scoreTotal: 9999 });

    expect(updateBuilder.update).toHaveBeenCalledWith(expect.objectContaining({
      score_total: 14,
      score_max: 20,
      adherence_percentage: 70,
      status: 'completed',
    }));
    expect(updateBuilder.eq).toHaveBeenCalledWith('patient_id', 'patient-1');
    expect(updateBuilder.eq).toHaveBeenCalledWith('status', 'pending');
    expect(mocks.rpc).toHaveBeenCalledWith('increment_checkin_streak', {
      p_patient_id: 'patient-1',
      p_nutritionist_id: 'nutritionist-1',
    });
    expect(result).toEqual({ adherencePct: 70, streakUpdated: true });
  });
});

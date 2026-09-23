import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCheckins } from './useCheckins';

const mocks = vi.hoisted(() => ({ mutationOptions: [], from: vi.fn(), rpc: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({})),
  useMutation: vi.fn(options => {
    mocks.mutationOptions.push(options);
    return { mutateAsync: vi.fn(), isPending: false };
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'patient-1', profile: { user_type: 'patient' } } }) }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/supabase/query-helpers', () => ({ logSupabaseError: vi.fn() }));

describe('check-in database contracts', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.mutationOptions.length = 0; });

  it('links a template with timezone through the authenticated RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: 'schedule-id', error: null });
    renderHook(() => useCheckins());
    await mocks.mutationOptions[2].mutationFn({ templateId: 'template-1', patientId: 'patient-1', channel: 'in_app', timeZone: 'America/Fortaleza' });
    expect(mocks.rpc).toHaveBeenCalledWith('link_checkin_template', {
      p_template_id: 'template-1', p_patient_id: 'patient-1', p_channel: 'in_app', p_time_zone: 'America/Fortaleza'
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('submits once through server-side validation and scoring', async () => {
    mocks.rpc.mockResolvedValue({ data: 70, error: null });
    renderHook(() => useCheckins());
    const result = await mocks.mutationOptions[4].mutationFn({ sessionId: 'session-1', responses: { scale: [7] }, scoreTotal: 9999 });
    expect(mocks.rpc).toHaveBeenCalledWith('submit_checkin_session', {
      p_session_id: 'session-1', p_responses: { scale: [7] }
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(result).toEqual({ adherencePct: 70 });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listPatientTimeline } from './timeline-queries';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  logSupabaseError: vi.fn(),
}));

vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/lib/supabase/query-helpers', () => ({ logSupabaseError: mocks.logSupabaseError }));

describe('listPatientTimeline', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls the episode-scoped RPC with the exact first-page payload', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    await listPatientTimeline('patient-1', 'episode-1', 'clinical');

    expect(mocks.rpc).toHaveBeenCalledWith('list_patient_timeline', {
      p_patient_id: 'patient-1',
      p_episode_id: 'episode-1',
      p_scope: 'clinical',
      p_cursor_at: null,
      p_cursor_event_id: null,
      p_limit: 30,
    });
  });

  it('normalizes a cursor and exposes only one page plus its stable next cursor', async () => {
    const data = Array.from({ length: 31 }, (_, index) => ({
      event_id: `event-${index}`,
      occurred_at: `2026-07-${String(31 - index).padStart(2, '0')}T12:00:00Z`,
    }));
    mocks.rpc.mockResolvedValue({ data, error: null });

    const result = await listPatientTimeline('patient-1', 'episode-1', 'all', {
      occurredAt: '2026-06-01T12:00:00Z',
      eventId: 'event-old',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('list_patient_timeline', expect.objectContaining({
      p_cursor_at: '2026-06-01T12:00:00Z',
      p_cursor_event_id: 'event-old',
    }));
    expect(result.items).toHaveLength(30);
    expect(result.nextCursor).toEqual({ occurredAt: data[29].occurred_at, eventId: data[29].event_id });
  });

  it('logs and throws Supabase errors so React Query owns retry state', async () => {
    const error = { code: '42501', message: 'timeline_forbidden' };
    mocks.rpc.mockResolvedValue({ data: null, error });

    await expect(listPatientTimeline('patient-1', 'episode-1', 'all')).rejects.toBe(error);
    expect(mocks.logSupabaseError).toHaveBeenCalledWith('Erro ao buscar linha do tempo do paciente', error);
  });
});

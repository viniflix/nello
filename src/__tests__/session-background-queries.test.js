import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMyCareRelationship, syncFeedTasksFromItems, upsertFeedTask } from '@/lib/supabase/patient-queries';
import { processPatientReminders } from '@/lib/supabase/food-diary-queries';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  logSupabaseError: vi.fn(),
}));

vi.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));
vi.mock('@/lib/supabase/query-helpers', async (importOriginal) => ({
  ...await importOriginal(),
  logSupabaseError: mocks.logSupabaseError,
}));
vi.mock('@/lib/supabase/lab-results-queries', () => ({
  classifyLabResultsRiskBatch: vi.fn(() => []),
  getLabRiskRules: vi.fn(async () => ({ data: [], error: null })),
}));

describe('session-safe background queries', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not persist a nutritionist feed after the authenticated account changes', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'patient-session' } } },
      error: null,
    });

    const single = await upsertFeedTask({
      nutritionistId: 'nutritionist-session',
      sourceType: 'pending',
      sourceId: 'pending-1',
      title: 'Pendência',
    });
    const batch = await syncFeedTasksFromItems('nutritionist-session', [{
      sourceType: 'pending',
      sourceId: 'pending-1',
      title: 'Pendência',
    }]);

    expect(single).toMatchObject({ error: null, skipped: true });
    expect(batch).toMatchObject({ error: null, skipped: true });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.logSupabaseError).not.toHaveBeenCalled();
  });

  it('does not report a no-row write when logout wins the feed persistence race', async () => {
    mocks.getSession
      .mockResolvedValueOnce({
        data: { session: { user: { id: 'nutritionist-session' } } },
        error: null,
      })
      .mockResolvedValueOnce({ data: { session: null }, error: null });

    mocks.from
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          match: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        })),
      })
      .mockReturnValueOnce({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
            }),
          })),
        })),
      });

    const result = await upsertFeedTask({
      nutritionistId: 'nutritionist-session',
      sourceType: 'pending',
      sourceId: 'pending-1',
      title: 'PendÃªncia',
    });

    expect(result).toMatchObject({ data: null, error: null, skipped: true });
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
    expect(mocks.logSupabaseError).not.toHaveBeenCalled();
  });

  it('does not report relationship or reminder requests cancelled by navigation', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(getMyCareRelationship({ signal: controller.signal }))
      .resolves.toMatchObject({ error: null, cancelled: true });
    await expect(processPatientReminders('patient-session', { signal: controller.signal }))
      .resolves.toMatchObject({ error: null, cancelled: true });

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.logSupabaseError).not.toHaveBeenCalled();
  });
});

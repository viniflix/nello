import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMyCareRelationship, getPatientActivities, syncFeedTasksFromItems, upsertFeedTask } from '@/lib/supabase/patient-queries';
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

  it('reuses an unchanged feed task without a database write', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'nutritionist-session' } } }, error: null });
    const existing = {
      id: 'task-1', source_type: 'pending', source_id: 'pending-1', patient_id: 'patient-1',
      title: 'Pendência', description: null, priority_score: 2, priority_reason: null,
      status: 'open', snooze_until: null, last_seen_at: new Date().toISOString(),
      metadata: { item_type: 'pending', cta_route: '/nutritionist/patients' },
    };

    const result = await syncFeedTasksFromItems('nutritionist-session', [{
      sourceType: 'pending', sourceId: 'pending-1', patientId: 'patient-1',
      type: 'pending', title: 'Pendência', priorityScore: 2,
      ctaRoute: '/nutritionist/patients',
    }], [existing]);

    expect(result).toMatchObject({ error: null, data: [existing] });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('starts every independent patient activity source before waiting for responses', async () => {
    const tables = ['meal_audit_log', 'growth_records', 'anamnesis_records', 'energy_expenditure_calculations', 'activity_log', 'user_achievements', 'appointments'];
    const pending = new Map(tables.map((table) => {
      let resolve;
      const promise = new Promise((done) => { resolve = done; });
      return [table, { promise, resolve }];
    }));
    mocks.from.mockImplementation((table) => {
      const chain = {
        select: () => chain, eq: () => chain, order: () => chain,
        limit: () => chain, in: () => chain,
        then: (resolve, reject) => pending.get(table).promise.then(resolve, reject),
      };
      return chain;
    });

    const resultPromise = getPatientActivities('patient-1', 100);
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(tables);
    for (const { resolve } of pending.values()) resolve({ data: [], error: null });
    await expect(resultPromise).resolves.toEqual({ data: [], error: null });
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

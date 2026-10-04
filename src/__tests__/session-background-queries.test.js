import { clearMutationIntents } from '@/lib/supabase/idempotent-mutations';
import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMyCareRelationship, getPatientActivities, getPatientsHighRiskLabAlerts, syncFeedTasksFromItems, upsertFeedTask } from '@/lib/supabase/patient-queries';
import { processPatientReminders } from '@/lib/supabase/food-diary-queries';
import { retryFeedTaskSync } from '@/lib/supabase/patient-query-feed';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  logSupabaseError: vi.fn(),
}));

vi.mock('@/infrastructure/supabase/client', () => ({
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
  beforeEach(() => { vi.clearAllMocks();clearMutationIntents();vi.stubGlobal('crypto', webcrypto); });

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
      status: 'open', snooze_until: null, last_seen_at: '2025-01-01T00:00:00Z',
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

  it('updates a changed snapshot without a per-item read and guards concurrent edits', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'nutritionist-session' } } }, error: null });
    mocks.rpc.mockResolvedValue({ data: null, error: {code:'PT409',message:'task_changed'} });
    const result = await syncFeedTasksFromItems('nutritionist-session', [{
      sourceType: 'pending', sourceId: 'pending-1', title: 'Nova pendência',
    }], [{
      id: 'task-1', source_type: 'pending', source_id: 'pending-1',
      title: 'Pendência', status: 'resolved', updated_at: '2026-09-24T00:00:00Z', metadata: {},
    }]);

    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('save_feed_task',expect.objectContaining({
      p_expected:'2026-09-24T00:00:00Z',p_values:expect.objectContaining({status:'resolved'}),p_actor:'nutritionist-session'
    }));
    expect(result).toMatchObject({ data: [], error: {code:'PT409'},failedCount:1,
      outcomes:[{sourceType:'pending',sourceId:'pending-1',status:'failed',code:'PT409'}] });
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

  it('reports obsolete snapshots as inapplicable instead of failed saves', async () => {
    mocks.getSession.mockResolvedValue({data:{session:{user:{id:'nutritionist-session'}}},error:null});
    mocks.rpc.mockResolvedValue({data:{no_longer_applicable:true},error:null});
    const result=await syncFeedTasksFromItems('nutritionist-session',[{
      sourceType:'pending',sourceId:'old',patientId:'patient',careEpisodeId:'old-episode',title:'Old task'
    }]);
    expect(result).toMatchObject({data:[],error:null,failedCount:0,failedItems:[],outcomes:[{status:'obsolete'}]});
    expect(mocks.logSupabaseError).not.toHaveBeenCalled();
  });
  it('restricts operational laboratory alerts to the current care episodes', async () => {
    const chain={select:vi.fn(),in:vi.fn(),gte:vi.fn(),order:vi.fn(),limit:vi.fn().mockResolvedValue({data:[],error:null})};
    for(const method of ['select','in','gte','order'])chain[method].mockReturnValue(chain);
    mocks.from.mockReturnValue(chain);
    expect(await getPatientsHighRiskLabAlerts({nutritionistId:'nutritionist-session',patientIds:['patient'],careEpisodeIds:['current']})).toMatchObject({error:null,data:[]});
    expect(chain.in).toHaveBeenCalledWith('care_episode_id',['current']);
  });

  it('retries only failed current-episode items using fresh revisions and excludes closed scopes', async () => {
    mocks.getSession.mockResolvedValue({data:{session:{user:{id:'nutritionist-session'}}},error:null});
    mocks.rpc.mockImplementation(async name=>{
      if(name==='get_active_feed_patients') return {data:[{id:'patient',care_episode_id:'current'}],error:null};
      if(name==='get_my_feed_task_states') return {data:[{source_type:'pending',source_id:'failed',updated_at:'fresh-revision',status:'open',metadata:{care_episode_id:'current'}}],error:null};
      return {data:{id:'saved',source_type:'pending',source_id:'failed'},error:null};
    });
    const result=await retryFeedTaskSync('nutritionist-session',[
      {sourceType:'pending',sourceId:'failed',patientId:'patient',careEpisodeId:'current',title:'Current'},
      {sourceType:'pending',sourceId:'stale',patientId:'patient',careEpisodeId:'previous',title:'Old'},
      {sourceType:'pending',sourceId:'archived',patientId:'archived',careEpisodeId:'old',title:'Archived'}]);
    const writes=mocks.rpc.mock.calls.filter(([name])=>name==='save_feed_task');
    expect(writes).toHaveLength(1);expect(writes[0][1]).toMatchObject({p_expected:'fresh-revision',p_values:{source_id:'failed',metadata:{care_episode_id:'current'}}});
    expect(result.discardedKeys).toEqual(['pending:stale','pending:archived']);expect(result.failedItems).toEqual([]);
  });

  it('keeps unsaved items when retry context cannot be read and does not guess permission', async () => {
    mocks.getSession.mockResolvedValue({data:{session:{user:{id:'nutritionist-session'}}},error:null});
    mocks.rpc.mockResolvedValue({data:null,error:{code:'NETWORK_FAILURE',message:'Synthetic outage'}});
    const failedItems=[{sourceType:'pending',sourceId:'failed',patientId:'patient',careEpisodeId:'current'}];
    expect(await retryFeedTaskSync('nutritionist-session',failedItems)).toMatchObject({error:{code:'NETWORK_FAILURE'},failedItems:[{...failedItems[0],failureCode:'NETWORK_FAILURE'}]});
    expect(mocks.rpc.mock.calls.some(([name])=>name==='save_feed_task')).toBe(false);
  });

  it('does not report a no-row write when logout wins the feed persistence race', async () => {
    mocks.getSession
      .mockResolvedValue({data:{session:null},error:null})
      .mockResolvedValueOnce({
        data: { session: { user: { id: 'nutritionist-session' } } },
        error: null,
      })
      .mockResolvedValueOnce({ data: { session: null }, error: null });

    const query={select:vi.fn(),match:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data:null,error:null})};
    for(const method of ['select','match','eq'])query[method].mockReturnValue(query);
    mocks.from.mockReturnValue(query);
    const result = await upsertFeedTask({
      nutritionistId: 'nutritionist-session',
      sourceType: 'pending',
      sourceId: 'pending-1',
      title: 'PendÃªncia',
    });

    expect(result).toMatchObject({ data: null, error: null, skipped: true });
    expect(mocks.rpc).not.toHaveBeenCalled();
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

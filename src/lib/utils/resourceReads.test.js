import { describe, expect, it, vi } from 'vitest';
import { observeResources } from './resourceReads';
import { queryResource } from './queryResource';

describe('independent source completion', () => {
  it('publishes a healthy source while its sibling is still pending and classifies both rejection and response errors', async () => {
    let resolve; const slow = new Promise(done => { resolve = done; }); const publish = vi.fn();
    const done = observeResources({ slow: () => slow, fast: async () => ({ data: [] }), broken: async () => { throw Object.assign(new Error('Synthetic denied'), { status: 403 }); } }, publish);
    await vi.waitFor(() => expect(publish).toHaveBeenCalledWith('fast', expect.objectContaining({ data: [], error: null })));
    expect(publish.mock.calls.some(([key]) => key === 'slow')).toBe(false);
    resolve({ error: { code: 'NETWORK_FAILURE' } }); const results = await done;
    expect(results.broken.error.status).toBe(403); expect(results.slow.error.code).toBe('NETWORK_FAILURE');
  });
});
describe('query cache presentation', () => {
  it('retains empty and zero cache, marks stale and removes denied cache', () => {
    for (const data of [[], 0, null]) {
      expect(queryResource({ data, isFetching: true })).toMatchObject({ hasSnapshot: true, refreshing: true, initialLoading: false, canAct: false });
      expect(queryResource({ data, error: { code: 'NETWORK_FAILURE' } }).stale).toBe(true);
      expect(queryResource({ data, error: { status: 403 } })).toMatchObject({ hasSnapshot: false, data: null, canAct: false });
    }
  });
  it('distinguishes paused initial reads from a confirmed empty result', () => {
    expect(queryResource({ fetchStatus: 'paused' })).toMatchObject({ hasSnapshot: false, initialLoading: true, pending: true });
  });
});

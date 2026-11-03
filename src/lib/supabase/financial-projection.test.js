import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProjectedCashFlow } from './financial-queries';
const api = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/infrastructure/supabase/domainClients', () => ({ financeClient: api }));
vi.mock('@/lib/supabase/idempotent-mutations', () => ({ insertIdempotently: vi.fn(), updateIdempotently: vi.fn(), idempotentRpc: vi.fn() }));
vi.mock('@/lib/supabase/query-helpers', () => ({ logSupabaseError: vi.fn() }));
const today = new Date(2026, 10, 2, 12);
let requests;
function source(groups, response) {
  api.from.mockImplementation(() => {
    let group = 'paid', start = 0, end = 999;
    const q = {};
    for (const name of ['select', 'eq', 'gte', 'lte', 'order', 'abortSignal', 'retry']) q[name] = vi.fn(() => q);
    q.in = vi.fn((field, statuses) => { if (statuses.includes('pending')) group = 'due'; return q; });
    q.is = vi.fn(() => { group = 'undated'; return q; });
    q.range = vi.fn((a, b) => { start = a; end = b; return q; });
    q.then = (resolve, reject) => {
      requests.push({ group, start, end });
      return Promise.resolve(response ? response(group, start) : { data: groups[group].slice(start, end + 1), error: null }).then(resolve, reject);
    };
    return q;
  });
}
beforeEach(() => { vi.clearAllMocks(); requests = []; });
afterEach(() => { vi.useRealTimers(); });
describe('complete bounded financial projection', () => {
  it('keeps cents, refunds, net fees and both boundary dates unchanged', async () => {
    source({ paid: [{ type: 'income', amount: '100.10', net_amount: '97.10', status: 'paid' }, { type: 'income', amount: '50.00', net_amount: '48.50', status: 'refunded' }, { type: 'expense', amount: '10.20', status: 'paid' }, { type: 'expense', amount: '5.00', status: 'refunded' }], due: [{ type: 'income', amount: '10.00', net_amount: '9.70', due_date: '2026-11-02' }, { type: 'expense', amount: '0.10', due_date: '2026-12-02' }], undated: [{ type: 'expense', amount: '0.20', transaction_date: '2026-11-03' }] });
    const result = await getProjectedCashFlow('synthetic-owner', today);
    expect(result).toHaveLength(31);
    expect(result[0]).toEqual({ date: '2026-11-02', balance: 95.10 });
    expect(result[1]).toEqual({ date: '2026-11-03', balance: 94.90 });
    expect(result[30]).toEqual({ date: '2026-12-02', balance: 94.80 });
  });
  it('rejects a missing actor before starting a read', async () => {
    source({ paid: [], due: [], undated: [] });
    await expect(getProjectedCashFlow(null, today)).rejects.toThrow('nutritionistId is required');
    expect(requests).toEqual([]);
  });
  it('fails rather than returning a partial total above the shared 10000 row budget', async () => {
    const paid = Array.from({length: 9000}, () => ({type: 'income', amount: '1.00', status: 'paid'}));
    source({paid, due: Array.from({length: 1001}, () => ({type: 'income', amount: '1.00', due_date: '2026-11-02'})), undated: []});
    await expect(getProjectedCashFlow('synthetic-owner', today)).rejects.toThrow('REPORT_ROW_LIMIT_REACHED');
  });
  it('accepts exactly 10000 rows and does not confuse a complete total with a partial one', async () => {
    source({paid: Array.from({length: 10000}, () => ({type: 'income', amount: '0.01', status: 'paid'})), due: [], undated: []});
    expect((await getProjectedCashFlow('synthetic-owner', today))[0].balance).toBe(100);
  });
  it('bounds a source which never returns its last page', async () => {
    source({}, () => ({data: Array.from({length: 1000}, () => ({type: 'expense', amount: 1, status: 'paid'})), error: null}));
    // Stop the old unbounded implementation without changing the production deadline.
    let count = 0; const original = api.from.getMockImplementation();
    api.from.mockImplementation(() => { if (++count > 12) throw new Error('TEST_SOURCE_SENTINEL'); return original(); });
    await expect(getProjectedCashFlow('synthetic-owner', today)).rejects.toThrow('REPORT_ROW_LIMIT_REACHED');
    expect(requests.length).toBeLessThanOrEqual(11);
  });
  it('cancels an already aborted read before sending any page', async () => {
    source({paid: [], due: [], undated: []});
    const controller = new AbortController(); controller.abort();
    await expect(getProjectedCashFlow('synthetic-owner', today, {signal: controller.signal})).rejects.toMatchObject({name: 'AbortError'});
    expect(requests).toEqual([]);
  });
  it('cancels a transport which ignores abort', async () => {
    source({}, () => new Promise(() => {}));
    const controller = new AbortController();
    const pending = getProjectedCashFlow('synthetic-owner', today, {signal: controller.signal}).then(() => 'resolved', error => error.name);
    await Promise.resolve(); controller.abort();
    expect(await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve('unbounded'), 30))])).toBe('AbortError');
  });
  it('enforces one total 30 second deadline across all groups', async () => {
    vi.useFakeTimers();
    source({}, () => new Promise(resolve => setTimeout(() => resolve({data: [], error: null}), 12000)));
    const pending = getProjectedCashFlow('synthetic-owner', today).then(() => 'resolved', error => error.name);
    await vi.advanceTimersByTimeAsync(30001);
    expect(await Promise.race([pending, Promise.resolve('unbounded')])).toBe('TimeoutError');
  });
  it.each([401, 403, 503])('preserves an explicit HTTP %i failure instead of returning zero', async status => {
    source({}, () => ({data: null, error: {status}}));
    await expect(getProjectedCashFlow('synthetic-owner', today)).rejects.toMatchObject({status});
  });
});

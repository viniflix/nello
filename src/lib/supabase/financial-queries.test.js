import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPendingPayments, getFinancialMonthRows } from './financial-queries';
const api = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/infrastructure/supabase/domainClients', () => ({ financeClient: api }));
vi.mock('@/lib/supabase/idempotent-mutations', () => ({ insertIdempotently: vi.fn(), updateIdempotently: vi.fn(), idempotentRpc: vi.fn() }));
vi.mock('@/lib/supabase/query-helpers', () => ({ logSupabaseError: vi.fn() }));

function query(data, error = null) {
    const chain = {};
    for (const name of ['select', 'eq', 'in', 'order', 'gte', 'lte']) chain[name] = vi.fn(() => chain);
    chain.range = vi.fn(async (start, end) => ({ data: data.slice(start, end + 1), error }));
    return chain;
}
beforeEach(() => { vi.clearAllMocks(); });
describe('complete owner-scoped financial reads', () => {
    it('fetches 1001 pending rows with the owner, open status and deterministic order on every page', async () => {
        const rows = Array.from({ length: 1001 }, (_, id) => ({ id }));
        const queries = []; api.from.mockImplementation(() => { const q = query(rows); queries.push(q); return q; });
        expect(await getPendingPayments('synthetic-owner')).toEqual(rows);
        expect(queries).toHaveLength(2);
        for (const q of queries) {
            expect(q.eq).toHaveBeenCalledWith('nutritionist_id', 'synthetic-owner');
            expect(q.eq).toHaveBeenCalledWith('type', 'income');
            expect(q.in).toHaveBeenCalledWith('status', ['pending', 'overdue']);
            expect(q.order).toHaveBeenCalledWith('id', { ascending: true });
        }
        expect(queries[1].range).toHaveBeenCalledWith(1000, 1999);
    });
    it('rejects missing identity and failed queries instead of presenting empty totals', async () => {
        await expect(getPendingPayments(null)).rejects.toThrow('nutritionistId');
        expect(api.from).not.toHaveBeenCalled();
        api.from.mockReturnValue(query([], new Error('unavailable')));
        await expect(getPendingPayments('synthetic-owner')).rejects.toThrow('unavailable');
    });
    it('fails closed beyond 10000 rows rather than reporting a partial amount', async () => {
        api.from.mockImplementation(() => query(Array.from({ length: 10001 }, (_, id) => ({ id }))));
        await expect(getPendingPayments('synthetic-owner')).rejects.toThrow('REPORT_ROW_LIMIT_REACHED');
    });
    it('retains revision metadata and deduplicates all three civil date ranges', async () => {
        const q = query([{ id: 1, updated_at: 'synthetic-revision' }]); api.from.mockReturnValue(q);
        expect(await getFinancialMonthRows('synthetic-owner', new Date('2026-10-01T12:00:00'))).toEqual([{ id: 1, updated_at: 'synthetic-revision' }]);
        expect(q.select.mock.calls[0][0]).toContain('updated_at');
        expect(q.gte.mock.calls.map(x => x[0])).toEqual(['transaction_date', 'paid_at', 'refunded_at']);
    });
});

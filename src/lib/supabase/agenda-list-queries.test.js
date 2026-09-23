import { describe, expect, it, vi } from 'vitest';

const { mockFrom, mockRange, mockOrder, mockGte, mockLt, response } = vi.hoisted(() => ({
    mockFrom: vi.fn(), mockRange: vi.fn(), mockOrder: vi.fn(), mockGte: vi.fn(), mockLt: vi.fn(),
    response: { current: null },
}));
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { from: mockFrom } }));
const { fetchAppointmentsInPeriod } = await import('./agenda-list-queries');

describe('agenda por período', () => {
    it('inclui compromissos após a primeira página e ordena datas empatadas pelo ID', async () => {
        const query = {
            select: vi.fn(), eq: vi.fn(), order: mockOrder, gte: mockGte, lt: mockLt, range: mockRange,
            then: (resolve, reject) => Promise.resolve(response.current).then(resolve, reject),
        };
        for (const method of ['select', 'eq', 'order', 'gte', 'lt']) query[method].mockReturnValue(query);
        mockFrom.mockReturnValue(query);
        mockRange.mockImplementation(offset => {
            response.current = offset === 0
                ? { data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null }
                : { data: [{ id: 500 }, { id: 501 }], error: null };
            return query;
        });
        const start = new Date('2026-09-01T00:00:00Z');
        const end = new Date('2026-10-01T00:00:00Z');

        const rows = await fetchAppointmentsInPeriod('nutritionist', start, end);

        expect(rows).toHaveLength(502);
        expect(rows[501].id).toBe(501);
        expect(mockRange).toHaveBeenNthCalledWith(2, 500, 999);
        expect(mockOrder).toHaveBeenCalledWith('appointment_time', { ascending: true });
        expect(mockOrder).toHaveBeenCalledWith('id', { ascending: true });
        expect(mockGte).toHaveBeenCalledWith('appointment_time', start.toISOString());
        expect(mockLt).toHaveBeenCalledWith('appointment_time', end.toISOString());
    });
});

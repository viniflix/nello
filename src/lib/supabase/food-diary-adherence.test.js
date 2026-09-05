import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateDiaryAdherence } from './food-diary-queries';

const state = vi.hoisted(() => ({ rows: [], filters: [], error: null }));
vi.mock('@/lib/customSupabaseClient', () => ({
    supabase: {
        from: () => {
            const query = {
                select: () => query,
                eq: () => query,
                is: (field, value) => { state.filters.push(['is', field, value]); return query; },
                gte: (field, value) => { state.filters.push(['gte', field, value]); return query; },
                lte: (field, value) => { state.filters.push(['lte', field, value]); return query; },
                then: (resolve) => resolve({
                    data: state.rows.filter(row => state.filters.every(([op, field, value]) =>
                        op === 'is' ? (row[field] ?? null) === value
                            : op === 'gte' ? row[field] >= value : row[field] <= value)),
                    error: state.error,
                }),
            };
            return query;
        },
    },
}));
vi.mock('@/lib/supabase/query-helpers', () => ({
    logSupabaseError: vi.fn(), isExpectedRequestCancellation: vi.fn(),
}));

describe('regularidade do diário no período selecionado', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 4, 12));
        state.rows = [];
        state.filters = [];
        state.error = null;
    });
    afterEach(() => vi.useRealTimers());

    it('inclui exatamente sete datas até hoje, sem dias anteriores ou futuros', async () => {
        state.rows = ['2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31',
            '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']
            .map(meal_date => ({ meal_date }));
        const { data } = await calculateDiaryAdherence('patient', 7);
        expect(data).toEqual({ totalDays: 7, daysWithRecords: 7, adherencePercentage: 100, currentStreak: 7, totalMeals: 7 });
    });

    it('conta refeições separadamente dos dias e permite sequência iniciada ontem', async () => {
        state.rows = ['2026-09-03', '2026-09-03', '2026-09-02'].map(meal_date => ({ meal_date }));
        const { data } = await calculateDiaryAdherence('patient', 7);
        expect(data).toMatchObject({ daysWithRecords: 2, currentStreak: 2, totalMeals: 3, adherencePercentage: 29 });
    });

    it('usa o dia local também à noite, sem avançar a data por conversão UTC', async () => {
        vi.setSystemTime(new Date(2026, 8, 4, 23, 30));
        state.rows = [{ meal_date: '2026-09-04' }, { meal_date: '2026-09-05' }];
        const { data } = await calculateDiaryAdherence('patient', 1);
        expect(state.filters).toContainEqual(['lte', 'meal_date', '2026-09-04']);
        expect(data).toMatchObject({ totalMeals: 1, currentStreak: 1 });
    });

    it.each([0, -1, 1.5, NaN])('rejeita período inválido %s sem produzir percentuais inválidos', async days => {
        const result = await calculateDiaryAdherence('patient', days);
        expect(result.data).toBeNull();
        expect(result.error).toBeInstanceOf(Error);
    });

    it('propaga falhas em vez de representar falta de registros', async () => {
        state.error = new Error('unavailable');
        expect(await calculateDiaryAdherence('patient', 7)).toEqual({ data: null, error: state.error });
    });

    it('não conta refeições excluídas na regularidade ou na sequência', async () => {
        state.rows = [
            { meal_date: '2026-09-04', deleted_at: '2026-09-04T12:00:00Z' },
            { meal_date: '2026-09-03', deleted_at: null },
        ];
        const { data } = await calculateDiaryAdherence('patient', 7);
        expect(data).toMatchObject({ daysWithRecords: 1, currentStreak: 1, totalMeals: 1 });
    });
});

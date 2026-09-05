import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPatientHubOperationalContext } from './patient-queries';
const mocks = vi.hoisted(() => ({ from: vi.fn(), records: vi.fn() }));
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/features/clinical-records/api/evolution-queries', () => ({ listClinicalRecordsByEpisode: mocks.records }));
vi.mock('@/lib/supabase/lab-results-queries', () => ({ classifyLabResultsRiskBatch: vi.fn(), getLabRiskRules: vi.fn() }));
vi.mock('@/lib/supabase/query-helpers', () => ({ buildActivityEventPayload: vi.fn(), isExpectedRequestCancellation: vi.fn(), logSupabaseError: vi.fn() }));
beforeEach(() => {
    vi.clearAllMocks();
    mocks.records.mockResolvedValue({ data: [{ id: 'latest', recorded_at: '2026-09-04' }], error: null });
    mocks.from.mockImplementation(() => {
        const query = {};
        ['select', 'eq', 'is', 'in', 'gte', 'lt', 'order', 'limit'].forEach(method => { query[method] = () => query; });
        query.maybeSingle = async () => ({ data: null, error: null });
        query.then = resolve => resolve({ data: [], error: null });
        return query;
    });
});
describe('contexto clínico do Hub', () => {
    it('usa a projeção autorizada do episódio, sem SELECT direto na tabela clínica', async () => {
        const result = await getPatientHubOperationalContext('patient', 'nutritionist', 'episode');
        expect(mocks.records).toHaveBeenCalledWith('patient', 'episode');
        expect(mocks.from).not.toHaveBeenCalledWith('clinical_records');
        expect(result.data.latestClinicalRecord.id).toBe('latest');
    });
    it('não consulta registros sem episódio resolvido', async () => {
        const result = await getPatientHubOperationalContext('patient', 'nutritionist');
        expect(mocks.records).not.toHaveBeenCalled();
        expect(mocks.from).not.toHaveBeenCalledWith('clinical_records');
        expect(result.data.latestClinicalRecord).toBeNull();
    });
    it('mantém falhas de autorização explícitas, sem fallback para acesso direto', async () => {
        mocks.records.mockResolvedValue({ data: null, error: new Error('denied') });
        const result = await getPatientHubOperationalContext('patient', 'nutritionist', 'episode');
        expect(result.data.partialErrors).toContain('registro clínico mais recente');
        expect(result.data.latestClinicalRecord).toBeNull();
    });
});

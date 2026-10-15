import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLabResultsPageController } from './useLabResultsPageController';
const mocks = vi.hoisted(() => ({ labs: vi.fn(), rules: vi.fn(), classify: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'synthetic-owner' } }) }));
vi.mock('@/hooks/useResolvedPatientId', () => ({ useResolvedPatientId: () => ({ patientId: 'synthetic-patient' }) }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { from: () => { const query = { select: () => query, eq: () => query, single: async () => ({ data: { name: 'Synthetic' } }) }; return query; } } }));
vi.mock('@/lib/supabase/lab-results-queries', () => ({ getPatientLabResults: mocks.labs, getLabRiskRules: mocks.rules, classifyLabResultsRiskBatch: mocks.classify, createLabResult: vi.fn(), updateLabResult: vi.fn(), deleteLabResult: vi.fn(), confirmLabResultInterpretation: vi.fn(), getLabResultPDFUrl: vi.fn(), uploadLabResultPDF: vi.fn() }));
describe('Laboratory verified context', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.labs.mockResolvedValue({ data: [{ id: 'synthetic-lab', test_name: 'Synthetic marker' }] }); mocks.rules.mockResolvedValue({ data: [] }); mocks.classify.mockImplementation(data => ({ data, summary: { total: data.length } })); });
  it('keeps the confirmed classified list during revalidation', async () => {
    const { result } = renderHook(() => useLabResultsPageController()); await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.labs.mockReturnValue(new Promise(() => {})); act(() => { void result.current.loadLabResults(); });
    expect(result.current.loading).toBe(false); expect(result.current.labResults).toHaveLength(1);
  });
  it('does not classify results using a failed rules response', async () => {
    mocks.rules.mockResolvedValue({ error: { code: 'NETWORK_FAILURE' } });
    const { result } = renderHook(() => useLabResultsPageController()); await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.classify).not.toHaveBeenCalled(); expect(result.current.labResults).toEqual([]);
  });
});

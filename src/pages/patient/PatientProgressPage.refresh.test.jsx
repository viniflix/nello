import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePatientProgressPageController } from './usePatientProgressPageController';
const mocks = vi.hoisted(() => ({ read: vi.fn(), photos: vi.fn(), foundation: vi.fn(), toast: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'synthetic-patient' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/lib/supabase/progress-photos-queries', () => ({ getProgressPhotos: mocks.photos, deleteProgressPhoto: vi.fn(), uploadProgressPhoto: vi.fn() }));
vi.mock('@/lib/supabase/patient-queries', () => ({ logActivityEvent: vi.fn() }));
vi.mock('@/features/clinical-records/api/record-foundation-queries', () => ({ getPatientRecordFoundation: mocks.foundation }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { from: table => { let range; const query = { select: () => query, eq: () => query, order: () => query, range: (...values) => {range=values;return query;}, then: (resolve, reject) => mocks.read(table,range).then(resolve, reject) }; return query; } } }));
describe('Patient progress source independence', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.read.mockImplementation(async table => ({ data: table === 'growth_records' ? [{ id: 'synthetic-weight', weight: 70, record_date: '2026-10-13' }] : [], error: null })); mocks.photos.mockResolvedValue({ data: [] }); mocks.foundation.mockResolvedValue({ data: { records: [] } }); });
  it('keeps a confirmed history while refreshing instead of re-entering initial loading', async () => {
    const { result } = renderHook(() => usePatientProgressPageController()); await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.read.mockReturnValue(new Promise(() => {})); act(() => { void result.current.loadProgressData(); });
    expect(result.current.loading).toBe(false); expect(result.current.sortedWeightData).toHaveLength(1);
  });
  it('keeps a successful weight section when another history source fails', async () => {
    mocks.photos.mockResolvedValue({ data: null, error: { code: 'NETWORK_FAILURE' } });
    const { result } = renderHook(() => usePatientProgressPageController()); await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sortedWeightData).toHaveLength(1);
  });
  it('preserves already paginated records when a sibling completes during a failed refresh', async () => {
    const rows=Array.from({length:101},(_,id)=>({id:`synthetic-${id}`,weight:70,record_date:'2026-10-13'}));
    mocks.read.mockImplementation(async(table,range)=>({data:table==='growth_records'?rows.slice(range[0],range[1]+1):[]}));
    const {result}=renderHook(()=>usePatientProgressPageController());
    await waitFor(()=>expect(result.current.sortedWeightData).toHaveLength(100));
    await act(async()=>result.current.loadMoreHistory());expect(result.current.sortedWeightData).toHaveLength(101);
    mocks.read.mockImplementation(async table=>table==='growth_records'?{error:{code:'NETWORK_FAILURE'}}:{data:[]});
    await act(async()=>result.current.loadProgressData());expect(result.current.sortedWeightData).toHaveLength(101);
  });
});

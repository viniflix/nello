import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePatientListData } from './usePatientListData';
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/lib/supabase/patient-queries', () => ({ fetchAllNutritionistPatients: mocks.read }));
describe('Patient list background state', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.read.mockResolvedValue({ active: [{ id: 'synthetic-patient' }], archived: [], pending: [] }); });
  it('preserves confirmed rows without entering initial loading again', async () => {
    const { result } = renderHook(() => usePatientListData('synthetic-owner'));
    await waitFor(() => expect(result.current.patients).toHaveLength(1));
    mocks.read.mockReturnValue(new Promise(() => {})); act(() => { void result.current.fetchPatients(); });
    expect(result.current.loading).toBe(false); expect(result.current.refreshing).toBe(true);
    expect(result.current.patients).toHaveLength(1);
  });
  it('clears denied data after a successful read', async () => {
    const { result } = renderHook(() => usePatientListData('synthetic-owner'));
    await waitFor(() => expect(result.current.patients).toHaveLength(1));
    mocks.read.mockResolvedValue({ error: { status: 403 } }); await act(async () => result.current.fetchPatients());
    expect(result.current.patients).toEqual([]); expect(result.current.error.kind).toBe('forbidden');
  });
});

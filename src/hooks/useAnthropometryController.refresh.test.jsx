import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnthropometryController } from './useAnthropometryController';
const mocks = vi.hoisted(() => ({ records: vi.fn(), charts: vi.fn(), toast: vi.fn() }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/infrastructure/analytics/posthog', () => ({ track: vi.fn(), Events: {} }));
vi.mock('@/lib/supabase/anthropometry-queries', () => ({ getAnthropometryRecords: mocks.records, getAnthropometryChartData: mocks.charts, getAnthropometryLongitudinalScore: async () => ({ data: null }), getPatientModuleSyncFlags: async () => ({ data: null }), saveAnthropometryRecord: vi.fn(), deleteAnthropometryRecord: vi.fn() }));
vi.mock('@/lib/supabase/goals-queries', () => ({ getActiveGoal: async () => ({ data: null }) }));
vi.mock('@/lib/supabase/anamnesis-queries', () => ({ getLatestAnamnesis: async () => ({ data: null }) }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { from: () => { const query = { select: () => query, eq: () => query, single: async () => ({ data: { name: 'Synthetic', gender: 'other' } }) }; return query; } } }));
const props = { patientId: 'synthetic-patient', user: { id: 'synthetic-owner' }, resolveLoading: false };
describe('Anthropometry confirmed resources', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.records.mockResolvedValue({ data: [{ id: 'synthetic-record', record_date: '2026-10-13', weight: 70, height: 170 }] }); mocks.charts.mockResolvedValue({ data: [] }); });
  it('keeps history and avoids initial loading during refresh', async () => {
    const { result } = renderHook(() => useAnthropometryController(props)); await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.records.mockReturnValue(new Promise(() => {})); act(() => { void result.current.loadData(); });
    expect(result.current.loading).toBe(false); expect(result.current.records).toHaveLength(1);
  });
  it('keeps a healthy history when charts fail on initial load', async () => {
    mocks.charts.mockResolvedValue({ error: { code: 'NETWORK_FAILURE' } });
    const { result } = renderHook(() => useAnthropometryController(props)); await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.records).toHaveLength(1);
  });
  it('publishes records before a slow chart and removes denied records', async () => {
    mocks.charts.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAnthropometryController(props));
    await waitFor(() => expect(result.current.records).toHaveLength(1));
    expect(result.current.loading).toBe(false);
    mocks.records.mockResolvedValue({ error: { status: 403 } });
    act(() => { void result.current.loadData(); });
    await waitFor(() => expect(result.current.resources.records.error?.kind).toBe('forbidden'));
    expect(result.current.records).toEqual([]); expect(result.current.latestRecord).toBeNull();
  });
});

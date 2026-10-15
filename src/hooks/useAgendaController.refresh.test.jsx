import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgendaController } from './useAgendaController';
const mocks = vi.hoisted(() => ({ read: vi.fn(), toast: vi.fn() }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/lib/supabase/agenda-list-queries', () => ({ fetchAppointmentsInPeriod: mocks.read }));
vi.mock('./useAgendaReferences', () => ({ useAgendaReferences: () => ({ patients: [], services: [], settings: {}, errors: {} }) }));
vi.mock('./useAgendaDayAvailability', () => ({ useAgendaDayAvailability: () => ({ rows: [], status: 'ready' }) }));
vi.mock('@/infrastructure/realtime/events', () => ({ subscribeDomain: () => () => {} }));
vi.mock('@/lib/supabase/agenda-queries', () => ({ createAppointmentWithFinance: vi.fn(), updateAppointment: vi.fn(), deleteAppointment: vi.fn() }));
const row = { id: 'synthetic-appointment', appointment_time: new Date().toISOString(), status: 'scheduled' };
const user = { id: 'synthetic-owner' };
describe('Agenda initial versus background reads', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.read.mockResolvedValue([row]); });
  it('keeps a confirmed list usable while refreshing the same scope', async () => {
    const { result } = renderHook(() => useAgendaController({ user }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.read.mockReturnValue(new Promise(() => {}));
    act(() => { void result.current.loadData(); });
    expect(result.current.loading).toBe(false);
    expect(result.current.refreshing).toBe(true);
    expect(result.current.appointments[0].id).toBe(row.id);
  });
  it('retains snapshot on a transient failure with a typed stale error', async () => {
    const { result } = renderHook(() => useAgendaController({ user }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.read.mockRejectedValue({ code: 'NETWORK_FAILURE' });
    await act(async () => result.current.loadData());
    expect(result.current.appointments[0].id).toBe(row.id);
    expect(result.current.appointmentsResource.error.kind).toBe('network');
    expect(result.current.appointmentsResource.stale).toBe(true);
  });
  it('removes the snapshot when permission is denied after success', async () => {
    const { result } = renderHook(() => useAgendaController({ user }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.read.mockRejectedValue({ status: 403 });
    await act(async () => result.current.loadData());
    expect(result.current.appointments).toEqual([]);
    expect(result.current.appointmentsResource.error.kind).toBe('forbidden');
  });
  it('never gives the new period a snapshot from the previous period', async () => {
    const { result } = renderHook(() => useAgendaController({ user }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.read.mockReturnValue(new Promise(() => {}));
    act(() => result.current.setFilterView('month'));
    expect(result.current.appointments).toEqual([]);
    expect(result.current.loading).toBe(true);
  });
});

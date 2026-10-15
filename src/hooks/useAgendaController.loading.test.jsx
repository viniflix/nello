import {invalidateDomain} from '@/infrastructure/realtime/events';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgendaController } from './useAgendaController';
const mocks = vi.hoisted(() => ({ read: vi.fn(), toast: vi.fn(), subscribers: new Map() }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/lib/supabase/agenda-list-queries', () => ({ fetchAppointmentsInPeriod: mocks.read }));
vi.mock('./useAgendaReferences', () => ({ useAgendaReferences: () => ({ patients: [], services: [] }) }));
vi.mock('./useAgendaDayAvailability', () => ({ useAgendaDayAvailability: () => ({}) }));
vi.mock('@/lib/supabase/agenda-queries', () => ({ createAppointmentWithFinance: vi.fn(), updateAppointment: vi.fn(), deleteAppointment: vi.fn() }));
describe('Agenda session loading', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.read.mockResolvedValue([]); });
  it('does not refetch or close an editor for another object of the same account', async () => {
    const { result, rerender } = renderHook(({ user }) => useAgendaController({ user }), { initialProps: { user: { id: 'synthetic-a' } } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.setIsFormOpen(true); result.current.setEditingAppointment({ id: 'synthetic-draft' }); });
    const count = mocks.read.mock.calls.length;
    rerender({ user: { id: 'synthetic-a' } });
    await act(async () => {});
    expect(mocks.read).toHaveBeenCalledTimes(count);
    expect(result.current.isFormOpen).toBe(true);
    expect(result.current.editingAppointment.id).toBe('synthetic-draft');
  });
  it('still reloads on filter change and clinical invalidation', async () => {
    const user = { id: 'synthetic-a' };
    const { result } = renderHook(() => useAgendaController({ user }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const count = mocks.read.mock.calls.length;
    act(() => result.current.setFilterView('month'));
    await waitFor(() => expect(mocks.read.mock.calls.length).toBeGreaterThan(count));
    const next = mocks.read.mock.calls.length;
    await act(async () => { invalidateDomain('synthetic-a','clinical'); await new Promise(resolve => setTimeout(resolve,130)); });
    await waitFor(() => expect(mocks.read.mock.calls.length).toBeGreaterThan(next));
  });
  it('ignores a response belonging to an earlier account', async () => {
    let resolve;
    const pending = new Promise(r => { resolve = r; });
    mocks.read.mockImplementation((id, start, end, projection) => id === 'synthetic-a' && !projection ? pending : Promise.resolve([]));
    const { result, rerender } = renderHook(({ user }) => useAgendaController({ user }), { initialProps: { user: { id: 'synthetic-a' } } });
    rerender({ user: { id: 'synthetic-b' } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => resolve([{ id: 'old-private-appointment' }]));
    expect(result.current.appointments).toEqual([]);
  });
  it('does not reload for a Date allocation representing the same civil date', async () => {
    const user = { id: 'synthetic-a' };
    const { result } = renderHook(() => useAgendaController({ user }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const count = mocks.read.mock.calls.length;
    act(() => result.current.setPeriodDate(previous => new Date(previous)));
    await act(async () => {});
    expect(mocks.read).toHaveBeenCalledTimes(count);
  });
  it('reloads and clears the selected private context after access invalidation, retaining the filter', async () => {
    const user = { id: 'synthetic-a' };
    const { result } = renderHook(() => useAgendaController({ user }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.setFilterView('month'); result.current.setIsFormOpen(true); result.current.setEditingAppointment({ id: 'synthetic-appointment' }); });
    await act(async () => {});
    const count = mocks.read.mock.calls.length;
    act(() => invalidateDomain('synthetic-a','access'));
    await act(async () => {});
    expect(mocks.read.mock.calls.length).toBeGreaterThan(count);
    expect(result.current.editingAppointment).toBeNull();
    expect(result.current.isFormOpen).toBe(false);
    expect(result.current.filterView).toBe('month');
  });
});

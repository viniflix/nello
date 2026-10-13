import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncAppointmentNotificationSchedule, getAppointmentNotifications } from './appointment-notifications-queries';
const transport = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/infrastructure/supabase/domainClients', () => ({ agendaClient: transport }));
vi.mock('@/lib/supabase/query-helpers', () => ({ logSupabaseError: vi.fn() }));
describe('honest appointment notice transport', () => {
  beforeEach(() => vi.clearAllMocks());
  it('returns the missing RPC error instead of claiming scheduling succeeded', async () => {
    const error = { code: 'PGRST202', message: 'Function unavailable' };
    transport.rpc.mockResolvedValue({ data: null, error });
    expect((await syncAppointmentNotificationSchedule(12)).error).toBe(error);
  });
  it('does not start an unscoped history read', async () => {
    expect((await getAppointmentNotifications({ appointmentId: 12 })).error).toBeTruthy();
    expect(transport.from).not.toHaveBeenCalled();
  });
  it('bounds and scopes history to the current owner and appointment', async () => {
    const query = { select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), then: resolve => Promise.resolve(resolve({ data: [], error: null })) };
    transport.from.mockReturnValue(query);
    await getAppointmentNotifications({ appointmentId: 12, nutritionistId: 'synthetic-owner', limit: 10000 });
    expect(query.limit).toHaveBeenCalledWith(100);
    expect(query.eq).toHaveBeenCalledWith('nutritionist_id', 'synthetic-owner');
    expect(query.eq).toHaveBeenCalledWith('appointment_id', 12);
  });
});

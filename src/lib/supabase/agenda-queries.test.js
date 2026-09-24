import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, from, sync, logError } = vi.hoisted(() => ({
    rpc: vi.fn(), from: vi.fn(), sync: vi.fn(), logError: vi.fn()
}));
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { rpc, from } }));
vi.mock('@/lib/supabase/appointment-notifications-queries', () => ({
    syncAppointmentNotificationSchedule: sync
}));
vi.mock('@/lib/supabase/query-helpers', () => ({ logSupabaseError: logError }));
vi.mock('./message-templates-queries', () => ({ dispatchMessageTemplate: vi.fn() }));

const { createAppointmentWithFinance, updateAppointment, deleteAppointment } = await import('./agenda-queries');
const appointment = {
    nutritionist_id: '00000000-0000-4000-8000-000000000001',
    unregistered_patient_name: 'Paciente de teste',
    appointment_time: '2026-10-01T12:00:00Z',
    duration: 60,
    status: 'scheduled'
};

describe('gravação atômica de agenda e cobrança', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sync.mockResolvedValue({ error: null });
    });

    it('não anuncia consulta criada quando a transação do banco falha', async () => {
        const error = new Error('cobrança rejeitada');
        rpc.mockResolvedValue({ data: null, error });

        await expect(createAppointmentWithFinance(appointment, { custom_price: '50' })).rejects.toBe(error);
        expect(rpc).toHaveBeenCalledWith('save_appointment_with_finance', expect.objectContaining({
            p_appointment_id: null, p_financial: { custom_price: '50' }
        }));
        expect(from).not.toHaveBeenCalled();
        expect(sync).not.toHaveBeenCalled();
    });

    it('retorna consulta e cobrança geradas na mesma RPC', async () => {
        const saved = { appointment: { id: 7, status: 'scheduled' }, transaction: { id: 9, appointment_id: 7 } };
        rpc.mockResolvedValue({ data: saved, error: null });

        await expect(createAppointmentWithFinance(appointment, { custom_price: '50' })).resolves.toEqual(saved);
        expect(sync).toHaveBeenCalledWith(7, true);
    });

    it('não faz update direto nem fallback após transição rejeitada', async () => {
        const error = new Error('APPOINTMENT_INVALID_TRANSITION');
        rpc.mockResolvedValue({ data: null, error });

        await expect(updateAppointment(7, { ...appointment, status: 'completed' })).rejects.toBe(error);
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(from).not.toHaveBeenCalled();
        expect(sync).not.toHaveBeenCalled();
    });

    it('remove consulta e cobrança pendente por uma única RPC', async () => {
        rpc.mockResolvedValue({ data: null, error: null });

        await deleteAppointment(7);
        expect(rpc).toHaveBeenCalledWith('delete_appointment_with_finance', { p_appointment_id: 7 });
        expect(from).not.toHaveBeenCalled();
    });
});

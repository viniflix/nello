import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, from, sync, logError, dispatch } = vi.hoisted(() => ({
    rpc: vi.fn(), from: vi.fn(), sync: vi.fn(), logError: vi.fn(), dispatch: vi.fn()
}));
vi.mock('@/lib/supabase/idempotent-mutations',()=>({clinicalRpc: (operation,args,expected)=>rpc('perform_clinical_operation',{p_operation:operation,p_arguments:args,p_expected:expected ?? null})}));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { rpc, from } }));
vi.mock('@/lib/supabase/appointment-notifications-queries', () => ({
    syncAppointmentNotificationSchedule: sync
}));
vi.mock('@/lib/supabase/query-helpers', () => ({ logSupabaseError: logError }));
vi.mock('./message-templates-queries', () => ({ dispatchMessageTemplate: dispatch }));

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
        expect(rpc).toHaveBeenCalledWith('perform_clinical_operation', expect.objectContaining({
            p_operation: 'appointment',p_arguments: expect.objectContaining({p_appointment_id: null, p_financial: { custom_price: '50' }})
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

    it.each(['evaluation', 'in_person'])('preserva o tipo %s aceito pelo banco', async appointment_type => {
        rpc.mockResolvedValue({ data: { appointment: { id: 7 }, transaction: null }, error: null });
        await createAppointmentWithFinance({ ...appointment, appointment_type });
        expect(rpc.mock.calls[0][1].p_arguments.p_appointment.appointment_type).toBe(appointment_type);
    });

    it('transporta revisão e horário novo sem reduzir awaiting_confirmation a scheduled', async () => {
        const updated_at = '2032-07-12T11:00:00Z';
        rpc.mockResolvedValue({ data: { appointment: { id: 7, status: 'awaiting_confirmation' } }, error: null });
        await updateAppointment(7, { ...appointment, start_time: '2026-10-01T10:00:00Z', updated_at, status: 'awaiting_confirmation' });
        const request = rpc.mock.calls[0][1];
        expect(request.p_expected).toBe(updated_at);
        expect(request.p_arguments.p_appointment.start_time).toBe(new Date(appointment.appointment_time).toISOString());
        expect(request.p_arguments.p_appointment.status).toBe('awaiting_confirmation');
    });

    it('mantém consulta salva e informa envio pendente quando o dispatcher retorna erro', async () => {
        const saved = { id: 7, status: 'completed', patient_id: 'patient-id', nutritionist_id: appointment.nutritionist_id };
        rpc.mockResolvedValue({ data: { appointment: saved }, error: null });
        const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'template-id' }, error: null }) };
        from.mockReturnValue(query);
        const failure = { code: 'PGRST202', message: 'dispatcher unavailable' };
        dispatch.mockResolvedValue({ data: null, error: failure });
        await expect(updateAppointment(7, { ...appointment, status: 'completed' })).resolves.toEqual({ ...saved, post_consultation_delivery_pending: true });
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(logError).toHaveBeenCalledWith('erro_ao_disparar_template_pos_consulta', failure);
    });
});

import { agendaClient as supabase } from '@/infrastructure/supabase/domainClients';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

export const syncAppointmentNotificationSchedule = async (appointmentId, forceReschedule = false) => {
    try {
        const { data, error } = await supabase.rpc('sync_appointment_notification_schedule', {
            p_appointment_id: appointmentId,
            p_force_reschedule: forceReschedule
        });

        if (error) {
            throw error;
        }
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_sincronizar_notificacoes_da_consulta", error);
        return { data: null, error };
    }
};

export const processAppointmentNotifications = async (limit = 50) => {
    try {
        const { data, error } = await supabase.rpc('process_appointment_notifications', {
            p_limit: limit
        });

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_processar_fila_de_notificacoes_da_consulta", error);
        return { data: null, error };
    }
};

export const getAppointmentNotifications = async ({
    appointmentId,
    nutritionistId,
    patientId,
    deliveryStatus,
    limit = 50
} = {}) => {
    try {
        if (!appointmentId || !nutritionistId) throw new Error('Consulta e responsável são obrigatórios.');
        let query = supabase
            .from('appointment_notifications')
            .select('id,appointment_id,nutritionist_id,patient_id,scheduled_for,delivery_status,event_kind,channel,reason_code,attempts,last_error_code,available_at,created_at')
            .order('created_at', { ascending: false })
            .limit(Math.min(100, Math.max(1, Number(limit) || 20)));

        if (appointmentId) query = query.eq('appointment_id', appointmentId);
        if (nutritionistId) query = query.eq('nutritionist_id', nutritionistId);
        if (patientId) query = query.eq('patient_id', patientId);
        if (deliveryStatus) query = query.eq('delivery_status', deliveryStatus);

        const { data, error } = await query;
        if (error) throw error;

        return { data: data || [], error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_notificacoes_de_consulta", error);
        return { data: [], error };
    }
};

export const transitionAppointmentStatus = async ({
    appointmentId,
    nextStatus,
    reason = null
}) => {
    try {
        const { data, error } = await supabase.rpc('transition_appointment_status', {
            p_appointment_id: appointmentId,
            p_next_status: nextStatus,
            p_reason: reason
        });

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_transicionar_status_da_consulta", error);
        return { data: null, error };
    }
};

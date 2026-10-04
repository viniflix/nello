import { agendaClient as supabase } from '@/infrastructure/supabase/domainClients';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

const isFunctionMissing = (err) => {
    if (!err) return false;
    const msg = String(err?.message || '').toLowerCase();
    const code = String(err?.code || err?.statusCode || '').toString();
    return code === '404' || code === '42883' || msg.includes('could not find the function') || msg.includes('schema cache');
};

export const syncAppointmentNotificationSchedule = async (appointmentId, forceReschedule = false) => {
    try {
        const { data, error } = await supabase.rpc('sync_appointment_notification_schedule', {
            p_appointment_id: appointmentId,
            p_force_reschedule: forceReschedule
        });

        if (error) {
            if (isFunctionMissing(error)) {
                return { data: null, error: null }; // Ignore gracefully
            }
            throw error;
        }
        return { data, error: null };
    } catch (error) {
        if (isFunctionMissing(error)) {
            return { data: null, error: null };
        }
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
        let query = supabase
            .from('appointment_notifications')
            .select('id,appointment_id,nutritionist_id,patient_id,scheduled_for,delivery_status')
            .order('scheduled_for', { ascending: true })
            .limit(limit);

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

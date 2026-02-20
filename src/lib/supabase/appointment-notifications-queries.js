import { supabase } from '@/lib/customSupabaseClient';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

export const syncAppointmentNotificationSchedule = async (appointmentId, forceReschedule = false) => {
    try {
        const { data, error } = await supabase.rpc('sync_appointment_notification_schedule', {
            p_appointment_id: appointmentId,
            p_force_reschedule: forceReschedule
        });

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao sincronizar notificações da consulta', error);
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
        logSupabaseError('Erro ao processar fila de notificações da consulta', error);
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
            .select('*')
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
        logSupabaseError('Erro ao buscar notificações de consulta', error);
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
        logSupabaseError('Erro ao transicionar status da consulta', error);
        return { data: null, error };
    }
};

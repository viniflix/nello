import { supabase } from '@/lib/customSupabaseClient';
import { logSupabaseError } from '@/lib/supabase/query-helpers';
import { syncAppointmentNotificationSchedule } from './appointment-notifications-queries';

import { dispatchMessageTemplate } from './message-templates-queries';

const STATUS_FALLBACK = 'scheduled';
// Mapeia para valores aceitos pelo DB (produção usa 'cancelled' com 2 L)
const STATUS_MAP = {
    awaiting_confirmation: 'scheduled',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    no_show: 'no_show'
};

const normalizeAppointmentStatus = (status) => {
    if (!status || typeof status !== 'string') return STATUS_FALLBACK;
    return STATUS_MAP[status] || status;
};

const toIsoDate = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
};

// DB aceita apenas: first_appointment, return, online
const APPT_TYPE_MAP = { evaluation: 'return', in_person: 'return' };
const toValidAppointmentType = (v) => {
    if (!v) return 'first_appointment';
    return APPT_TYPE_MAP[v] || v;
};

// Schema produção: appointments tem appointment_time, start_time, duration - NÃO tem title, end_time
const buildAppointmentPayload = (appointmentData = {}) => {
    const rawStartTime = appointmentData.start_time || appointmentData.appointment_time;
    const durationMinutes = Number(appointmentData.duration || 60);
    const startTimeIso = toIsoDate(rawStartTime);

    const patientId = appointmentData.patient_id && String(appointmentData.patient_id).trim()
        ? appointmentData.patient_id
        : null;

    const unregisteredPatientName = appointmentData.unregistered_patient_name && String(appointmentData.unregistered_patient_name).trim()
        ? appointmentData.unregistered_patient_name
        : null;

    if (!patientId && !unregisteredPatientName) {
        throw new Error('É necessário informar um paciente cadastrado ou o nome de um paciente não cadastrado.');
    }

    if (!startTimeIso) {
        throw new Error('Data e horário inválidos. Verifique se preencheu data e hora corretamente.');
    }

    return {
        nutritionist_id: appointmentData.nutritionist_id,
        patient_id: patientId,
        unregistered_patient_name: unregisteredPatientName,
        appointment_time: startTimeIso,
        start_time: startTimeIso,
        duration: durationMinutes,
        appointment_type: toValidAppointmentType(appointmentData.appointment_type),
        notes: appointmentData.notes || null,
        status: normalizeAppointmentStatus(appointmentData.status)
    };
};

/**
 * Create an appointment and automatically create a financial transaction
 * @param {Object} appointmentData - Appointment data
 * @param {Object} financialData - Financial data (service_id, custom_price, custom_description)
 * @returns {Promise<{appointment: Object, transaction: Object}>}
 */
export async function createAppointmentWithFinance(appointmentData, financialData) {
    const appointmentPayload = buildAppointmentPayload(appointmentData);
    const { data, error } = await supabase.rpc('save_appointment_with_finance', {
        p_appointment: appointmentPayload,
        p_financial: financialData || {},
        p_appointment_id: null
    });
    if (error) {
        logSupabaseError('Error creating appointment with finance', error);
        throw error;
    }
    const { appointment, transaction } = data;

    const syncResult = await syncAppointmentNotificationSchedule(appointment.id, true);
    if (syncResult.error) {
        logSupabaseError('Erro ao sincronizar notificações da consulta após criação', syncResult.error);
    }

    return { appointment, transaction };
}

/**
 * Update an appointment
 * @param {number} appointmentId - Appointment ID
 * @param {Object} appointmentData - Updated appointment data
 * @returns {Promise<Object>}
 */
export async function updateAppointment(appointmentId, appointmentData, financialData = {}) {
    const payload = buildAppointmentPayload(appointmentData);
    const { data, error } = await supabase.rpc('save_appointment_with_finance', {
        p_appointment: payload,
        p_financial: financialData,
        p_appointment_id: appointmentId
    });
    if (error) {
        logSupabaseError('Error updating appointment with finance', error);
        throw error;
    }
    const refreshed = data.appointment;
    const syncResult = await syncAppointmentNotificationSchedule(appointmentId, true);
    if (syncResult.error) {
        logSupabaseError('Erro ao sincronizar notificações da consulta após atualização', syncResult.error);
    }

    // Auto-dispatch post_consultation template when appointment is completed
    const finalStatus = refreshed?.status;
    const finalPatientId = refreshed?.patient_id;
    if (
        finalStatus === 'completed' &&
        finalPatientId &&
        refreshed?.nutritionist_id
    ) {
        try {
            const { data: postTpl } = await supabase
                .from('message_templates')
                .select('id')
                .eq('nutritionist_id', refreshed.nutritionist_id)
                .eq('context', 'post_consultation')
                .eq('is_active', true)
                .order('use_count', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (postTpl?.id) {
                await dispatchMessageTemplate({
                    templateId: postTpl.id,
                    patientId: finalPatientId,
                    triggerEvent: 'appointment_completed',
                    extraVariables: { appointment_id: appointmentId }
                });
            }
        } catch (dispatchErr) {
            logSupabaseError('Erro ao disparar template pós-consulta', dispatchErr);
        }
    }

    return refreshed;
}

/**
 * Delete an appointment
 * @param {number} appointmentId - Appointment ID
 * @returns {Promise<void>}
 */
export async function deleteAppointment(appointmentId) {
    const { error } = await supabase.rpc('delete_appointment_with_finance', {
        p_appointment_id: appointmentId
    });

    if (error) {
        logSupabaseError('Error deleting appointment', error);
        throw error;
    }
}


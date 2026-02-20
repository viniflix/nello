import { supabase } from '@/lib/customSupabaseClient';
import { format } from 'date-fns';
import { saveTransaction } from './financial-queries';
import { logSupabaseError } from '@/lib/supabase/query-helpers';
import { syncAppointmentNotificationSchedule, transitionAppointmentStatus } from './appointment-notifications-queries';
import { logOperationalEvent } from './observability-queries';

const STATUS_FALLBACK = 'scheduled';
const STATUS_MAP = {
    awaiting_confirmation: 'scheduled',
    cancelled: 'canceled',
    no_show: 'canceled'
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

const buildAppointmentPayload = (appointmentData = {}) => {
    const rawStartTime = appointmentData.start_time || appointmentData.appointment_time;
    const durationMinutes = Number(appointmentData.duration || 60);
    const startTimeIso = toIsoDate(rawStartTime);
    const computedEndTime = startTimeIso
        ? new Date(new Date(startTimeIso).getTime() + durationMinutes * 60000).toISOString()
        : null;
    const endTimeIso = toIsoDate(appointmentData.end_time) || computedEndTime;

    return {
        nutritionist_id: appointmentData.nutritionist_id,
        patient_id: appointmentData.patient_id || null,
        title: appointmentData.title || appointmentData.appointment_type || 'Consulta',
        start_time: startTimeIso,
        end_time: endTimeIso,
        notes: appointmentData.notes || null,
        status: normalizeAppointmentStatus(appointmentData.status)
    };
};

const isTerminalStatus = (status) => ['completed', 'canceled', 'no_show'].includes(status);

/**
 * Create an appointment and automatically create a financial transaction
 * @param {Object} appointmentData - Appointment data
 * @param {Object} financialData - Financial data (service_id, custom_price, custom_description)
 * @returns {Promise<{appointment: Object, transaction: Object}>}
 */
export async function createAppointmentWithFinance(appointmentData, financialData) {
    const startedAt = Date.now();
    const { nutritionist_id, patient_id, appointment_time } = appointmentData;
    const { service_id, custom_price, custom_description } = financialData;
    const appointmentPayload = buildAppointmentPayload(appointmentData);

    // Create appointment first
    const { data: appointment, error: appointmentError } = await supabase
        .from('appointments')
        .insert(appointmentPayload)
        .select()
        .single();

    if (appointmentError) {
        logSupabaseError('Error creating appointment', appointmentError);
        await logOperationalEvent({
            module: 'agenda',
            operation: 'create_appointment_with_finance',
            eventType: 'error',
            latencyMs: Date.now() - startedAt,
            nutritionistId: nutritionist_id || null,
            patientId: patient_id || null,
            errorMessage: appointmentError?.message || String(appointmentError)
        });
        throw appointmentError;
    }

    const syncResult = await syncAppointmentNotificationSchedule(appointment.id, true);
    if (syncResult.error) {
        logSupabaseError('Erro ao sincronizar notificações da consulta após criação', syncResult.error);
    }

    // Get patient name for description
    const { data: patient } = await supabase
        .from('user_profiles')
        .select('name')
        .eq('id', patient_id)
        .single();

    const patientName = patient?.name || 'Paciente';

    // Determine amount and description
    let amount = 0;
    let description = '';

    if (service_id) {
        // Get service details
        const { data: service } = await supabase
            .from('services')
            .select('name, price, category')
            .eq('id', service_id)
            .single();

        if (service) {
            amount = parseFloat(service.price);
            description = `Agendamento: ${patientName} - ${service.name}`;
        }
    } else if (custom_price) {
        // Custom price
        amount = parseFloat(custom_price);
        description = custom_description 
            ? `Agendamento: ${patientName} - ${custom_description}`
            : `Agendamento: ${patientName}`;
    }

    // Create financial transaction if amount > 0
    let transaction = null;
    if (amount > 0 && description) {
        try {
            const appointmentDate = new Date(appointmentPayload.start_time || appointment_time);
            transaction = await saveTransaction({
                nutritionist_id,
                patient_id,
                type: 'income',
                category: service_id ? 'consulta' : 'outros',
                description,
                amount,
                transaction_date: format(appointmentDate, 'yyyy-MM-dd'),
                status: 'pending',
                due_date: format(appointmentDate, 'yyyy-MM-dd')
            });
        } catch (error) {
            logSupabaseError('Error creating financial transaction', error);
            // Don't throw - appointment was created successfully
            // Transaction can be created manually later
        }
    }

    await logOperationalEvent({
        module: 'agenda',
        operation: 'create_appointment_with_finance',
        eventType: 'success',
        latencyMs: Date.now() - startedAt,
        nutritionistId: nutritionist_id || null,
        patientId: patient_id || null,
        metadata: {
            has_financial_transaction: Boolean(transaction)
        }
    });

    return { appointment, transaction };
}

/**
 * Update an appointment
 * @param {number} appointmentId - Appointment ID
 * @param {Object} appointmentData - Updated appointment data
 * @returns {Promise<Object>}
 */
export async function updateAppointment(appointmentId, appointmentData) {
    const startedAt = Date.now();
    const nutritionistId = appointmentData?.nutritionist_id || null;
    const patientId = appointmentData?.patient_id || null;
    const requestedStatus = normalizeAppointmentStatus(appointmentData?.status);

    const { data: current, error: currentError } = await supabase
        .from('appointments')
        .select('status')
        .eq('id', appointmentId)
        .single();

    if (currentError) {
        logSupabaseError('Error loading current appointment status', currentError);
        await logOperationalEvent({
            module: 'agenda',
            operation: 'update_appointment',
            eventType: 'error',
            latencyMs: Date.now() - startedAt,
            nutritionistId,
            patientId,
            errorMessage: currentError?.message || String(currentError)
        });
        throw currentError;
    }

    const payload = buildAppointmentPayload({
        ...appointmentData,
        status: current?.status || requestedStatus
    });

    // Campos de controle de status devem ser alterados apenas via RPC.
    const { status: _ignoredStatus, ...safePayload } = payload;
    const { data, error } = await supabase
        .from('appointments')
        .update(safePayload)
        .eq('id', appointmentId)
        .select()
        .single();

    if (error) {
        logSupabaseError('Error updating appointment', error);
        await logOperationalEvent({
            module: 'agenda',
            operation: 'update_appointment',
            eventType: 'error',
            latencyMs: Date.now() - startedAt,
            nutritionistId,
            patientId,
            errorMessage: error?.message || String(error)
        });
        throw error;
    }

    if (requestedStatus && requestedStatus !== current?.status) {
        const transitionResult = await transitionAppointmentStatus({
            appointmentId,
            nextStatus: requestedStatus,
            reason: appointmentData?.cancellation_reason || null
        });

        if (transitionResult.error) {
            throw transitionResult.error;
        }
    } else if (!isTerminalStatus(current?.status)) {
        const syncResult = await syncAppointmentNotificationSchedule(appointmentId, true);
        if (syncResult.error) {
            logSupabaseError('Erro ao sincronizar notificações da consulta após atualização', syncResult.error);
        }
    }

    const { data: refreshed, error: refreshedError } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', appointmentId)
        .single();

    if (refreshedError) {
        logSupabaseError('Error fetching refreshed appointment', refreshedError);
        await logOperationalEvent({
            module: 'agenda',
            operation: 'update_appointment',
            eventType: 'error',
            latencyMs: Date.now() - startedAt,
            nutritionistId,
            patientId,
            errorMessage: refreshedError?.message || String(refreshedError)
        });
        throw refreshedError;
    }

    await logOperationalEvent({
        module: 'agenda',
        operation: 'update_appointment',
        eventType: 'success',
        latencyMs: Date.now() - startedAt,
        nutritionistId: refreshed?.nutritionist_id || nutritionistId,
        patientId: refreshed?.patient_id || patientId,
        metadata: {
            status: refreshed?.status || requestedStatus || null
        }
    });

    return refreshed;
}

/**
 * Delete an appointment
 * @param {number} appointmentId - Appointment ID
 * @returns {Promise<void>}
 */
export async function deleteAppointment(appointmentId) {
    const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', appointmentId);

    if (error) {
        logSupabaseError('Error deleting appointment', error);
        throw error;
    }
}

/**
 * Get appointments for a nutritionist
 * @param {string} nutritionistId - Nutritionist UUID
 * @param {Object} filters - Optional filters
 * @returns {Promise<Array>}
 */
export async function getAppointments(nutritionistId, filters = {}) {
    const startedAt = Date.now();
    let query = supabase
        .from('appointments')
        .select('*, patient:user_profiles!appointments_patient_id_fkey(name, id)')
        .eq('nutritionist_id', nutritionistId)
        .order('start_time', { ascending: true });

    if (filters.startDate) {
        query = query.gte('start_time', filters.startDate);
    }

    if (filters.endDate) {
        query = query.lte('start_time', filters.endDate);
    }

    if (filters.status) {
        query = query.eq('status', filters.status);
    }

    const { data, error } = await query;

    if (error) {
        logSupabaseError('Error fetching appointments', error);
        await logOperationalEvent({
            module: 'agenda',
            operation: 'get_appointments',
            eventType: 'error',
            latencyMs: Date.now() - startedAt,
            nutritionistId: nutritionistId || null,
            errorMessage: error?.message || String(error)
        });
        throw error;
    }

    await logOperationalEvent({
        module: 'agenda',
        operation: 'get_appointments',
        eventType: 'success',
        latencyMs: Date.now() - startedAt,
        nutritionistId: nutritionistId || null,
        metadata: {
            items_count: Array.isArray(data) ? data.length : 0
        }
    });

    return data || [];
}


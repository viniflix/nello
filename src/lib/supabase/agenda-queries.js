import { supabase } from '@/lib/customSupabaseClient';
import { format } from 'date-fns';
import { saveTransaction } from './financial-queries';

/**
 * Create an appointment and automatically create a financial transaction
 * @param {Object} appointmentData - Appointment data
 * @param {Object} financialData - Financial data (service_id, custom_price, custom_description)
 * @returns {Promise<{appointment: Object, transaction: Object}>}
 */
export async function createAppointmentWithFinance(appointmentData, financialData) {
    const { nutritionist_id, patient_id, appointment_time, notes, duration, appointment_type, status } = appointmentData;
    const { service_id, custom_price, custom_description } = financialData;

    // Create appointment first
    const { data: appointment, error: appointmentError } = await supabase
        .from('appointments')
        .insert({
            nutritionist_id,
            patient_id,
            appointment_time,
            notes,
            duration: duration || 60,
            appointment_type: appointment_type || 'first_appointment',
            status: status || 'scheduled'
        })
        .select()
        .single();

    if (appointmentError) {
        console.error('Error creating appointment:', appointmentError);
        throw appointmentError;
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
            const appointmentDate = new Date(appointment_time);
            // Note: financial_records.appointment_id is UUID, but appointments.id is bigint
            // Since there's no foreign key constraint, we'll store it as a reference
            // Convert to string if needed, or omit if it causes issues
            const transactionData = {
                nutritionist_id,
                patient_id,
                type: 'income',
                category: service_id ? 'consulta' : 'outros',
                description,
                amount,
                transaction_date: format(appointmentDate, 'yyyy-MM-dd'),
                status: 'pending',
                due_date: format(appointmentDate, 'yyyy-MM-dd'),
                service_id: service_id || null
            };
            
            // Only add appointment_id if it's a valid UUID format
            // Since appointments.id is bigint, we'll omit it to avoid type mismatch
            // The relationship can be tracked via patient_id and date if needed
            
            transaction = await saveTransaction(transactionData);
        } catch (error) {
            console.error('Error creating financial transaction:', error);
            // Don't throw - appointment was created successfully
            // Transaction can be created manually later
        }
    }

    return { appointment, transaction };
}

/**
 * Update an appointment
 * @param {number} appointmentId - Appointment ID
 * @param {Object} appointmentData - Updated appointment data
 * @returns {Promise<Object>}
 */
export async function updateAppointment(appointmentId, appointmentData) {
    const { data, error } = await supabase
        .from('appointments')
        .update(appointmentData)
        .eq('id', appointmentId)
        .select()
        .single();

    if (error) {
        console.error('Error updating appointment:', error);
        throw error;
    }

    return data;
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
        console.error('Error deleting appointment:', error);
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
    let query = supabase
        .from('appointments')
        .select(`
            *,
            patient:user_profiles!appointments_patient_id_fkey(
                id,
                name
            )
        `)
        .eq('nutritionist_id', nutritionistId)
        .order('appointment_time', { ascending: true });

    if (filters.startDate) {
        query = query.gte('appointment_time', filters.startDate);
    }

    if (filters.endDate) {
        query = query.lte('appointment_time', filters.endDate);
    }

    if (filters.status) {
        query = query.eq('status', filters.status);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching appointments:', error);
        throw error;
    }

    return data || [];
}


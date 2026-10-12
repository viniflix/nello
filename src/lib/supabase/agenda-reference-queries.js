import { agendaClient as supabase } from '@/infrastructure/supabase/domainClients';
import { idempotentRpc } from './idempotent-mutations';

const PATIENT_PAGE_SIZE = 20;
const PATIENT_SELECT = 'patient_id,patient:user_profiles!care_episodes_patient_id_fkey!inner(id,name)';
const escapeSearch = value => String(value || '').trim().slice(0, 100).replace(/[\\%_]/g, '\\$&');

/** Active episodes, owner scope and a bounded page; no global profile catalogue. */
export async function searchAgendaPatients(nutritionistId, search = '', offset = 0, patientId = null) {
  if (!nutritionistId || !Number.isInteger(offset) || offset < 0 || offset > 10000) throw new Error('Invalid agenda patient search');
  let query = supabase.from('care_episodes').select(PATIENT_SELECT)
    .eq('nutritionist_id', nutritionistId).eq('status', 'active')
    .order('patient_id', { ascending: true }).range(offset, offset + PATIENT_PAGE_SIZE);
  if (patientId) query = query.eq('patient_id', patientId);
  if (String(search).trim()) query = query.ilike('patient.name', `%${escapeSearch(search)}%`);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  return { patients: rows.slice(0, PATIENT_PAGE_SIZE).map(row => row.patient).filter(Boolean), hasMore: rows.length > PATIENT_PAGE_SIZE };
}

export async function getAgendaRegistrationContext(nutritionistId, appointmentId) {
  const { data, error } = await supabase.from('appointments')
    .select('id,nutritionist_id,patient_id,unregistered_patient_name,appointment_time,status,updated_at,charge:financial_transactions!financial_transactions_appointment_id_fkey(id,amount,status,updated_at,due_date,transaction_date,paid_at)')
    .eq('nutritionist_id', nutritionistId).eq('id', appointmentId).single();
  if (error) throw error;
  return data;
}

export async function linkAgendaPatient(appointment, patientId) {
  const charges = Array.isArray(appointment.charge) ? appointment.charge : appointment.charge ? [appointment.charge] : [];
  if (charges.length > 1) throw new Error('Appointment charge is not unique');
  const { data, error } = await idempotentRpc('link_appointment_patient', {
    p_appointment_id: appointment.id, p_patient_id: patientId,
    p_expected: appointment.updated_at, p_financial_expected: charges[0]?.updated_at || null
  });
  if (error) throw error;
  return data;
}

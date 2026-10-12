import { asCivilDate, formatDateToIsoDate } from '@/lib/utils/date';

export function agendaReturnContext(userId, date, view) {
  return { userId, date: date ? formatDateToIsoDate(date) : null, view: ['all', 'today', 'week', 'month'].includes(view) ? view : 'all' };
}

export function readAgendaReturn(value, userId) {
  if (!userId || value?.userId !== userId || !['all', 'today', 'week', 'month'].includes(value.view)) return null;
  try { return { userId, date: value.date ? asCivilDate(value.date) : null, view: value.view }; } catch { return null; }
}

export function appointmentCharge(appointment) {
  const rows = Array.isArray(appointment?.charge) ? appointment.charge : appointment?.charge ? [appointment.charge] : [];
  if (rows.length > 1) throw new Error('Appointment charge is not unique');
  return rows[0] || null;
}

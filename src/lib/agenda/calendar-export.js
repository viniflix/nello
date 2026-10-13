/** Local snapshot only; never export names, notes, contacts or clinical data. */
export function appointmentCalendarFile(appointment, now = new Date()) {
  if (!['scheduled', 'awaiting_confirmation', 'confirmed'].includes(appointment?.status)) throw new Error('Exporte apenas consultas futuras ativas.');
  const start = new Date(appointment.appointment_time), duration = Number(appointment.duration);
  if (!Number.isSafeInteger(Number(appointment.id)) || Number(appointment.id) < 1 || !Number.isFinite(start.getTime()) || !Number.isInteger(duration) || duration < 1 || duration > 1440 || start <= now) throw new Error('Confira o horário e a duração antes de exportar.');
  const stamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nello//Agenda//PT-BR', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:nello-appointment-${Number(appointment.id)}@nellonutri.com.br`, `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + duration * 60000))}`,
    'SUMMARY:Consulta Nello', 'CLASS:PRIVATE', `STATUS:${appointment.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE'}`, 'TRANSP:OPAQUE', 'END:VEVENT', 'END:VCALENDAR'];
  return lines.join('\r\n') + '\r\n';
}

export function downloadAppointmentCalendar(appointment) {
  const file = appointmentCalendarFile(appointment);
  const url = URL.createObjectURL(new Blob([file], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');link.href = url;link.download = 'consulta-nello.ics';link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

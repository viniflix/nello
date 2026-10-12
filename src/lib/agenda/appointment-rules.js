export const RESERVING_APPOINTMENT_STATUSES = ['scheduled', 'awaiting_confirmation', 'confirmed'];

export function canonicalAppointmentStatus(status = 'scheduled') {
    return status === 'canceled' ? 'cancelled' : status;
}

export function appointmentStatusChoices(originalStatus) {
    if (!originalStatus) return ['scheduled'];
    const current = canonicalAppointmentStatus(originalStatus);
    if (current === 'scheduled' || current === 'awaiting_confirmation') return [current, 'confirmed', 'cancelled'];
    if (current === 'confirmed') return [current, 'completed', 'cancelled', 'no_show'];
    return [current];
}

export function isTerminalAppointment(status) {
    return ['completed', 'cancelled', 'no_show'].includes(canonicalAppointmentStatus(status));
}

/** Existing non-cancelled reservations retain their historical interval. */
export function hasAppointmentConflict(appointments, proposed) {
    if (canonicalAppointmentStatus(proposed.status) === 'cancelled') return false;
    const start = new Date(proposed.appointment_time).getTime();
    const end = start + Number(proposed.duration || 60) * 60000;
    return appointments.some(appointment => {
        if ((proposed.id != null && String(appointment.id) === String(proposed.id)) || canonicalAppointmentStatus(appointment.status) === 'cancelled') return false;
        const existingStart = new Date(appointment.appointment_time).getTime();
        const existingEnd = existingStart + Number(appointment.duration || 60) * 60000;
        return start < existingEnd && end > existingStart;
    });
}

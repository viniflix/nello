import { describe, expect, it } from 'vitest';
import { appointmentStatusChoices, hasAppointmentConflict, isTerminalAppointment } from './appointment-rules';

const current = { id: 1, status: 'scheduled', appointment_time: '2032-07-12T12:00:00Z', duration: 60 };
describe('appointment workflow and historical intervals', () => {
    it('permits only server transitions from the original state', () => {
        expect(appointmentStatusChoices()).toEqual(['scheduled']);
        expect(appointmentStatusChoices('awaiting_confirmation')).toEqual(['awaiting_confirmation', 'confirmed', 'cancelled']);
        expect(appointmentStatusChoices('confirmed')).toEqual(['confirmed', 'completed', 'cancelled', 'no_show']);
        for (const status of ['completed', 'cancelled', 'canceled', 'no_show']) expect(isTerminalAppointment(status)).toBe(true);
    });
    it('cancelled intervals are free but completed and no-show historical reservations are preserved', () => {
        const proposed = { ...current, id: 2 };
        expect(hasAppointmentConflict([{ ...current, status: 'cancelled' }], proposed)).toBe(false);
        expect(hasAppointmentConflict([{ ...current, status: 'canceled' }], proposed)).toBe(false);
        for (const status of ['scheduled', 'confirmed', 'completed', 'no_show']) expect(hasAppointmentConflict([{ ...current, status }], proposed)).toBe(true);
    });
    it('uses half-open intervals and excludes the edited record across numeric/string identifiers', () => {
        expect(hasAppointmentConflict([current], { ...current, id: '1' })).toBe(false);
        expect(hasAppointmentConflict([current], { ...current, id: 2, appointment_time: '2032-07-12T13:00:00Z' })).toBe(false);
        expect(hasAppointmentConflict([current], { ...current, id: 2, appointment_time: '2032-07-12T12:59:00Z' })).toBe(true);
    });
    it('cancellation is never blocked by another reservation', () => {
        expect(hasAppointmentConflict([current], { ...current, id: 2, status: 'cancelled' })).toBe(false);
    });
});

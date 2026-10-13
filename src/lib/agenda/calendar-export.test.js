import { describe, expect, it } from 'vitest';
import { appointmentCalendarFile } from './calendar-export';
const now = new Date('2034-10-12T12:00:00Z');
const appointment = { id: 123, status: 'confirmed', appointment_time: '2034-10-13T23:45:00-03:00', duration: 45 };
describe('private local calendar snapshot', () => {
  it('preserves the instant and midnight duration using UTC and CRLF', () => {
    const file = appointmentCalendarFile(appointment, now);
    expect(file).toContain('DTSTART:20341014T024500Z\r\n');
    expect(file).toContain('DTEND:20341014T033000Z\r\n');
    expect(file).toContain('CLASS:PRIVATE\r\n');
    expect(file.split('\r\n').every(line => new TextEncoder().encode(line).length <= 75)).toBe(true);
  });
  it('excludes patient, professional, note, contact and financial fields including control characters', () => {
    const file = appointmentCalendarFile({ ...appointment, patient: { name: 'Synthetic Patient' }, notes: '\r\nATTENDEE:injection@example.invalid', patient_id: 'synthetic-patient', nutritionist_id: 'synthetic-professional', charge: { amount: 100 }, unregistered_patient_name: 'Synthetic Contact' }, now);
    expect(file).not.toMatch(/Synthetic|ATTENDEE|patient|professional|100|example.invalid/);
    expect(file).toContain('SUMMARY:Consulta Nello');
  });
  it.each(['cancelled', 'completed', 'no_show'])('does not export terminal %s reservations', status => {
    expect(() => appointmentCalendarFile({ ...appointment, status }, now)).toThrow();
  });
  it('keeps unconfirmed reservations tentative and rejects stale or injected inputs', () => {
    expect(appointmentCalendarFile({ ...appointment, status: 'awaiting_confirmation' }, now)).toContain('STATUS:TENTATIVE');
    expect(() => appointmentCalendarFile({ ...appointment, id: '123\r\nEND:VEVENT' }, now)).toThrow();
    expect(() => appointmentCalendarFile({ ...appointment, duration: 0 }, now)).toThrow();
    expect(() => appointmentCalendarFile({ ...appointment, appointment_time: '2034-10-11T10:00Z' }, now)).toThrow();
  });
});

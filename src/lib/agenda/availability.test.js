import { describe, expect, it } from 'vitest';
import { agendaPeriod, agendaSummary, availableAgendaSlots, isOutsideAgendaSchedule, readAgendaSettings, validateAgendaSettings } from './availability';

const settings = { startTime: '08:00', endTime: '12:00', workingDays: ['monday'], slotDuration: 30 };
describe('consultório schedule and civil dates', () => {
  it('keeps Fortaleza midnight on the preceding civil day', () => {
    const period = agendaPeriod('today', null, '2026-10-13T01:30:00Z');
    expect(period.startKey).toBe('2026-10-12');
    expect(period.start.toISOString()).toBe('2026-10-12T03:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-10-13T03:00:00.000Z');
    expect(agendaSummary([{ appointment_time: '2026-10-13T02:59:00Z' }, { appointment_time: '2026-10-13T03:00:00Z' }], '2026-10-13T01:30:00Z').today).toBe(1);
  });
  it('reads the existing legacy settings and flags malformed stored settings', () => {
    expect(readAgendaSettings({ working_hours: { start: '09:00', end: '17:00', days: [1, 3] }, appointment_duration: 45 }).settings).toEqual({ startTime: '09:00', endTime: '17:00', workingDays: ['monday', 'wednesday'], slotDuration: 45 });
    expect(readAgendaSettings({ agenda: { ...settings, endTime: '07:00' } }).errors).not.toEqual([]);
    expect(readAgendaSettings({ agenda: 'malformed' }).errors).not.toEqual([]);
    expect(readAgendaSettings({ agenda: { ...settings, workingDays: null } }).errors).not.toEqual([]);
    expect(validateAgendaSettings({ ...settings, workingDays: [], slotDuration: 0 })).toHaveLength(2);
  });
  it('finds whole-duration slots, releases cancellations and preserves historical reservations', () => {
    const rows = [
      { id: 1, appointment_time: '2026-10-12T11:00:00Z', duration: 60, status: 'confirmed' },
      { id: 2, appointment_time: '2026-10-12T13:00:00Z', duration: 60, status: 'cancelled' },
      { id: 3, appointment_time: '2026-10-12T14:00:00Z', duration: 30, status: 'completed' }
    ];
    expect(availableAgendaSlots('2026-10-12', 60, settings, rows, null, new Date('2026-10-11T00:00Z'))).toEqual(['09:00', '09:30', '10:00']);
    expect(availableAgendaSlots('2026-10-12', 60, settings, rows, 1, new Date('2026-10-11T00:00Z'))).toContain('08:00');
    expect(availableAgendaSlots('2026-10-13', 60, settings, [], null, new Date('2026-10-11T00:00Z'))).toEqual([]);
  });
  it('does not offer past slots or label an invalid configuration as availability', () => {
    expect(availableAgendaSlots('2026-10-12', 60, settings, [], null, new Date('2026-10-12T13:15Z'))).toEqual(['10:30', '11:00']);
    expect(() => availableAgendaSlots('2026-10-12', 60, { ...settings, workingDays: [] }, [])).toThrow();
    expect(isOutsideAgendaSchedule('2026-10-12', '11:30', 60, settings)).toBe(true);
    expect(isOutsideAgendaSchedule('2026-10-13', '09:00', 30, settings)).toBe(true);
  });
});

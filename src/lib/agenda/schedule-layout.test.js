import { describe, expect, it } from 'vitest';
import { appointmentMoveDraft, appointmentDayInterval, appointmentLanes, scheduleBounds } from './schedule-layout';

const booking = { id: 7, appointment_time: '2034-10-18T12:00:00Z', duration: 60, status: 'confirmed', updated_at: 'revision' };
describe('agenda schedule drafts preserve the clinical operation boundary', () => {
  it('never moves terminal records or submits an unchanged interval', () => {
    for (const status of ['completed', 'cancelled', 'canceled', 'no_show']) expect(appointmentMoveDraft({ ...booking, status }, '2034-10-19', '10:00')).toBeNull();
    expect(appointmentMoveDraft(booking, '2034-10-18', '09:00')).toBeNull();
  });
  it('returns only a draft in the business timezone and preserves the source record', () => {
    expect(appointmentMoveDraft(booking, '2034-10-19', '10:30')).toEqual({ date: '2034-10-19', time: '10:30', originalTime: booking.appointment_time });
    expect(booking.updated_at).toBe('revision'); expect(booking.appointment_time).toBe('2034-10-18T12:00:00Z');
  });
  it('clips overnight and historical long appointments to each day', () => {
    const overnight = { ...booking, appointment_time: '2034-10-19T02:30:00Z', duration: 90 };
    expect(appointmentDayInterval(overnight, '2034-10-18')).toEqual({ start: 1410, end: 1440 });
    expect(appointmentDayInterval(overnight, '2034-10-19')).toEqual({ start: 0, end: 60 });
    expect(appointmentDayInterval(overnight, '2034-10-20')).toBeNull();
  });
  it('keeps out-of-schedule reservations visible rather than clipping them to clinic hours', () => {
    expect(scheduleBounds([{ ...booking, appointment_time: '2034-10-18T09:30:00Z' }], { startTime: '08:00', endTime: '18:00' }, ['2034-10-18'])).toEqual({ start: 360, end: 1080 });
  });
  it('does not place transitive historical overlaps in the same lane', () => {
    const rows = [[1, 480, 540], [2, 510, 570], [3, 540, 600]].map(([id, start, end]) => ({ item: { id }, interval: { start, end } }));
    const lanes = appointmentLanes(rows);
    expect(lanes.get(1)).toEqual({ lane: 0, count: 2 }); expect(lanes.get(2)).toEqual({ lane: 1, count: 2 }); expect(lanes.get(3)).toEqual({ lane: 0, count: 2 });
  });
});

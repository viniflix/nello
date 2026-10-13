import { civilDateInZone, localDateTimeToInstant, localTimeInZone } from '@/lib/utils/date';
import { isTerminalAppointment } from './appointment-rules';

export function appointmentMoveDraft(appointment, date, time) {
  if (!appointment?.id || isTerminalAppointment(appointment.status)) return null;
  const instant = localDateTimeToInstant(`${date}T${time}`);
  if (!instant || !Number.isFinite(new Date(instant).getTime())) return null;
  if (new Date(instant).getTime() === new Date(appointment.appointment_time).getTime()) return null;
  return { date, time, originalTime: appointment.appointment_time };
}

/** Clip a reservation to the business civil day, without changing its duration. */
export function appointmentDayInterval(appointment, date) {
  const dayStart = new Date(localDateTimeToInstant(`${date}T00:00`)).getTime();
  const start = new Date(appointment.start_time || appointment.appointment_time).getTime();
  const end = start + Number(appointment.duration || 60) * 60000;
  if (![dayStart, start, end].every(Number.isFinite) || end <= dayStart || start >= dayStart + 86400000) return null;
  return { start: Math.max(0, (start - dayStart) / 60000), end: Math.min(1440, (end - dayStart) / 60000) };
}

export function scheduleBounds(rows, settings, dates) {
  const minute = value => { const [h, m] = String(value).split(':').map(Number); return h * 60 + m; };
  let start = minute(settings?.startTime || '08:00'), end = minute(settings?.endTime || '18:00');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) { start = 480; end = 1080; }
  for (const date of dates) for (const row of rows) {
    const interval = appointmentDayInterval(row, date);
    if (interval) { start = Math.min(start, interval.start); end = Math.max(end, interval.end); }
  }
  return { start: Math.floor(start / 60) * 60, end: Math.min(1440, Math.ceil(end / 60) * 60) };
}

export const minuteTime = minute => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
export const appointmentDay = appointment => civilDateInZone(appointment.appointment_time);
export const appointmentClock = appointment => localTimeInZone(appointment.appointment_time);

/** Use consistent lanes across an overlap cluster, including transitive overlaps. */
export function appointmentLanes(rows) {
  const ordered = [...rows].sort((a, b) => a.interval.start - b.interval.start || a.interval.end - b.interval.end);
  const result = new Map();
  let cluster = [], clusterEnd = -1;
  const flush = () => {
    const laneEnds = [];
    for (const row of cluster) {
      let lane = laneEnds.findIndex(end => end <= row.interval.start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = row.interval.end;
      result.set(row.item.id, { lane, count: 0 });
    }
    for (const row of cluster) result.get(row.item.id).count = laneEnds.length;
  };
  for (const row of ordered) {
    if (cluster.length && row.interval.start >= clusterEnd) { flush(); cluster = []; clusterEnd = -1; }
    cluster.push(row); clusterEnd = Math.max(clusterEnd, row.interval.end);
  }
  flush(); return result;
}

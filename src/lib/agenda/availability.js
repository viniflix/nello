import { addDays, startOfWeek, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { asCivilDate, civilDateInZone, civilDateToDate, formatDateToIsoDate, localDateTimeToInstant, localTimeInZone } from '@/lib/utils/date';
import { hasAppointmentConflict } from './appointment-rules';

export const AGENDA_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export const DEFAULT_AGENDA_SETTINGS = { startTime: '08:00', endTime: '18:00', workingDays: AGENDA_DAYS.slice(1, 6), slotDuration: 60 };
export const calendarDateKey = value => typeof value === 'string' ? asCivilDate(value) : formatDateToIsoDate(value);
export const agendaToday = () => civilDateToDate(civilDateInZone());
export const isAgendaTodayDate = value => calendarDateKey(value) === civilDateInZone();
export const agendaCivilRange = (start, end) => ({ start: new Date(localDateTimeToInstant(`${calendarDateKey(start)}T00:00`)), end: new Date(localDateTimeToInstant(`${calendarDateKey(end)}T00:00`)) });
const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const clockTime = minute => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function validateAgendaSettings(settings) {
  const errors = [];
  if (!validTime(settings.startTime) || !validTime(settings.endTime) || minutes(settings.endTime) <= minutes(settings.startTime)) errors.push('O término deve ser depois do início do atendimento.');
  if (!Array.isArray(settings.workingDays) || !settings.workingDays.length || settings.workingDays.some(day => !AGENDA_DAYS.includes(day))) errors.push('Selecione pelo menos um dia de atendimento válido.');
  if (!Number.isInteger(Number(settings.slotDuration)) || Number(settings.slotDuration) < 1 || Number(settings.slotDuration) > 480) errors.push('A duração padrão deve estar entre 1 e 480 minutos.');
  return errors;
}

/** Read legacy settings without silently overwriting an invalid stored schedule. */
export function readAgendaSettings(clinicSettings = {}) {
  if (!clinicSettings || typeof clinicSettings !== 'object' || Array.isArray(clinicSettings)) {
    return { settings: { ...DEFAULT_AGENDA_SETTINGS }, errors: ['A configuração da agenda não é válida.'] };
  }
  const legacy = clinicSettings.working_hours;
  const raw = clinicSettings.agenda || (legacy ? {
    startTime: legacy.start,
    endTime: legacy.end,
    workingDays: Array.isArray(legacy.days) ? legacy.days.map(day => AGENDA_DAYS[day]) : legacy.days,
    slotDuration: clinicSettings.appointment_duration
  } : {});
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { settings: { ...DEFAULT_AGENDA_SETTINGS }, errors: ['A configuração da agenda não é válida.'] };
  }
  const settings = {
    startTime: raw.startTime === undefined ? DEFAULT_AGENDA_SETTINGS.startTime : raw.startTime,
    endTime: raw.endTime === undefined ? DEFAULT_AGENDA_SETTINGS.endTime : raw.endTime,
    workingDays: raw.workingDays === undefined ? [...DEFAULT_AGENDA_SETTINGS.workingDays] : raw.workingDays,
    slotDuration: Number(raw.slotDuration === undefined ? DEFAULT_AGENDA_SETTINGS.slotDuration : raw.slotDuration)
  };
  return { settings, errors: validateAgendaSettings(settings) };
}

/** Calendar controls use local display Dates; persistence boundaries use Fortaleza. */
export function agendaPeriod(view = 'all', selectedDate = null, now = new Date(), periodDate = null) {
  const today = periodDate ? civilDateToDate(calendarDateKey(periodDate)) : civilDateToDate(civilDateInZone(now));
  const startDate = selectedDate ? civilDateToDate(calendarDateKey(selectedDate))
    : view === 'week' ? startOfWeek(today, { locale: ptBR })
      : view === 'month' ? startOfMonth(today) : today;
  const endDate = selectedDate || view === 'today' ? addDays(startDate, 1)
    : view === 'week' ? addDays(startDate, 7)
      : view === 'month' ? new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1, 12) : null;
  const startKey = calendarDateKey(startDate), endKey = endDate ? calendarDateKey(endDate) : null;
  return { startKey, endKey, start: new Date(localDateTimeToInstant(`${startKey}T00:00`)), end: endKey ? new Date(localDateTimeToInstant(`${endKey}T00:00`)) : null };
}

export function instantInAgendaPeriod(instant, period) {
  const key = civilDateInZone(instant);
  return key >= period.startKey && (!period.endKey || key < period.endKey);
}

/** Display only the portion of each reservation inside this Fortaleza civil day. */
export function agendaDayOccupancy(date, appointments = []) {
  const period = agendaPeriod('today', date);
  const dayStart = period.start.getTime(), dayEnd = period.end.getTime();
  let reservedMs = 0, cancelledCount = 0;
  for (const appointment of appointments) {
    const start = new Date(appointment.start_time || appointment.appointment_time).getTime();
    const end = start + Number(appointment.duration || 60) * 60000;
    const overlap = Math.max(0, Math.min(end, dayEnd) - Math.max(start, dayStart));
    if (!Number.isFinite(overlap) || overlap === 0) continue;
    if (['cancelled', 'canceled'].includes(appointment.status)) cancelledCount += 1;
    else reservedMs += overlap;
  }
  return { reservedMinutes: Math.round(reservedMs / 60000), cancelledCount };
}

export function agendaSummary(appointments, now = new Date()) {
  return Object.fromEntries(['today', 'week', 'month'].map(view => [view, appointments.filter(row => instantInAgendaPeriod(row.appointment_time, agendaPeriod(view, null, now))).length]));
}

export function isOutsideAgendaSchedule(date, time, duration, settings) {
  if (!date || !validTime(time) || validateAgendaSettings(settings).length) return false;
  return !settings.workingDays.includes(AGENDA_DAYS[civilDateToDate(calendarDateKey(date)).getDay()])
    || minutes(time) < minutes(settings.startTime) || minutes(time) + Number(duration) > minutes(settings.endTime);
}

export function availableAgendaSlots(date, duration, settings, appointments, excludeId = null, now = new Date()) {
  if (validateAgendaSettings(settings).length) throw new Error('Revise a configuração da agenda antes de consultar horários disponíveis.');
  if (!Number.isInteger(Number(duration)) || Number(duration) < 1 || Number(duration) > 480) return [];
  const day = calendarDateKey(date);
  if (!settings.workingDays.includes(AGENDA_DAYS[civilDateToDate(day).getDay()])) return [];
  const slots = [];
  for (let minute = minutes(settings.startTime); minute + Number(duration) <= minutes(settings.endTime); minute += Number(settings.slotDuration)) {
    const time = clockTime(minute), instant = localDateTimeToInstant(`${day}T${time}`);
    if (new Date(instant) < now) continue;
    if (!hasAppointmentConflict(appointments, { id: excludeId, appointment_time: instant, duration: Number(duration), status: 'scheduled' })) slots.push(time);
  }
  return slots;
}

export const agendaEndTime = (instant, duration = 60) => localTimeInZone(new Date(new Date(instant).getTime() + Number(duration) * 60000));

/** Civil dates are calendar values, never UTC instants. Platform clock: Fortaleza. */
export function asCivilDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Data civil inv\u00e1lida.');
  const [year, month, day] = value.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (year < 100 || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) throw new Error('Data civil inv\u00e1lida.');
  return value;
}
export function civilDateInZone(instant = new Date(), timeZone = 'America/Fortaleza') {
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new Error('Instante inv\u00e1lido.');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(p => [p.type, p.value]));
  return asCivilDate(`${parts.year}-${parts.month}-${parts.day}`);
}
export const getTodayIsoDate = () => civilDateInZone();
/** A display-only local calendar representation, never a persistence instant. */
export function civilDateToDate(value) {
  const [year,month,day] = asCivilDate(value).split('-').map(Number);
  return new Date(year,month-1,day,12);
}
export function civilAge(birthDate, today = getTodayIsoDate()) {
  try {
    asCivilDate(birthDate);asCivilDate(today);
    if (birthDate > today) return null;
    return Number(today.slice(0,4))-Number(birthDate.slice(0,4))-(today.slice(5)<birthDate.slice(5)?1:0);
  } catch { return null; }
}
export function localTimeInZone(instant = new Date(), timeZone = 'America/Fortaleza') {
  return new Intl.DateTimeFormat('en-GB', {timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(instant));
}
export function formatDateToIsoDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return asCivilDate(value);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Data inv\u00e1lida.');
  return asCivilDate(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`);
}
export function asUtcInstant(value) {
  if (typeof value === 'string' && !/(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error('Informe o fuso do instante.');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Instante inv\u00e1lido.');
  return date.toISOString();
}
export function asLocalDateTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Hor\u00e1rio local inv\u00e1lido.');
  asCivilDate(value.slice(0,10));
  const [hour, minute] = value.slice(11).split(':').map(Number);
  if (hour > 23 || minute > 59) throw new Error('Hor\u00e1rio local inv\u00e1lido.');
  return value;
}
export function localDateTimeToInstant(value, timeZone = 'America/Fortaleza') {
  asLocalDateTime(value);
  const wall = Date.parse(value+'Z');
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23' });
  const wallAt = timestamp => fmt.format(new Date(timestamp)).replace(' ','T');
  let candidate = wall;
  for (let i=0;i<4;i++) candidate += wall - Date.parse(wallAt(candidate)+'Z');
  const matches = [...new Set([candidate-3600000,candidate,candidate+3600000].filter(t=>wallAt(t)===value))];
  if (matches.length !== 1) throw new Error('Hor\u00e1rio inexistente ou amb\u00edguo neste fuso. Escolha outro hor\u00e1rio.');
  return new Date(matches[0]).toISOString();
}

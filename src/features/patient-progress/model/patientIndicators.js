/* global BigInt */
import { asCivilDate } from '@/lib/utils/date';
import { parseGlycemiaMgDl } from '@/lib/utils/glycemia';

const measurementTime = value => {
  if (typeof value !== 'string') return NaN;
  try { asCivilDate(value.slice(0, 10)); return Date.parse(value); }
  catch { return NaN; }
};
const createdTime = row => Date.parse(row.created_at || '') || 0;
const compareIdentity = (left, right) => {
  const a = String(left.id ?? '').replace(/^patient:/, '');
  const b = String(right.id ?? '').replace(/^patient:/, '');
  if (/^-?\d+$/.test(a) && /^-?\d+$/.test(b)) {
    const first = BigInt(a), second = BigInt(b);
    return first < second ? -1 : first > second ? 1 : 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
};
const byNewest = dateKey => (left, right) => measurementTime(right[dateKey]) - measurementTime(left[dateKey])
  || createdTime(right) - createdTime(left)
  || Number(left.source === 'patient') - Number(right.source === 'patient')
  || compareIdentity(left, right);

export function patientWeightHistory(records = []) {
  return records.flatMap(record => {
    if (!record || (record.status != null && record.status !== 'active') || record.is_latest_revision === false) return [];
    const raw = record.weight;
    const weight = typeof raw === 'number' || (typeof raw === 'string' && raw.trim()) ? Number(raw) : NaN;
    return Number.isFinite(weight) && weight > 0 && Number.isFinite(measurementTime(record.record_date))
      ? [{ ...record, weight }] : [];
  }).sort(byNewest('record_date'));
}

export function patientGlycemiaHistory(records = []) {
  return records.flatMap(record => {
    const value = parseGlycemiaMgDl(record?.value);
    return value !== null && Number.isFinite(measurementTime(record.date)) ? [{ ...record, value }] : [];
  }).sort(byNewest('date'));
}

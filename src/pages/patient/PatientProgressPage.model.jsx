



import { format, parseISO } from 'date-fns';























export const MIME_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif'
};
export const formatCivilDate = (value, pattern = 'dd/MM/yyyy') => {
  if (!value) return 'Data não informada';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseISO(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data não informada' : format(date, pattern);
};
export const formatWeightTooltip = (value) => [
  `${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`,
  'Peso',
];
export const CLINICAL_TYPE_LABELS = {
  clinical_evolution: 'Evolução clínica',
  follow_up: 'Acompanhamento clínico',
  initial_assessment: 'Avaliação inicial',
  discharge_summary: 'Resumo de alta',
};
export const HISTORY_PAGE_SIZE = 100;
export const GROWTH_COLUMNS = 'id, patient_id, record_date, weight, height, head_circumference, notes, circumferences, skinfolds, bioimpedance, bone_diameters';
export const SELF_MEASUREMENT_COLUMNS = 'id, patient_id, record_date, weight, height, head_circumference, created_at';
export const GLYCEMIA_COLUMNS = 'id, patient_id, date, value, condition, notes';
export const mergeUnique = (current, incoming, keyFor) => {
  const seen = new Set(current.map(keyFor));
  return [...current, ...incoming.filter((item) => {
    const key = keyFor(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })];
};
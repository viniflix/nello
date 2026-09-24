export const GLYCEMIA_MIN_MG_DL = 20;
export const GLYCEMIA_MAX_MG_DL = 600;

export function parseGlycemiaMgDl(input) {
  const raw = String(input ?? '').trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(raw)) return null;
  const value = Number(raw.replace(',', '.'));
  if (!Number.isFinite(value) || value < GLYCEMIA_MIN_MG_DL || value > GLYCEMIA_MAX_MG_DL) return null;
  return value;
}

/** Parse a single decimal value without accepting partial strings, blanks or non-finite values. */
export function parseFiniteEnergyNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(normalized)) return null;
  const number = Number(normalized.replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

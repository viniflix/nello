// Decimal inputs are interpreted as exact base-10 rationals. No intermediate rounding.
// JSON carries strings, never BigInt. Number conversion is only a compatibility boundary.
const gcd = (a, b) => { a = a < 0n ? -a : a; while (b) [a, b] = [b, a % b]; return a; };
const fraction = (n, d = 1n) => {
  if (d === 0n) throw new RangeError('clinical_division_by_zero');
  if (d < 0n) { n = -n; d = -d; }
  const divisor = gcd(n, d);
  return { numerator: String(n / divisor), denominator: String(d / divisor) };
};
const validFraction = value => {
  if (!value || typeof value.numerator !== 'string' || typeof value.denominator !== 'string'
    || value.numerator.length > 256 || value.denominator.length > 256
    || !/^-?\d+$/.test(value.numerator) || !/^\d+$/.test(value.denominator)
    || BigInt(value.denominator) <= 0n) throw new TypeError('invalid_clinical_fraction');
  return value;
};
export function decimalFraction(value) {
  if (typeof value !== 'number' && typeof value !== 'string') throw new TypeError('invalid_clinical_number');
  const text = String(value).trim().replace(',', '.');
  if (text.length > 64 || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) throw new TypeError('invalid_clinical_number');
  const [mantissa, exponentText = '0'] = text.toLowerCase().split('e');
  const exponent = Number(exponentText);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 100) throw new RangeError('clinical_number_out_of_bounds');
  const decimals = (mantissa.split('.')[1] || '').length;
  const n = BigInt(mantissa.replace('.', ''));
  const scale = decimals - exponent;
  return scale < 0 ? fraction(n * 10n ** BigInt(-scale)) : fraction(n, 10n ** BigInt(scale));
}
export function exactOperation(operation, operands) {
  if (!Array.isArray(operands) || operands.length !== 2) throw new TypeError('invalid_clinical_operands');
  const [a, b] = operands;
  validFraction(a); validFraction(b);
  const an = BigInt(a.numerator), ad = BigInt(a.denominator), bn = BigInt(b.numerator), bd = BigInt(b.denominator);
  switch (operation) {
    case 'add': return fraction(an * bd + bn * ad, ad * bd);
    case 'subtract': return fraction(an * bd - bn * ad, ad * bd);
    case 'multiply': return fraction(an * bn, ad * bd);
    case 'divide': return fraction(an * bd, ad * bn);
    default: throw new TypeError('unknown_clinical_operation');
  }
}
export const fractionNumber = value => Number(value.numerator) / Number(value.denominator);
export function roundClinicalFraction(value, places = 2) {
  validFraction(value);
  if (!Number.isInteger(places) || places < 0 || places > 8) throw new RangeError('invalid_clinical_precision');
  const n = BigInt(value.numerator), d = BigInt(value.denominator);
  const negative = n < 0n, magnitude = (negative ? -n : n) * 10n ** BigInt(places);
  const rounded = magnitude / d + (2n * (magnitude % d) >= d ? 1n : 0n);
  const digits = String(rounded).padStart(places + 1, '0');
  return `${negative && rounded !== 0n ? '-' : ''}${places ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits}`;
}
export const clinicalLeaf = (label, value, unit = '1') => ({ operation: 'input', label, value: Number(value), unit, exact: decimalFraction(value) });
export function clinicalOperation(operation, left, right, label, unit = 'kcal/day') {
  const exact = exactOperation(operation, [left.exact, right.exact]);
  return { operation, label, unit, operands: [left, right], exact, value: fractionNumber(exact) };
}

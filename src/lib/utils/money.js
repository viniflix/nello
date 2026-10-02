/* global BigInt */
/** Exact decimal parsing and half-up rounding. Arithmetic is always integer cents. */
export function toCents(value) {
  const text = String(value ?? 0).trim().replace(',', '.');
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error('Valor monetário inválido.');
  const fraction = (match[3] || '').padEnd(3,'0');
  const exact = BigInt(match[2])*100n + BigInt(fraction.slice(0,2)) + (Number(fraction[2]) >= 5 ? 1n : 0n);
  if (exact > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Valor monetário fora do limite.');
  const cents = Number(exact);
  return match[1] ? -cents : cents;
}
export function fromCents(value) {
  if (!Number.isSafeInteger(value)) throw new Error('Valor monetário fora do limite.');
  return value / 100;
}
export function decimalMoney(value) {
  const cents = toCents(value);
  return `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents)/100)}.${String(Math.abs(cents)%100).padStart(2,'0')}`;
}
/** Round the net total once, matching PostgreSQL round(amount*(1-fee/100),2). */
export function netAfterFee(amount, feePercentage) {
  const feeText = String(feePercentage ?? 0).trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,6})?$/.test(feeText)) throw new Error('Taxa inválida.');
  const [whole,fraction = ''] = feeText.split('.');
  const scale = 10n ** BigInt(fraction.length);
  const fee = BigInt(whole)*scale+BigInt(fraction || 0);
  if (fee > 100n*scale) throw new Error('Taxa inválida.');
  const denominator = 100n*scale;
  const numerator = BigInt(toCents(amount))*(denominator-fee);
  const magnitude = numerator < 0n ? -numerator : numerator;
  const rounded = (magnitude*2n+denominator)/(denominator*2n);
  return fromCents(Number(numerator < 0n ? -rounded : rounded));
}
